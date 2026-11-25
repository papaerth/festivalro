"""ORM → dict. 미확인 값은 None 으로 그대로 노출한다."""
from __future__ import annotations

from .models import (
    Celebrity, CollectionJob, DailyReport, Product, ProductOffer, ShortsPlan, SourcingCandidate, SourcingScore,
    UploadSchedule, VerificationRecord, Video, VideoSegment, YoutubeChannel, VERIFICATION_ITEMS,
)
from .services.daily_sourcing import production_ready, video_graph
from .services.metrics import latest_metrics
from .services.scoring import band_label_for, grade_label, latest_scores
from .services.shorts_planner import CONTENT_TYPES


def iso(dt):
    return dt.isoformat() if dt else None


def celebrity(c: Celebrity) -> dict:
    return {"id": c.id, "name": c.name, "name_en": c.name_en, "primary_field": c.primary_field,
            "age_group": c.age_group, "audience_note": c.audience_note, "notes": c.notes, "is_demo": c.is_demo,
            "channel_count": len(c.channels), "created_at": iso(c.created_at), "updated_at": iso(c.updated_at)}


def channel(ch: YoutubeChannel) -> dict:
    return {
        "id": ch.id, "celebrity_id": ch.celebrity_id, "celebrity_name": ch.celebrity.name if ch.celebrity else None,
        "channel_name": ch.channel_name, "channel_id": ch.channel_id, "handle": ch.handle, "channel_url": ch.channel_url,
        "channel_type": ch.channel_type, "verification_status": ch.verification_status, "primary_field": ch.primary_field,
        "audience_note": ch.audience_note, "relevance_beauty": ch.relevance_beauty, "relevance_living": ch.relevance_living,
        "relevance_food": ch.relevance_food, "subscriber_count": ch.subscriber_count,
        "last_collected_at": iso(ch.last_collected_at), "collected_video_count": ch.collected_video_count,
        "is_active": ch.is_active, "source": ch.source, "notes": ch.notes, "is_demo": ch.is_demo,
    }


def segment(s: VideoSegment) -> dict:
    url = s.video.url if s.video else None
    return {
        "id": s.id, "video_id": s.video_id, "start_seconds": s.start_seconds, "end_seconds": s.end_seconds,
        "quote": s.quote, "context": s.context, "content_type": s.content_type,
        "content_type_label": CONTENT_TYPES.get(s.content_type or "", s.content_type),
        "sponsorship_status": s.sponsorship_status, "is_recommendation": s.is_recommendation,
        "verification_status": s.verification_status, "source": s.source, "notes": s.notes,
        "timestamp_url": f"{url}&t={s.start_seconds}s" if url and s.start_seconds is not None else None,
    }


def offer(o: ProductOffer) -> dict:
    return {"id": o.id, "product_id": o.product_id, "seller": o.seller, "url": o.url, "price": o.price,
            "currency": o.currency, "stock_status": o.stock_status, "affiliate_available": o.affiliate_available,
            "affiliate_program": o.affiliate_program, "checked_at": iso(o.checked_at), "source": o.source, "notes": o.notes}


def product(p: Product, with_offers: bool = True) -> dict:
    d = {"id": p.id, "name": p.name, "brand": p.brand, "model_name": p.model_name, "category": p.category,
         "subcategory": p.subcategory, "image_url": p.image_url, "features": p.features,
         "identification_status": p.identification_status, "notes": p.notes, "is_demo": p.is_demo,
         "mention_count": len(p.mentions), "updated_at": iso(p.updated_at)}
    if with_offers:
        d["offers"] = [offer(o) for o in p.offers]
    return d


import re as _re

_URL_RE = _re.compile(r"https?://[^\s<>\"')\]]+")
CONFIRMED_IDENT = ("exact", "brand_only")


def product_status(v: Video) -> str:
    """confirmed(정확/브랜드 확인 상품 연결) / candidate(미확정 상품만 연결) / none(상품 미연결)."""
    if not v.mentions:
        return "none"
    if any(m.product.identification_status in CONFIRMED_IDENT for m in v.mentions):
        return "confirmed"
    return "candidate"


