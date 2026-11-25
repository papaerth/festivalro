"""규칙 기반 간이 채점(AI 아님). 저장된 사실만으로 6개 항목을 모두 채워 **임시 총점·순위**를 만든다.

목적: AI 채점·사람 채점 전에 후보들 사이의 순위를 바로 볼 수 있게 한다.
원칙:
- 모든 근거를 rationale 에 한국어로 적는다(어떤 값으로 왜 그 점수가 나왔는지).
- 지표(Outlier·VPH)가 없으면 조회수만으로 보수적으로 추정하고 그 사실을 적는다.
- 사람 점수 > AI 점수 > 규칙 점수 순으로 표시된다(latest_scores).
- 지표·상품 연결·원본 연결 상태가 바뀌면 재계산한다(rule_score_step).
"""
from __future__ import annotations

import math
import re
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..config import load_config_json
from ..models import ShortsPlan, SourcingCandidate, SourcingScore, utcnow
from .daily_sourcing import CATEGORIES, video_graph
from .scoring import compute_total, get_active_version, latest_scores, suggest_performance_score
from .season import SEASONS

DERIVED = ("reedit_shorts", "competitor")
NARRATIVE_TYPES = ("experience", "comparison", "curiosity_debate", "life_tip", "regret", "accidental_find", "value_find")
SEASON_TERMS = {
    "겨울": ["보온", "난방", "히터", "핫팩", "보습", "패딩", "김장", "수면양말", "전기장판", "목도리", "가습", "건조", "크림", "립밤", "온열", "귤", "군고구마", "호빵", "붕어빵"],
    "봄": ["봄", "미세먼지", "황사", "마스크", "알레르기", "꽃가루", "나들이", "피크닉", "환절기", "자외선", "선크림", "딸기", "새학기", "봄맞이", "대청소"],
    "여름": ["여름", "폭염", "쿨링", "선풍기", "에어컨", "냉감", "자외선", "선크림", "땀", "제습", "장마", "모기", "휴가", "물놀이", "냉면", "빙수", "수박", "아이스"],
    "가을": ["가을", "환절기", "보습", "건조", "니트", "가디건", "단풍", "캠핑", "추석", "전어", "대하", "고구마", "밤", "난방 준비", "김장"],
}


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _pts(frac: float, max_points: int) -> int:
    return int(round(_clamp(frac) * max_points))


