"""JSON 전체 백업·복원, CSV 내보내기. 복원 전 자동 백업."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..models import utcnow
from .. import models
from ..config import get_settings
from ..database import Base

TABLE_ORDER = [
    "celebrities", "youtube_channels", "videos", "video_metrics", "view_snapshots", "video_segments",
    "products", "product_mentions", "product_offers", "scoring_versions", "sourcing_candidates",
    "sourcing_scores", "verification_records", "shorts_plans", "daily_reports", "upload_schedule",
    "production_tasks", "data_sources", "collection_jobs", "audit_logs", "user_settings", "reference_styles",
]


def _ser(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def _table(name):
    return Base.metadata.tables[name]


def export_all(db: Session) -> dict:
    out = {"format": "shoppulse-backup", "version": 1, "exported_at": utcnow().isoformat(), "tables": {}}
    for name in TABLE_ORDER:
        t = _table(name)
        rows = db.execute(t.select()).mappings().all()
        out["tables"][name] = [{k: _ser(v) for k, v in r.items()} for r in rows]
    return out


def write_backup_file(db: Session, label: str = "manual") -> Path:
    data = export_all(db)
    path = get_settings().backup_dir / f"shoppulse-backup-{datetime.now():%Y%m%d-%H%M%S}-{label}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def _coerce(table, row: dict) -> dict:
    out = {}
    for col in table.columns:
        if col.name not in row:
            continue
        v = row[col.name]
        pytype = getattr(col.type, "python_type", None)
        try:
            pt = col.type.python_type
        except NotImplementedError:
            pt = None
        if v is not None and isinstance(v, str):
            if pt is datetime:
                v = datetime.fromisoformat(v)
            elif pt is date:
                v = date.fromisoformat(v)
        out[col.name] = v
    return out


def restore_all(db: Session, payload: dict, mode: str = "replace") -> dict:
    if payload.get("format") != "shoppulse-backup":
        raise ValueError("SHOPPULSE 백업 파일 형식이 아닙니다.")
    tables = payload.get("tables", {})
    counts = {}
    db.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        if mode == "replace":
            for name in reversed(TABLE_ORDER):
                if name not in tables:  # 예전 백업에 없는 표(나중에 추가된 것)는 지우지 않고 그대로 둔다
                    continue
                db.execute(_table(name).delete())
        for name in TABLE_ORDER:
            rows = tables.get(name) or []
            t = _table(name)
            if not rows:
                counts[name] = 0
                continue
            coerced = [_coerce(t, r) for r in rows]
            if mode == "replace":
                db.execute(t.insert(), coerced)
            else:  # merge: 기존 PK 는 건너뜀
                pk = [c.name for c in t.primary_key.columns]
                existing = {tuple(r[k] for k in pk) for r in db.execute(t.select()).mappings().all()}
                new = [r for r in coerced if tuple(r.get(k) for k in pk) not in existing]
                if new:
                    db.execute(t.insert(), new)
                coerced = new
            counts[name] = len(coerced)
        db.commit()
    finally:
        db.execute(text("PRAGMA foreign_keys=ON"))
    return counts


def export_csv_zip(db: Session) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        data = export_all(db)
        for name, rows in data["tables"].items():
            s = io.StringIO()
            cols = [c.name for c in _table(name).columns]
            w = csv.DictWriter(s, fieldnames=cols)
            w.writeheader()
            for r in rows:
                w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v) for k, v in r.items()})
            zf.writestr(f"{name}.csv", "﻿" + s.getvalue())
        zf.writestr("README.txt", "SHOPPULSE 3.0 CSV 내보내기. 복원은 JSON 백업 파일로만 가능합니다.\n")
    return buf.getvalue()


def list_backups() -> list[dict]:
    out = []
    for p in sorted(get_settings().backup_dir.glob("shoppulse-backup-*.json"), reverse=True):
        st = p.stat()
        out.append({"name": p.name, "size": st.st_size, "modified_at": datetime.fromtimestamp(st.st_mtime).isoformat()})
    return out
