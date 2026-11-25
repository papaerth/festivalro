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
        "공개", "드디어", "지금", "바로", "이유", "결국", "근황", "브이로그", "vlog", "short", "video", "youtube", "구독", "좋아요",
        "밤새", "밤에", "아침에", "오늘", "어제", "내일", "모두", "전부", "하나", "진심", "실화", "대박", "미쳤다", "미친", "찐", "찐친들", "언니", "오빠", "엄마", "아빠",
        "같이", "함께", "연예인추천템", "추천템", "셀럽템", "셀럽꿀템", "꿀템", "인생템", "필수템", "애정템", "득템", "내돈내산", "리뷰", "언박싱",
        "이것", "그것", "저것", "이걸", "그걸", "것만", "이것만", "챙기세요", "꼭", "절대", "무조건", "드디어", "결국", "역시", "그냥", "진짜로"}
_YT_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|live/|embed/))([A-Za-z0-9_-]{11})")
_TOKEN_RE = re.compile(r"[가-힣A-Za-z0-9]{2,}")


_HASHTAG_RE = re.compile(r"#([가-힣A-Za-z0-9_]{2,})")
# 흔한 서술어·조사 꼬리(제목의 동사·형용사 토막을 걸러낸다)
_VERBISH = re.compile(r"(세요|하세요|습니다|됩니다|된다는|없으면|있으면|한다면|할까요|했어요|해요|이에요|예요|네요|거든요|라고|이라고|처럼|보다|까지|부터|에서|으로|에게|한테|이다|했다|한다)$")


def hashtags_of(short: Video) -> list[str]:
    out = []
    for h in _HASHTAG_RE.findall(f"{short.title or ''} {short.description or ''}"):
        if h.lower() not in STOP and h not in out:
            out.append(h)
    return out


def extract_keywords(short: Video, product_name: str | None = None, celeb_names: list[str] | None = None) -> list[str]:
    """검색·일치용 단어. 우선순위: 해시태그 → 상품명 → 제목 명사 → 태그 → 설명 앞부분. 등록된 연예인 이름은 제외(채널로 처리)."""
    ordered = hashtags_of(short) + _TOKEN_RE.findall(product_name or "") + _TOKEN_RE.findall(short.title or "") \
        + [t for tag in (short.tags or []) for t in _TOKEN_RE.findall(tag)] + _TOKEN_RE.findall((short.description or "")[:300])
    toks: list[str] = []
    for t in ordered:
        tl = t.lower()
        if tl in STOP or tl.isdigit() or _VERBISH.search(t) and len(t) > 3:
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
    score, hits, _ = score_with_snippets(kws, title, desc, tags)
    return score, hits


def score_with_snippets(kws: list[str], title: str | None, desc: str | None, tags: list | None,
                        strong: set[str] | None = None) -> tuple[float, list[str], list[str]]:
    """단어 일치 점수 + 설명란에서 그 단어가 나온 문장 조각(근거 문장).
    strong(해시태그·상품명처럼 재편집 채널이 고른 핵심 단어)은 제목 3점/설명 1.5점, 나머지는 2점/1점."""
    t = (title or "").lower()
    raw_d = (desc or "")[:2000]
    d = (raw_d + " " + " ".join(tags or [])).lower()
    strong_l = {x.lower() for x in (strong or set())}
    hits, snippets, score = [], [], 0.0
    for k in kws:
        kl = k.lower()
        w = 1.5 if kl in strong_l else 1.0
        if kl in t:
            score += 2.0 * w; hits.append(k)
        elif kl in d:
            score += 1.0 * w; hits.append(k)
            i = raw_d.lower().find(kl)
            if i >= 0 and len(snippets) < 3:
                a, b = max(0, i - 40), min(len(raw_d), i + len(kl) + 40)
                snippets.append(("…" if a else "") + raw_d[a:b].replace("\n", " ").strip() + ("…" if b < len(raw_d) else ""))
    return score, hits, snippets


MIN_ORIGINAL_SECONDS = 60  # 쇼츠(60초 이하)는 원본 후보에서 제외 — 원본은 롱폼이어야 한다


def _is_short(v: Video) -> bool:
    return v.video_format == "short" or (v.duration_seconds is not None and v.duration_seconds <= MIN_ORIGINAL_SECONDS)


