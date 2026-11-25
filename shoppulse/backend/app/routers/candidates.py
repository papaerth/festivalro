from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..models import utcnow
from .. import schemas, serializers
from ..database import get_db
from ..models import (
    CANDIDATE_STATUSES, Product, ShortsPlan, SourcingCandidate, SourcingScore, VerificationRecord, Video,
    VideoSegment, VERIFICATION_ITEMS,
)
from ..services.audit import log
from ..services.daily_sourcing import video_graph
from ..services.scoring import compute_total, get_active_version, suggest_performance_score
from ..services.shorts_planner import generate_plan
from .common import apply_patch, get_or_404

router = APIRouter(prefix="/api/candidates", tags=["candidates"])

SORTS = {"score": "소싱 점수 높은 순", "outlier": "Outlier 높은 순", "vph": "VPH 높은 순", "views": "조회수 높은 순",
         "published_desc": "최근 업로드순", "published_asc": "오래된 영상순", "growth_7d": "최근 재상승률순(데이터 있을 때만)",
         "updated": "최근 변경순"}


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    cfg = get_active_version(db).config
    db.commit()
    from ..services.shorts_planner import CONTENT_TYPES
    return {"statuses": CANDIDATE_STATUSES, "content_types": CONTENT_TYPES, "scoring": cfg,
            "verification_items": [{"key": k, "label": l} for k, l in VERIFICATION_ITEMS], "sorts": SORTS}


@router.get("")
def list_candidates(
    category: str | None = None, status: str | None = None, celebrity_id: int | None = None,
    content_type: str | None = None, product_identification: str | None = None, grade: str | None = None,
    min_score: float | None = None, max_score: float | None = None, graph_type: str | None = None,
    video_format: str | None = None, sponsorship: str | None = None, production_ready: bool | None = None,
    min_outlier: float | None = None, min_vph: float | None = None, min_views: int | None = None,
    published_from: datetime | None = None, published_to: datetime | None = None,
    include_demo: bool = False, include_rejected: bool = False, produced: str | None = None,
    sort: str = "score", limit: int = Query(60, le=500), offset: int = 0,
    db: Session = Depends(get_db),
):
    cfg = get_active_version(db).config
    qs = db.query(SourcingCandidate).options(joinedload(SourcingCandidate.video), joinedload(SourcingCandidate.product))
    if not include_demo:
        qs = qs.filter(SourcingCandidate.is_demo.is_(False))
    if category:
        qs = qs.filter(SourcingCandidate.channel_category == category)
    if status:
        qs = qs.filter(SourcingCandidate.status.in_(status.split(",")))
    elif not include_rejected:
        qs = qs.filter(SourcingCandidate.status != "rejected")
    if produced == "yes":
        qs = qs.filter(SourcingCandidate.produced_at.isnot(None))
    elif produced == "no":
        qs = qs.filter(SourcingCandidate.produced_at.is_(None))
    if celebrity_id:
        qs = qs.filter(SourcingCandidate.celebrity_id == celebrity_id)
    if content_type:
        qs = qs.filter(SourcingCandidate.content_type == content_type)
    if product_identification:
        qs = qs.join(SourcingCandidate.product).filter(Product.identification_status == product_identification)
    if video_format or published_from or published_to or min_views is not None:
        qs = qs.join(SourcingCandidate.video)
        if video_format:
            qs = qs.filter(Video.video_format == video_format)
        if published_from:
            qs = qs.filter(Video.published_at >= published_from)
        if published_to:
            qs = qs.filter(Video.published_at <= published_to)
        if min_views is not None:
            qs = qs.filter(Video.view_count >= min_views)
    if sponsorship:
        qs = qs.join(SourcingCandidate.segment).filter(VideoSegment.sponsorship_status == sponsorship)

    rows = qs.all()
    items = []
    for c in rows:
        d = serializers.candidate_summary(c, cfg)
        vs = serializers.video_summary(c.video)
        d["video"] = vs
        items.append(d)

    def keep(i):
        if grade and i["grade_key"] != grade:
            return False
        if min_score is not None and (i["score"] is None or i["score"] < min_score):
            return False
        if max_score is not None and (i["score"] is None or i["score"] > max_score):
            return False
        if graph_type and i["video"]["graph"]["graph_type"] != graph_type:
            return False
        if production_ready is not None and i["production_ready"] != production_ready:
            return False
        if min_outlier is not None and (i["video"]["outlier"] is None or i["video"]["outlier"] < min_outlier):
            return False
        if min_vph is not None and (i["video"]["vph"] is None or i["video"]["vph"] < min_vph):
            return False
        return True

    items = [i for i in items if keep(i)]
    none_last = lambda v: (v is not None, v if v is not None else 0)  # noqa: E731
    if sort == "score":
        items.sort(key=lambda i: none_last(i["score"]), reverse=True)
    elif sort == "outlier":
        items.sort(key=lambda i: none_last(i["video"]["outlier"]), reverse=True)
    elif sort == "vph":
        items.sort(key=lambda i: none_last(i["video"]["vph"]), reverse=True)
    elif sort == "views":
        items.sort(key=lambda i: none_last(i["video"]["view_count"]), reverse=True)
    elif sort == "published_desc":
        items.sort(key=lambda i: i["video"]["published_at"] or "", reverse=True)
    elif sort == "published_asc":
        items.sort(key=lambda i: i["video"]["published_at"] or "9999")
    elif sort == "growth_7d":
        items = [i for i in items if i["video"]["graph"]["growth_7d"] is not None]
        items.sort(key=lambda i: i["video"]["graph"]["growth_7d"], reverse=True)
    elif sort == "updated":
        items.sort(key=lambda i: i["updated_at"], reverse=True)
    # 총점 순위(점수 있는 후보만, 필터 결과 안에서 1부터). 정렬 기준과 무관하게 '총점 순위'를 붙인다.
    by_score = sorted([i for i in items if i["score"] is not None], key=lambda i: -i["score"])
    rank_of = {i["id"]: n + 1 for n, i in enumerate(by_score)}
    for i in items:
        i["rank"] = rank_of.get(i["id"])
    total = len(items)
    return {"total": total, "items": items[offset: offset + limit], "sort": sort, "sort_label": SORTS.get(sort, sort),
            "ranked": len(by_score), "note": "저장된 후보의 정렬입니다(외부 새 검색 아님). 순위는 현재 필터 결과 안의 총점 순위입니다."}


