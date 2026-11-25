from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..models import utcnow
from .. import schemas, serializers
from ..database import get_db
from ..models import Video, VideoMetric, VideoSegment, YoutubeChannel, Celebrity
from ..services import collection
from ..services.audit import log
from ..services.daily_sourcing import video_graph
from ..services.dedupe import classify_format, extract_video_id
from ..services.metrics import add_metric, add_snapshot
from .common import apply_patch, get_or_404

router = APIRouter(prefix="/api/videos", tags=["videos"])

SORTS = {
    "view_count": "조회수 높은 순", "published_desc": "최근 업로드순", "published_asc": "오래된 영상순",
    "outlier": "Outlier 높은 순", "vph": "VPH 높은 순", "updated": "최근 갱신순", "growth_7d": "최근 7일 증가량순(데이터 있을 때만)",
}


def _latest_metric_subq(db: Session, metric_type: str):
    latest = (
        db.query(VideoMetric.video_id, func.max(VideoMetric.measured_at).label("mx"))
        .filter(VideoMetric.metric_type == metric_type).group_by(VideoMetric.video_id).subquery()
    )
    return (
        db.query(VideoMetric.video_id.label("vid"), VideoMetric.value.label("val"))
        .join(latest, (VideoMetric.video_id == latest.c.video_id) & (VideoMetric.measured_at == latest.c.mx))
        .filter(VideoMetric.metric_type == metric_type).subquery()
    )