def rule_score(c: SourcingCandidate, config: dict, today: date | None = None) -> tuple[dict, dict]:
    """(item_scores, rationale) — 모든 항목이 채워진다."""
    from ..serializers import evidence_summary, product_status

    today = today or date.today()
    maxes = {i["key"]: i["max"] for i in config["items"]}
    v = c.video
    orig = v.original
    is_short = v.source_type in DERIVED
    views = v.view_count or 0
    text = f"{v.title or ''} {(v.description or '')[:1500]}".lower()
    seg = c.segment
    items: dict[str, int | None] = {}
    why: dict[str, str] = {}

    # 1) 성과·재확산 가능성 ---------------------------------------------------------
    graph = video_graph(v)
    gtype = graph["graph_type"]
    ev = evidence_summary(orig) if orig else evidence_summary(v)
    perf, reason = suggest_performance_score(v.metrics, gtype, maxes.get("performance", 20), evidence=ev)
    if perf is None:
        frac = _clamp((math.log10(max(views, 1)) - 3) / 4)  # 1천→0, 1천만→1
        perf = _pts(frac * 0.8, maxes.get("performance", 20))
        reason = f"Outlier·VPH 지표 없음 — 조회수 {views:,}만으로 보수적 추정(배점의 80% 상한)"
        if gtype in ("resurgence", "late_surge"):
            perf = min(maxes.get("performance", 20), perf + 2)
            reason += " / 그래프 재상승·뒤늦은 급상승 +2"
    items["performance"] = perf
    why["performance"] = reason

    # 2) 후킹력·이야기성 -----------------------------------------------------------------
    f = 0.3
    parts = ["기본 0.3"]
    title = v.title or ""
    if re.search(r"[?？!！]", title):
        f += 0.1; parts.append("제목에 물음표·느낌표 +0.1")
    if re.search(r"\d", title):
        f += 0.05; parts.append("제목에 숫자 +0.05")
    if seg and seg.quote:
        f += 0.25; parts.append("원본 발언(quote) 기록됨 +0.25")
    if views >= 1_000_000:
        f += 0.2; parts.append(f"조회수 {views:,}(100만+) +0.2")
    elif views >= 100_000:
        f += 0.1; parts.append(f"조회수 {views:,}(10만+) +0.1")
    celeb = c.celebrity or (v.channel.celebrity if v.channel else None) or v.celebrity
    if celeb and celeb.name and celeb.name in title:
        f += 0.1; parts.append("제목에 연예인 이름 +0.1")
    if (v.shopping_score or 0) >= 6:
        f += 0.1; parts.append(f"쇼핑 단어 점수 {v.shopping_score} +0.1")
    items["hook"] = _pts(f, maxes.get("hook", 25))
    why["hook"] = " / ".join(parts)

    # 3) 독창적 해설·재구성 가치 -----------------------------------------------------------
    f = 0.35
    parts = ["기본 0.35"]
    if is_short and orig:
        f += 0.2; parts.append("원본 영상 연결됨(해설 소재 확보) +0.2")
    elif is_short:
        parts.append("원본 영상 미연결(0)")
    if c.content_type in NARRATIVE_TYPES:
        f += 0.2; parts.append(f"콘텐츠 유형 {c.content_type}(해설 여지 큼) +0.2")
    elif c.content_type:
        f += 0.05; parts.append(f"콘텐츠 유형 {c.content_type} +0.05")
    if seg and seg.context:
        f += 0.1; parts.append("발언 맥락 기록됨 +0.1")
    shop_links = (v.resolved_links or {}).get("products") if isinstance(v.resolved_links, dict) else None
    shop_links = shop_links or []
    if shop_links:
        f += 0.05; parts.append("설명란·링크허브에서 상품 링크 확보 +0.05")
    items["originality"] = _pts(f, maxes.get("originality", 20))
    why["originality"] = " / ".join(parts)

    # 4) 상품 구매 연결성 -----------------------------------------------------------------
    ps = product_status(v)
    p = c.product
    if p and p.identification_status == "exact":
        f, label = 1.0, f"정확한 상품 확인({p.name})"
    elif p and p.identification_status == "brand_only":
        f, label = 0.75, f"브랜드만 확인({p.name})"
    elif ps == "confirmed":
        f, label = 0.8, "쇼츠에 확인된 상품 연결됨(후보 상품 미지정)"
    elif p and p.identification_status == "similar_candidate" or ps == "candidate":
        f, label = 0.45, "유사 상품 후보만 연결(확정 전)"
    elif p and p.identification_status == "discontinued":
        f, label = 0.2, "단종 상품"
    else:
        f, label = 0.15, "상품 미연결"
    parts = [label]
    if p and p.offers:
        f += 0.1; parts.append(f"판매처 {len(p.offers)}곳 확인 +0.1")
    if shop_links and not (p and p.identification_status in ("exact", "brand_only")):
        f += 0.1; parts.append(f"구매 링크 {len(shop_links)}개 발견 +0.1")
    items["purchasability"] = _pts(f, maxes.get("purchasability", 15))
    why["purchasability"] = " / ".join(parts)

    # 5) 30~50대 여성 타깃 적합성 ---------------------------------------------------------
    f = 0.3
    parts = ["기본 0.3"]
    chans = []
    src = orig or v
    if src.channel:
        chans = [src.channel]
    elif celeb:
        chans = list(celeb.channels)
    if chans:
        rel = max(getattr(ch, f"relevance_{c.channel_category}", 0) or 0 for ch in chans)
        f += (rel / 3) * 0.5; parts.append(f"채널의 {c.channel_category} 관련성 {rel}/3 → +{(rel / 3) * 0.5:.2f}")
    terms = load_config_json("shopping_keywords.json").get("category_terms", {}).get(c.channel_category, [])
    hits = sum(text.count(t.lower()) for t in terms)
    if hits:
        f += 0.2; parts.append(f"카테고리 단어 {hits}회 +0.2")
    items["target_fit"] = _pts(f, maxes.get("target_fit", 10))
    why["target_fit"] = " / ".join(parts)

    # 6) 계절·날씨·업로드 시간 적합성 -----------------------------------------------------
    f = 0.5
    parts = ["기본 0.5(시간대 가설은 편성표에서 결정)"]
    season = SEASONS[today.month]
    s_hits = [t for t in SEASON_TERMS.get(season, []) if t.lower() in text]
    if s_hits:
        f += 0.3; parts.append(f"현재 계절({season}) 단어 {', '.join(s_hits[:4])} +0.3")
    else:
        other = [s for s, ts in SEASON_TERMS.items() if s != season and any(t.lower() in text for t in ts)]
        if other:
            f -= 0.15; parts.append(f"다른 계절({'/'.join(other)}) 단어 -0.15")
    if gtype in ("resurgence", "late_surge"):
        f += 0.2; parts.append("지금 다시 상승 중(재상승/뒤늦은 급상승) +0.2")
    elif gtype == "steady_rise":
        f += 0.1; parts.append("꾸준히 상승 +0.1")
    items["timing"] = _pts(f, maxes.get("timing", 10))
    why["timing"] = " / ".join(parts)

    for i in config["items"]:
        items.setdefault(i["key"], 0)
        why.setdefault(i["key"], "규칙 없음 → 0")
    labels = {i["key"]: i["label"] for i in config["items"]}
    short = {"performance": "성과", "hook": "후킹", "originality": "해설가치", "purchasability": "구매연결", "target_fit": "타깃", "timing": "시기"}
    why["_summary"] = "규칙 간이 채점(AI 아님) — " + ", ".join(
        f"{short.get(k, labels.get(k, k))} {items[k]}/{maxes[k]}" for k in ("performance", "purchasability", "hook", "originality", "target_fit", "timing") if k in items)
    why["_basis"] = "저장된 지표·상품 연결·원본 연결·제목 단어로 계산한 임시 점수입니다. AI 채점이나 사람 점수가 생기면 그 점수가 우선 표시됩니다."
    return items, why