@router.post("", status_code=201)
def create_candidate(body: schemas.CandidateIn, db: Session = Depends(get_db)):
    video = get_or_404(db, Video, body.video_id, "영상")
    if body.product_id:
        get_or_404(db, Product, body.product_id, "상품")
    if body.segment_id:
        s = get_or_404(db, VideoSegment, body.segment_id, "장면")
        if s.video_id not in (body.video_id, video.original_video_id):
            raise HTTPException(400, "장면이 해당 영상(또는 연결된 원본)에 속하지 않습니다")
    dup = db.query(SourcingCandidate).filter_by(video_id=body.video_id, product_id=body.product_id,
                                                channel_category=body.channel_category).first()
    if dup and (dup.segment_id == body.segment_id):
        raise HTTPException(409, {"message": "같은 영상·상품·카테고리 후보가 이미 있습니다", "candidate_id": dup.id})
    c = SourcingCandidate(**body.model_dump())
    db.add(c)
    db.flush()
    for key, _ in VERIFICATION_ITEMS:
        db.add(VerificationRecord(candidate_id=c.id, item=key, status="pending"))
    log(db, "candidate", c.id, "create", {"video_id": c.video_id, "category": c.channel_category})
    db.commit()
    # 버튼 누르기 전 준비: 규칙 간이 점수 + 템플릿 기획안
    try:
        from ..services.rule_scorer import save_rule_score
        from ..services.shorts_planner import generate_plan
        save_rule_score(db, c)
        plan, by = generate_plan(c, 25, provider="template")
        db.add(ShortsPlan(candidate_id=c.id, target_seconds=25, generated_by=by, plan=plan))
        db.commit()
    except Exception:
        db.rollback()
    return serializers.candidate_detail(c, get_active_version(db).config)


@router.post("/prepare-all")
def prepare_all(force: bool = False, db: Session = Depends(get_db)):
    """모든 활성 후보에 규칙 간이 점수(총점·순위)와 템플릿 기획안을 채운다. force=true 면 규칙 점수를 전부 다시 계산."""
    from ..services.rule_scorer import rule_score_step, template_plan_step
    return {"rule_scores": rule_score_step(db, force=force), "template_plans": template_plan_step(db)}


