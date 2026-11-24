from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..database import get_db
from ..models import DailyReport, UserSetting
from ..services import scheduler
from ..services.daily_sourcing import run_daily_sourcing

router = APIRouter(prefix="/api/sourcing", tags=["sourcing"])


@router.post("/run")
def run(body: schemas.RunSourcingIn, db: Session = Depends(get_db)):
    """background=True(기본): 조회수 갱신→평가를 백그라운드로 실행하고 진행 상태를 돌려준다(/api/channels/bulk/status 로 확인).
    background=False: 동기 실행 후 보고서를 바로 돌려준다."""
    if body.background:
        from ..services import bulk
        from ..models import UserSetting
        s = db.get(UserSetting, "daily_refresh_limit")
        limit = int(s.value.get("value", 300)) if s else 300
        try:
            return bulk.start("sourcing", report_date=body.report_date, refresh_limit=limit)
        except RuntimeError as e:
            raise HTTPException(409, str(e))
    rep = run_daily_sourcing(db, trigger="manual", report_date=body.report_date)
    return serializers.report(rep)


@router.get("/reports")
def reports(limit: int = 30, db: Session = Depends(get_db)):
    rows = db.query(DailyReport).order_by(DailyReport.report_date.desc(), DailyReport.generated_at.desc()).limit(limit).all()
    return [serializers.report(r) for r in rows]


@router.get("/reports/latest")
def latest(db: Session = Depends(get_db)):
    r = db.query(DailyReport).order_by(DailyReport.report_date.desc(), DailyReport.generated_at.desc()).first()
    return serializers.report(r) if r else None


@router.get("/scheduler")
def scheduler_status():
    return scheduler.status()


@router.put("/scheduler")
def set_scheduler(body: schemas.SettingIn, db: Session = Depends(get_db)):
    if not isinstance(body.value, bool):
        raise HTTPException(400, "value 는 true/false")
    s = db.get(UserSetting, "auto_sourcing_enabled")
    if not s:
        s = UserSetting(key="auto_sourcing_enabled", value={"value": body.value})
        db.add(s)
    else:
        s.value = {"value": body.value}
    db.commit()
    return scheduler.status()
