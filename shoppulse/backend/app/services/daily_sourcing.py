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


def ai_score_step(db: Session, max_per_category: int = TARGET_CANDIDATES, report_date: date | None = None) -> dict:
    """AI 점수가 없는 후보(카테고리별 최대 N개, 자동 발굴·미평가 우선)를 AI 로 1차 채점한다."""
    from ..config import get_settings
    from ..serializers import evidence_summary
    from .ai_scorer import score_with_ai
    from .product_identifier import AINotConfigured
    from .scoring import compute_total, get_active_version, latest_scores, suggest_performance_score
    from .shorts_planner import build_context
    from .metrics import latest_metrics
    from ..models import SourcingScore

    if not get_settings().anthropic_api_key:
        return {"skipped": True, "reason": "ANTHROPIC_API_KEY 미설정 — 사람이 점수를 입력해야 추천이 됩니다", "scored": 0}
    ver = get_active_version(db)
    scored, failed = 0, []
    for cat in CATEGORIES:
        cands = (db.query(SourcingCandidate)
                 .filter(SourcingCandidate.channel_category == cat, SourcingCandidate.is_demo.is_(False),
                         SourcingCandidate.status.notin_(["rejected", "published", "analyzing"]))
                 .order_by(SourcingCandidate.created_at.desc()).all())
        todo = [c for c in cands if latest_scores(c.scores)["final"] is None or
                (latest_scores(c.scores)["human"] is None and latest_scores(c.scores)["ai"] is not None
                 and latest_scores(c.scores)["ai"].total is None)][:max_per_category]
        for c in todo:
            graph = video_graph(c.video)
            ev = evidence_summary(c.video)
            perf = suggest_performance_score(c.video.metrics, graph["graph_type"], next(i["max"] for i in ver.config["items"] if i["key"] == "performance"), evidence=ev)
            ctx = build_context(c) | {"graph": graph, "evidence": ev, "view_count": c.video.view_count,
                                      "metrics": {k: m.get("value") for k, m in latest_metrics(c.video).items()},
                                      "auto_discovery_note": c.notes}
            try:
                r = score_with_ai(c, ver.config, ctx, perf)
            except AINotConfigured as e:
                return {"skipped": True, "reason": str(e), "scored": scored}
            except Exception as e:
                failed.append({"candidate_id": c.id, "error": str(e)[:200]})
                continue
            total, grade = compute_total(r["item_scores"], ver.config)
            db.add(SourcingScore(candidate_id=c.id, scoring_version_id=ver.id, scorer="ai", item_scores=r["item_scores"],
                                 rationale=r["rationale"] | {"_summary": r["summary"], "_model": r["model"]},
                                 total=total, grade_key=grade))
            scored += 1
            db.commit()
    return {"skipped": False, "scored": scored, "failed": failed}


def ai_identify_products_step(db: Session, max_calls: int = 30) -> dict:
    """상품이 연결되지 않은 활성 후보 쇼츠에 AI 상품 추정을 돌리고, 확신도 high/medium 추정을 '유사 상품 후보'로 자동 연결한다."""
    from ..config import get_settings
    from ..models import Product, ProductMention
    from ..serializers import product_status
    from .product_identifier import AINotConfigured, identify

    if not get_settings().anthropic_api_key:
        return {"skipped": True, "reason": "ANTHROPIC_API_KEY 미설정", "identified": 0, "linked": 0}
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected", "published", "analyzing"]))
             .order_by(SourcingCandidate.created_at.desc()).all())
    identified = linked = 0
    failed, no_result = [], 0
    for c in cands:
        if identified >= max_calls:
            break
        v = c.video
        if product_status(v) != "none" or v.ai_product_suggestions is not None:
            continue
        if v.resolved_links is None:
            try:
                from .link_resolver import resolve_video_links
                v.resolved_links = resolve_video_links(v.description, v.yt_channel_description)
                db.commit()
            except Exception:
                pass
        try:
            result = identify(v, extra_images=None, use_thumbnail=True)
        except AINotConfigured as e:
            return {"skipped": True, "reason": str(e), "identified": identified, "linked": linked}
        except Exception as e:
            failed.append({"video_id": v.id, "error": str(e)[:200]})
            continue
        identified += 1
        v.ai_product_suggestions = result
        adopted_first = None
        for sg in result.get("suggestions", []):
            if sg.get("confidence") not in ("high", "medium") or sg.get("category") not in CATEGORIES or not sg.get("name"):
                continue
            p = Product(name=sg["name"], brand=sg.get("brand") or None, category=sg["category"], subcategory=sg.get("subcategory") or None,
                        identification_status="similar_candidate",
                        notes=f"[AI 추정 자동 연결] 영상 {v.youtube_video_id} · 확신도 {sg['confidence']} · 근거: {sg.get('evidence', '')} — 사람이 확인 후 상태를 바꾸세요.")
            db.add(p)
            db.flush()
            db.add(ProductMention(video_id=v.id, product_id=p.id, celebrity_id=v.celebrity_id))
            linked += 1
            adopted_first = adopted_first or p
        if adopted_first and not c.product_id:
            c.product_id = adopted_first.id
        if not result.get("suggestions"):
            no_result += 1
        db.commit()
    return {"skipped": False, "identified": identified, "linked": linked, "no_result": no_result, "failed": failed}


