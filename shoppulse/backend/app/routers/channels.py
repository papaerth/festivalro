from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..config import get_settings
from ..database import get_db
from ..models import YoutubeChannel
from ..services import bulk, collection
from ..services.audit import log
from ..services.dedupe import normalize_channel_ref
from ..services.youtube_connector import YouTubeAPIError, YouTubeNotConfigured
from .common import apply_patch, get_or_404

router = APIRouter(prefix="/api/channels", tags=["channels"])


@router.get("")
def list_channels(q: str | None = None, verification_status: str | None = None, celebrity_id: int | None = None,
                  category: str | None = None, active_only: bool = False, db: Session = Depends(get_db)):
    qs = db.query(YoutubeChannel)
    if q:
        qs = qs.filter(YoutubeChannel.channel_name.contains(q))
    if verification_status:
        qs = qs.filter(YoutubeChannel.verification_status == verification_status)
    if celebrity_id:
        qs = qs.filter(YoutubeChannel.celebrity_id == celebrity_id)
    if active_only:
        qs = qs.filter(YoutubeChannel.is_active.is_(True))
    if category == "beauty":
        qs = qs.filter(YoutubeChannel.relevance_beauty > 0)
    elif category == "living":
        qs = qs.filter(YoutubeChannel.relevance_living > 0)
    elif category == "food":
        qs = qs.filter(YoutubeChannel.relevance_food > 0)
    rows = qs.order_by(YoutubeChannel.channel_name).all()
    out = [serializers.channel(c) for c in rows]
    if q:  # 연예인 이름으로도 검색
        names = {c["id"] for c in out}
        extra = db.query(YoutubeChannel).join(YoutubeChannel.celebrity).filter(YoutubeChannel.celebrity.has(name=q)).all()
        out += [serializers.channel(c) for c in extra if c.id not in names]
    return out


@router.post("", status_code=201)
def create_channel(body: schemas.ChannelIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    if data.get("channel_id"):
        ref = normalize_channel_ref(data["channel_id"])
        data["channel_id"] = ref.get("channel_id")
        if not data["channel_id"] and ref.get("handle"):
            data["handle"] = ref["handle"]
        if data["channel_id"] and db.query(YoutubeChannel).filter(YoutubeChannel.channel_id == data["channel_id"]).first():
            raise HTTPException(409, "같은 채널 ID가 이미 등록되어 있습니다")
    ch = YoutubeChannel(**data)
    db.add(ch)
    db.flush()
    log(db, "channel", ch.id, "create", {"name": ch.channel_name})
    db.commit()
    return serializers.channel(ch)


@router.get("/bulk/status")
def bulk_status():
    return bulk.status()


@router.post("/bulk/resolve")
def bulk_resolve(body: schemas.BulkResolveIn, db: Session = Depends(get_db)):
    """채널 ID 가 없는 채널을 일괄 검색해 가장 유력한 채널을 저장한다(검증 상태는 '검증 전' 유지). 채널당 할당량 100."""
    if not get_settings().youtube_api_key:
        raise HTTPException(503, "YOUTUBE_API_KEY 가 설정되지 않았습니다.")
    try:
        return bulk.start("resolve", limit=body.limit)
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.post("/bulk/collect")
def bulk_collect(body: schemas.BulkCollectIn, db: Session = Depends(get_db)):
    """채널 ID 가 있는 활성 채널의 영상을 일괄 수집한다(백그라운드)."""
    if not get_settings().youtube_api_key:
        raise HTTPException(503, "YOUTUBE_API_KEY 가 설정되지 않았습니다.")
    try:
        return bulk.start("collect", max_videos=body.max_videos, years=body.years, stale_days=body.stale_days)
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.post("/bulk/discover")
def bulk_discover(body: schemas.BulkDiscoverIn, db: Session = Depends(get_db)):
    """연예인별로 '이름 + 키워드' 쇼츠를 검색해 재편집 쇼츠로 등록(연예인당 할당량 100)."""
    if not get_settings().youtube_api_key:
        raise HTTPException(503, "YOUTUBE_API_KEY 가 설정되지 않았습니다.")
    try:
        return bulk.start("discover", limit=body.limit, max_results=body.max_results, suffix=body.suffix,
                          years=body.years, order=body.order)
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.get("/{chid}")
def get_channel(chid: int, db: Session = Depends(get_db)):
    return serializers.channel(get_or_404(db, YoutubeChannel, chid, "채널"))


@router.patch("/{chid}")
def patch_channel(chid: int, body: schemas.ChannelPatch, db: Session = Depends(get_db)):
    ch = get_or_404(db, YoutubeChannel, chid, "채널")
    data = body.model_dump(exclude_unset=True)
    if "channel_id" in data and data["channel_id"]:
        ref = normalize_channel_ref(data["channel_id"])
        data["channel_id"] = ref.get("channel_id")
        if not data["channel_id"]:
            raise HTTPException(400, "채널 ID 는 UC 로 시작하는 24자 또는 채널 URL 이어야 합니다")
        dup = db.query(YoutubeChannel).filter(YoutubeChannel.channel_id == data["channel_id"], YoutubeChannel.id != chid).first()
        if dup:
            raise HTTPException(409, f"같은 채널 ID가 '{dup.channel_name}' 에 이미 등록되어 있습니다")
    for k, v in data.items():
        setattr(ch, k, v)
    log(db, "channel", ch.id, "update", data)
    db.commit()
    return serializers.channel(ch)


@router.delete("/{chid}", status_code=204)
def delete_channel(chid: int, db: Session = Depends(get_db)):
    ch = get_or_404(db, YoutubeChannel, chid, "채널")
    db.delete(ch)
    log(db, "channel", chid, "delete", {})
    db.commit()


@router.post("/{chid}/resolve")
def resolve(chid: int, db: Session = Depends(get_db)):
    """YouTube 에서 채널 후보를 검색해 돌려준다(자동 확정 안 함). search 1회 = 할당량 100."""
    ch = get_or_404(db, YoutubeChannel, chid, "채널")
    try:
        return collection.resolve_channel(db, ch)
    except YouTubeNotConfigured as e:
        raise HTTPException(503, str(e))
    except YouTubeAPIError as e:
        raise HTTPException(502, str(e))


@router.post("/{chid}/collect")
def collect(chid: int, body: schemas.ChannelCollectIn, db: Session = Depends(get_db)):
    ch = get_or_404(db, YoutubeChannel, chid, "채널")
    job = collection.collect_channel_videos(db, ch, max_videos=body.max_videos, years=body.years)
    return serializers.job(job)
