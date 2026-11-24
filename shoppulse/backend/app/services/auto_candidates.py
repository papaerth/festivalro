"""후보 자동 발굴. 쇼핑 관련 원본 영상을 소싱 신호로 순위 매겨 카테고리별 N개를 후보로 등록한다.

규칙(투명):
- 대상: 시연용이 아닌 제작용 원본(original_celebrity) 중 쇼핑 판정(사람 우선, 규칙 점수)이 참인 영상.
  + 상품 확인된 재편집 쇼츠가 연결된 원본은 쇼핑 판정과 무관하게 대상에 포함(바이럴 근거가 있으므로).
- 신호 점수: log10(조회수) + 재편집 근거(상품 확인 쇼츠 수, 최고 Outlier, 재상승/급등후평탄화) + 원본 그래프 유형 + 최근성.
- 카테고리: 연결 상품 분류 → 제목·설명 단어(category_terms) → 채널 관련성 최대값. 못 정하면 제외(사유 기록).
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
    if v.channel:
        rel = {"beauty": v.channel.relevance_beauty, "living": v.channel.relevance_living, "food": v.channel.relevance_food}
        b = max(rel, key=rel.get)
        if rel[b] > 0 and list(rel.values()).count(rel[b]) == 1:
            return b, f"채널 관련성({b} {rel[b]})"
    return None, "분류 추정 불가"


def signal_score(v: Video, evidence: dict) -> tuple[float, list[str]]:
    reasons = []
    s = 0.0
    if v.view_count:
        s += math.log10(max(v.view_count, 1))
        reasons.append(f"조회수 {v.view_count:,}")
    if evidence.get("count"):
        s += 2.0 + min(evidence["count"], 5) * 0.5
        reasons.append(f"상품 확인 재편집 쇼츠 {evidence['count']}개")
        if evidence.get("best_outlier"):
            s += min(evidence["best_outlier"], 50) / 10
            reasons.append(f"쇼츠 최고 Outlier {evidence['best_outlier']:g}")
        gt = evidence.get("graph_types", {})
        for k, b in GRAPH_BONUS.items():
            if gt.get(k):
                s += b
                reasons.append(f"쇼츠 {k} {gt[k]}개")
    g = video_graph(v)["graph_type"]
    if g in GRAPH_BONUS:
        s += GRAPH_BONUS[g] / 2
        reasons.append(f"원본 그래프 {g}")
    lm = latest_metrics(v)
    if lm.get("outlier", {}).get("value"):
        s += min(lm["outlier"]["value"], 50) / 10
        reasons.append(f"원본 Outlier {lm['outlier']['value']:g}")
    if v.published_at and (utcnow() - v.published_at) < timedelta(days=90):
        s += 1.0
        reasons.append("최근 90일 내 게시")
    return round(s, 2), reasons


def discover_candidates(db: Session, per_category: int = 9) -> dict:
    from ..serializers import evidence_summary

    videos = (db.query(Video).filter(Video.is_demo.is_(False), Video.source_type == "original_celebrity").all())
    existing = {(c.video_id, c.channel_category) for c in db.query(SourcingCandidate).all()}
    per_cat_existing = {c: 0 for c in CATEGORIES}
    for _, cat in existing:
        per_cat_existing[cat] = per_cat_existing.get(cat, 0) + 1
    ranked: dict[str, list] = {c: [] for c in CATEGORIES}
    skipped = {"not_shopping": 0, "no_category": 0, "already": 0}
    for v in videos:
        ev = evidence_summary(v)
        if not is_shopping(v) and not ev.get("count"):
            skipped["not_shopping"] += 1
            continue
        cat, cat_reason = infer_category(v)
        if not cat:
            skipped["no_category"] += 1
            continue
        if (v.id, cat) in existing:
            skipped["already"] += 1
            continue
        sc, reasons = signal_score(v, ev)
        ranked[cat].append((sc, v, reasons + [cat_reason]))
    created = {c: 0 for c in CATEGORIES}
    created_ids = []
    for cat in CATEGORIES:
        ranked[cat].sort(key=lambda x: -x[0])
        for sc, v, reasons in ranked[cat][:per_category]:
            product = next((m.product for m in v.mentions if m.product.category == cat), None)
            c = SourcingCandidate(video_id=v.id, product_id=product.id if product else None, channel_category=cat,
                                  celebrity_id=(v.channel.celebrity_id if v.channel else v.celebrity_id), status="candidate",
                                  notes=f"[자동 발굴 {utcnow():%Y-%m-%d}] 신호 {sc} — " + " / ".join(reasons),
                                  research_todo="상품 확인·연결, 실제 발언·타임스탬프 기록, 광고·협찬 여부 확인")
            db.add(c)
            db.flush()
            for key, _ in VERIFICATION_ITEMS:
                db.add(VerificationRecord(candidate_id=c.id, item=key, status="pending"))
            created[cat] += 1
            created_ids.append(c.id)
    db.commit()
    return {"created": created, "created_ids": created_ids, "pool": {c: len(ranked[c]) for c in CATEGORIES},
            "skipped": skipped, "existing": per_cat_existing}