def ai_plan_step(db: Session, candidate_ids: list[int]) -> dict:
    """최종 추천 후보에 AI 쇼츠 기획안을 자동 생성한다(오늘 이미 있으면 건너뜀). 키가 없으면 건너뜀."""
    from ..config import get_settings
    from ..models import ShortsPlan, UserSetting
    from .shorts_planner import generate_plan

    if not get_settings().anthropic_api_key:
        return {"skipped": True, "reason": "ANTHROPIC_API_KEY 미설정", "generated": 0}
    ts = db.get(UserSetting, "default_target_seconds")
    target = int(ts.value.get("value", 25)) if ts else 25
    generated, failed, existing = 0, [], 0
    today = utcnow().date()
    for cid in candidate_ids:
        c = db.get(SourcingCandidate, cid)
        if not c:
            continue
        if any(p.created_at.date() == today and p.generated_by == "anthropic" for p in c.plans):
            existing += 1
            continue
        try:
            plan, by = generate_plan(c, target)
        except Exception as e:
            failed.append({"candidate_id": cid, "error": str(e)[:200]})
            continue
        db.add(ShortsPlan(candidate_id=cid, target_seconds=target, generated_by=by, plan=plan))
        generated += 1
        db.commit()
    return {"skipped": False, "generated": generated, "existing_today": existing, "failed": failed}


def run_daily_sourcing(db: Session, trigger: str = "manual", report_date: date | None = None,
                       refresh_limit: int | None = None, auto_discover: bool = True, ai_score: bool = True) -> DailyReport:
    report_date = report_date or date.today()
    if refresh_limit is None:
        from ..models import UserSetting
        s = db.get(UserSetting, "daily_refresh_limit")
        refresh_limit = int(s.value.get("value", 300)) if s else 300
    refresh = refresh_stats_step(db, refresh_limit) if refresh_limit > 0 else {"skipped": True, "reason": "갱신 개수 0"}
    discovery = None
    legacy_retired = 0
    if auto_discover:
        from .auto_candidates import discover_candidates
        # 구버전(원본 영상 기준) 자동 발굴 후보 정리: 사람 점수·기획안·상태 변경이 없는 것만 '제외'로
        legacy = (db.query(SourcingCandidate).join(SourcingCandidate.video)
                  .filter(SourcingCandidate.status == "candidate", SourcingCandidate.notes.like("[자동 발굴%"),
                          Video.source_type == "original_celebrity").all())
        for c in legacy:
            if any(sc.scorer == "human" for sc in c.scores) or c.plans:
                continue
            c.status = "rejected"
            c.duplicate_reason = "구버전 자동 발굴(원본 영상 기준) — 후보 기준이 재편집 쇼츠로 바뀌어 자동 제외"
            legacy_retired += 1
        db.commit()
        discovery = discover_candidates(db, per_category=TARGET_CANDIDATES)
        discovery["legacy_retired"] = legacy_retired
    ai_products = ai_identify_products_step(db) if ai_score else {"skipped": True, "reason": "비활성", "identified": 0, "linked": 0}
    ai = ai_score_step(db) if ai_score else {"skipped": True, "reason": "비활성", "scored": 0}
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
               "auto_discovery": discovery, "ai_scoring": ai, "ai_products": ai_products,
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
                "is_short": c.video.source_type in ("reedit_shorts", "competitor"),
                "thumbnail_url": c.video.thumbnail_url, "view_count": c.video.view_count,
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
            "found": len(rows), "shorts": sum(r["is_short"] for r in rows), "originals": sum(not r["is_short"] for r in rows), "candidate_ids": [r["candidate_id"] for r in top],
            "final_ids": [r["candidate_id"] for r in final], "rows": top,
            "shortfall": max(0, TARGET_CANDIDATES - len(top)),
            "final_shortfall": max(0, TARGET_FINAL - len(final)),
            "duplicates_from_previous_day": duplicates,
            "note": None if len(final) >= TARGET_FINAL else (
                "점수가 매겨진 후보가 부족합니다. " + ("AI 키가 없어 사람이 점수를 입력해야 합니다." if ai.get("skipped") else "후보를 추가하거나 평가하세요.") + " (가짜 결과를 만들지 않음)"),
        })
        summary["total_candidates"] += len(top)
        summary["total_final"] += len(final)

    summary["ai_plans"] = ai_plan_step(db, [cid for cat in out_categories for cid in cat["final_ids"]]) if ai_score else {"skipped": True, "reason": "비활성"}
    report = DailyReport(report_date=report_date, trigger=trigger, summary=summary, candidates=out_categories,
                         generated_at=utcnow())
    db.add(report)
    db.commit()
    return report
