"""재편집 쇼츠의 **진짜 원본 영상**(연예인 공식 채널 영상) 찾기.

근거 순서(모두 기록):
1) 쇼츠 설명란의 유튜브 링크(출처 표기) → 확실(certain)
2) 쇼츠 제목·해시태그·태그에서 연예인 이름을 찾고, 그 연예인 채널의 **이미 수집된 원본 영상** 중 단어 일치로 순위
3) (API 키·허용 시) 그 연예인 채널 안에서 YouTube 검색(search.list channelId, 할당량 100) — 쇼츠 게시일 이전 영상만
4) (AI 키 시) 상위 후보를 Claude 가 재검토 → 확신도·이유

확신도 certain/high 면 original_video_id 를 자동 연결하고, 그 외는 후보 목록만 저장해 사람이 고르게 한다.
"""
from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Celebrity, SourcingCandidate, Video, YoutubeChannel, utcnow

DERIVED = ("reedit_shorts", "competitor")
STOP = {"shorts", "쇼츠", "추천템", "추천", "영상", "유튜브", "리뷰", "꿀템", "대란", "품절", "품절대란", "화제", "연예인", "셀럽",
        "진짜", "정말", "이거", "그거", "왜", "다들", "대체", "최고", "레전드", "충격", "난리", "요즘", "사온", "사", "온",
        "서서", "줄서서", "환장", "할까요", "하는", "있는", "보고", "이게", "그게", "저게", "너무", "완전", "역대급", "솔직", "후기",
        "공개", "드디어", "지금", "바로", "이유", "결국", "근황", "브이로그", "vlog", "short", "video", "youtube", "구독", "좋아요"}
_YT_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|live/|embed/))([A-Za-z0-9_-]{11})")
_TOKEN_RE = re.compile(r"[가-힣A-Za-z0-9]{2,}")


def extract_keywords(short: Video, product_name: str | None = None, celeb_names: list[str] | None = None) -> list[str]:
    text = f"{short.title or ''} {product_name or ''} {' '.join(short.tags or [])} {(short.description or '')[:300]}"
    toks = []
    for t in _TOKEN_RE.findall(text):
        tl = t.lower()
        if tl in STOP or tl.isdigit():
            continue
        if celeb_names and any(n in t for n in celeb_names):
            continue
        if t not in toks:
            toks.append(t)
    return toks[:20]


def detect_celebrities(db: Session, short: Video) -> list[Celebrity]:
    text = f"{short.title or ''} {short.description or ''} {' '.join(short.tags or [])}"
    found = []
    for c in db.query(Celebrity).filter(Celebrity.is_demo.is_(False)).all():
        if c.name and len(c.name) >= 2 and c.name in text:
            found.append(c)
    # 이미 지정된 연예인은 항상 포함
    if short.celebrity and short.celebrity not in found:
        found.insert(0, short.celebrity)
    return found


def _score_text(kws: list[str], title: str | None, desc: str | None, tags: list | None) -> tuple[float, list[str]]:
    t = (title or "").lower()
    d = ((desc or "")[:2000] + " " + " ".join(tags or [])).lower()
    hits, score = [], 0.0
    for k in kws:
        kl = k.lower()
        if kl in t:
            score += 2.0; hits.append(k)
        elif kl in d:
            score += 1.0; hits.append(k)
    return score, hits


def _cand(v: Video, score: float, hits: list[str], how: str) -> dict:
    return {"video_id": v.id, "youtube_video_id": v.youtube_video_id, "title": v.title, "url": v.url,
            "published_at": v.published_at.isoformat() if v.published_at else None, "duration_seconds": v.duration_seconds,
            "channel": v.channel.channel_name if v.channel else v.yt_channel_title, "thumbnail_url": v.thumbnail_url,
            "score": round(score, 1), "hits": hits, "how": how}


