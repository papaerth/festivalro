"""유튜브 영상 정보와 인기 댓글을 가져온다.

  python pipeline/comments.py <유튜브 링크> work/<편>/comments.json

YOUTUBE_API_KEY 가 있으면 YouTube Data API(무료 키)를, 없으면 yt-dlp(pip install yt-dlp)를 쓴다.
댓글 작성자 이름은 저장하지 않는다(카드에서도 모자이크한다).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402


def video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([0-9A-Za-z_-]{11})", url or "")
    return m.group(1) if m else None


def like_label(n: int) -> str:
    """유튜브 한국어 화면처럼: 1234 → 1.2천, 15300 → 1.5만"""
    if n >= 10000:
        v = n / 10000
        return (f"{v:.1f}".rstrip("0").rstrip(".") if v < 100 else f"{v:.0f}") + "만"
    if n >= 1000:
        return f"{n / 1000:.1f}".rstrip("0").rstrip(".") + "천"
    return str(n)


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def _via_api(vid: str, key: str, n: int) -> dict:
    base = "https://www.googleapis.com/youtube/v3"
    v = _get(f"{base}/videos?" + urllib.parse.urlencode({"part": "snippet", "id": vid, "key": key}))
    sn = (v.get("items") or [{}])[0].get("snippet", {})
    c = _get(f"{base}/commentThreads?" + urllib.parse.urlencode(
        {"part": "snippet", "videoId": vid, "order": "relevance", "maxResults": min(n, 100),
         "textFormat": "plainText", "key": key}))
    comments = []
    for it in c.get("items", []):
        s = it["snippet"]["topLevelComment"]["snippet"]
        comments.append({"text": s.get("textOriginal") or s.get("textDisplay", ""), "likes": int(s.get("likeCount", 0))})
    return {"title": sn.get("title", ""), "channel": sn.get("channelTitle", ""),
            "description": sn.get("description", "")[:3000], "comments": comments}


def _via_ytdlp(url: str, n: int) -> dict:
    cmd = [sys.executable, "-m", "yt_dlp", "--skip-download", "--write-comments", "--no-warnings",
           "--extractor-args", f"youtube:comment_sort=top;max_comments={n},all,0,0", "--dump-single-json", url]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace")[-400:])
    d = json.loads(r.stdout)
    comments = [{"text": c.get("text", ""), "likes": int(c.get("like_count") or 0)}
                for c in d.get("comments") or [] if c.get("parent") in (None, "root")]
    return {"title": d.get("title", ""), "channel": d.get("channel") or d.get("uploader", ""),
            "description": (d.get("description") or "")[:3000], "comments": comments}


def fetch(url: str, n: int = 100) -> dict:
    """{"title","channel","description","comments":[{"text","likes","likes_label"}]}. 실패하면 빈 댓글."""
    vid = video_id(url)
    out = {"title": "", "channel": "", "description": "", "comments": [], "error": ""}
    if not vid:
        out["error"] = "유튜브 링크에서 영상 ID를 찾지 못했습니다."
        return out
    try:
        key = os.environ.get("YOUTUBE_API_KEY")
        out.update(_via_api(vid, key, n) if key else _via_ytdlp(url, n))
    except (urllib.error.URLError, RuntimeError, json.JSONDecodeError, KeyError) as e:
        out["error"] = f"댓글을 가져오지 못했습니다: {e}"
    out["comments"].sort(key=lambda c: -c["likes"])
    for c in out["comments"]:
        c["likes_label"] = like_label(c["likes"])
    return out


if __name__ == "__main__":
    util.load_env()
    if len(sys.argv) != 3:
        util.die("사용법: python pipeline/comments.py <유튜브 링크> <출력.json>")
    res = fetch(sys.argv[1])
    util.write_json(sys.argv[2], res)
    print(f"댓글 {len(res['comments'])}개 · 채널 {res['channel']} {res['error']}")
