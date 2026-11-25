"""가벼운 스키마 마이그레이션. create_all 은 기존 테이블에 컬럼을 추가하지 않으므로 누락 컬럼을 ALTER 로 보강한다.
새 컬럼을 모델에 추가하면 여기 목록에도 추가한다. (Alembic 도입 전 임시 방식)
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger("shoppulse.migrations")

# (테이블, 컬럼, SQL 타입/제약)
COLUMNS = [
    ("videos", "original_video_id", "INTEGER REFERENCES videos(id) ON DELETE SET NULL"),
    ("videos", "celebrity_id", "INTEGER REFERENCES celebrities(id) ON DELETE SET NULL"),
    ("videos", "yt_channel_id", "VARCHAR(64)"),
    ("videos", "yt_channel_title", "VARCHAR(200)"),
    ("videos", "discovery_query", "VARCHAR(300)"),
    ("videos", "shopping_score", "INTEGER"),
    ("videos", "shopping_hits", "JSON"),
    ("videos", "is_shopping", "BOOLEAN"),
    ("videos", "ai_product_suggestions", "JSON"),
    ("videos", "resolved_links", "JSON"),
    ("videos", "yt_channel_description", "TEXT"),
    ("sourcing_candidates", "produced_at", "DATETIME"),
    ("sourcing_candidates", "produced_url", "VARCHAR(300)"),
    ("sourcing_candidates", "slot_reason", "TEXT"),
]
INDEXES = [
    ("ix_videos_original_video_id", "videos", "original_video_id"),
    ("ix_videos_celebrity_id", "videos", "celebrity_id"),
]


def run(engine: Engine) -> list[str]:
    insp = inspect(engine)
    applied: list[str] = []
    with engine.begin() as conn:
        for table, col, ddl in COLUMNS:
            if table not in insp.get_table_names():
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if col not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                applied.append(f"{table}.{col}")
        for name, table, col in INDEXES:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({col})"))
    if applied:
        log.info("스키마 보강: %s", ", ".join(applied))
    return applied
