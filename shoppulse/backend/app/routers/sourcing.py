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


@router.post("/auto-on-open")
def auto_on_open(force: bool = False, db: Session = Depends(get_db)):
    """화면을 열 때 호출: 설정(auto_on_open, 기본 켬)과 마지막 실행 시각(auto_on_open_hours, 기본 6시간)을 보고
    수집 → 쇼츠 검색 → 오늘 소싱을 백그라운드로 자동 시작한다. 이미 작업 중이면 그 상태를 돌려준다."""
    from datetime import datetime, timedelta
    from ..models import utcnow
    from ..services import bulk

    def setting(key, default):
        st = db.get(UserSetting, key)
        return st.value.get("value", default) if st else default

    enabled = bool(setting("auto_on_open", True))
    hours = float(setting("auto_on_open_hours", 6))
    last_raw = setting("auto_on_open_last", None)
    last = None
    if last_raw:
        try:
            last = datetime.fromisoformat(last_raw)
        except Exception:
            last = None
    state = bulk.status()
    base = {"enabled": enabled, "hours": hours, "last_run": last.isoformat() if last else None, "state": state}
    if state["running"]:
        return base | {"started": False, "reason": f"다른 작업({state['task']}) 실행 중"}
    if not enabled and not force:
        return base | {"started": False, "reason": "접속 자동 작업이 꺼져 있음(설정)"}
    if last and not force and (utcnow() - last) < timedelta(hours=hours):
        return base | {"started": False, "reason": f"마지막 실행 후 {hours:g}시간이 지나지 않음"}
    limit = int(setting("daily_refresh_limit", 300))
    dl = int(setting("auto_discover_limit", 10))
    try:
        st = bulk.start("auto", collect_stale_days=1, discover_limit=dl, refresh_limit=limit)
    except RuntimeError as e:
        return base | {"started": False, "reason": str(e)}
    return base | {"started": True, "reason": "수집 → 쇼츠 검색 → 소싱 실행 시작", "state": st}


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