@router.get("")
def list_videos(
    q: str | None = None, channel_id: int | None = None, celebrity_id: int | None = None,
    video_format: str | None = None, source_type: str | None = None, access_status: str | None = None,
    published_from: datetime | None = None, published_to: datetime | None = None,
    min_views: int | None = None, max_views: int | None = None,
    min_outlier: float | None = None, max_outlier: float | None = None,
    min_vph: float | None = None, max_vph: float | None = None,
    min_duration: int | None = None, max_duration: int | None = None,
    graph_type: str | None = None, content_type: str | None = None, sponsorship: str | None = None,
    original_video_id: int | None = None, unlinked_derived: bool = False, shopping: str | None = None,
    product_status: str | None = None,
    include_demo: bool = False, sort: str = "view_count",
    limit: int = Query(50, le=500), offset: int = 0, with_graph: bool = True,
    db: Session = Depends(get_db),
):
    qs = db.query(Video).options(joinedload(Video.channel).joinedload(YoutubeChannel.celebrity))
    if not include_demo:
        qs = qs.filter(Video.is_demo.is_(False))
    if q:
        qs = qs.filter(or_(Video.title.contains(q), Video.description.contains(q), Video.youtube_video_id == q))
    if channel_id:
        qs = qs.filter(Video.channel_id == channel_id)
    if celebrity_id:
        qs = qs.outerjoin(Video.channel).filter(or_(YoutubeChannel.celebrity_id == celebrity_id, Video.celebrity_id == celebrity_id))
    if original_video_id:
        qs = qs.filter(Video.original_video_id == original_video_id)
    if unlinked_derived:
        qs = qs.filter(Video.source_type.in_(["reedit_shorts", "competitor"]), Video.original_video_id.is_(None))
    if shopping:
        from ..services.shopping_filter import threshold
        th = threshold()
        if shopping == "yes":
            qs = qs.filter(or_(Video.is_shopping.is_(True), (Video.is_shopping.is_(None)) & (Video.shopping_score >= th)))
        elif shopping == "no":
            qs = qs.filter(or_(Video.is_shopping.is_(False), (Video.is_shopping.is_(None)) & (Video.shopping_score < th)))
        elif shopping == "unknown":
            qs = qs.filter(Video.is_shopping.is_(None), Video.shopping_score.is_(None))
    if video_format:
        qs = qs.filter(Video.video_format == video_format)
    if source_type:
        qs = qs.filter(Video.source_type == source_type)
    if access_status:
        qs = qs.filter(Video.access_status == access_status)
    if published_from:
        qs = qs.filter(Video.published_at >= published_from)
    if published_to:
        qs = qs.filter(Video.published_at <= published_to)
    if min_views is not None:
        qs = qs.filter(Video.view_count >= min_views)
    if max_views is not None:
        qs = qs.filter(Video.view_count <= max_views)
    if min_duration is not None:
        qs = qs.filter(Video.duration_seconds >= min_duration)
    if max_duration is not None:
        qs = qs.filter(Video.duration_seconds <= max_duration)
    if content_type or sponsorship:
        seg_q = db.query(VideoSegment.video_id)
        if content_type:
            seg_q = seg_q.filter(VideoSegment.content_type == content_type)
        if sponsorship:
            seg_q = seg_q.filter(VideoSegment.sponsorship_status == sponsorship)
        qs = qs.filter(Video.id.in_(seg_q))

    out_sq = _latest_metric_subq(db, "outlier")
    vph_sq = _latest_metric_subq(db, "vph")
    qs = qs.outerjoin(out_sq, out_sq.c.vid == Video.id).outerjoin(vph_sq, vph_sq.c.vid == Video.id)
    if min_outlier is not None:
        qs = qs.filter(out_sq.c.val >= min_outlier)
    if max_outlier is not None:
        qs = qs.filter(out_sq.c.val <= max_outlier)
    if min_vph is not None:
        qs = qs.filter(vph_sq.c.val >= min_vph)
    if max_vph is not None:
        qs = qs.filter(vph_sq.c.val <= max_vph)

    total = qs.count()
    if sort == "published_desc":
        qs = qs.order_by(Video.published_at.desc().nullslast())
    elif sort == "published_asc":
        qs = qs.order_by(Video.published_at.asc().nullslast())
    elif sort == "outlier":
        qs = qs.order_by(out_sq.c.val.desc().nullslast())
    elif sort == "vph":
        qs = qs.order_by(vph_sq.c.val.desc().nullslast())
    elif sort == "updated":
        qs = qs.order_by(Video.updated_at.desc())
    else:
        qs = qs.order_by(Video.view_count.desc().nullslast())

    post_filter = bool(graph_type or sort == "growth_7d" or product_status)
    rows = qs.all() if post_filter else qs.offset(offset).limit(limit).all()
    items = [serializers.video_summary(v, with_graph=with_graph or bool(graph_type) or sort == "growth_7d") for v in rows]
    if product_status:
        items = [i for i in items if i["product_status"] == product_status]
    if graph_type:
        items = [i for i in items if i["graph"]["graph_type"] == graph_type]
    if sort == "growth_7d":
        items = [i for i in items if i["graph"]["growth_7d"] is not None]
        items.sort(key=lambda i: i["graph"]["growth_7d"], reverse=True)
    if post_filter:
        total = len(items)
        items = items[offset: offset + limit]
    return {"total": total, "items": items, "sort": sort, "sort_label": SORTS.get(sort, sort),
            "note": "저장된 데이터 정렬입니다(외부 새 검색 아님)."}


@router.get("/vidiq-request")
def vidiq_request(limit: int = Query(30, le=200), only_candidates: bool = True, db: Session = Depends(get_db)):
    """vidIQ(MCP) 에서 과거 일별 조회수를 받아오기 위한 영상 ID 목록과 요청 문구를 만든다."""
    from ..models import SourcingCandidate
    if only_candidates:
        rows = (db.query(Video).join(SourcingCandidate, SourcingCandidate.video_id == Video.id)
                .filter(SourcingCandidate.status != "rejected", Video.is_demo.is_(False)).distinct().all())
    else:
        rows = db.query(Video).filter(Video.is_demo.is_(False), Video.source_type.in_(["reedit_shorts", "competitor"])).all()
    # 관측이 적은(과거 기록 없는) 영상 우선
    rows.sort(key=lambda v: (len(v.snapshots), -(v.view_count or 0)))
    picked = rows[:limit]
    ids = [v.youtube_video_id for v in picked]
    earliest = min((v.published_at for v in picked if v.published_at), default=None)
    prompt = (
        "vidIQ 도구를 사용해 아래 유튜브 영상들의 과거 일별 조회수 시계열을 받아 주세요.\n"
        "각 영상마다 vidiq_video_stats 를 granularity=daily 로 호출하고, from 은 영상 게시일(모르면 "
        f"{earliest.date().isoformat() if earliest else '3년 전'}), to 는 오늘로 해 주세요.\n"
        "결과는 가공하지 말고 각 호출의 원본 JSON 응답({\"videoId\": ..., \"data\": [...]})을 그대로 JSON 배열로 묶어 "
        "하나의 .json 파일(예: vidiq_stats.json)로 저장해 주세요. 추가로 vidiq_get_videos_by_ids 로 같은 ID들의 최신 VPH·Outlier 도 받아 "
        "vidiq_meta.json 으로 저장해 주세요.\n\n영상 ID 목록:\n" + "\n".join(ids)
    )
    return {"count": len(ids), "video_ids": ids, "prompt": prompt,
            "note": "ChatGPT 또는 Claude 에 vidIQ 를 연결한 대화창에 붙여넣으세요. 받은 JSON 파일은 「데이터 수집 → vidIQ JSON 업로드」로 올리면 그래프가 채워집니다. 영상 1개당 vidIQ 크레딧 5가 듭니다."}


