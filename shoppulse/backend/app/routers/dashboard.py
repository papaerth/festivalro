from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import serializers
from ..config import get_settings
from ..database import get_db
from ..models import (
    CollectionJob, DailyReport, DataSource, SourcingCandidate, Video, VideoSegment, YoutubeChannel, Celebrity,
    VerificationRecord, CRITICAL_VERIFICATION_ITEMS,
)
from ..services import scheduler
from ..services.claude_client import transport_status
from ..services.daily_sourcing import video_graph
from ..services.scoring import get_active_version
from ..services.season import season_context

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    cfg = get_active_version(db).config
    non_demo = Video.is_demo.is_(False)
    from ..config import load_config_json
    from ..models import ProductMention, Product, ViewSnapshot
    from sqlalchemy.orm import selectinload
    rules = load_config_json("graph_rules.json")
    min_points = int(rules.get("min_points", 4)); min_span_h = float(rules.get("min_span_hours", 72))
    derived_types = ("reedit_shorts", "competitor")
    videos_total = db.query(func.count(Video.id)).filter(non_demo).scalar() or 0
    derived_total = db.query(func.count(Video.id)).filter(non_demo, Video.source_type.in_(derived_types)).scalar() or 0
    # 관측이 충분한 영상만 그래프 분석(나머지는 '판별 불가'로 바로 집계)
    agg = (db.query(ViewSnapshot.video_id, func.count(ViewSnapshot.id), func.min(ViewSnapshot.observed_at), func.max(ViewSnapshot.observed_at))
           .join(Video, Video.id == ViewSnapshot.video_id).filter(non_demo).group_by(ViewSnapshot.video_id).all())
    eligible = [vid for vid, n, mn, mx in agg if n >= min_points and mn and mx and (mx - mn).total_seconds() >= min_span_h * 3600]
    confirmed_ids = {r[0] for r in (db.query(ProductMention.video_id).join(Product, Product.id == ProductMention.product_id)
                                    .filter(Product.identification_status.in_(("exact", "brand_only"))).distinct().all())}
    derived_ids = {r[0] for r in db.query(Video.id).filter(non_demo, Video.source_type.in_(derived_types)).all()}
    derived_confirmed = len(derived_ids & confirmed_ids)
    graph_counts: dict[str, int] = {}
    graph_counts_derived: dict[str, int] = {}
    graph_counts_confirmed: dict[str, int] = {}
    graph_counts_original: dict[str, int] = {}
    analyzed_derived = analyzed_original = 0
    if eligible:
        for v in db.query(Video).options(selectinload(Video.snapshots)).filter(Video.id.in_(eligible)).all():
            g = video_graph(v)["graph_type"]
            graph_counts[g] = graph_counts.get(g, 0) + 1
            if v.id in derived_ids:
                analyzed_derived += 1
                graph_counts_derived[g] = graph_counts_derived.get(g, 0) + 1
                if v.id in confirmed_ids:
                    graph_counts_confirmed[g] = graph_counts_confirmed.get(g, 0) + 1
            else:
                analyzed_original += 1
                graph_counts_original[g] = graph_counts_original.get(g, 0) + 1
    graph_counts["insufficient"] = graph_counts.get("insufficient", 0) + (videos_total - len(eligible))
    graph_counts_derived["insufficient"] = graph_counts_derived.get("insufficient", 0) + (derived_total - analyzed_derived)
    graph_counts_original["insufficient"] = graph_counts_original.get("insufficient", 0) + ((videos_total - derived_total) - analyzed_original)
    cands = db.query(SourcingCandidate).filter(SourcingCandidate.is_demo.is_(False)).all()
    pending_verification = 0
    for c in cands:
        st = {r.item: r.status for r in c.verifications}
        if any(st.get(i) != "passed" for i in CRITICAL_VERIFICATION_ITEMS) and c.status not in ("rejected", "published", "analyzing"):
            pending_verification += 1
    latest_report = db.query(DailyReport).order_by(DailyReport.report_date.desc(), DailyReport.generated_at.desc()).first()
    last_job = db.query(CollectionJob).filter(CollectionJob.status.in_(["success", "partial"])).order_by(CollectionJob.finished_at.desc()).first()
    last_snapshot = db.query(func.max(Video.stats_updated_at)).filter(non_demo).scalar()
    return {
        "channels_total": db.query(YoutubeChannel).filter(YoutubeChannel.is_demo.is_(False)).count(),
        "channels_verified": db.query(YoutubeChannel).filter(YoutubeChannel.verification_status == "verified").count(),
        "celebrities_total": db.query(Celebrity).filter(Celebrity.is_demo.is_(False)).count(),
        "videos_total": videos_total,
        "videos_original": videos_total - derived_total,
        "videos_derived": derived_total,
        "graph_derived": graph_counts_derived,
        "graph_derived_confirmed": graph_counts_confirmed,
        "videos_derived_confirmed": derived_confirmed,
        "graph_original": graph_counts_original,
        "videos_new_today": db.query(Video).filter(non_demo, Video.created_at >= today_start).count(),
        "candidates_today": db.query(SourcingCandidate).filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.created_at >= today_start).count(),
        "candidates_total": len(cands),
        "final_today": (latest_report.summary.get("total_final") if latest_report and latest_report.report_date == today else 0),
        "ai": transport_status(),
        "spike_plateau": graph_counts.get("spike_plateau", 0),
        "resurgence": graph_counts.get("resurgence", 0),
        "late_surge": graph_counts.get("late_surge", 0),
        "steady_rise": graph_counts.get("steady_rise", 0),
        "insufficient": graph_counts.get("insufficient", 0),
        "pending_verification": pending_verification,
        "produced_total": sum(1 for c in cands if c.produced_at),
        "last_collection_at": (last_job.finished_at.isoformat() if last_job and last_job.finished_at else None),
        "last_snapshot_at": last_snapshot.isoformat() if last_snapshot else None,
        "latest_report": serializers.report(latest_report) if latest_report else None,
        "scheduler": scheduler.status(),
        "season": season_context(today, db),
        "scoring_name": cfg.get("name"),
    }


@router.get("/data-sources")
def data_sources(db: Session = Depends(get_db)):
    return [{"key": d.key, "name": d.name, "kind": d.kind, "status": d.status, "note": d.note, "checked_at": d.checked_at.isoformat()}
            for d in db.query(DataSource).order_by(DataSource.id).all()]
