from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import serializers
from ..database import get_db
from ..models import CollectionJob
from ..services.collection import finish_job, start_job
from ..services.metrics import import_metrics_csv, import_vidiq_json

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/vidiq-json")
async def vidiq_json(file: UploadFile = File(...), measured_at: datetime | None = None, db: Session = Depends(get_db)):
    """vidIQ MCP 응답(vidiq_get_videos_by_ids / vidiq_video_stats) JSON 파일 가져오기."""
    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(400, f"JSON 파싱 실패: {e}")
    job = start_job(db, "import_vidiq_json", {"filename": file.filename})
    try:
        result = import_vidiq_json(db, payload, measured_at.replace(tzinfo=None) if measured_at else None)
        if result.get("transcripts_added"):
            from ..services.segment_finder import segment_step
            db.commit()
            result["segments"] = segment_step(db)
        finish_job(job, "success" if not result["skipped"] else "partial", result,
                   items=result["videos_created"] + result["videos_updated"])
        db.commit()
    except Exception as e:
        db.rollback()
        job = start_job(db, "import_vidiq_json", {"filename": file.filename})
        finish_job(job, "failed", error=str(e))
        db.commit()
        raise HTTPException(400, f"가져오기 실패: {e}")
    return serializers.job(job)


@router.post("/metrics-csv")
async def metrics_csv(file: UploadFile = File(...), source: str = "vidiq_csv", db: Session = Depends(get_db)):
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    job = start_job(db, "import_metrics_csv", {"filename": file.filename, "source": source})
    try:
        result = import_metrics_csv(db, text, source=source)
        finish_job(job, "success" if not result["skipped"] else "partial", result, items=result["rows"])
        db.commit()
    except Exception as e:
        db.rollback()
        job = start_job(db, "import_metrics_csv", {"filename": file.filename})
        finish_job(job, "failed", error=str(e))
        db.commit()
        raise HTTPException(400, f"가져오기 실패: {e}")
    return serializers.job(job)


@router.get("/template.csv")
def csv_template():
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        "video_id,title,outlier,vph,vph_basis,views,measured_at\n"
        "dQw4w9WgXcQ,예시 제목(실제 값으로 교체),,13933.75,unspecified,1840384614,2026-11-24T00:00:00Z\n",
        media_type="text/csv", headers={"Content-Disposition": "attachment; filename=shoppulse-metrics-template.csv"},
    )


@router.get("/jobs")
def jobs(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.query(CollectionJob).order_by(CollectionJob.started_at.desc()).limit(limit).all()
    return [serializers.job(j) for j in rows]