def description_links(v: Video) -> list[dict]:
    out, seen = [], set()
    for url in _URL_RE.findall(v.description or ""):
        url = url.rstrip(".,")
        if url in seen:
            continue
        seen.add(url)
        host = _re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
        shop = any(k in url.lower() for k in ("coupang", "smartstore", "brand.naver", "shopping.naver", "oliveyoung", "kurly",
                                                   "musinsa", "29cm", "ohou", "gmarket", "11st", "ssg.com", "lotteon", "amazon",
                                                   "aliexpress", "temu", "zigzag", "a-bly", "link.", "bit.ly", "naver.me"))
        out.append({"url": url, "host": host, "is_shopping_link": shop})
    return out[:30]


def _is_shopping(v: Video):
    from .services.shopping_filter import is_shopping
    return is_shopping(v)


def _sparkline(v: Video, max_points: int = 60) -> list[dict]:
    snaps = v.snapshots
    if len(snaps) > max_points:
        step = len(snaps) / max_points
        snaps = [snaps[int(i * step)] for i in range(max_points)] + [snaps[-1]]
    return [{"observed_at": s.observed_at.isoformat(), "view_count": s.view_count, "source": s.source} for s in snaps]


def video_summary(v: Video, with_graph: bool = True) -> dict:
    lm = latest_metrics(v)
    out = lm.get("outlier", {}).get("value")
    vph = lm.get("vph", {}).get("value")
    d = {
        "id": v.id, "youtube_video_id": v.youtube_video_id, "title": v.title, "url": v.url,
        "thumbnail_url": v.thumbnail_url or f"https://i.ytimg.com/vi/{v.youtube_video_id}/hqdefault.jpg",
        "channel_id": v.channel_id, "channel_name": v.channel.channel_name if v.channel else None,
        "channel_verification": v.channel.verification_status if v.channel else None,
        "celebrity_name": (v.channel.celebrity.name if v.channel and v.channel.celebrity else (v.celebrity.name if v.celebrity else None)),
        "published_at": iso(v.published_at), "duration_seconds": v.duration_seconds, "video_format": v.video_format,
        "view_count": v.view_count, "like_count": v.like_count, "comment_count": v.comment_count,
        "stats_updated_at": iso(v.stats_updated_at), "source_type": v.source_type, "access_status": v.access_status,
        "data_source": v.data_source, "is_demo": v.is_demo,
        "metrics": lm,
        "outlier": out, "outlier_band": band_label_for("outlier", out),
        "vph": vph, "vph_basis": lm.get("vph", {}).get("basis"), "vph_band": band_label_for("vph", vph),
        "snapshot_count": len(v.snapshots),
        "sparkline": _sparkline(v),
        "original_video_id": v.original_video_id,
        "celebrity_id": v.celebrity_id,
        "yt_channel_title": v.yt_channel_title,
        "yt_channel_id": v.yt_channel_id,
        "discovery_query": v.discovery_query,
        "derived_count": len(v.derived),
        "is_derived": v.source_type in ("reedit_shorts", "competitor"),
        "shopping_score": v.shopping_score, "shopping_hits": v.shopping_hits or [],
        "is_shopping_manual": v.is_shopping, "is_shopping": _is_shopping(v),
        "product_status": product_status(v),
        "product_names": [f"{m.product.brand + ' ' if m.product.brand else ''}{m.product.name}" for m in v.mentions][:5],
        "shopping_link_count": sum(1 for l in description_links(v) if l["is_shopping_link"]),
        "segment_count": len(v.segments), "candidate_count": len(v.candidates),
    }
    if with_graph:
        d["graph"] = video_graph(v)
    return d


def video_detail(v: Video) -> dict:
    d = video_summary(v)
    d.update({
        "description": v.description, "tags": v.tags, "notes": v.notes, "collected_at": iso(v.collected_at),
        "snapshots": [{"observed_at": iso(s.observed_at), "view_count": s.view_count, "like_count": s.like_count,
                       "comment_count": s.comment_count, "source": s.source} for s in v.snapshots],
        "metric_history": [{"id": m.id, "metric_type": m.metric_type, "value": m.value, "basis": m.basis, "source": m.source,
                            "measured_at": iso(m.measured_at), "note": m.note} for m in sorted(v.metrics, key=lambda m: m.measured_at)],
        "segments": [segment(s) for s in v.segments],
        "products": [product(m.product, with_offers=False) | {"segment_id": m.segment_id, "mention_id": m.id} for m in v.mentions],
        "candidates": [candidate_summary(c) for c in v.candidates],
        "derived_shorts": [video_summary(x) for x in sorted(v.derived, key=lambda x: -(x.view_count or 0))],
        "original": video_summary(v.original, with_graph=False) if v.original else None,
        "original_products": ([product(m.product, with_offers=False) for m in v.original.mentions] if v.original else []),
        "evidence": evidence_summary(v),
        "description_links": description_links(v),
        "ai_product_suggestions": v.ai_product_suggestions,
    })
    return d


