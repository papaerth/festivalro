"""YouTube Data API v3 커넥터. 키가 없으면 명확히 '미설정' 오류를 낸다.

할당량(유닛): search.list=100, channels.list=1, playlistItems.list=1, videos.list=1
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from ..config import get_settings

API = "https://www.googleapis.com/youtube/v3"
QUOTA = {"search": 100, "channels": 1, "playlistItems": 1, "videos": 1}


class YouTubeNotConfigured(Exception):
    pass


class YouTubeAPIError(Exception):
    def __init__(self, message: str, reason: str | None = None, status: int | None = None):
        super().__init__(message)
        self.reason = reason
        self.status = status


class YouTubeClient:
    def __init__(self, api_key: str | None = None, timeout: float = 20.0):
        self.api_key = api_key or get_settings().youtube_api_key
        if not self.api_key:
            raise YouTubeNotConfigured("YOUTUBE_API_KEY 가 설정되지 않았습니다. .env 를 확인하세요.")
        self.quota_used = 0
        self._client = httpx.Client(timeout=timeout)

    def close(self):
        self._client.close()

    def _get(self, resource: str, **params) -> dict:
        params["key"] = self.api_key
        try:
            r = self._client.get(f"{API}/{resource}", params=params)
        except httpx.HTTPError as e:
            raise YouTubeAPIError(f"네트워크 오류: {e}", reason="network") from e
        self.quota_used += QUOTA.get(resource, 1)
        if r.status_code != 200:
            reason = None
            msg = r.text[:300]
            try:
                err = r.json().get("error", {})
                errs = err.get("errors") or []
                reason = errs[0].get("reason") if errs else err.get("status")
                msg = err.get("message", msg)
            except ValueError:
                pass
            if reason == "quotaExceeded":
                msg = "YouTube API 일일 할당량 초과. 내일(태평양 시간 0시 리셋) 다시 시도하세요."
            raise YouTubeAPIError(msg, reason=reason, status=r.status_code)
        return r.json()

    # ---- 채널
    def search_channels(self, query: str, max_results: int = 10) -> list[dict]:
        data = self._get("search", part="snippet", type="channel", q=query, maxResults=max_results)
        ids = [i["snippet"]["channelId"] for i in data.get("items", [])]
        return self.get_channels(ids) if ids else []

    def get_channels(self, channel_ids: list[str] | None = None, handle: str | None = None) -> list[dict]:
        params = {"part": "snippet,statistics,contentDetails"}
        if handle:
            params["forHandle"] = handle.lstrip("@")
        elif channel_ids:
            params["id"] = ",".join(channel_ids[:50])
        else:
            return []
        data = self._get("channels", **params)
        out = []
        for it in data.get("items", []):
            sn, st = it.get("snippet", {}), it.get("statistics", {})
            out.append({
                "channel_id": it["id"],
                "title": sn.get("title"),
                "handle": sn.get("customUrl"),
                "description": sn.get("description"),
                "thumbnail": (sn.get("thumbnails") or {}).get("default", {}).get("url"),
                "subscriber_count": int(st["subscriberCount"]) if st.get("subscriberCount") and not st.get("hiddenSubscriberCount") else None,
                "video_count": int(st["videoCount"]) if st.get("videoCount") else None,
                "uploads_playlist": (it.get("contentDetails") or {}).get("relatedPlaylists", {}).get("uploads"),
                "url": f"https://www.youtube.com/channel/{it['id']}",
            })
        return out

    def search_videos(self, query: str, max_results: int = 25, duration: str = "short",
                      published_after: datetime | None = None, order: str = "relevance",
                      published_before: datetime | None = None) -> list[str]:
        """영상 검색(할당량 100/페이지). duration: short(<4분)/medium/long/any. 반환: 영상 ID 목록."""
        ids: list[str] = []
        token = None
        while len(ids) < max_results:
            params = {"part": "id", "type": "video", "q": query, "maxResults": min(50, max_results - len(ids)),
                      "order": order, "regionCode": "KR", "relevanceLanguage": "ko"}
            if duration and duration != "any":
                params["videoDuration"] = duration
            if published_after:
                params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")
            if published_before:
                params["publishedBefore"] = published_before.strftime("%Y-%m-%dT%H:%M:%SZ")
            if token:
                params["pageToken"] = token
            data = self._get("search", **params)
            ids += [i["id"]["videoId"] for i in data.get("items", []) if i.get("id", {}).get("videoId")]
            token = data.get("nextPageToken")
            if not token:
                break
        return ids[:max_results]

    def search_channel_videos(self, channel_id: str, query: str, max_results: int = 10,
                              published_before: datetime | None = None, published_after: datetime | None = None) -> list[dict]:
        """특정 채널 안에서 검색(할당량 100). snippet 포함: 제목·설명(앞부분)·게시일을 바로 돌려준다."""
        params = {"part": "snippet", "type": "video", "q": query, "channelId": channel_id,
                  "maxResults": min(50, max_results), "order": "relevance"}
        if published_before:
            params["publishedBefore"] = published_before.strftime("%Y-%m-%dT%H:%M:%SZ")
        if published_after:
            params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")
        data = self._get("search", **params)
        out = []
        for i in data.get("items", []):
            vid = (i.get("id") or {}).get("videoId")
            sn = i.get("snippet") or {}
            if vid:
                out.append({"video_id": vid, "title": sn.get("title"), "description": sn.get("description"),
                            "published_at": sn.get("publishedAt"), "channel_id": sn.get("channelId"),
                            "channel_title": sn.get("channelTitle")})
        return out

    # ---- 영상
    def list_upload_video_ids(self, uploads_playlist: str, published_after: datetime | None = None,
                              max_videos: int = 200, published_before: datetime | None = None) -> list[str]:
        ids: list[str] = []
        token = None
        while len(ids) < max_videos:
            params = {"part": "contentDetails", "playlistId": uploads_playlist, "maxResults": 50}
            if token:
                params["pageToken"] = token
            data = self._get("playlistItems", **params)
            stop = False
            for it in data.get("items", []):
                cd = it.get("contentDetails", {})
                pub = cd.get("videoPublishedAt")
                if pub and (published_after or published_before):
                    pub_dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
                    if published_after and pub_dt < published_after:
                        stop = True  # 업로드 목록은 최신순이므로 이보다 오래된 것은 모두 범위 밖
                        continue
                    if published_before and pub_dt > published_before:
                        continue  # 아직 너무 최근 — 건너뛰고 계속
                if cd.get("videoId"):
                    ids.append(cd["videoId"])
            token = data.get("nextPageToken")
            if stop or not token:
                break
        return ids[:max_videos]

    def get_videos(self, video_ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(video_ids), 50):
            chunk = video_ids[i : i + 50]
            data = self._get("videos", part="snippet,contentDetails,statistics", id=",".join(chunk))
            for it in data.get("items", []):
                sn, st, cd = it.get("snippet", {}), it.get("statistics", {}), it.get("contentDetails", {})
                thumbs = sn.get("thumbnails") or {}
                thumb = (thumbs.get("maxres") or thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
                out.append({
                    "video_id": it["id"],
                    "title": sn.get("title"),
                    "description": sn.get("description"),
                    "channel_id": sn.get("channelId"),
                    "channel_title": sn.get("channelTitle"),
                    "published_at": sn.get("publishedAt"),
                    "duration": cd.get("duration"),
                    "thumbnail": thumb,
                    "tags": sn.get("tags"),
                    "view_count": int(st["viewCount"]) if st.get("viewCount") is not None else None,
                    "like_count": int(st["likeCount"]) if st.get("likeCount") is not None else None,
                    "comment_count": int(st["commentCount"]) if st.get("commentCount") is not None else None,
                    "caption": cd.get("caption"),  # "true"/"false" 자막 존재 여부
                })
        return out


def three_years_ago() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=365 * 3)
