"""채널 일괄 작업(백그라운드 스레드). ID 일괄 조회, 영상 일괄 수집.

- 한 번에 하나의 일괄 작업만 실행한다.
- 진행 상태는 메모리(BULK_STATE)에 두고, 개별 결과는 collection_jobs 에 기록한다.
- ID 일괄 조회는 가장 유력한 검색 결과를 저장하되 verification_status 는 'unverified' 로 유지한다(자동 확정 안 함).
"""
from __future__ import annotations

import re
import threading
from datetime import datetime, timedelta

from ..database import SessionLocal
from ..models import Celebrity, Video, YoutubeChannel, utcnow
from .collection import collect_channel_videos, discover_shorts, finish_job, start_job, upsert_video_from_api
from .youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured

_lock = threading.Lock()
BULK_STATE: dict = {"running": False, "task": None, "total": 0, "done": 0, "current": None,
                    "started_at": None, "finished_at": None, "summary": {}, "error": None}


def status() -> dict:
    return dict(BULK_STATE)


def _norm(s: str | None) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())


def pick_best(channel: YoutubeChannel, candidates: list[dict]) -> tuple[dict | None, str]:
    """채널명/연예인 이름과의 일치도 + 구독자 수로 가장 유력한 후보를 고른다. 확신이 낮으면 사유를 돌려준다."""
    if not candidates:
        return None, "검색 결과 없음"
    name = _norm(channel.channel_name)
    celeb = _norm(channel.celebrity.name) if channel.celebrity else ""
    scored = []
    for c in candidates:
        t = _norm(c.get("title"))
        h = _norm(c.get("handle"))
        score = 0
        if t == name:
            score += 100
        elif name and (name in t or t in name):
            score += 60
        if celeb and (celeb in t or celeb in h):
            score += 30
        subs = c.get("subscriber_count") or 0
        score += min(subs / 100000, 30)  # 구독자 10만당 1점, 최대 30
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    best_score, best = scored[0]
    if best_score < 40:
        return best, "이름 일치도 낮음 — 확인 필요"
    if len(scored) > 1 and scored[1][0] >= best_score - 10:
        return best, "유사 후보 여러 개 — 확인 필요"
    return best, "유력"


def _run_resolve(limit: int):
    with SessionLocal() as db:
        job = start_job(db, "bulk_resolve_channels", {"limit": limit})
        db.commit()
        try:
            client = YouTubeClient()
        except YouTubeNotConfigured as e:
            finish_job(job, "failed", error=str(e)); db.commit()
            BULK_STATE.update(running=False, error=str(e), finished_at=utcnow().isoformat())
            return
        targets = (db.query(YoutubeChannel).filter(YoutubeChannel.channel_id.is_(None), YoutubeChannel.is_active.is_(True))
                   .order_by(YoutubeChannel.id).limit(limit).all())
        BULK_STATE.update(total=len(targets), done=0)
        saved, review, failed = [], [], []
        for ch in targets:
            BULK_STATE["current"] = ch.channel_name
            try:
                cands = client.get_channels(handle=ch.handle) if ch.handle else []
                if not cands:
                    cands = client.search_channels(ch.channel_name, 5)
                best, verdict = pick_best(ch, cands)
                if best:
                    dup = db.query(YoutubeChannel).filter(YoutubeChannel.channel_id == best["channel_id"]).first()
                    if dup and dup.id != ch.id:
                        failed.append({"channel": ch.channel_name, "reason": f"'{dup.channel_name}' 에 이미 같은 ID"})
                    else:
                        ch.channel_id = best["channel_id"]; ch.channel_url = best["url"]; ch.handle = best.get("handle") or ch.handle
                        ch.subscriber_count = best.get("subscriber_count")
                        others = "; ".join(f"{c['title']}({c.get('subscriber_count') or '?'}명)" for c in cands if c["channel_id"] != best["channel_id"])
                        ch.notes = ((ch.notes or "") + f"\n[일괄 ID 조회 {utcnow():%Y-%m-%d}] {verdict}. 저장: {best['title']}" + (f" / 다른 후보: {others}" if others else "")).strip()
                        (saved if verdict == "유력" else review).append({"channel": ch.channel_name, "saved": best["title"], "verdict": verdict})
                else:
                    failed.append({"channel": ch.channel_name, "reason": verdict})
                db.commit()
            except YouTubeAPIError as e:
                failed.append({"channel": ch.channel_name, "reason": str(e)})
                db.rollback()
                if e.reason == "quotaExceeded":
                    break
            BULK_STATE["done"] += 1
        summary = {"saved": saved, "needs_review": review, "failed": failed, "quota_used": client.quota_used}
        client.close()
        finish_job(job, "success" if not failed else "partial", summary, items=len(saved) + len(review), quota=client.quota_used)
        db.commit()
        BULK_STATE.update(running=False, current=None, summary=summary, finished_at=utcnow().isoformat())


def _run_collect(max_videos: int, years: int, stale_days: int):
    with SessionLocal() as db:
        q = db.query(YoutubeChannel).filter(YoutubeChannel.channel_id.isnot(None), YoutubeChannel.is_active.is_(True))
        if stale_days:
            cutoff = utcnow() - timedelta(days=stale_days)
            q = q.filter((YoutubeChannel.last_collected_at.is_(None)) | (YoutubeChannel.last_collected_at < cutoff))
        targets = q.order_by(YoutubeChannel.last_collected_at.asc().nullsfirst()).all()
        BULK_STATE.update(total=len(targets), done=0)
        results, quota = [], 0
        for ch in targets:
            BULK_STATE["current"] = ch.channel_name
            job = collect_channel_videos(db, ch, max_videos=max_videos, years=years, triggered_by="bulk")
            quota += job.quota_used
            results.append({"channel": ch.channel_name, "status": job.status, "created": job.result.get("created"),
                            "updated": job.result.get("updated"), "error": job.error})
            BULK_STATE["done"] += 1
            if job.status == "failed" and job.result.get("reason") == "quotaExceeded":
                break
        summary = {"channels": len(results), "success": sum(r["status"] == "success" for r in results),
                   "failed": [r for r in results if r["status"] == "failed"], "quota_used": quota, "results": results}
        BULK_STATE.update(running=False, current=None, summary=summary, finished_at=utcnow().isoformat())


