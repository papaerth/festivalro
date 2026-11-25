"""SHOPPULSE 3.0 FastAPI 앱. 프런트엔드 빌드(frontend/dist)가 있으면 같은 포트에서 서빙한다."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import FRONTEND_DIST, get_settings
from .database import Base, SessionLocal, engine
from .routers import backup, candidates, celebrities, channels, dashboard, imports, products, schedule, settings, sourcing, studio, styles, videos
from .seeds.loader import ensure_scoring_version, refresh_data_sources, seed_channels
from .services import scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("shoppulse")


def _setup_file_log() -> None:
    """서버 창이 닫혀도 원인을 볼 수 있게 data/logs/server.log 에 기록한다(2MB × 3개 순환)."""
    try:
        from logging.handlers import RotatingFileHandler

        log_dir = get_settings().data_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        h = RotatingFileHandler(log_dir / "server.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        h.addFilter(_AccessLogFilter())
        logging.getLogger().addHandler(h)
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            logging.getLogger(name).addHandler(h)
    except Exception as e:  # 로그 파일을 못 만들어도 서버는 떠야 한다
        log.warning("로그 파일을 만들지 못했습니다: %s", e)

_QUIET_PATHS = ("/api/channels/bulk/status", "/api/health")


class _AccessLogFilter(logging.Filter):
    """화면이 주기적으로 묻는 상태 확인 요청은 서버 창 로그에서 제외한다."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in _QUIET_PATHS)


logging.getLogger("uvicorn.access").addFilter(_AccessLogFilter())


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    from . import migrations

    migrations.run(engine)
    with SessionLocal() as db:
        ensure_scoring_version(db)
        n = seed_channels(db)
        if n:
            log.info("시드 채널 %d개 적재(모두 '검증 전')", n)
        refresh_data_sources(db)
        _recover_interrupted_jobs(db)
        from .services.house_style import ensure_house_style
        ensure_house_style(db)


def _recover_interrupted_jobs(db) -> int:
    """서버가 꺼지며 중단된 영상 제작·스타일 학습을 '실패'로 정리한다(안 그러면 영원히 '만드는 중'으로 남아 다시 누를 수 없다)."""
    from .models import ReferenceStyle, ShortsRender
    msg = "서버가 꺼지거나 재시작되어 중단됐습니다. 다시 눌러 주세요."
    n = 0
    for r in db.query(ShortsRender).filter(ShortsRender.status.in_(["queued", "running"])).all():
        r.status, r.error, r.step = "failed", msg, None
        n += 1
    for st in db.query(ReferenceStyle).filter(ReferenceStyle.status == "learning").all():
        # 이미 배운 값이 있으면 그대로 쓸 수 있게 둔다
        st.status, st.error, st.step = ("ready" if st.profile else "failed"), (None if st.profile else msg), None
        n += 1
    if n:
        db.commit()
        log.info("중단된 작업 %d건 정리", n)
    return n


def _prepare_candidates_background() -> None:
    """시작 직후(백그라운드): 모든 활성 후보에 규칙 간이 점수·템플릿 기획안이 있게 한다. 실패해도 서버는 계속 동작."""
    import threading

    def run():
        try:
            from .services.rule_scorer import prepare_candidates

            with SessionLocal() as db:
                r = prepare_candidates(db)
            log.info("후보 준비: 규칙 점수 %s건 계산(%s건 유지), 템플릿 기획안 %s건 생성",
                     r["rule_scores"]["scored"], r["rule_scores"]["unchanged"], r["template_plans"]["generated"])
        except Exception as e:
            log.warning("후보 준비 실패(서버는 계속 동작): %s", e)

    threading.Thread(target=run, daemon=True, name="prepare-candidates").start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _setup_file_log()
    init_db()
    scheduler.start()
    _prepare_candidates_background()
    log.info("SHOPPULSE %s 시작 — http://localhost:%d", __version__, get_settings().shoppulse_port)
    yield
    scheduler.shutdown()


app = FastAPI(title="SHOPPULSE 3.0", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])

for r in (dashboard, celebrities, channels, videos, products, candidates, schedule, imports, sourcing, settings, backup, studio, styles):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    s = get_settings()
    return {"status": "ok", "version": __version__, "youtube_api": bool(s.youtube_api_key),
            "ai_provider": s.shoppulse_ai_provider if s.anthropic_api_key else "template", "frontend_built": FRONTEND_DIST.exists()}


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("처리되지 않은 오류: %s", exc)
    return JSONResponse(500, {"detail": f"서버 오류: {exc}"})


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = FRONTEND_DIST / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
else:

    @app.get("/", include_in_schema=False)
    def no_frontend():
        return JSONResponse(200, {"message": "SHOPPULSE API 가 실행 중입니다. 프런트엔드가 빌드되지 않았습니다. setup.bat 을 실행하세요.",
                                  "docs": "/docs"})
