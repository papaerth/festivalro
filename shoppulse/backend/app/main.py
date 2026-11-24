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
from .routers import backup, candidates, celebrities, channels, dashboard, imports, products, schedule, settings, sourcing, videos
from .seeds.loader import ensure_scoring_version, refresh_data_sources, seed_channels
from .services import scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("shoppulse")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_scoring_version(db)
        n = seed_channels(db)
        if n:
            log.info("시드 채널 %d개 적재(모두 '검증 전')", n)
        refresh_data_sources(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.start()
    log.info("SHOPPULSE %s 시작 — http://localhost:%d", __version__, get_settings().shoppulse_port)
    yield
    scheduler.shutdown()


app = FastAPI(title="SHOPPULSE 3.0", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])

for r in (dashboard, celebrities, channels, videos, products, candidates, schedule, imports, sourcing, settings, backup):
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