def _cand(v: Video, score: float, hits: list[str], how: str, short_published: datetime | None = None, snippets: list[str] | None = None) -> dict:
    """후보 항목 + 롱폼·채널 검증·게시 시점 가산(근거 기록)."""
    reasons = list(hits)
    bonus = 0.0
    dur = v.duration_seconds or 0
    if dur >= 240:
        bonus += 1.0; reasons.append(f"롱폼 {dur // 60}분")
    elif dur > MIN_ORIGINAL_SECONDS:
        bonus += 0.3; reasons.append(f"{dur // 60}분 {dur % 60}초")
    if v.channel and v.channel.verification_status == "verified":
        bonus += 0.5; reasons.append("공식 채널 확인됨")
    if short_published and v.published_at:
        days = (short_published - v.published_at).days
        if 0 <= days <= 180:
            bonus += 0.5; reasons.append(f"쇼츠 {days}일 전 게시")
        elif days > 730:
            bonus -= 0.3; reasons.append(f"쇼츠보다 {days // 365}년 이상 전 게시")
    return {"video_id": v.id, "youtube_video_id": v.youtube_video_id, "title": v.title, "url": v.url,
            "published_at": v.published_at.isoformat() if v.published_at else None, "duration_seconds": v.duration_seconds,
            "channel": v.channel.channel_name if v.channel else v.yt_channel_title, "thumbnail_url": v.thumbnail_url,
            "score": round(score + bonus, 1), "keyword_score": round(score, 1), "hits": hits, "reasons": reasons, "how": how,
            "is_long": dur >= 240, "snippets": snippets or []}


def find_original(db: Session, short: Video, product_name: str | None = None, use_api: bool = False,
                  max_searches: int = 2, use_ai: bool = True) -> dict:
    celebs = detect_celebrities(db, short)
    names = [c.name for c in celebs]
    kws = extract_keywords(short, product_name, names)
    tags = hashtags_of(short)
    strong = set(h for h in tags if h in kws) | set(_TOKEN_RE.findall(product_name or ""))
    result = {"checked_at": utcnow().isoformat(), "celebrities": names, "keywords": kws, "hashtags": tags, "candidates": [],
              "best": None, "confidence": "none", "reason": "", "api_searches": 0, "notes": [], "strong": sorted(strong)}
    unregistered = [h for h in tags if 2 <= len(h) <= 4 and re.fullmatch(r"[가-힣]+", h) and not any(n in h for n in names)
                    and h.lower() not in STOP and h not in kws[:0]]
    if unregistered:
        result["notes"].append("해시태그 중 등록된 연예인이 아닌 이름일 수 있는 단어: " + ", ".join("#" + h for h in unregistered[:6]) +
                               " — 함께 출연한 연예인이면 「연예인·채널」에 채널을 등록해야 그 채널도 검색합니다. 등록 전에는 검색어로만 씁니다.")
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
    skipped_shorts = 0
    result["skipped_shorts_api"] = 0
    for v in pool:
        if before and v.published_at and v.published_at > before:
            continue  # 쇼츠보다 늦게 올라온 영상은 원본일 수 없음
        if _is_short(v):
            skipped_shorts += 1
            continue  # 쇼츠는 원본이 아님
        sc, hits, snips = score_with_snippets(kws, v.title, v.description, v.tags, strong)
        if sc > 0:
            result["candidates"].append(_cand(v, sc, hits, "db", before, snips))

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
                tags_q = [h for h in hashtags_of(short) if h in kws][:2]
                queries = [" ".join(tags_q)] if tags_q else []
                rest = [k for k in kws if k not in tags_q][:2]
                if rest:
                    queries.append(" ".join(rest))
                queries = [q for q in queries if q] or [" ".join(kws[:4])]
                result["queries"] = queries
                for c in celebs:
                    for ch in c.channels:
                        if not ch.channel_id:
                            continue
                        for query in queries:
                            if result["api_searches"] >= max_searches:
                                break
                            items = client.search_channel_videos(ch.channel_id, query, max_results=8, published_before=before)
                            result["api_searches"] += 1
                            _absorb(db, client, ch, c, items, short, kws, before, result, now)
                db.commit()
            except YouTubeAPIError as e:
                result["notes"].append(f"YouTube 검색 실패: {e}")
            finally:
                client.close()
    result["candidates"].sort(key=lambda x: (-x["score"], -(x["duration_seconds"] or 0)))
    result["candidates"] = result["candidates"][:8]
    for n, x in enumerate(result["candidates"], 1):
        x["rank"] = n
    skipped_shorts += result.pop("skipped_shorts_api", 0)
    result["skipped_shorts"] = skipped_shorts
    if skipped_shorts:
        result["notes"].append(f"쇼츠(60초 이하) {skipped_shorts}개는 원본 후보에서 제외했습니다(롱폼만 순위).")
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
    reason = f"#1 {', '.join(best['reasons'][:6])} (점수 {best['score']})"

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


