"""APScheduler 기반 자동 실행. 기본 비활성(SHOPPULSE_AUTO_SOURCING=false). ChatGPT 예약 브리핑과는 별개."""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..database import session_scope
from ..models import UserSetting

log = logging.getLogger("shoppulse.scheduler")
_scheduler: BackgroundScheduler | None = None


def _auto_enabled() -> bool:
    with session_scope() as db:
        s = db.get(UserSetting, "auto_sourcing_enabled")
        if s is not None:
            return bool(s.value.get("value"))
    return get_settings().shoppulse_auto_sourcing


def _job():
    if not _auto_enabled():
        log.info("자동 소싱 비활성 상태 — 건너뜀")
        return
    from .daily_sourcing import run_daily_sourcing

    with session_scope() as db:
        rep = run_daily_sourcing(db, trigger="scheduled")
        log.info("자동 소싱 완료: report %s", rep.id)


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler:
        return _scheduler
    tz = get_settings().shoppulse_timezone
    _scheduler = BackgroundScheduler(timezone=tz)
    _scheduler.add_job(_job, CronTrigger(hour=5, minute=0, timezone=tz), id="daily_sourcing",
                       replace_existing=True, misfire_grace_time=3600)
    _scheduler.start()
    return _scheduler


def status() -> dict:
    job = _scheduler.get_job("daily_sourcing") if _scheduler else None
    return {
        "running": bool(_scheduler and _scheduler.running),
        "auto_enabled": _auto_enabled(),
        "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
        "schedule": "매일 05:00 Asia/Seoul",
        "note": "PC가 켜져 있고 SHOPPULSE 서버가 실행 중일 때만 동작합니다.",
    }


def shutdown():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
