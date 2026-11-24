"""영상·채널 식별 규칙."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(value: str) -> str | None:
    """영상 ID 또는 URL(watch/shorts/youtu.be/embed/live) 에서 11자리 ID 추출."""
    value = (value or "").strip()
    if not value:
        return None
    if _VIDEO_ID_RE.match(value):
        return value
    try:
        u = urlparse(value if "://" in value else "https://" + value)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    if host.endswith("youtu.be"):
        vid = u.path.strip("/").split("/")[0]
        return vid if _VIDEO_ID_RE.match(vid) else None
    if "youtube." in host:
        qs = parse_qs(u.query)
        if "v" in qs and _VIDEO_ID_RE.match(qs["v"][0]):
            return qs["v"][0]
        m = re.match(r"^/(shorts|embed|live|v)/([A-Za-z0-9_-]{11})", u.path)
        if m:
            return m.group(2)
    return None


def classify_format(duration_seconds: int | None) -> str:
    """길이만으로는 쇼츠 여부를 확정할 수 없다. 60초 이하=short, 61~180=short_or_long(미확정), 그 외 long."""
    if duration_seconds is None:
        return "unknown"
    if duration_seconds <= 60:
        return "short"
    if duration_seconds <= 180:
        return "short_or_long"
    return "long"


def parse_iso8601_duration(value: str | None) -> int | None:
    """PT1H2M3S → 초. 파싱 실패 시 None."""
    if not value:
        return None
    m = re.match(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", value)
    if not m:
        return None
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def normalize_channel_ref(value: str) -> dict:
    """채널 ID / @핸들 / URL → {'channel_id':..} 또는 {'handle':..}."""
    value = (value or "").strip()
    if re.match(r"^UC[A-Za-z0-9_-]{22}$", value):
        return {"channel_id": value}
    if value.startswith("@"):
        return {"handle": value}
    try:
        u = urlparse(value if "://" in value else "https://" + value)
    except ValueError:
        return {}
    m = re.match(r"^/channel/(UC[A-Za-z0-9_-]{22})", u.path)
    if m:
        return {"channel_id": m.group(1)}
    m = re.match(r"^/(@[^/]+)", u.path)
    if m:
        return {"handle": m.group(1)}
    return {}