@router.get("/vidiq-transcript-request")
def vidiq_transcript_request(limit: int = Query(30, le=200), db: Session = Depends(get_db)):
    """활성 후보의 원본 영상 중 자막이 없고 장면도 없는 것들의 ID 와 vidIQ 자막 요청 문구."""
    from ..models import SourcingCandidate
    from ..services.segment_finder import transcript_request_prompt
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected", "published", "analyzing"])).all())
    seen, ids = set(), []
    for c in cands:
        o = c.video.original
        if o is None or c.segment_id or o.transcript or o.youtube_video_id in seen:
            continue
        seen.add(o.youtube_video_id)
        ids.append(o.youtube_video_id)
    ids = ids[:limit]
    return {"count": len(ids), "video_ids": ids, "prompt": transcript_request_prompt(ids) if ids else "",
            "note": "원본 영상의 자막을 받아 올리면 쇼츠가 쓴 구간(몇 분 몇 초)과 실제 발언을 자동으로 찾습니다. 영상 1개당 vidIQ 크레딧 5."}


@router.post("", status_code=201)
def create_video(body: schemas.VideoIn, db: Session = Depends(get_db)):
    vid = extract_video_id(body.url_or_id)
    if not vid:
        raise HTTPException(400, "유튜브 영상 URL 또는 11자리 영상 ID를 입력하세요")
    existing = db.query(Video).filter(Video.youtube_video_id == vid).first()
    if existing:
        raise HTTPException(409, {"message": "이미 등록된 영상입니다", "video_id": existing.id})
    channel = db.get(YoutubeChannel, body.channel_id) if body.channel_id else None
    fetch_note = None
    if body.fetch:
        v, created, err = collection.add_video_by_id(db, vid, channel)
        if v is not None:
            if body.notes:
                v.notes = (v.notes or "") + "\n" + body.notes
            v.source_type = body.source_type
            v.is_demo = body.is_demo
            db.commit()
            return serializers.video_detail(v) | {"fetch_note": "YouTube API 로 메타데이터를 가져왔습니다."}
        fetch_note = f"YouTube API 조회 실패({err}). 입력한 값으로 수동 등록했습니다."
    v = Video(
        youtube_video_id=vid, channel_id=body.channel_id, celebrity_id=body.celebrity_id, title=body.title or f"(제목 미확인) {vid}",
        description=body.description, published_at=body.published_at, duration_seconds=body.duration_seconds,
        video_format=classify_format(body.duration_seconds), thumbnail_url=body.thumbnail_url,
        url=f"https://www.youtube.com/watch?v={vid}", source_type=body.source_type, access_status=body.access_status,
        data_source="manual", notes=body.notes, is_demo=body.is_demo, collected_at=utcnow(),
    )
    from ..services.shopping_filter import classify
    classify(v)
    db.add(v)
    db.flush()
    if body.view_count is not None:
        add_snapshot(db, v, utcnow().replace(microsecond=0), body.view_count, "manual")
    log(db, "video", v.id, "create", {"youtube_video_id": vid, "fetch": body.fetch})
    db.commit()
    return serializers.video_detail(v) | {"fetch_note": fetch_note}