def find_original(db: Session, short: Video, product_name: str | None = None, use_api: bool = False,
                  max_searches: int = 2, use_ai: bool = True) -> dict:
    celebs = detect_celebrities(db, short)
    names = [c.name for c in celebs]
    kws = extract_keywords(short, product_name, names)
    result = {"checked_at": utcnow().isoformat(), "celebrities": names, "keywords": kws, "candidates": [],
              "best": None, "confidence": "none", "reason": "", "api_searches": 0, "notes": []}
    now = utcnow()
    before = short.published_at

    # 1) 설명란 출처 링크
    for yid in _YT_RE.findall(short.description or ""):
        if yid == short.youtube_video_id:
            continue
        v = db.query(Video).filter(Video.youtube_video_id == yid).first()
        if v is None and use_api:
            from .collection import add_video_by_id
            v, _, err = add_video_by_id(db, yid, None)
            if v is None:
                result["notes"].append(f"설명란 링크 {yid} 조회 실패: {err}")
        if v is not None and v.id != short.id:
            result["candidates"].append(_cand(v, 99.0, ["설명란 출처 링크"], "description_link"))
            result["best"], result["confidence"] = result["candidates"][0], "certain"
            result["reason"] = "쇼츠 설명란에 적힌 유튜브 링크가 가리키는 영상"
            _apply(db, short, v, result)
            return result

    if not celebs:
        result["reason"] = "쇼츠 제목·설명·태그에서 등록된 연예인 이름을 찾지 못했습니다. 후보 상세에서 연예인을 지정한 뒤 다시 시도하세요."
        short.original_match = result
        db.commit()
        return result

    # 2) DB 안의 원본 영상
    celeb_ids = [c.id for c in celebs]
    chan_ids = [ch.id for c in celebs for ch in c.channels]
    q = db.query(Video).filter(Video.is_demo.is_(False), Video.source_type == "original_celebrity", Video.id != short.id)
    q = q.filter((Video.celebrity_id.in_(celeb_ids)) | (Video.channel_id.in_(chan_ids)) if chan_ids else Video.celebrity_id.in_(celeb_ids))
    pool = q.all()
    for v in pool:
        if before and v.published_at and v.published_at > before:
            continue  # 쇼츠보다 늦게 올라온 영상은 원본일 수 없음
        sc, hits = _score_text(kws, v.title, v.description, v.tags)
        if sc > 0:
            result["candidates"].append(_cand(v, sc, hits, "db"))

    # 3) 채널 안 API 검색
    if use_api and kws:
        from .youtube_connector import YouTubeAPIError, YouTubeClient, YouTubeNotConfigured
        try:
            client = YouTubeClient()
        except YouTubeNotConfigured as e:
            client = None
            result["notes"].append(str(e))
        if client:
            try:
                query = " ".join(kws[:4])
                for c in celebs:
                    for ch in c.channels:
                        if not ch.channel_id or result["api_searches"] >= max_searches:
                            continue
                        items = client.search_channel_videos(ch.channel_id, query, max_results=8, published_before=before)
                        result["api_searches"] += 1
                        ids = [i["video_id"] for i in items if i["video_id"] != short.youtube_video_id]
                        if not ids:
                            continue
                        full = client.get_videos(ids)
                        from .collection import upsert_video_from_api
                        for item in full:
                            v, _ = upsert_video_from_api(db, item, ch, now, source_type="original_celebrity")
                            if v.celebrity_id is None:
                                v.celebrity_id = c.id
                            sc, hits = _score_text(kws, v.title, v.description, v.tags)
                            if not any(x["video_id"] == v.id for x in result["candidates"]):
                                result["candidates"].append(_cand(v, sc + 0.5, hits + ["채널 내 검색 결과"], "api_channel_search"))
                db.commit()
            except YouTubeAPIError as e:
                result["notes"].append(f"YouTube 검색 실패: {e}")
            finally:
                client.close()

    result["candidates"].sort(key=lambda x: -x["score"])
    result["candidates"] = result["candidates"][:8]
    if not result["candidates"]:
        result["reason"] = ("연예인 채널에서 단어가 겹치는 원본 영상을 찾지 못했습니다. " +
                            ("채널 영상 수집 범위(조회 대상 게시 기간)를 넓히거나, " if not use_api else "") +
                            "원본 영상 URL을 직접 등록해 연결하세요.")
        short.original_match = result
        db.commit()
        return result

    best = result["candidates"][0]
    second = result["candidates"][1]["score"] if len(result["candidates"]) > 1 else 0
    title_hits = sum(1 for h in best["hits"] if h.lower() in (next((c["title"] for c in result["candidates"] if c is best), "") or "").lower())
    if (best["score"] >= 4 or (len(best["hits"]) >= 2 and title_hits >= 1)) and best["score"] >= second + 2:
        conf = "high"
    elif best["score"] >= 2:
        conf = "medium"
    else:
        conf = "low"
    reason = f"단어 일치 {', '.join(best['hits'][:5])} (점수 {best['score']})"

    # 4) AI 재검토
    if use_ai:
        try:
            from ..config import get_settings
            if get_settings().anthropic_api_key:
                ai = _ai_pick(short, result["candidates"], names)
                if ai and ai.get("video_id") in {c["video_id"] for c in result["candidates"]}:
                    best = next(c for c in result["candidates"] if c["video_id"] == ai["video_id"])
                    conf = ai.get("confidence", conf)
                    reason = f"AI 검토: {ai.get('reason', '')} / 규칙 근거: {reason}"
                    result["ai"] = {"model": ai.get("_model"), "confidence": ai.get("confidence")}
                elif ai and ai.get("video_id") is None:
                    conf = "low" if conf != "certain" else conf
                    reason = f"AI 검토: 후보 중 원본이 없다고 판단 — {ai.get('reason', '')} / 규칙 근거: {reason}"
        except Exception as e:  # AI 실패는 규칙 결과로 대체
            result["notes"].append(f"AI 재검토 실패: {str(e)[:120]}")
    result["best"], result["confidence"], result["reason"] = best, conf, reason
    v = db.get(Video, best["video_id"])
    if conf in ("certain", "high"):
        _apply(db, short, v, result)
    else:
        if short.celebrity_id is None and len(celebs) == 1:
            short.celebrity_id = celebs[0].id
        short.original_match = result
        db.commit()
    return result


