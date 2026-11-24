"""vidIQ 지표 가져오기(JSON/CSV/수동). 공식적으로 허용된 경로로 얻은 데이터만 저장한다.

지원 형식
1) vidIQ MCP `vidiq_get_videos_by_ids` 응답 JSON: {"videos": [{id, title, channelId, channelTitle, publishedAt,
   duration, viewCount, likeCount, commentCount, thumbnail, vph, outlierScore, engagementRate, ...}]}
2) vidIQ MCP `vidiq_video_stats` 응답 JSON: {"videoId": "...", "data": [{timestamp, views, likes, comments, vph}]}
3) CSV: 열 이름 video_id|url, outlier, vph, views, measured_at(선택), vph_basis(선택)

vidIQ 가 VPH 측정 구간을 명시하지 않으므로 basis 는 'unspecified' 로 저장한다.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import utcnow
from ..models import Video, VideoMetric, ViewSnapshot
from .dedupe import classify_format, extract_video_id, parse_iso8601_duration


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def get_or_create_video(db: Session, youtube_video_id: str, defaults: dict | None = None) -> tuple[Video, bool]:
    v = db.query(Video).filter(Video.youtube_video_id == youtube_video_id).first()
    if v:
        return v, False
    d = defaults or {}
    v = Video(
        youtube_video_id=youtube_video_id,
        title=d.get("title") or f"(제목 미확인) {youtube_video_id}",
        url=f"https://www.youtube.com/watch?v={youtube_video_id}",
        data_source=d.get("data_source", "manual"),
        **{k: val for k, val in d.items() if k not in ("title", "data_source")},
    )
    db.add(v)
    db.flush()
    return v, True


def add_snapshot(db: Session, video: Video, observed_at: datetime, views: int, source: str,
                 likes: int | None = None, comments: int | None = None) -> bool:
    """중복(동일 시각) 이면 False."""
    exists = (
        db.query(ViewSnapshot)
        .filter(ViewSnapshot.video_id == video.id, ViewSnapshot.observed_at == observed_at)
        .first()
    )
    if exists:
        return False
    db.add(ViewSnapshot(video_id=video.id, observed_at=observed_at, view_count=views,
                        like_count=likes, comment_count=comments, source=source))
    if video.stats_updated_at is None or observed_at >= video.stats_updated_at:
        video.view_count = views
        if likes is not None:
            video.like_count = likes
        if comments is not None:
            video.comment_count = comments
        video.stats_updated_at = observed_at
    return True


def add_metric(db: Session, video: Video, metric_type: str, value: float | None, source: str,
               measured_at: datetime, basis: str = "unspecified", note: str | None = None) -> VideoMetric:
    m = VideoMetric(video_id=video.id, metric_type=metric_type, value=value, basis=basis,
                    source=source, measured_at=measured_at, note=note)
    db.add(m)
    return m


def import_vidiq_json(db: Session, payload: dict | list, measured_at: datetime | None = None) -> dict:
    """vidIQ MCP 응답 JSON 가져오기. 결과 요약 dict 반환."""
    now = measured_at or utcnow()
    result = {"videos_created": 0, "videos_updated": 0, "metrics_added": 0, "snapshots_added": 0,
              "skipped": [], "null_outliers": 0}
    items: list[dict] = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        if "videos" in payload:
            items = payload["videos"]
        elif "data" in payload and "videoId" in payload:
            items = [payload]
        else:
            items = [payload]

    for item in items:
        if not isinstance(item, dict):
            result["skipped"].append("객체가 아닌 항목")
            continue
        # 형식 2: 시계열
        if "data" in item and isinstance(item["data"], list):
            vid = extract_video_id(str(item.get("videoId") or item.get("id") or ""))
            if not vid:
                result["skipped"].append("videoId 없음(시계열)")
                continue
            video, created = get_or_create_video(db, vid, {"data_source": "vidiq_mcp_json"})
            result["videos_created" if created else "videos_updated"] += 1
            for p in item["data"]:
                ts = _parse_dt(p.get("timestamp"))
                views = p.get("views")
                if ts is None or views is None:
                    continue
                if add_snapshot(db, video, ts, int(views), "vidiq_mcp_json",
                                p.get("likes"), p.get("comments")):
                    result["snapshots_added"] += 1
                if p.get("vph") is not None:
                    add_metric(db, video, "vph", _num(p["vph"]), "vidiq_mcp_json", ts,
                               basis="unspecified", note="vidIQ video_stats 시계열 VPH(측정 구간 미확인)")
                    result["metrics_added"] += 1
            continue
        # 형식 1: 영상 메타+최신 지표
        vid = extract_video_id(str(item.get("id") or item.get("videoId") or item.get("url") or ""))
        if not vid:
            result["skipped"].append(f"video id 없음: {str(item)[:60]}")
            continue
        duration = parse_iso8601_duration(item.get("duration")) if isinstance(item.get("duration"), str) else _num(item.get("duration"))
        defaults = {
            "title": item.get("title"),
            "description": item.get("description"),
            "published_at": _parse_dt(item.get("publishedAt")),
            "duration_seconds": int(duration) if duration is not None else None,
            "video_format": classify_format(int(duration) if duration is not None else None),
            "thumbnail_url": item.get("thumbnail"),
            "tags": item.get("tags"),
            "data_source": "vidiq_mcp_json",
        }
        video, created = get_or_create_video(db, vid, defaults)
        if not created:
            for k in ("title", "description", "published_at", "duration_seconds", "thumbnail_url", "tags"):
                if defaults.get(k) is not None:
                    setattr(video, k, defaults[k])
            if defaults["duration_seconds"] is not None:
                video.video_format = defaults["video_format"]
        result["videos_created" if created else "videos_updated"] += 1
        measured = _parse_dt(item.get("measuredAt")) or now
        if item.get("viewCount") is not None:
            if add_snapshot(db, video, measured, int(item["viewCount"]), "vidiq_mcp_json",
                            item.get("likeCount"), item.get("commentCount")):
                result["snapshots_added"] += 1
        if "vph" in item:
            add_metric(db, video, "vph", _num(item["vph"]), "vidiq_mcp_json", measured,
                       basis="unspecified", note="vidIQ 최신 VPH(측정 구간 미확인)")
            result["metrics_added"] += 1
        if "outlierScore" in item:
            val = _num(item["outlierScore"])
            if val is None:
                result["null_outliers"] += 1
            add_metric(db, video, "outlier", val, "vidiq_mcp_json", measured,
                       note="vidIQ outlierScore" + ("" if val is not None else " (미제공 → NULL)"))
            result["metrics_added"] += 1
        if "engagementRate" in item:
            add_metric(db, video, "engagement_rate", _num(item["engagementRate"]), "vidiq_mcp_json", measured)
            result["metrics_added"] += 1
    db.flush()
    return result


def import_metrics_csv(db: Session, text: str, source: str = "vidiq_csv") -> dict:
    reader = csv.DictReader(io.StringIO(text))
    result = {"rows": 0, "metrics_added": 0, "snapshots_added": 0, "videos_created": 0, "skipped": []}
    now = utcnow()
    for row in reader:
        result["rows"] += 1
        key = row.get("video_id") or row.get("url") or row.get("videoId") or ""
        vid = extract_video_id(key)
        if not vid:
            result["skipped"].append(f"{result['rows']}행: video_id/url 없음")
            continue
        video, created = get_or_create_video(db, vid, {"title": row.get("title"), "data_source": source})
        if created:
            result["videos_created"] += 1
        measured = _parse_dt(row.get("measured_at")) or now
        basis = (row.get("vph_basis") or "unspecified").strip()
        if row.get("outlier") not in (None, ""):
            add_metric(db, video, "outlier", _num(row["outlier"]), source, measured)
            result["metrics_added"] += 1
        if row.get("vph") not in (None, ""):
            add_metric(db, video, "vph", _num(row["vph"]), source, measured, basis=basis)
            result["metrics_added"] += 1
        if row.get("views") not in (None, ""):
            v = _num(row["views"])
            if v is not None and add_snapshot(db, video, measured, int(v), source):
                result["snapshots_added"] += 1
    db.flush()
    return result


def latest_metrics(video: Video) -> dict[str, dict]:
    out: dict[str, VideoMetric] = {}
    for m in video.metrics:
        cur = out.get(m.metric_type)
        if cur is None or m.measured_at > cur.measured_at:
            out[m.metric_type] = m
    return {
        k: {"value": m.value, "basis": m.basis, "source": m.source,
            "measured_at": m.measured_at.isoformat(), "note": m.note}
        for k, m in out.items()
    }