@router.post("/plans/generate-all")
def generate_all_plans(max_calls: int = Query(40, ge=1, le=200), db: Session = Depends(get_db)):
    """활성 후보 전체에 AI 기획안을 미리 생성한다(백그라운드). 진행은 /api/channels/bulk/status 로 확인."""
    from ..services import bulk
    try:
        return bulk.start("plans", max_calls=max_calls)
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.get("/{cid}")
def get_candidate(cid: int, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    return serializers.candidate_detail(c, get_active_version(db).config)


@router.patch("/{cid}")
def patch_candidate(cid: int, body: schemas.CandidatePatch, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in CANDIDATE_STATUSES:
        raise HTTPException(400, f"상태 값은 {CANDIDATE_STATUSES} 중 하나여야 합니다")
    if data.get("segment_id"):
        seg = get_or_404(db, VideoSegment, data["segment_id"], "장면")
        if seg.video_id not in (c.video_id, c.video.original_video_id):
            raise HTTPException(400, "장면이 해당 영상(또는 연결된 원본)에 속하지 않습니다")
    if data.get("product_id"):
        get_or_404(db, Product, data["product_id"], "상품")
    apply_patch(c, body)
    log(db, "candidate", c.id, "update", data)
    db.commit()
    return serializers.candidate_detail(c, get_active_version(db).config)


@router.delete("/{cid}", status_code=204)
def delete_candidate(cid: int, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    db.delete(c)
    db.commit()


@router.put("/{cid}/produced")
def set_produced(cid: int, body: schemas.ProducedIn, db: Session = Depends(get_db)):
    """사용자가 '이 후보로 영상을 만들었다'고 체크한다. 체크 시 상태가 후보 단계면 '게시 완료'로 올린다."""
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    if body.produced:
        c.produced_at = c.produced_at or utcnow()
        c.produced_url = body.produced_url or c.produced_url
        if c.status in ("candidate", "sourced", "verifying_product", "verifying_rights", "scripting", "editing", "scheduled", "hold"):
            c.status = "published"
    else:
        c.produced_at = None
        c.produced_url = None
    log(db, "candidate", c.id, "produced", {"produced": body.produced, "url": body.produced_url})
    db.commit()
    return serializers.candidate_detail(c, get_active_version(db).config)


@router.post("/{cid}/scores", status_code=201)
def add_score(cid: int, body: schemas.ScoreIn, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    ver = get_active_version(db)
    try:
        total, grade = compute_total(body.item_scores, ver.config)
    except ValueError as e:
        raise HTTPException(400, str(e))
    s = SourcingScore(candidate_id=c.id, scoring_version_id=ver.id, scorer=body.scorer,
                      item_scores=body.item_scores, rationale=body.rationale, total=total, grade_key=grade)
    db.add(s)
    log(db, "candidate", c.id, "score", {"scorer": body.scorer, "total": total})
    db.commit()
    return serializers.candidate_detail(c, ver.config)


@router.post("/{cid}/scores/suggest")
def suggest_score(cid: int, mode: str = "ai", db: Session = Depends(get_db)):
    """mode=ai: Claude 가 6개 항목 모두 채점(성과 항목은 지표가 있으면 규칙값 우선).
    mode=rule 또는 AI 키 없음: 규칙 간이 채점(6개 항목 모두, scorer='rule')."""
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    ver = get_active_version(db)
    from ..config import get_settings
    if mode == "ai" and get_settings().anthropic_api_key:
        from ..services.ai_scorer import score_with_ai
        from ..services.metrics import latest_metrics
        from ..services.shorts_planner import build_context
        from ..services.claude_client import ClaudeError
        graph = video_graph(c.video)
        ev = serializers.evidence_summary(c.video)
        perf_item = next((i for i in ver.config["items"] if i["key"] == "performance"), None)
        perf = suggest_performance_score(c.video.metrics, graph["graph_type"], perf_item["max"] if perf_item else 20, evidence=ev)
        ctx = build_context(c) | {"graph": graph, "evidence": ev, "view_count": c.video.view_count,
                                  "metrics": {k: m.get("value") for k, m in latest_metrics(c.video).items()},
                                  "computed": serializers.video_summary(c.video, with_graph=False).get("computed"),
                                  "auto_discovery_note": c.notes}
        try:
            r = score_with_ai(c, ver.config, ctx, perf)
        except ClaudeError as e:
            raise HTTPException(502, f"AI 채점 실패: {e}")
        except Exception as e:
            raise HTTPException(502, f"AI 채점 실패: {e}")
        total, grade = compute_total(r["item_scores"], ver.config)
        s = SourcingScore(candidate_id=c.id, scoring_version_id=ver.id, scorer="ai", item_scores=r["item_scores"],
                          rationale=r["rationale"] | {"_summary": r["summary"], "_model": r["model"]}, total=total, grade_key=grade)
        db.add(s)
        log(db, "candidate", c.id, "score", {"scorer": "ai", "total": total, "mode": "ai"})
        db.commit()
        return serializers.candidate_detail(c, ver.config)
    # 규칙 간이 채점(6개 항목 모두, AI 아님) — 총점·순위가 바로 나온다
    from ..services.rule_scorer import save_rule_score
    save_rule_score(db, c, ver)
    log(db, "candidate", c.id, "score", {"scorer": "rule", "mode": mode})
    db.commit()
    return serializers.candidate_detail(c, ver.config)


@router.put("/{cid}/verification")
def set_verification(cid: int, body: schemas.VerificationIn, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    if body.item not in {k for k, _ in VERIFICATION_ITEMS}:
        raise HTTPException(400, "알 수 없는 검증 항목")
    rec = db.query(VerificationRecord).filter_by(candidate_id=c.id, item=body.item).first()
    if not rec:
        rec = VerificationRecord(candidate_id=c.id, item=body.item)
        db.add(rec)
    rec.status, rec.note, rec.checked_by = body.status, body.note, body.checked_by
    rec.checked_at = utcnow()
    log(db, "candidate", c.id, "verify", {"item": body.item, "status": body.status})
    db.commit()
    return serializers.candidate_detail(c, get_active_version(db).config)


@router.post("/{cid}/plans", status_code=201)
def create_plan(cid: int, body: schemas.PlanRequest, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    try:
        plan, by = generate_plan(c, body.target_seconds, provider=None if body.provider == "auto" else body.provider)
    except Exception as e:  # AI 실패 시 명확히 알림
        raise HTTPException(502, f"기획안 생성 실패: {e}")
    p = ShortsPlan(candidate_id=c.id, target_seconds=body.target_seconds, generated_by=by, plan=plan)
    db.add(p)
    db.commit()
    return serializers.plan(p)