def _apply(db: Session, short: Video, original: Video, result: dict) -> None:
    short.original_video_id = original.id
    if short.celebrity_id is None:
        short.celebrity_id = original.celebrity_id or (original.channel.celebrity_id if original.channel else None)
    result["linked"] = True
    short.original_match = result
    db.commit()


def _ai_pick(short: Video, candidates: list[dict], names: list[str]) -> dict | None:
    import json
    from .claude_client import create_json
    schema = {"type": "object", "additionalProperties": False, "required": ["video_id", "confidence", "reason"],
              "properties": {"video_id": {"type": ["integer", "null"]}, "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                             "reason": {"type": "string"}}}
    system = ("당신은 유튜브 재편집 쇼츠의 원본 영상을 찾는 조사원이다. 한국어로 답한다. "
              "쇼츠의 제목·설명과 후보 원본 영상들의 제목·설명을 비교해 쇼츠가 잘라 쓴 원본일 가능성이 가장 높은 하나를 고른다. "
              "확실하지 않으면 confidence 를 낮추고, 어느 것도 아니면 video_id 를 null 로 한다. 추측으로 단정하지 않는다.")
    payload = {"short": {"title": short.title, "description": (short.description or "")[:800], "published_at": short.published_at.isoformat() if short.published_at else None,
                         "celebrities_mentioned": names},
               "candidates": [{"video_id": c["video_id"], "title": c["title"], "published_at": c["published_at"], "duration_seconds": c["duration_seconds"],
                               "channel": c["channel"], "hits": c["hits"]} for c in candidates]}
    out = create_json(system=system, max_tokens=800, output_schema=schema,
                      messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    return out


def link_originals_step(db: Session, use_api: bool = False, max_searches_total: int = 10) -> dict:
    """원본이 없는 활성 후보 쇼츠에 자동 탐색을 돌린다. API 검색은 총 max_searches_total 번까지(할당량 100/회)."""
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected", "published", "analyzing"])).all())
    linked, tried, searches = 0, 0, 0
    for c in cands:
        v = c.video
        if v.source_type not in DERIVED or v.original_video_id:
            continue
        # 최근에 이미 찾아봤고(24시간) API 없이 다시 봐도 달라질 게 없으면 건너뜀
        om = v.original_match or {}
        if om.get("checked_at") and not use_api:
            try:
                if (utcnow() - datetime.fromisoformat(om["checked_at"])).total_seconds() < 86400:
                    continue
            except Exception:
                pass
        allow_api = use_api and searches < max_searches_total
        r = find_original(db, v, c.product.name if c.product else None, use_api=allow_api, max_searches=2)
        tried += 1
        searches += r.get("api_searches", 0)
        if r.get("linked"):
            linked += 1
    return {"tried": tried, "linked": linked, "api_searches": searches}