def _absorb(db, client, ch, c, items, short, kws, before, result, now):
    ids = [i["video_id"] for i in items if i["video_id"] != short.youtube_video_id]
    if not ids:
        return
    from .collection import parse_iso8601_duration, upsert_video_from_api
    for item in client.get_videos(ids):
        d = parse_iso8601_duration(item.get("duration")) or 0
        if d <= MIN_ORIGINAL_SECONDS:
            result["skipped_shorts_api"] = result.get("skipped_shorts_api", 0) + 1
            continue  # 채널의 쇼츠는 원본 후보에서 제외
        v, _ = upsert_video_from_api(db, item, ch, now, source_type="original_celebrity")
        if v.celebrity_id is None:
            v.celebrity_id = c.id
        strong = set(result.get("strong", []))
        sc, hits, snips = score_with_snippets(kws, v.title, v.description, v.tags, strong)
        if not any(x["video_id"] == v.id for x in result["candidates"]):
            result["candidates"].append(_cand(v, sc + 0.5, hits + ["채널 내 검색 결과"], "api_channel_search", before, snips))


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
              "쇼츠의 제목·설명과 후보 원본 영상들의 제목·설명 조각을 비교해 쇼츠가 잘라 쓴 원본일 가능성이 가장 높은 하나를 고른다. "
              "재편집 쇼츠는 제목에 여러 연예인을 함께 적어도 실제로는 한 연예인의 영상에서 다른 연예인이 '언급'만 된 경우가 많다는 점을 고려한다. "
              "확실하지 않으면 confidence 를 낮추고, 어느 것도 아니면 video_id 를 null 로 한다. 추측으로 단정하지 않는다.")
    payload = {"short": {"title": short.title, "description": (short.description or "")[:800], "published_at": short.published_at.isoformat() if short.published_at else None,
                         "celebrities_mentioned": names},
               "candidates": [{"video_id": c["video_id"], "title": c["title"], "published_at": c["published_at"], "duration_seconds": c["duration_seconds"],
                               "channel": c["channel"], "hits": c["hits"], "description_snippets": c.get("snippets", [])} for c in candidates]}
    out = create_json(system=system, max_tokens=800, output_schema=schema,
                      messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    return out


def link_originals_step(db: Session, use_api: bool = False, max_searches_total: int = 10, use_image: bool | None = None) -> dict:
    """원본이 없는 활성 후보 쇼츠에 자동 탐색을 돌린다(버튼 없이).

    1) 제목·해시태그·연예인 채널 수집 영상으로 찾고, use_api 면 채널 안 YouTube 검색까지(할당량 100/회, 총 max_searches_total 회)
    2) 그래도 확신이 낮으면 **쇼츠 썸네일(공식 API 이미지)로 이미지 검색**: Google Vision 키가 있으면 같은 장면을 쓴 유튜브 페이지를,
       없으면 AI 가 화면을 읽어 검색어를 만들고 YouTube 에서 찾는다. 사람이 캡처해 구글에 붙여넣는 일을 프로그램이 대신한다.
    결과는 후보마다 '연결됨 / 확인 필요(후보 목록) / 미발견' 으로 남고, 추측으로 단정하지 않는다.
    """
    from ..config import get_settings
    from ..models import UserSetting
    s = get_settings()
    if use_image is None:
        st = db.get(UserSetting, "auto_image_original")
        use_image = bool(st.value.get("value", False)) if st else False  # 기본 꺼짐(사용자가 캡처로 직접 찾는 쪽을 선택)
    image_possible = use_image and (s.google_vision_api_key or s.anthropic_api_key)
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected", "published", "analyzing"])).all())
    linked, tried, searches, image_tried, needs_review, unresolved = 0, 0, 0, 0, 0, 0
    for c in cands:
        v = c.video
        if v.source_type not in DERIVED or v.original_video_id:
            continue
        # 최근에 이미 찾아봤고(24시간) API 없이 다시 봐도 달라질 게 없으면 건너뜀
        om = v.original_match or {}
        if om.get("checked_at") and not use_api:
            try:
                if (utcnow() - datetime.fromisoformat(om["checked_at"])).total_seconds() < 86400:
                    if om.get("candidates"):
                        needs_review += 1
                    else:
                        unresolved += 1
                    continue
            except Exception:
                pass
        allow_api = use_api and searches < max_searches_total
        pname = c.product.name if c.product else None
        r = find_original(db, v, pname, use_api=allow_api, max_searches=2)
        tried += 1
        searches += r.get("api_searches", 0)
        if not r.get("linked") and image_possible and use_api and searches < max_searches_total and v.thumbnail_url \
                and not (om.get("image_analysis") and om.get("method") in ("image", "text+image")):
            try:
                from .image_original import find_original_by_image
                r2 = find_original_by_image(db, v, [], use_thumbnail=True, product_name=pname,
                                            max_searches=min(3, max_searches_total - searches), seed=r)
                image_tried += 1
                searches += r2.get("api_searches", 0) - r.get("api_searches", 0)
                r = r2
            except Exception as e:  # 이미지 검색 실패는 기록만
                r.setdefault("notes", []).append(f"썸네일 이미지 검색 실패: {str(e)[:120]}")
                v.original_match = r
                db.commit()
        if r.get("linked"):
            linked += 1
        elif r.get("candidates"):
            needs_review += 1
        else:
            unresolved += 1
    return {"tried": tried, "linked": linked, "needs_review": needs_review, "unresolved": unresolved,
            "image_searched": image_tried, "api_searches": searches,
            "note": ("이미지 검색: " + ("Google Vision + AI" if s.google_vision_api_key else "AI 화면 읽기(썸네일)") if image_possible else "이미지 검색 비활성(키 없음)")}
