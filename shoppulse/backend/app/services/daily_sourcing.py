"""매일 소싱 작업. 카테고리별 후보 9개 조사 → 최종 3개 추천(총 27 / 9 목표).

목표 개수를 채우기 위해 검증되지 않은 결과를 만들지 않는다. 실제 확보한 수를 그대로 기록한다.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models import utcnow
from ..models import (
    CRITICAL_VERIFICATION_ITEMS, DailyReport, SourcingCandidate, Video, VerificationRecord,
)
from .graph_analysis import analyze
from .scoring import get_active_version, latest_scores

CATEGORIES = ["beauty", "living", "food"]
CATEGORY_LABELS = {"beauty": "뷰티·패션", "living": "생활용품", "food": "먹거리"}
TARGET_CANDIDATES = 9
TARGET_FINAL = 3


def video_graph(video: Video) -> dict:
    pts = [(s.observed_at, s.view_count) for s in video.snapshots]
    return analyze(pts, [s.source for s in video.snapshots]).to_dict()


def production_ready(candidate: SourcingCandidate) -> tuple[bool, list[str]]:
    """중대한 검증 항목이 모두 passed 여야 '제작 준비 완료'."""
    status = {v.item: v.status for v in candidate.verifications}
    unresolved = [item for item in CRITICAL_VERIFICATION_ITEMS if status.get(item) != "passed"]
    return (not unresolved), sorted(unresolved)


def refresh_stats_step(db: Session, limit: int) -> dict:
    """YouTube API 키가 있으면 오래된 영상부터 조회수를 갱신해 스냅샷을 쌓는다. 없으면 건너뛴 사실을 기록."""
    from ..config import get_settings
    from .collection import refresh_video_stats

    if not get_settings().youtube_api_key:
        return {"skipped": True, "reason": "YOUTUBE_API_KEY 미설정"}
    videos = (db.query(Video).filter(Video.is_demo.is_(False))
              .order_by(Video.stats_updated_at.asc().nullsfirst()).limit(limit).all())
    if not videos:
        return {"skipped": True, "reason": "영상 없음"}
    job = refresh_video_stats(db, videos, triggered_by="daily_sourcing")
    return {"skipped": False, "job_id": job.id, "status": job.status, "updated": job.result.get("updated"),
            "quota_used": job.quota_used, "error": job.error}


def run_daily_sourcing(db: Session, trigger: str = "manual", report_date: date | None = None,
                       refresh_limit: int | None = None) -> DailyReport:
    report_date = report_date or date.today()
    if refresh_limit is None:
        from ..models import UserSetting
        s = db.get(UserSetting, "daily_refresh_limit")
        refresh_limit = int(s.value.get("value", 300)) if s else 300
    refresh = refresh_stats_step(db, refresh_limit) if refresh_limit > 0 else {"skipped": True, "reason": "갱신 개수 0"}
    yesterday = report_date - timedelta(days=1)
    prev = (
        db.query(DailyReport).filter(DailyReport.report_date == yesterday)
        .order_by(DailyReport.generated_at.desc()).first()
    )
    prev_final_ids: set[int] = set()
    if prev:
        for cat in prev.candidates:
            prev_final_ids.update(cat.get("final_ids", []))

    cfg = get_active_version(db).config
    out_categories = []
    summary = {"graph_types": {}, "total_candidates": 0, "total_final": 0, "stats_refresh": refresh,
               "targets": {"candidates_per_category": TARGET_CANDIDATES, "final_per_category": TARGET_FINAL}}

    for cat in CATEGORIES:
        cands = (
            db.query(SourcingCandidate)
            .filter(SourcingCandidate.channel_category == cat,
                    SourcingCandidate.status.notin_(["rejected", "published", "analyzing"]),
                    SourcingCandidate.is_demo.is_(False))
            .all()
        )
        rows = []
        for c in cands:
            ls = latest_scores(c.scores)
            final = ls["final"]
            total = final.total if final else None
            graph = video_graph(c.video)
            summary["graph_types"][graph["graph_type"]] = summary["graph_types"].get(graph["graph_type"], 0) + 1
            ready, unresolved = production_ready(c)
            rows.append({
                "candidate_id": c.id, "video_id": c.video_id, "title": c.video.title,
                "score": total, "grade": final.grade_key if final else None, "scorer": final.scorer if final else None,
                "graph_type": graph["graph_type"], "production_ready": ready, "unresolved": unresolved,
                "status": c.status,
            })
        # 점수 있는 것 우선, 점수 높은 순. 재상승/뒤늦은 급상승은 동점 시 우선.
        prio = {"resurgence": 2, "late_surge": 2, "spike_plateau": 1}
        rows.sort(key=lambda r: ((r["score"] is not None), r["score"] or -1, prio.get(r["graph_type"], 0)), reverse=True)
        top = rows[:TARGET_CANDIDATES]
        final = [r for r in top if r["score"] is not None][:TARGET_FINAL]
        duplicates = []
        for r in final:
            c = next(x for x in cands if x.id == r["candidate_id"])
            if c.id in prev_final_ids:
                reason = []
                if r["graph_type"] in ("resurgence", "late_surge"):
                    reason.append(f"그래프 {r['graph_type']} 재상승 징후")
                reason.append("전날에도 추천됨 — 새로운 정보가 없으면 제외 검토")
                c.duplicate_reason = " / ".join(reason)
                duplicates.append({"candidate_id": c.id, "reason": c.duplicate_reason})
            else:
                c.duplicate_reason = None
            c.last_recommended_date = report_date
            c.recommendation_count = (c.recommendation_count or 0) + 1
        out_categories.append({
            "category": cat, "label": CATEGORY_LABELS[cat],
            "found": len(rows), "candidate_ids": [r["candidate_id"] for r in top],
            "final_ids": [r["candidate_id"] for r in final], "rows": top,
            "shortfall": max(0, TARGET_CANDIDATES - len(top)),
            "final_shortfall": max(0, TARGET_FINAL - len(final)),
            "duplicates_from_previous_day": duplicates,
            "note": None if len(final) >= TARGET_FINAL else "점수가 매겨진 후보가 부족합니다. 후보를 추가·평가하세요(가짜 결과를 만들지 않음).",
        })
        summary["total_candidates"] += len(top)
        summary["total_final"] += len(final)

    report = DailyReport(report_date=report_date, trigger=trigger, summary=summary, candidates=out_categories,
                         generated_at=utcnow())
    db.add(report)
    db.commit()
    return report
