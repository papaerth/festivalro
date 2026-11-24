from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..services import backup as svc
from ..services.audit import log

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("")
def list_backups():
    return {"dir": str(get_settings().backup_dir), "files": svc.list_backups()}


@router.post("", status_code=201)
def create_backup(db: Session = Depends(get_db)):
    path = svc.write_backup_file(db, "manual")
    log(db, "backup", None, "create", {"file": path.name})
    db.commit()
    return {"file": path.name, "path": str(path)}


@router.get("/download/{name}")
def download(name: str):
    if "/" in name or "\\" in name or not name.startswith("shoppulse-backup-"):
        raise HTTPException(400, "잘못된 파일명")
    path = get_settings().backup_dir / name
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(path, filename=name, media_type="application/json")


@router.get("/export.json")
def export_json(db: Session = Depends(get_db)):
    data = svc.export_all(db)
    return Response(json.dumps(data, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": "attachment; filename=shoppulse-export.json"})


@router.get("/export.zip")
def export_csv(db: Session = Depends(get_db)):
    return Response(svc.export_csv_zip(db), media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=shoppulse-export-csv.zip"})


@router.post("/restore")
async def restore(file: UploadFile = File(...), mode: str = "replace", db: Session = Depends(get_db)):
    if mode not in ("replace", "merge"):
        raise HTTPException(400, "mode 는 replace 또는 merge")
    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(400, f"JSON 파싱 실패: {e}")
    pre = svc.write_backup_file(db, "pre-restore")
    try:
        counts = svc.restore_all(db, payload, mode=mode)
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"복원 실패(변경 없음, 사전 백업 {pre.name}): {e}")
    log(db, "backup", None, "restore", {"mode": mode, "file": file.filename, "pre_backup": pre.name})
    db.commit()
    return {"restored": counts, "pre_restore_backup": pre.name, "mode": mode}
