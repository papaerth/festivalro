"""캡처 화면으로 원본 영상 찾기(구글 렌즈처럼).

경로 1) Google Cloud Vision Web Detection(공식 API, 키 필요): 같은 장면 이미지를 쓴 웹 페이지 → 유튜브 영상 URL 을 직접 얻는다.
경로 2) Claude 비전(키 필요): 화면 속 인물·자막·프로그램 단서를 읽어 검색어를 만들고, 등록된 연예인 채널 안 검색 + YouTube 일반 검색으로 찾는다.
두 경로 모두 결과를 '후보 목록'으로 돌려주고, Vision 직접 일치나 AI 높은 확신일 때만 자동 연결한다. 추측으로 단정하지 않는다.
"""
from __future__ import annotations

import base64
import json
import re

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Celebrity, Video, YoutubeChannel, utcnow
from .original_finder import (MIN_ORIGINAL_SECONDS, _ai_pick, _apply, _cand, detect_celebrities, extract_keywords,
                              score_with_snippets)

_YT_ID_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|live/|embed/)|i\.ytimg\.com/vi/)([A-Za-z0-9_-]{11})")


class ImageSearchNotConfigured(RuntimeError):
    pass


def vision_web_detection(images: list[tuple[bytes, str]]) -> dict:
    """Google Cloud Vision images:annotate WEB_DETECTION. 반환: {youtube_ids, pages, entities}"""
    key = get_settings().google_vision_api_key
    if not key:
        raise ImageSearchNotConfigured("GOOGLE_VISION_API_KEY 미설정")
    reqs = [{"image": {"content": base64.standard_b64encode(d).decode()}, "features": [{"type": "WEB_DETECTION", "maxResults": 20}]}
            for d, _ in images[:3]]
    r = httpx.post("https://vision.googleapis.com/v1/images:annotate", params={"key": key}, json={"requests": reqs}, timeout=40.0)
    r.raise_for_status()
    yt_ids, pages, entities = [], [], []
    for resp in r.json().get("responses", []):
        wd = resp.get("webDetection") or {}
        for e in wd.get("webEntities", []):
            if e.get("description") and e["description"] not in entities:
                entities.append(e["description"])
        for p in wd.get("pagesWithMatchingImages", []):
            url = p.get("url", "")
            pages.append({"url": url, "title": p.get("pageTitle")})
            for m in _YT_ID_RE.findall(url):
                if m not in yt_ids:
                    yt_ids.append(m)
        for key_ in ("fullMatchingImages", "partialMatchingImages", "visuallySimilarImages"):
            for im in wd.get(key_, []):
                for m in _YT_ID_RE.findall(im.get("url", "")):
                    if m not in yt_ids and key_ != "visuallySimilarImages":
                        yt_ids.append(m)
    return {"youtube_ids": yt_ids, "pages": pages[:15], "entities": entities[:15]}


def claude_read_frame(images: list[tuple[bytes, str]], short: Video, known_names: list[str]) -> dict:
    from .claude_client import create_json
    schema = {"type": "object", "additionalProperties": False,
              "required": ["people", "on_screen_text", "program_guess", "search_queries", "notes"],
              "properties": {"people": {"type": "array", "items": {"type": "string"}}, "on_screen_text": {"type": "string"},
                             "program_guess": {"type": "string"}, "search_queries": {"type": "array", "items": {"type": "string"}},
                             "notes": {"type": "string"}}}
    content = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.standard_b64encode(d).decode()}} for d, mt in images[:4]]
    content.append({"type": "text", "text": json.dumps({
        "short_title": short.title, "short_description": (short.description or "")[:400],
        "registered_celebrities_sample": known_names[:80],
        "task": "이 화면(재편집 쇼츠의 한 장면)이 어느 유튜브 원본 영상에서 왔는지 찾기 위한 단서를 읽어라."}, ensure_ascii=False)})
    system = ("한국 연예인 유튜브 화면 분석가. 한국어로 답한다. 화면에 보이는 인물 이름(확실한 경우만, 등록 목록과 대조), 화면 자막·로고 텍스트, "
              "어느 채널/프로그램 장면인지 추정(모르면 '불명'), 그리고 원본 롱폼 영상을 찾기 위한 유튜브 검색어 3개를 만든다. "
              "검색어는 인물 이름 + 장면 단서(장소·행동·소품) 조합으로 짧게. 모르는 것은 지어내지 말고 notes 에 적는다.")
    return create_json(system=system, max_tokens=800, output_schema=schema, messages=[{"role": "user", "content": content}])


