from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..config import load_config_json
from ..database import get_db
from ..models import SourcingCandidate, UploadSchedule, CANDIDATE_STATUSES
from ..services.audit import log
from ..services.scoring import get_active_version

router = APIRouter(prefix="/api/schedule", tags=["schedule"])
CATS = ["beauty", "living", "food"]


@router.get("")
def get_schedule(schedule_date: date | None = None, db: Session = Depends(get_db)):
    d = schedule_date or date.today()
    cfg = get_active_version(db).config
    slots_cfg = load_config_json("upload_slots.json")
    rows = db.query(UploadSchedule).filter(UploadSchedule.schedule_date == d).all()
    by = {(r.channel_category, r.slot): r for r in rows}
    grid = []
    for cat in CATS:
        for slot in [s["key"] for s in slots_cfg.get("slots", [])]:
            r = by.get((cat, slot))
            grid.append(serializers.schedule_slot(r, cfg) if r else {
                "id": None, "schedule_date": d.isoformat(), "channel_category": cat, "slot": slot,
                "candidate_id": None, "status": "empty", "note": None, "candidate": None,
            })
    return {"date": d.isoformat(), "slots": slots_cfg.get("slots", []), "hypothesis": slots_cfg.get("hypothesis", {}),
            "hypothesis_note": slots_cfg.get("note"), "grid": grid, "statuses": CANDIDATE_STATUSES}


@router.put("")
def assign(body: schemas.ScheduleAssign, db: Session = Depends(get_db)):
    r = db.query(UploadSchedule).filter_by(schedule_date=body.schedule_date, channel_category=body.channel_category,
                                           slot=body.slot).first()
    if body.candidate_id is not None:
        c = db.get(SourcingCandidate, body.candidate_id)
        if not c:
            raise HTTPException(404, "후보를 찾을 수 없습니다")
        if c.channel_category != body.channel_category:
            raise HTTPException(400, f"후보 카테고리({c.channel_category})와 편성 채널({body.channel_category})이 다릅니다")
    if not r:
        r = UploadSchedule(schedule_date=body.schedule_date, channel_category=body.channel_category, slot=body.slot)
        db.add(r)
    r.candidate_id = body.candidate_id
    if body.status:
        if body.status not in CANDIDATE_STATUSES:
            raise HTTPException(400, "알 수 없는 상태")
        r.status = body.status
    elif body.candidate_id is None:
        r.status = "empty"
    elif r.status in ("empty", None):
        r.status = "sourced"
    if body.note is not None:
        r.note = body.note
    if body.candidate_id is not None and body.status:
        c = db.get(SourcingCandidate, body.candidate_id)
        c.status = body.status
    log(db, "schedule", r.id, "assign", body.model_dump(mode="json"))
    db.commit()
    return serializers.schedule_slot(r, get_active_version(db).config)
