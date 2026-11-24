"""YouTube 수집 작업: 채널 확인, 영상 수집(최근 3년), 통계 갱신(스냅샷 축적). 모든 작업은 collection_jobs 에 기록."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import utcnow
from ..models import CollectionJob, Video, YoutubeChannel
from .dedupe import classify_format, parse_iso8601_duration
from .metrics import add_snapshot
from .youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured, three_years_ago


def _utc_naive(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)


def start_job(db: Session, job_type: str, params: dict, triggered_by: str = "manual") -> CollectionJob:
    job = CollectionJob(job_type=job_type, status="running", params=params, triggered_by=triggered_by)
    db.add(job)
    db.flush()
    return job


def finish_job(job: CollectionJob, status: str, result: dict | None = None, error: str | None = None,
               items: int = 0, quota: int = 0) -> None:
    job.status = status
    job.result = result or {}
    job.error = error
    job.items_processed = items
    job.quota_used = quota
    job.finished_at = utcnow()


def upsert_video_from_api(db: Session, item: dict, channel: YoutubeChannel | None, observed_at: datetime,
                          source_type: str | None = None) -> tuple[Video, bool]:
    v = db.query(Video).filter(Video.youtube_video_id == item["video_id"]).first()
    created = v is None
    dur = parse_iso8601_duration(item.get("duration"))
    if created:
        v = Video(youtube_video_id=item["video_id"], title=item.get("title") or item["video_id"],
                  url=f"https://www.youtube.com/watch?v={item['video_id']}", data_source="youtube_api",
                  collected_at=observed_at)
        db.add(v)
    v.title = item.get("title") or v.title
    v.description = item.get("description")
    v.published_at = _utc_naive(item.get("published_at"))
    v.duration_seconds = dur
    v.video_format = classify_format(dur)
    v.thumbnail_url = item.get("thumbnail")
    v.tags = item.get("tags")
    v.yt_channel_id = item.get("channel_id")
    v.yt_channel_title = item.get("channel_title")
    if channel:
        v.channel_id = channel.id
    if created and source_type:
        v.source_type = source_type
    if item.get("caption") == "true":
        v.access_status = "captions" if v.access_status in ("unknown", "description_only") else v.access_status
    elif v.access_status == "unknown":
        v.access_status = "description_only"
    db.flush()
    if item.get("view_count") is not None:
        add_snapshot(db, v, observed_at, item["view_count"], "youtube_api", item.get("like_count"), item.get("comment_count"))
    return v, created


def collect_channel_videos(db: Session, channel: YoutubeChannel, max_videos: int = 200,
                           years: int = 3, triggered_by: str = "manual") -> CollectionJob:
    job = start_job(db, "collect_channel_videos", {"channel_id": channel.id, "channel_name": channel.channel_name,
                                                   "max_videos": max_videos, "years": years}, triggered_by)
    db.commit()
    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        finish_job(job, "failed", error=str(e))
        db.commit()
        return job
    try:
        if not channel.channel_id:
            raise YouTubeAPIError("채널 ID(UC...)가 없어 수집할 수 없습니다. 먼저 채널 ID를 확인하세요.", reason="no_channel_id")
        info = client.get_channels([channel.channel_id])
        if not info:
            raise YouTubeAPIError("YouTube 에서 채널을 찾지 못했습니다.", reason="not_found")
        ch = info[0]
        channel.subscriber_count = ch["subscriber_count"]
        channel.handle = ch.get("handle") or channel.handle
        channel.channel_url = ch["url"]
        after = datetime.now(timezone.utc).replace(year=datetime.now(timezone.utc).year - years) if years else None
        ids = client.list_upload_video_ids(ch["uploads_playlist"], published_after=after, max_videos=max_videos)
        now = utcnow().replace(microsecond=0)
        created = updated = 0
        for item in client.get_videos(ids):
            _, c = upsert_video_from_api(db, item, channel, now)
            created += int(c)
            updated += int(not c)
        channel.last_collected_at = now
        channel.collected_video_count = db.query(Video).filter(Video.channel_id == channel.id).count()
        finish_job(job, "success", {"created": created, "updated": updated, "video_ids": len(ids)},
                   items=created + updated, quota=client.quota_used)
    except YouTubeAPIError as e:
        finish_job(job, "failed", error=str(e), quota=client.quota_used)
        job.result = {"reason": e.reason}
    finally:
        client.close()
    db.commit()
    return job


def refresh_video_stats(db: Session, videos: list[Video], triggered_by: str = "manual") -> CollectionJob:
    """기존 영상의 조회수를 다시 조회해 스냅샷을 추가한다(시계열 축적)."""
    job = start_job(db, "refresh_video_stats", {"count": len(videos)}, triggered_by)
    db.commit()
    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        finish_job(job, "failed", error=str(e))
        db.commit()
        return job
    try:
        by_id = {v.youtube_video_id: v for v in videos}
        now = utcnow().replace(microsecond=0)
        n = 0
        missing = []
        items = client.get_videos(list(by_id))
        seen = set()
        for item in items:
            seen.add(item["video_id"])
            v = by_id[item["video_id"]]
            upsert_video_from_api(db, item, v.channel, now)
            n += 1
        missing = [vid for vid in by_id if vid not in seen]
        finish_job(job, "success" if not missing else "partial",
                   {"updated": n, "missing_or_private": missing}, items=n, quota=client.quota_used)
    except YouTubeAPIError as e:
        finish_job(job, "failed", error=str(e), quota=client.quota_used)
    finally:
        client.close()
    db.commit()
    return job


def resolve_channel(db: Session, channel: YoutubeChannel) -> dict:
    """채널명/핸들로 YouTube 에서 후보를 찾아 돌려준다(자동 확정하지 않음)."""
    client = YouTubeClient()
    try:
        if channel.handle:
            found = client.get_channels(handle=channel.handle)
            if found:
                return {"candidates": found, "quota_used": client.quota_used}
        return {"candidates": client.search_channels(channel.channel_name, 5), "quota_used": client.quota_used}
    finally:
        client.close()


def add_video_by_id(db: Session, youtube_video_id: str, channel: YoutubeChannel | None = None) -> tuple[Video, bool, str | None]:
    """영상 ID로 메타데이터를 가져와 등록. API 미설정이면 (None, False, 사유)."""
    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        return None, False, str(e)
    try:
        items = client.get_videos([youtube_video_id])
        if not items:
            return None, False, "YouTube 에서 영상을 찾지 못했습니다(비공개/삭제 가능)."
        item = items[0]
        ch = channel
        if ch is None and item.get("channel_id"):
            ch = db.query(YoutubeChannel).filter(YoutubeChannel.channel_id == item["channel_id"]).first()
        v, created = upsert_video_from_api(db, item, ch, utcnow().replace(microsecond=0))
        if ch is None:
            v.notes = (v.notes or "") + f"\n[수집] 채널 미등록: {item.get('channel_title')} ({item.get('channel_id')})"
        db.commit()
        return v, created, None
    except YouTubeAPIError as e:
        return None, False, str(e)
    finally:
        client.close()


def discover_shorts(db: Session, query: str, celebrity_id: int | None = None, max_results: int = 25,
                    years: int = 3, order: str = "relevance", source_type: str = "reedit_shorts",
                    triggered_by: str = "manual") -> CollectionJob:
    """연예인 이름·상품 키워드로 YouTube 쇼츠를 검색해 '재편집 쇼츠'로 등록한다.

    - 등록된 공식 채널의 영상이 검색되면 원본(original_celebrity)으로 분류한다.
    - 이미 있는 영상은 메타·조회수만 갱신하고 source_type 은 바꾸지 않는다.
    - 할당량: 검색 100/페이지 + 영상 50개당 1.
    """
    job = start_job(db, "discover_shorts", {"query": query, "celebrity_id": celebrity_id, "max_results": max_results,
                                            "years": years, "order": order}, triggered_by)
    db.commit()
    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        finish_job(job, "failed", error=str(e)); db.commit()
        return job
    try:
        after = datetime.now(timezone.utc).replace(year=datetime.now(timezone.utc).year - years) if years else None
        ids = client.search_videos(query, max_results=max_results, duration="short", published_after=after, order=order)
        now = utcnow().replace(microsecond=0)
        official = {c.channel_id: c for c in db.query(YoutubeChannel).filter(YoutubeChannel.channel_id.isnot(None)).all()}
        created = updated = originals = 0
        for item in client.get_videos(ids):
            ch = official.get(item.get("channel_id"))
            st = "original_celebrity" if ch else source_type
            v, c = upsert_video_from_api(db, item, ch, now, source_type=st)
            if c:
                created += 1
                v.discovery_query = query
                if celebrity_id and not ch:
                    v.celebrity_id = celebrity_id
            else:
                updated += 1
            originals += int(bool(ch))
        finish_job(job, "success", {"created": created, "updated": updated, "found": len(ids),
                                    "official_channel_videos": originals}, items=created + updated, quota=client.quota_used)
    except YouTubeAPIError as e:
        finish_job(job, "failed", error=str(e), quota=client.quota_used)
        job.result = {"reason": e.reason}
    finally:
        client.close()
    db.commit()
    return job
