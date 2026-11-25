"""재편집 쇼츠의 해시태그·제목에서 연예인 이름을 찾아 연예인·채널을 자동 등록한다(사람이 일일이 채널을 찾지 않도록).

- 후보 이름: 해시태그 중 한글 2~4자, 금칙어·상품/카테고리 단어 제외, 서로 다른 쇼츠 2개 이상에서 등장
- AI 키가 있으면 Claude 가 '한국 연예인 이름인가'를 분류하고 활동 분야를 적는다. 없으면 3개 이상 쇼츠에서 등장한 이름만 등록
- 등록 결과: Celebrity(notes '[자동 등록]') + 채널 placeholder(YoutubeChannel, channel_id 없음, '검증 전')
  → 접속 자동 작업의 'ID 일괄 조회' 단계가 채널 ID 를 찾는다(YouTube 채널 검색, 유력 후보만 저장).
"""
from __future__ import annotations

import json
import re
from datetime import timedelta

from sqlalchemy.orm import Session

from ..config import get_settings, load_config_json
from ..models import Celebrity, Video, YoutubeChannel, utcnow
from .original_finder import STOP, hashtags_of

_KO = re.compile(r"^[가-힣]{2,4}$")
EXTRA_STOP = {"쇼츠", "쇼핑", "추천", "리뷰", "먹방", "뷰티", "패션", "명품", "다이소", "올리브영", "코스트코", "이마트", "홈쇼핑",
              "가성비", "신상", "품절", "대란", "화제", "필수", "인생", "꿀팁", "살림", "주방", "청소", "건강", "다이어트", "운동",
              "트레이더조", "스타벅스", "맥도날드", "컬리", "쿠팡", "네이버", "유튜브", "방송", "예능", "드라마", "영화", "연예인", "셀럽", "스타"}


def _name_candidates(db: Session, days: int = 30) -> dict[str, dict]:
    since = utcnow() - timedelta(days=days)
    shorts = (db.query(Video).filter(Video.is_demo.is_(False), Video.source_type.in_(["reedit_shorts", "competitor"]),
                                     Video.created_at >= since).all())
    terms = load_config_json("shopping_keywords.json").get("category_terms", {})
    cat_words = {w.lower() for k, ws in terms.items() if isinstance(ws, list) for w in ws}
    known = {c.name for c in db.query(Celebrity).all()}
    found: dict[str, dict] = {}
    for v in shorts:
        for h in hashtags_of(v):
            if not _KO.match(h) or h in known or h.lower() in STOP or h in EXTRA_STOP or h.lower() in cat_words:
                continue
            d = found.setdefault(h, {"shorts": set(), "channels": set(), "titles": []})
            d["shorts"].add(v.id); d["channels"].add(v.yt_channel_id or v.id)
            if len(d["titles"]) < 3:
                d["titles"].append((v.title or "")[:80])
    return {k: d for k, d in found.items() if len(d["shorts"]) >= 2}


def _ai_classify(names: dict[str, dict]) -> dict[str, dict]:
    from .claude_client import create_json
    schema = {"type": "object", "additionalProperties": False, "required": ["people"],
              "properties": {"people": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                                                   "required": ["name", "is_celebrity", "field", "youtube_channel_guess"],
                                                                   "properties": {"name": {"type": "string"}, "is_celebrity": {"type": "boolean"},
                                                                                  "field": {"type": "string"}, "youtube_channel_guess": {"type": "string"}}}}}}
    payload = [{"name": n, "example_titles": d["titles"]} for n, d in names.items()]
    system = ("한국 연예계 지식이 있는 분류기. 한국어로 답한다. 각 단어가 실존 한국 연예인(배우·가수·방송인·셰프·스포츠인 등 유명인)의 이름이면 "
              "is_celebrity=true 와 활동 분야(배우/가수/방송인/셰프/스포츠인/인플루언서)를, 아니면 false 를 준다. "
              "그 사람의 공식 유튜브 채널명을 알면 youtube_channel_guess 에 적고 모르면 빈 문자열. 확실하지 않으면 false.")
    out = create_json(system=system, max_tokens=4000, output_schema=schema,
                      messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    return {p["name"]: p for p in out.get("people", []) if p.get("name") in names}


def auto_register_celebrities(db: Session, max_new: int = 20) -> dict:
    names = _name_candidates(db)
    if not names:
        return {"candidates": 0, "registered": 0, "skipped": [], "method": "none"}
    s = get_settings()
    registered, skipped = [], []
    method = "heuristic"
    cls: dict[str, dict] = {}
    if s.anthropic_api_key:
        try:
            cls = _ai_classify(names)
            method = "ai"
        except Exception as e:
            skipped.append(f"AI 분류 실패 → 규칙(3개 이상 쇼츠) 적용: {str(e)[:100]}")
    for name, d in sorted(names.items(), key=lambda kv: -len(kv[1]["shorts"])):
        if len(registered) >= max_new:
            break
        if method == "ai":
            c = cls.get(name)
            if not c or not c.get("is_celebrity"):
                skipped.append(f"{name}: 연예인 아님/불확실")
                continue
            field, guess = c.get("field") or None, c.get("youtube_channel_guess") or ""
        else:
            if len(d["shorts"]) < 3 or len(d["channels"]) < 2:
                skipped.append(f"{name}: 등장 {len(d['shorts'])}개(규칙 기준 미달)")
                continue
            field, guess = None, ""
        celeb = Celebrity(name=name, primary_field=field,
                          notes=f"[자동 등록 {utcnow():%Y-%m-%d}] 재편집 쇼츠 {len(d['shorts'])}개 해시태그에서 발견({method}). 채널 ID 는 자동 조회 후 확인 필요.")
        db.add(celeb); db.flush()
        ch = YoutubeChannel(celebrity_id=celeb.id, channel_name=guess or name, channel_type="official_personal",
                            verification_status="unverified", primary_field=field, source="auto",
                            notes=f"[자동 등록] 채널명은 {'AI 추정' if guess else '연예인 이름으로 임시 지정'} — ID 일괄 조회가 실제 채널을 찾습니다.")
        db.add(ch)
        registered.append({"name": name, "shorts": len(d["shorts"]), "channel_guess": guess or name, "field": field})
    db.commit()
    return {"candidates": len(names), "registered": len(registered), "list": registered, "skipped": skipped[:30], "method": method}