@router.get("/{vid}")
def get_video(vid: int, db: Session = Depends(get_db)):
    return serializers.video_detail(get_or_404(db, Video, vid, "영상"))


@router.patch("/{vid}")
def patch_video(vid: int, body: schemas.VideoPatch, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    if body.original_video_id is not None:
        if body.original_video_id == vid:
            raise HTTPException(400, "자기 자신을 원본으로 연결할 수 없습니다")
        get_or_404(db, Video, body.original_video_id, "원본 영상")
    apply_patch(v, body)
    if body.duration_seconds is not None:
        v.video_format = classify_format(body.duration_seconds)
    db.commit()
    return serializers.video_detail(v)


@router.delete("/{vid}", status_code=204)
def delete_video(vid: int, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    db.delete(v)
    log(db, "video", vid, "delete", {})
    db.commit()


@router.get("/{vid}/graph")
def get_graph(vid: int, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    return {"analysis": video_graph(v),
            "points": [{"observed_at": s.observed_at.isoformat(), "view_count": s.view_count, "source": s.source} for s in v.snapshots]}


@router.post("/{vid}/snapshots", status_code=201)
def add_snapshot_api(vid: int, body: schemas.SnapshotIn, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    ok = add_snapshot(db, v, body.observed_at.replace(tzinfo=None), body.view_count, body.source, body.like_count, body.comment_count)
    if not ok:
        raise HTTPException(409, "같은 시각의 관측치가 이미 있습니다")
    db.commit()
    return serializers.video_detail(v)


@router.post("/{vid}/metrics", status_code=201)
def add_metric_api(vid: int, body: schemas.MetricIn, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    add_metric(db, v, body.metric_type, body.value, body.source, (body.measured_at or utcnow()).replace(tzinfo=None),
               basis=body.basis, note=body.note)
    db.commit()
    return serializers.video_detail(v)


@router.delete("/{vid}/metrics/{mid}", status_code=204)
def delete_metric(vid: int, mid: int, db: Session = Depends(get_db)):
    m = db.get(VideoMetric, mid)
    if not m or m.video_id != vid:
        raise HTTPException(404, "지표를 찾을 수 없습니다")
    db.delete(m)
    db.commit()


@router.post("/{vid}/segments", status_code=201)
def add_segment(vid: int, body: schemas.SegmentIn, db: Session = Depends(get_db)):
    v = get_or_404(db, Video, vid, "영상")
    if body.start_seconds is not None and body.end_seconds is not None and body.end_seconds < body.start_seconds:
        raise HTTPException(400, "종료 시점이 시작 시점보다 앞설 수 없습니다")
    if v.duration_seconds and body.end_seconds and body.end_seconds > v.duration_seconds:
        raise HTTPException(400, "종료 시점이 영상 길이를 넘습니다")
    s = VideoSegment(video_id=v.id, **body.model_dump())
    db.add(s)
    db.commit()
    return serializers.segment(s)


@router.patch("/{vid}/segments/{sid}")
def patch_segment(vid: int, sid: int, body: schemas.SegmentPatch, db: Session = Depends(get_db)):
    s = db.get(VideoSegment, sid)
    if not s or s.video_id != vid:
        raise HTTPException(404, "장면을 찾을 수 없습니다")
    apply_patch(s, body)
    db.commit()
    return serializers.segment(s)


@router.delete("/{vid}/segments/{sid}", status_code=204)
def delete_segment(vid: int, sid: int, db: Session = Depends(get_db)):
    s = db.get(VideoSegment, sid)
    if not s or s.video_id != vid:
        raise HTTPException(404, "장면을 찾을 수 없습니다")
    db.delete(s)
    db.commit()


@router.post("/discover-shorts")
def discover_shorts(body: schemas.DiscoverShortsIn, db: Session = Depends(get_db)):
    """연예인·상품 키워드로 YouTube 쇼츠를 검색해 재편집 쇼츠로 등록(할당량 100/검색)."""
    job = collection.discover_shorts(db, body.query, celebrity_id=body.celebrity_id, max_results=body.max_results,
                                     years=body.years, order=body.order, source_type=body.source_type,
                                     shopping_only=body.shopping_only)
    return serializers.job(job)


@router.post("/{vid}/copy-original-products", status_code=201)
def copy_original_products(vid: int, db: Session = Depends(get_db)):
    """재편집 쇼츠에 원본 영상의 상품 연결을 그대로 복사한다(같은 상품을 다루는 경우)."""
    from ..models import ProductMention
    v = get_or_404(db, Video, vid, "영상")
    if not v.original:
        raise HTTPException(400, "원본 영상이 연결되어 있지 않습니다")
    existing = {m.product_id for m in v.mentions}
    added = 0
    for m in v.original.mentions:
        if m.product_id in existing:
            continue
        db.add(ProductMention(video_id=v.id, product_id=m.product_id, celebrity_id=m.celebrity_id))
        added += 1
    db.commit()
    return {"added": added}


@router.post("/reclassify-shopping")
def reclassify_shopping(scope: str = "all", db: Session = Depends(get_db)):
    """영상 전체(scope=all) 또는 재편집·경쟁 영상(scope=derived)을 쇼핑 규칙으로 다시 점수화한다(사람 판정은 유지)."""
    from ..services.shopping_filter import classify, threshold
    qs = db.query(Video)
    if scope == "derived":
        qs = qs.filter(Video.source_type.in_(["reedit_shorts", "competitor"]))
    rows = qs.all()
    yes = no = 0
    for v in rows:
        r = classify(v)
        if r["is_shopping"]:
            yes += 1
        else:
            no += 1
    db.commit()
    return {"total": len(rows), "shopping": yes, "non_shopping": no, "threshold": threshold()}


@router.post("/{vid}/compute-outlier")
def compute_outlier(vid: int, db: Session = Depends(get_db)):
    """채널 중앙값 기준 Outlier 를 계산한다(미등록 채널은 YouTube API 로 최근 업로드 50개 조회, 할당량 약 3)."""
    from ..services.computed_metrics import ensure_outlier
    v = get_or_404(db, Video, vid, "영상")
    out, quota, err = ensure_outlier(db, v, allow_api=True)
    if out is None:
        raise HTTPException(400, f"계산 불가: {err or '기준 자료 부족'}")
    return {"outlier": out, "quota_used": quota}


@router.post("/{vid}/resolve-links")
def resolve_links(vid: int, db: Session = Depends(get_db)):
    """설명란·채널 소개의 링크 페이지(인포크링크 등)를 따라가 상품 링크를 수집한다. 미등록 채널 소개글은 YouTube API 로 1회 조회(할당량 1)."""
    from ..services.link_resolver import resolve_video_links
    from ..services.youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured
    v = get_or_404(db, Video, vid, "영상")
    ch_desc = v.yt_channel_description
    if ch_desc is None and v.yt_channel_id:
        try:
            client = YouTubeClient()
            try:
                info = client.get_channels([v.yt_channel_id])
                ch_desc = (info[0].get("description") or "") if info else ""
            finally:
                client.close()
        except (YouTubeNotConfigured, YouTubeAPIError):
            ch_desc = None
        if ch_desc is not None:
            v.yt_channel_description = ch_desc
    result = resolve_video_links(v.description, ch_desc)
    v.resolved_links = result
    log(db, "video", v.id, "resolve_links", {"products": len(result["products"]), "hubs": len(result["hubs"])})
    db.commit()
    return result


@router.post("/{vid}/product-from-link", status_code=201)
def product_from_link(vid: int, body: schemas.ProductFromLinkIn, db: Session = Depends(get_db)):
    """수집한 상품 링크로 상품(유사 상품 후보)과 판매처를 한 번에 등록하고 이 영상에 연결한다."""
    from ..models import Product, ProductMention, ProductOffer
    v = get_or_404(db, Video, vid, "영상")
    host = body.url.split("/")[2] if "://" in body.url else body.url
    seller = "쿠팡" if "coupang" in host else "네이버 스마트스토어" if "smartstore" in host or "brand.naver" in host else host
    p = Product(name=body.name, brand=body.brand or None, category=body.category, identification_status="similar_candidate",
                notes=f"[링크 수집] 영상 {v.youtube_video_id} 의 설명란/링크 페이지에서 수집한 링크로 등록 — 상품 페이지를 확인한 뒤 상태를 바꾸세요.")
    db.add(p)
    db.flush()
    db.add(ProductMention(video_id=v.id, product_id=p.id, celebrity_id=v.celebrity_id))
    db.add(ProductOffer(product_id=p.id, seller=seller, url=body.url, price=None, stock_status="unknown",
                        affiliate_available=True if ("link.coupang" in body.url or "coupa.ng" in body.url) else None,
                        affiliate_program="쿠팡 파트너스(원 게시자 링크)" if ("link.coupang" in body.url or "coupa.ng" in body.url) else None,
                        source="link_resolver", notes="타인 게시 링크 — 내 제휴 링크로 교체 필요"))
    db.commit()
    return serializers.product(p)


@router.post("/{vid}/identify-product")
async def identify_product(vid: int, files: list[UploadFile] = File(default=[]), use_thumbnail: bool = True,
                           db: Session = Depends(get_db)):
    """썸네일·사용자 캡처·메타데이터로 상품을 AI 추정한다(추정 결과는 저장만, 상품 등록은 별도 확인)."""
    from ..services.product_identifier import AINotConfigured, identify
    v = get_or_404(db, Video, vid, "영상")
    images = []
    for f in files[:4]:
        data = await f.read()
        if not (f.content_type or "").startswith("image/") or len(data) > 8 * 1024 * 1024:
            raise HTTPException(400, f"이미지 파일만 8MB 이하로 올려주세요: {f.filename}")
        images.append((data, f.content_type))
    try:
        result = identify(v, extra_images=images, use_thumbnail=use_thumbnail)
    except AINotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI 추정 실패: {e}")
    v.ai_product_suggestions = result
    log(db, "video", v.id, "ai_identify_product", {"n": len(result.get("suggestions", [])), "images": result.get("image_sources")})
    db.commit()
    return result


@router.post("/{vid}/adopt-suggestion", status_code=201)
def adopt_suggestion(vid: int, body: schemas.AdoptSuggestionIn, db: Session = Depends(get_db)):
    """AI 추정 상품을 '유사 상품 후보' 상태로 등록하고 이 영상에 연결한다."""
    from ..models import Product, ProductMention
    v = get_or_404(db, Video, vid, "영상")
    p = Product(name=body.name, brand=body.brand or None, category=body.category, subcategory=body.subcategory or None,
                identification_status="similar_candidate",
                notes=f"[AI 추정] 영상 {v.youtube_video_id} 에서 추정. 근거: {body.evidence or ''} — 사람이 확인 후 상태를 바꾸세요.")
    db.add(p)
    db.flush()
    db.add(ProductMention(video_id=v.id, product_id=p.id, celebrity_id=v.celebrity_id))
    log(db, "product", p.id, "create_from_ai_suggestion", {"video_id": v.id})
    db.commit()
    return serializers.product(p)


@router.post("/bulk-delete")
def bulk_delete(body: schemas.BulkDeleteIn, db: Session = Depends(get_db)):
    """영상 일괄 삭제. 후보가 연결된 영상은 건너뛴다."""
    rows = db.query(Video).filter(Video.id.in_(body.video_ids)).all()
    deleted, skipped = 0, []
    for v in rows:
        if v.candidates:
            skipped.append({"id": v.id, "title": v.title, "reason": "후보 연결됨"})
            continue
        db.delete(v)
        deleted += 1
    log(db, "video", None, "bulk_delete", {"deleted": deleted, "skipped": len(skipped)})
    db.commit()
    return {"deleted": deleted, "skipped": skipped}


@router.post("/refresh-stats")
def refresh_stats(body: schemas.RefreshStatsIn, db: Session = Depends(get_db)):
    qs = db.query(Video).filter(Video.is_demo.is_(False))
    if body.video_ids:
        qs = qs.filter(Video.id.in_(body.video_ids))
    videos = qs.order_by(Video.stats_updated_at.asc().nullsfirst()).limit(body.limit).all()
    if not videos:
        raise HTTPException(400, "갱신할 영상이 없습니다")
    return serializers.job(collection.refresh_video_stats(db, videos))