def find_original_by_image(db: Session, short: Video, images: list[tuple[bytes, str]], use_thumbnail: bool = True,
                           product_name: str | None = None, max_searches: int = 3, seed: dict | None = None) -> dict:
    """seed: 앞서 한 제목·해시태그 기반 탐색 결과(original_match). 그 후보들을 합쳐서 함께 순위 매긴다."""
    from .product_identifier import fetch_image
    from .collection import parse_iso8601_duration, upsert_video_from_api
    from .youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured

    imgs = list(images)
    if use_thumbnail and short.thumbnail_url and len(imgs) < 4:
        t = fetch_image(short.thumbnail_url)
        if t:
            imgs.append(t)
    if not imgs:
        raise ValueError("이미지가 없습니다. 캡처를 붙여넣거나 썸네일 사용을 켜세요.")
    s = get_settings()
    before = short.published_at
    now = utcnow()
    celebs = detect_celebrities(db, short)
    names = [c.name for c in celebs]
    kws = extract_keywords(short, product_name, names)
    result = {"checked_at": now.isoformat(), "method": "image" if not seed else "text+image", "celebrities": names, "keywords": kws,
              "candidates": [dict(c, how=c.get("how", "db")) for c in (seed or {}).get("candidates", [])],
              "best": None, "confidence": "none", "reason": "", "api_searches": 0, "notes": [], "image_analysis": {},
              "images_used": len(imgs), "hashtags": (seed or {}).get("hashtags"), "text_queries": (seed or {}).get("queries")}
    client = None
    try:
        client = YouTubeClient()
    except YouTubeNotConfigured as e:
        result["notes"].append(str(e))

    def absorb(ids: list[str], how: str, bonus: float, extra_reason: str, channel_hint: YoutubeChannel | None = None, celeb: Celebrity | None = None):
        ids = [i for i in ids if i != short.youtube_video_id]
        if not ids:
            return
        existing = {v.youtube_video_id: v for v in db.query(Video).filter(Video.youtube_video_id.in_(ids)).all()}
        missing = [i for i in ids if i not in existing]
        fetched = []
        if missing and client:
            try:
                fetched = client.get_videos(missing)
            except YouTubeAPIError as e:
                result["notes"].append(f"영상 정보 조회 실패: {e}")
        vids = list(existing.values())
        for item in fetched:
            d = parse_iso8601_duration(item.get("duration")) or 0
            if d <= MIN_ORIGINAL_SECONDS:
                result["skipped_shorts"] = result.get("skipped_shorts", 0) + 1
                continue
            ch = channel_hint or db.query(YoutubeChannel).filter(YoutubeChannel.channel_id == item.get("channel_id")).first()
            v, _ = upsert_video_from_api(db, item, ch, now, source_type="original_celebrity")
            if v.celebrity_id is None and (celeb or (ch and ch.celebrity_id)):
                v.celebrity_id = celeb.id if celeb else ch.celebrity_id
            vids.append(v)
        for v in vids:
            if v.id == short.id or (v.duration_seconds is not None and v.duration_seconds <= MIN_ORIGINAL_SECONDS) or v.video_format == "short":
                continue
            sc, hits, snips = score_with_snippets(kws, v.title, v.description, v.tags)
            if not any(x["video_id"] == v.id for x in result["candidates"]):
                result["candidates"].append(_cand(v, sc + bonus, hits + [extra_reason], how, before, snips))
        db.commit()

    # 경로 1: Google Vision 웹 감지(같은 장면을 쓴 유튜브 페이지)
    vision_hit = False
    if s.google_vision_api_key:
        try:
            wd = vision_web_detection(imgs)
            result["image_analysis"]["vision"] = {"youtube_ids": wd["youtube_ids"], "pages": wd["pages"][:8], "entities": wd["entities"][:10]}
            if wd["youtube_ids"]:
                absorb(wd["youtube_ids"], "google_vision_match", 10.0, "같은 장면 이미지가 쓰인 유튜브 페이지(Google Vision)")
                vision_hit = any(c["how"] == "google_vision_match" for c in result["candidates"])
            if wd["entities"]:
                kws = list(dict.fromkeys(kws + [e for e in wd["entities"] if len(e) >= 2]))[:24]
        except ImageSearchNotConfigured:
            pass
        except Exception as e:
            result["notes"].append(f"Google Vision 조회 실패: {str(e)[:160]}")
    else:
        result["notes"].append("Google Vision 키가 없어 '같은 장면 이미지 검색'(구글 렌즈 방식)은 건너뛰고 AI 화면 읽기로 찾습니다. .env 의 GOOGLE_VISION_API_KEY 를 넣으면 정확도가 올라갑니다.")

    # 경로 2: Claude 가 화면 단서를 읽고 검색어 생성 → 채널 안 검색 + 일반 검색
    if s.anthropic_api_key:
        try:
            known = [c.name for c in db.query(Celebrity).filter(Celebrity.is_demo.is_(False)).all()]
            fr = claude_read_frame(imgs, short, known)
            result["image_analysis"]["ai"] = {k: fr.get(k) for k in ("people", "on_screen_text", "program_guess", "search_queries", "notes")} | {"model": fr.get("_model")}
            seen_people = [p for p in fr.get("people", []) if p]
            for p in seen_people:
                c = db.query(Celebrity).filter(Celebrity.name == p, Celebrity.is_demo.is_(False)).first()
                if c and c not in celebs:
                    celebs.append(c)
            result["celebrities"] = [c.name for c in celebs]
            queries = [q for q in fr.get("search_queries", []) if q][:3]
            result["queries"] = queries
            if client and queries:
                try:
                    # 2-a 등록 연예인 채널 안 검색
                    for c in celebs:
                        for ch in c.channels:
                            if ch.channel_id and result["api_searches"] < max_searches:
                                items = client.search_channel_videos(ch.channel_id, queries[0], max_results=8, published_before=before)
                                result["api_searches"] += 1
                                absorb([i["video_id"] for i in items], "image_ai_channel_search", 0.5, f"AI 화면 단서 검색({ch.channel_name})", ch, c)
                    # 2-b 일반 검색(채널 미등록 연예인·방송 클립 대비) — 1회
                    if result["api_searches"] < max_searches:
                        ids = client.search_videos(queries[0], max_results=10, duration="any", published_before=before)
                        result["api_searches"] += 1
                        absorb(ids, "image_ai_search", 0.0, "AI 화면 단서 YouTube 검색")
                except YouTubeAPIError as e:
                    result["notes"].append(f"YouTube 검색 실패: {e}")
        except Exception as e:
            result["notes"].append(f"AI 화면 읽기 실패: {str(e)[:160]}")
    elif not vision_hit:
        result["notes"].append("ANTHROPIC_API_KEY 가 없어 화면 읽기를 할 수 없습니다.")
    if client:
        client.close()
    result["api_searches"] += (seed or {}).get("api_searches", 0)

    result["candidates"].sort(key=lambda x: (-x["score"], -(x["duration_seconds"] or 0)))
    result["candidates"] = result["candidates"][:8]
    for n, x in enumerate(result["candidates"], 1):
        x["rank"] = n
    if result.get("skipped_shorts"):
        result["notes"].append(f"쇼츠(60초 이하) {result['skipped_shorts']}개는 원본 후보에서 제외했습니다.")
    if not result["candidates"]:
        result["reason"] = "화면 단서로도 롱폼 원본을 찾지 못했습니다. 다른 장면(인물 얼굴·자막·로고가 잘 보이는 장면)을 캡처해 다시 시도하거나, 원본 URL 을 직접 연결하세요."
        short.original_match = result
        db.commit()
        return result
    best = result["candidates"][0]
    if best["how"] == "google_vision_match":
        conf, reason = "certain", "같은 장면 이미지가 쓰인 유튜브 페이지를 Google Vision 이 직접 찾음"
    else:
        conf, reason = ("medium" if best["score"] >= 2 else "low"), f"#1 {', '.join(best['reasons'][:6])} (점수 {best['score']})"
        if s.anthropic_api_key:
            try:
                ai = _ai_pick(short, result["candidates"], result["celebrities"])
                if ai and ai.get("video_id") in {c["video_id"] for c in result["candidates"]}:
                    best = next(c for c in result["candidates"] if c["video_id"] == ai["video_id"])
                    conf = ai.get("confidence", conf)
                    reason = f"AI 검토: {ai.get('reason', '')} / 규칙 근거: {reason}"
                elif ai and ai.get("video_id") is None:
                    conf = "low"; reason = f"AI 검토: 후보 중 원본이 없다고 판단 — {ai.get('reason', '')}"
            except Exception as e:
                result["notes"].append(f"AI 재검토 실패: {str(e)[:120]}")
    result["best"], result["confidence"], result["reason"] = best, conf, reason
    v = db.get(Video, best["video_id"])
    if conf in ("certain", "high"):
        _apply(db, short, v, result)
    else:
        short.original_match = result
        db.commit()
    return result