def _run_discover(limit: int, max_results: int, suffix: str, years: int, order: str, shopping_only: bool = True):
    with SessionLocal() as db:
        celebs = (db.query(Celebrity).filter(Celebrity.is_demo.is_(False)).join(Celebrity.channels)
                  .filter(YoutubeChannel.is_active.is_(True)).distinct().order_by(Celebrity.id).limit(limit).all())
        BULK_STATE.update(total=len(celebs), done=0)
        results, quota = [], 0
        for c in celebs:
            BULK_STATE["current"] = c.name
            query = f"{c.name} {suffix}".strip()
            job = discover_shorts(db, query, celebrity_id=c.id, max_results=max_results, years=years, order=order,
                                  triggered_by="bulk", shopping_only=shopping_only)
            quota += job.quota_used
            results.append({"celebrity": c.name, "query": query, "status": job.status, "created": job.result.get("created"),
                            "updated": job.result.get("updated"), "found": job.result.get("found"),
                            "skipped_non_shopping": job.result.get("skipped_non_shopping"), "error": job.error})
            BULK_STATE["done"] += 1
            if job.status == "failed" and job.result.get("reason") == "quotaExceeded":
                break
        summary = {"celebrities": len(results), "success": sum(r["status"] == "success" for r in results),
                   "created": sum(r["created"] or 0 for r in results),
                   "skipped_non_shopping": sum(r["skipped_non_shopping"] or 0 for r in results),
                   "failed": [r for r in results if r["status"] == "failed"],
                   "quota_used": quota, "results": results}
        BULK_STATE.update(running=False, current=None, summary=summary, finished_at=utcnow().isoformat())


def _run_sourcing(report_date, refresh_limit: int, trigger: str = "manual"):
    """조회수 갱신(진행률 표시) → 일일 소싱 평가. 백그라운드."""
    from ..config import get_settings
    from .daily_sourcing import run_daily_sourcing

    with SessionLocal() as db:
        refresh = {"skipped": True, "reason": "YOUTUBE_API_KEY 미설정"}
        if get_settings().youtube_api_key and refresh_limit > 0:
            videos = (db.query(Video).filter(Video.is_demo.is_(False))
                      .order_by(Video.stats_updated_at.asc().nullsfirst()).limit(refresh_limit).all())
            BULK_STATE.update(total=len(videos), done=0, current="조회수 갱신")
            job = start_job(db, "refresh_video_stats", {"count": len(videos), "mode": "daily"}, trigger)
            db.commit()
            updated, missing, error = 0, [], None
            try:
                client = YouTubeClient()
                try:
                    now = utcnow().replace(microsecond=0)
                    for i in range(0, len(videos), 50):
                        chunk = videos[i:i + 50]
                        by_id = {v.youtube_video_id: v for v in chunk}
                        seen = set()
                        for item in client.get_videos(list(by_id)):
                            seen.add(item["video_id"])
                            upsert_video_from_api(db, item, by_id[item["video_id"]].channel, now)
                            updated += 1
                        missing += [vid for vid in by_id if vid not in seen]
                        db.commit()
                        BULK_STATE["done"] = min(len(videos), i + 50)
                finally:
                    client.close()
                finish_job(job, "success" if not missing else "partial", {"updated": updated, "missing_or_private": missing[:200],
                                                                         "missing_count": len(missing)}, items=updated, quota=client.quota_used)
            except YouTubeNotConfigured as e:
                error = str(e); finish_job(job, "failed", error=error)
            except YouTubeAPIError as e:
                error = str(e); finish_job(job, "failed", error=error)
            db.commit()
            refresh = {"skipped": False, "job_id": job.id, "status": job.status, "updated": updated, "quota_used": job.quota_used, "error": error}
        BULK_STATE.update(current="후보 평가")
        rep = run_daily_sourcing(db, trigger=trigger, report_date=report_date, refresh_limit=0)
        rep.summary = dict(rep.summary, stats_refresh=refresh)
        db.commit()
        summary = {"report_id": rep.id, "report_date": rep.report_date.isoformat(), "stats_refresh": refresh,
                   "total_candidates": rep.summary["total_candidates"], "total_final": rep.summary["total_final"]}
        BULK_STATE.update(running=False, current=None, summary=summary, finished_at=utcnow().isoformat())


def start(task: str, **params) -> dict:
    with _lock:
        if BULK_STATE["running"]:
            raise RuntimeError(f"다른 일괄 작업({BULK_STATE['task']})이 실행 중입니다. 완료 후 다시 시도하세요.")
        BULK_STATE.update(running=True, task=task, total=0, done=0, current=None, started_at=utcnow().isoformat(),
                          finished_at=None, summary={}, error=None)
    target = {"resolve": _run_resolve, "collect": _run_collect, "discover": _run_discover, "sourcing": _run_sourcing}[task]
    t = threading.Thread(target=target, kwargs=params, daemon=True, name=f"bulk-{task}")
    t.start()
    return status()
