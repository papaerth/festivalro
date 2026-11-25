"""업로드 시간대(11시/17시/21시) 자동 추천 — 운영 가설 기반 규칙(AI 아님).

근거(모두 저장된 사실): 카테고리별 슬롯 단어 일치(config/upload_slots.json slot_keywords),
참고 쇼츠·원본이 실제로 게시된 시각(KST), 콘텐츠 유형. 시간대별 실제 성과 데이터는 아직 없으므로
'가설' 임을 명시하고, 사용자가 직접 고른 값('사용자 지정')은 덮어쓰지 않는다.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from ..config import load_config_json
from ..models import SourcingCandidate

AUTO_PREFIX = "[자동]"
TYPE_HINT = {  # 콘텐츠 유형 → 슬롯 가중
    "gift": "night", "premium_taste": "night", "regret": "night", "curiosity_debate": "night",
    "life_tip": "morning", "natural_use": "morning", "repeat_buy": "morning",
    "value_find": "afternoon", "comparison": "afternoon", "sponsored": "afternoon", "direct_recommend": "afternoon",
}


def recommend_slot(c: SourcingCandidate) -> tuple[str, str]:
    cfg = load_config_json("upload_slots.json")
    slots = [s["key"] for s in cfg.get("slots", [])] or ["morning", "afternoon", "night"]
    labels = {s["key"]: s["label"] for s in cfg.get("slots", [])}
    hours = cfg.get("slot_hours", {"morning": 11, "afternoon": 17, "night": 21})
    kw = cfg.get("slot_keywords", {}).get(c.channel_category, {})
    hyp = cfg.get("hypothesis", {}).get(c.channel_category, {})
    v = c.video
    orig = v.original
    p = c.product
    text = " ".join(x for x in [v.title, (v.description or "")[:800], p.name if p else "", p.subcategory if p else "",
                                orig.title if orig else ""] if x).lower()
    score = {k: 0.0 for k in slots}
    why: dict[str, list[str]] = {k: [] for k in slots}
    for k in slots:
        hits = [t for t in kw.get(k, []) if t.lower() in text]
        if hits:
            score[k] += 2.0 * min(len(hits), 3)
            why[k].append(f"단어 {', '.join(hits[:3])}")
    # 참고 쇼츠가 실제 게시된 시각(KST) — 가장 가까운 슬롯
    for label, vid in (("참고 쇼츠", v), ("원본", orig)):
        if vid is not None and vid.published_at:
            h = (vid.published_at + timedelta(hours=9)).hour
            nearest = min(slots, key=lambda k: min(abs(h - hours.get(k, 12)), 24 - abs(h - hours.get(k, 12))))
            w = 1.5 if label == "참고 쇼츠" else 0.5
            score[nearest] += w
            why[nearest].append(f"{label} 게시 {h:02d}시(KST)")
    th = TYPE_HINT.get(c.content_type or "")
    if th in score:
        score[th] += 1.0
        why[th].append(f"유형 {c.content_type}")
    best = max(slots, key=lambda k: score[k])
    if score[best] == 0:
        best = "afternoon" if "afternoon" in slots else slots[0]
        reason = f"{AUTO_PREFIX} 단서 없음 → 기본 {labels.get(best, best)} (가설: {hyp.get(best, '')})"
    else:
        reason = f"{AUTO_PREFIX} {labels.get(best, best)} — " + " / ".join(why[best]) + f" (가설: {hyp.get(best, '')})"
    return best, reason


def apply_slot(c: SourcingCandidate) -> bool:
    """사용자 지정이 아니면 자동 추천을 (다시) 적용. 바뀌었으면 True."""
    if c.recommended_slot and c.slot_reason and not c.slot_reason.startswith(AUTO_PREFIX):
        return False  # 사용자가 직접 고른 값
    slot, reason = recommend_slot(c)
    changed = (c.recommended_slot != slot) or (c.slot_reason != reason)
    c.recommended_slot, c.slot_reason = slot, reason
    return changed


def slot_step(db: Session) -> dict:
    cands = db.query(SourcingCandidate).filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status != "rejected").all()
    changed = sum(1 for c in cands if apply_slot(c))
    db.commit()
    return {"updated": changed, "total": len(cands)}
