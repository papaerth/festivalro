"""후보 자동 발굴. **쇼핑 재편집 쇼츠**를 소싱 신호로 순위 매겨 카테고리별 N개를 후보로 등록한다.

후보의 주체는 재편집 쇼츠다. 쇼츠 상세(후보 상세)에서 원본 영상·상품을 연결·확인한다.

규칙(투명):
- 대상: 시연용이 아닌 재편집·경쟁 쇼츠(reedit_shorts/competitor) 중 쇼핑 판정(사람 우선, 규칙 점수)이 참인 영상.
- 신호 점수: log10(조회수) + Outlier + 그래프 유형(재상승/뒤늦은 급상승/급등 후 평탄화/꾸준히 상승) + 최근성
  + 상품 확인됨(+2) + 원본 연결됨(+1).
- 카테고리: 연결 상품 분류 → 제목·설명 단어(category_terms) → 연예인 채널 관련성 최대값. 못 정하면 제외(사유 기록).
- 같은 영상·카테고리 후보가 이미 있으면 만들지 않는다. 만든 후보에는 notes 에 '[자동 발굴]' 근거를 적는다.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..config import load_config_json
from ..models import SourcingCandidate, VerificationRecord, Video, VERIFICATION_ITEMS, utcnow
from .daily_sourcing import CATEGORIES, video_graph
from .metrics import latest_metrics
from .shopping_filter import is_shopping

GRAPH_BONUS = {"resurgence": 3.0, "late_surge": 3.0, "spike_plateau": 1.5, "steady_rise": 2.0}


def infer_category(v: Video) -> tuple[str | None, str]:
    for m in v.mentions:
        if m.product.category in CATEGORIES:
            return m.product.category, f"연결 상품 분류({m.product.name})"
    terms = load_config_json("shopping_keywords.json").get("category_terms", {})
    text = f"{v.title or ''} {(v.description or '')[:1000]} {' '.join(v.tags or [])}".lower()
    counts = {c: sum(text.count(t.lower()) for t in terms.get(c, [])) for c in CATEGORIES}
    best = max(counts, key=counts.get)
    if counts[best] > 0 and list(counts.values()).count(counts[best]) == 1:
        return best, f"제목·설명 단어({best} {counts[best]}회)"
    chans = [v.channel] if v.channel else (v.celebrity.channels if v.celebrity else [])
    if chans:
        rel = {"beauty": max(c.relevance_beauty for c in chans), "living": max(c.relevance_living for c in chans),
               "food": max(c.relevance_food for c in chans)}
        b = max(rel, key=rel.get)
        if rel[b] > 0 and list(rel.values()).count(rel[b]) == 1:
            return b, f"연예인 채널 관련성({b} {rel[b]})"
    return None, "분류 추정 불가"


def signal_score(v: Video, product_confirmed: bool) -> tuple[float, list[str]]:
    reasons = []
    s = 0.0
    if v.view_count:
        s += math.log10(max(v.view_count, 1))
        reasons.append(f"조회수 {v.view_count:,}")
    lm = latest_metrics(v)
    if lm.get("outlier", {}).get("value"):
        s += min(lm["outlier"]["value"], 50) / 10
        reasons.append(f"Outlier {lm['outlier']['value']:g}")
    if lm.get("vph", {}).get("value"):
        s += min(math.log10(max(lm["vph"]["value"], 1)), 4)
        reasons.append(f"VPH {lm['vph']['value']:g}")
    g = video_graph(v)["graph_type"]
    if g in GRAPH_BONUS:
        s += GRAPH_BONUS[g]
        reasons.append(f"그래프 {g}")
    if product_confirmed:
        s += 2.0
        reasons.append("상품 확인됨")
    if v.original_video_id:
        s += 1.0
        reasons.append("원본 연결됨")
    return round(s, 2), reasons


def discover_candidates(db: Session, per_category: int = 9) -> dict:
    from ..serializers import product_status

    from .collection import sourcing_window
    after, before, mn, mx = sourcing_window(db)
    after_n, before_n = after.replace(tzinfo=None), before.replace(tzinfo=None)
    videos = (db.query(Video).filter(Video.is_demo.is_(False), Video.source_type.in_(["reedit_shorts", "competitor"])).all())
    existing = {(c.video_id, c.channel_category) for c in db.query(SourcingCandidate).all()}
    per_cat_existing = {c: 0 for c in CATEGORIES}
    for _, cat in existing:
        per_cat_existing[cat] = per_cat_existing.get(cat, 0) + 1
    ranked: dict[str, list] = {c: [] for c in CATEGORIES}
    skipped = {"not_shopping": 0, "no_category": 0, "already": 0, "out_of_window": 0}
    for v in videos:
        if v.published_at and not (after_n <= v.published_at <= before_n):
            skipped["out_of_window"] += 1
            continue
        if not is_shopping(v):
            skipped["not_shopping"] += 1
            continue
        cat, cat_reason = infer_category(v)
        if not cat:
            skipped["no_category"] += 1
            continue
        if (v.id, cat) in existing:
            skipped["already"] += 1
            continue
        sc, reasons = signal_score(v, product_status(v) == "confirmed")
        ranked[cat].append((sc, v, reasons + [cat_reason]))
    created = {c: 0 for c in CATEGORIES}
    created_ids = []
    for cat in CATEGORIES:
        ranked[cat].sort(key=lambda x: -x[0])
        for sc, v, reasons in ranked[cat][:per_category]:
            product = next((m.product for m in v.mentions if m.product.category == cat), None)
            c = SourcingCandidate(video_id=v.id, product_id=product.id if product else None, channel_category=cat,
                                  celebrity_id=(v.celebrity_id or (v.channel.celebrity_id if v.channel else None)), status="candidate",
                                  notes=f"[자동 발굴 {utcnow():%Y-%m-%d}] 신호 {sc} — " + " / ".join(reasons),
                                  research_todo="원본 영상 연결, 상품 확인·연결, 원본의 실제 발언·타임스탬프 기록, 광고·협찬 여부 확인")
            db.add(c)
            db.flush()
            for key, _ in VERIFICATION_ITEMS:
                db.add(VerificationRecord(candidate_id=c.id, item=key, status="pending"))
            created[cat] += 1
            created_ids.append(c.id)
    db.commit()
    return {"created": created, "created_ids": created_ids, "pool": {c: len(ranked[c]) for c in CATEGORIES},
            "skipped": skipped, "existing": per_cat_existing, "window_days": [mn, mx]}