def evidence_summary(v: Video) -> dict:
    """원본 영상에 연결된 재편집 쇼츠 중 **상품이 확인·연결된 것만** 성과를 집계한다(바이럴 검증 자료).

    상품 미확인 쇼츠는 unconfirmed_count 로만 보고하고 수치에 넣지 않는다.
    """
    all_shorts = list(v.derived)
    shorts = [s for s in all_shorts if product_status(s) == "confirmed"]
    unconfirmed = len(all_shorts) - len(shorts)
    if not all_shorts:
        return {"count": 0, "unconfirmed_count": 0, "note": "연결된 재편집 쇼츠 없음 — 바이럴 검증 자료 없음"}
    if not shorts:
        return {"count": 0, "unconfirmed_count": unconfirmed,
                "note": f"재편집 쇼츠 {unconfirmed}개가 있지만 상품이 확인·연결된 것이 없어 집계하지 않음 — 각 쇼츠에서 상품을 연결하세요"}
    graphs = {}
    best_outlier = best_vph = None
    total_views = 0
    max_views = 0
    for s in shorts:
        g = video_graph(s)["graph_type"]
        graphs[g] = graphs.get(g, 0) + 1
        lm = latest_metrics(s)
        o, p = lm.get("outlier", {}).get("value"), lm.get("vph", {}).get("value")
        if o is not None and (best_outlier is None or o > best_outlier):
            best_outlier = o
        if p is not None and (best_vph is None or p > best_vph):
            best_vph = p
        total_views += s.view_count or 0
        max_views = max(max_views, s.view_count or 0)
    return {"count": len(shorts), "unconfirmed_count": unconfirmed, "total_views": total_views, "max_views": max_views,
            "graph_types": graphs, "best_outlier": best_outlier, "best_vph": best_vph,
            "note": "상품이 확인·연결된 재편집 쇼츠만 집계" + (f" (미확인 {unconfirmed}개 제외)" if unconfirmed else ""),
            "resurgence": graphs.get("resurgence", 0) + graphs.get("late_surge", 0),
            "spike_plateau": graphs.get("spike_plateau", 0), "steady_rise": graphs.get("steady_rise", 0)}


def score(s: SourcingScore, config: dict | None) -> dict:
    return {"id": s.id, "scorer": s.scorer, "item_scores": s.item_scores, "rationale": s.rationale, "total": s.total,
            "grade_key": s.grade_key, "grade_label": grade_label(s.grade_key, config) if config else None,
            "created_at": iso(s.created_at)}


def verification(c: SourcingCandidate) -> list[dict]:
    by = {v.item: v for v in c.verifications}
    out = []
    for key, label in VERIFICATION_ITEMS:
        v = by.get(key)
        out.append({"item": key, "label": label, "status": v.status if v else "pending", "note": v.note if v else None,
                    "checked_by": v.checked_by if v else None, "checked_at": iso(v.checked_at) if v else None})
    return out


def _reason_summary(c: SourcingCandidate, ls: dict) -> str | None:
    """선정 이유 한 줄: AI 채점 요약 → 사람 점수 근거 → 자동 발굴 신호 순."""
    final = ls.get("final")
    if final and final.rationale:
        if final.rationale.get("_summary"):
            return final.rationale["_summary"]
        parts = [v for k, v in final.rationale.items() if not k.startswith("_") and v]
        if parts:
            return " / ".join(parts)[:300]
    if c.notes and c.notes.startswith("[자동 발굴"):
        return c.notes.split("—", 1)[-1].strip()[:300]
    return None


