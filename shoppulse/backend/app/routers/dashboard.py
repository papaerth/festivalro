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
    videos = db.query(Video).filter(non_demo).all()
    graph_counts: dict[str, int] = {}
    graph_counts_derived: dict[str, int] = {}
    graph_counts_original: dict[str, int] = {}
    for v in videos:
        g = video_graph(v)["graph_type"]
        graph_counts[g] = graph_counts.get(g, 0) + 1
        bucket = graph_counts_derived if v.source_type in ("reedit_shorts", "competitor") else graph_counts_original
        bucket[g] = bucket.get(g, 0) + 1
    derived_total = sum(graph_counts_derived.values())
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
        "videos_total": len(videos),
        "videos_original": len(videos) - derived_total,
        "videos_derived": derived_total,
        "graph_derived": graph_counts_derived,
        "graph_original": graph_counts_original,
        "videos_new_today": db.query(Video).filter(non_demo, Video.created_at >= today_start).count(),
        "candidates_today": db.query(SourcingCandidate).filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.created_at >= today_start).count(),
        "candidates_total": len(cands),
        "final_today": (latest_report.summary.get("total_final") if latest_report and latest_report.report_date == today else 0),
        "spike_plateau": graph_counts.get("spike_plateau", 0),
        "resurgence": graph_counts.get("resurgence", 0),
        "late_surge": graph_counts.get("late_surge", 0),
        "steady_rise": graph_counts.get("steady_rise", 0),
        "insufficient": graph_counts.get("insufficient", 0),
        "pending_verification": pending_verification,
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