def rule_fingerprint(c: SourcingCandidate) -> str:
    """입력이 바뀌었는지 판단하는 요약(재계산 여부)."""
    from ..serializers import product_status
    v = c.video
    return "|".join(str(x) for x in (
        v.view_count, len(v.metrics), len(v.snapshots), v.original_video_id, c.product_id,
        c.product.identification_status if c.product else None, product_status(v), c.content_type, c.segment_id,
        len(c.product.offers) if c.product else 0, date.today().isoformat()[:7],
    ))


def save_rule_score(db: Session, c: SourcingCandidate, ver=None) -> SourcingScore:
    ver = ver or get_active_version(db)
    items, why = rule_score(c, ver.config)
    total, grade = compute_total(items, ver.config)
    why["_fingerprint"] = rule_fingerprint(c)
    s = SourcingScore(candidate_id=c.id, scoring_version_id=ver.id, scorer="rule", item_scores=items, rationale=why,
                      total=total, grade_key=grade)
    db.add(s)
    return s


def rule_score_step(db: Session, force: bool = False) -> dict:
    """활성 후보 전체에 규칙 점수를 채운다. 입력(지표·상품·원본 연결)이 바뀐 후보만 다시 계산한다."""
    ver = get_active_version(db)
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected"]))
             .all())
    created = skipped = 0
    for c in cands:
        ls = latest_scores(c.scores)
        cur = ls.get("rule")
        if cur and not force and (cur.rationale or {}).get("_fingerprint") == rule_fingerprint(c):
            skipped += 1
            continue
        save_rule_score(db, c, ver)
        created += 1
    db.commit()
    return {"scored": created, "unchanged": skipped, "total": len(cands)}


def template_plan_step(db: Session) -> dict:
    """기획안이 하나도 없는 활성 후보에 템플릿 기획안(외부 AI 없이 저장된 사실만)을 만들어 둔다."""
    from ..models import UserSetting
    from .shorts_planner import generate_plan

    ts = db.get(UserSetting, "default_target_seconds")
    target = int(ts.value.get("value", 25)) if ts else 25
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected"]))
             .all())
    made, failed = 0, []
    for c in cands:
        if c.plans:
            continue
        try:
            plan, by = generate_plan(c, target, provider="template")
        except Exception as e:
            failed.append({"candidate_id": c.id, "error": str(e)[:200]})
            continue
        db.add(ShortsPlan(candidate_id=c.id, target_seconds=target, generated_by=by, plan=plan))
        made += 1
    db.commit()
    return {"generated": made, "failed": failed, "total": len(cands)}


def prepare_candidates(db: Session) -> dict:
    """후보 전체를 '버튼 누르기 전 상태'로 만든다: 규칙 점수 + 템플릿 기획안."""
    from .slot_recommender import slot_step
    return {"rule_scores": rule_score_step(db), "template_plans": template_plan_step(db), "upload_slots": slot_step(db)}