def candidate_summary(c: SourcingCandidate, config: dict | None = None) -> dict:
    ls = latest_scores(c.scores)
    final = ls["final"]
    ready, unresolved = production_ready(c)
    return {
        "id": c.id, "video_id": c.video_id, "product_id": c.product_id, "segment_id": c.segment_id,
        "celebrity_id": c.celebrity_id,
        "celebrity_name": (c.celebrity.name if c.celebrity else (c.video.channel.celebrity.name if c.video.channel and c.video.channel.celebrity else None)),
        "channel_category": c.channel_category, "content_type": c.content_type,
        "content_type_label": CONTENT_TYPES.get(c.content_type or "", c.content_type),
        "status": c.status, "recommended_slot": c.recommended_slot, "hook_idea": c.hook_idea,
        "research_todo": c.research_todo, "notes": c.notes, "is_demo": c.is_demo,
        "last_recommended_date": iso(c.last_recommended_date), "recommendation_count": c.recommendation_count,
        "duplicate_reason": c.duplicate_reason,
        "score": final.total if final else None, "grade_key": final.grade_key if final else None,
        "grade_label": grade_label(final.grade_key, config) if (final and config) else None,
        "score_scorer": final.scorer if final else None,
        "ai_score": ls["ai"].total if ls["ai"] else None, "human_score": ls["human"].total if ls["human"] else None,
        "production_ready": ready, "unresolved_critical": unresolved,
        "product_name": c.product.name if c.product else None,
        "product_identification": c.product.identification_status if c.product else None,
        "offer_status": (c.product.offers[0].stock_status if c.product and c.product.offers else None),
        "segment": segment(c.segment) if c.segment else None,
        "is_short_candidate": c.video.source_type in ("reedit_shorts", "competitor"),
        "plan_count": len(c.plans), "latest_plan_by": (max(c.plans, key=lambda p: p.created_at).generated_by if c.plans else None),
        "produced_at": iso(c.produced_at), "produced_url": c.produced_url,
        "reason_summary": _reason_summary(c, ls),
        "original_video": (video_summary(c.video.original, with_graph=False) if c.video.original else None),
        "video_product_status": product_status(c.video),
        "evidence": evidence_summary(c.video.original) if c.video.original else evidence_summary(c.video),
        "updated_at": iso(c.updated_at), "created_at": iso(c.created_at),
    }


def candidate_detail(c: SourcingCandidate, config: dict) -> dict:
    d = candidate_summary(c, config)
    ls = latest_scores(c.scores)
    d.update({
        "video": video_detail(c.video),
        "original_detail": video_detail(c.video.original) if c.video.original else None,
        "product": product(c.product) if c.product else None,
        "scores": {"ai": score(ls["ai"], config) if ls["ai"] else None,
                   "human": score(ls["human"], config) if ls["human"] else None,
                   "history": [score(s, config) for s in sorted(c.scores, key=lambda s: s.created_at)]},
        "verification": verification(c),
        "plans": [plan(p) for p in sorted(c.plans, key=lambda p: p.created_at, reverse=True)],
    })
    return d


def plan(p: ShortsPlan) -> dict:
    return {"id": p.id, "candidate_id": p.candidate_id, "target_seconds": p.target_seconds,
            "generated_by": p.generated_by, "plan": p.plan, "created_at": iso(p.created_at)}


def schedule_slot(s: UploadSchedule, config: dict | None = None) -> dict:
    return {"id": s.id, "schedule_date": iso(s.schedule_date), "channel_category": s.channel_category, "slot": s.slot,
            "candidate_id": s.candidate_id, "status": s.status, "note": s.note,
            "candidate": (candidate_summary(s.candidate, config) | {"video": video_summary(s.candidate.video, with_graph=False)}) if s.candidate else None}


def job(j: CollectionJob) -> dict:
    return {"id": j.id, "job_type": j.job_type, "status": j.status, "triggered_by": j.triggered_by, "params": j.params,
            "result": j.result, "error": j.error, "items_processed": j.items_processed, "quota_used": j.quota_used,
            "started_at": iso(j.started_at), "finished_at": iso(j.finished_at)}


def report(r: DailyReport) -> dict:
    return {"id": r.id, "report_date": iso(r.report_date), "generated_at": iso(r.generated_at), "trigger": r.trigger,
            "summary": r.summary, "categories": r.candidates, "note": r.note}
