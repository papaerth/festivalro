"""우리 데이터로 계산하는 지표. vidIQ 값과 구분해 source='computed' 로 저장·표시한다.

- VPH(전체 평균)  = 누적 조회수 / 게시 후 경과 시간(h)            basis='overall_computed'
- VPH(최근 구간)  = (최신 관측 - 이전 관측) / 구간 시간(h)          basis='recent_Nh_computed'
- Outlier(계산)   = 영상 조회수 / 같은 채널 영상 조회수 중앙값        basis='channel_median'
"""
from __future__ import annotations

from datetime import timedelta
from statistics import mean, median

from sqlalchemy.orm import Session

from ..models import ChannelBaseline, Video, utcnow
from .dedupe import classify_format, parse_iso8601_duration


def vph_overall(video: Video) -> dict | None:
    if not video.view_count or not video.published_at:
        return None
    ref = video.stats_updated_at or utcnow()
    hours = (ref - video.published_at).total_seconds() / 3600
    if hours < 1:
        return None
    return {"value": round(video.view_count / hours, 2), "basis": "overall_computed", "hours": round(hours),
            "note": "누적 조회수 ÷ 게시 후 경과 시간(계산값)"}


def vph_recent(video: Video, min_hours: float = 1.0) -> dict | None:
    snaps = sorted(video.snapshots, key=lambda s: s.observed_at)
    if len(snaps) < 2:
        return None
    last = snaps[-1]
    # 최소 min_hours 이상 떨어진 가장 가까운 이전 관측
    prev = None
    for s in reversed(snaps[:-1]):
        if (last.observed_at - s.observed_at).total_seconds() >= min_hours * 3600:
            prev = s
            break
    if prev is None:
        return None
    hours = (last.observed_at - prev.observed_at).total_seconds() / 3600
    return {"value": round(max(0, last.view_count - prev.view_count) / hours, 2), "basis": f"recent_{round(hours)}h_computed",
            "hours": round(hours, 1), "note": f"최근 {round(hours)}시간 관측 구간의 시간당 증가(실측 기반 계산값)"}


def compute_baseline_from_db(db: Session, channel_db_id: int, fmt: str | None = None) -> ChannelBaseline | None:
    q = db.query(Video.view_count, Video.video_format, Video.yt_channel_id).filter(Video.channel_id == channel_db_id, Video.view_count.isnot(None))
    rows = q.all()
    if fmt:
        rows = [r for r in rows if (r[1] == fmt or (fmt == "short" and r[1] == "short_or_long"))]
    views = [r[0] for r in rows if r[0] is not None]
    if len(views) < 5:
        return None
    ytid = next((r[2] for r in rows if r[2]), None) or f"db:{channel_db_id}"
    bl = db.get(ChannelBaseline, ytid) or ChannelBaseline(yt_channel_id=ytid)
    bl.median_views, bl.mean_views, bl.sample_size = float(median(views)), float(mean(views)), len(views)
    bl.sample_format, bl.source, bl.computed_at = fmt or "all", "db", utcnow()
    bl.note = "수집된 채널 영상 기준"
    db.merge(bl)
    return bl


def compute_baseline_from_api(db: Session, yt_channel_id: str, fmt: str | None = None, max_videos: int = 50) -> tuple[ChannelBaseline | None, int, str | None]:
    """미등록 채널: 최근 업로드 50개를 API 로 받아 중앙값 계산. 반환 (기준선, 사용 할당량, 오류)."""
    from .youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured

    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        return None, 0, str(e)
    try:
        info = client.get_channels([yt_channel_id])
        if not info:
            return None, client.quota_used, "채널을 찾지 못함"
        ids = client.list_upload_video_ids(info[0]["uploads_playlist"], max_videos=max_videos)
        items = client.get_videos(ids)
        views = []
        for it in items:
            dur = parse_iso8601_duration(it.get("duration"))
            f = classify_format(dur)
            if fmt and not (f == fmt or (fmt == "short" and f == "short_or_long")):
                continue
            if it.get("view_count") is not None:
                views.append(it["view_count"])
        if len(views) < 5:
            return None, client.quota_used, f"표본 부족({len(views)}개)"
        bl = db.get(ChannelBaseline, yt_channel_id) or ChannelBaseline(yt_channel_id=yt_channel_id)
        bl.channel_title = info[0].get("title")
        bl.median_views, bl.mean_views, bl.sample_size = float(median(views)), float(mean(views)), len(views)
        bl.sample_format, bl.source, bl.computed_at = fmt or "all", "youtube_api", utcnow()
        bl.note = f"최근 업로드 {len(items)}개 중 {fmt or '전체'} {len(views)}개 기준"
        db.merge(bl)
        return bl, client.quota_used, None
    except YouTubeAPIError as e:
        return None, client.quota_used, str(e)
    finally:
        client.close()


def outlier_for(db: Session, video: Video) -> dict | None:
    if not video.view_count:
        return None
    key = video.yt_channel_id or (f"db:{video.channel_id}" if video.channel_id else None)
    if not key:
        return None
    bl = db.get(ChannelBaseline, key)
    if not bl or not bl.median_views:
        return None
    return {"value": round(video.view_count / bl.median_views, 2), "basis": "channel_median",
            "median_views": bl.median_views, "sample_size": bl.sample_size, "sample_format": bl.sample_format,
            "computed_at": bl.computed_at.isoformat(),
            "note": f"영상 조회수 ÷ 채널 {bl.sample_format} 영상 {bl.sample_size}개 중앙값 {int(bl.median_views):,} (계산값, vidIQ 아님)"}


def ensure_outlier(db: Session, video: Video, allow_api: bool = True, stale_days: int = 7) -> tuple[dict | None, int, str | None]:
    """기준선이 없거나 오래됐으면 계산한 뒤 Outlier 를 돌려준다. 반환 (outlier, 할당량, 오류)."""
    fmt = "short" if video.video_format in ("short", "short_or_long") else ("long" if video.video_format == "long" else None)
    key = video.yt_channel_id or (f"db:{video.channel_id}" if video.channel_id else None)
    if not key:
        return None, 0, "채널 정보 없음"
    bl = db.get(ChannelBaseline, key)
    quota, err = 0, None
    if bl is None or (utcnow() - bl.computed_at) > timedelta(days=stale_days) or bl.sample_format != (fmt or "all"):
        if video.channel_id:
            bl = compute_baseline_from_db(db, video.channel_id, fmt)
        if (bl is None or bl.source == "db" and bl.sample_size < 5) and video.yt_channel_id and allow_api:
            bl, quota, err = compute_baseline_from_api(db, video.yt_channel_id, fmt)
        db.commit()
    return outlier_for(db, video), quota, err
