from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..config import get_settings, load_config_json, save_config_json
from ..database import get_db
from ..models import ScoringVersion, UserSetting
from ..services.audit import log
from ..services.scoring import get_active_version

router = APIRouter(prefix="/api/settings", tags=["settings"])
EDITABLE_CONFIGS = {"graph_rules.json", "metric_bands.json", "upload_slots.json"}


@router.get("")
def get_all(db: Session = Depends(get_db)):
    s = get_settings()
    user = {u.key: u.value.get("value") for u in db.query(UserSetting).all()}
    return {
        "env": {"port": s.shoppulse_port, "youtube_api_configured": bool(s.youtube_api_key),
                "ai_provider": s.shoppulse_ai_provider, "anthropic_configured": bool(s.anthropic_api_key),
                "timezone": s.shoppulse_timezone, "data_dir": str(s.data_dir)},
        "user": {"default_region": user.get("default_region", s.shoppulse_default_region),
                 "auto_sourcing_enabled": user.get("auto_sourcing_enabled", s.shoppulse_auto_sourcing),
                 "default_target_seconds": user.get("default_target_seconds", 25), **user},
        "scoring": get_active_version(db).config,
        "graph_rules": load_config_json("graph_rules.json"),
        "metric_bands": load_config_json("metric_bands.json"),
        "upload_slots": load_config_json("upload_slots.json"),
    }


@router.put("/user/{key}")
def set_user(key: str, body: schemas.SettingIn, db: Session = Depends(get_db)):
    s = db.get(UserSetting, key)
    if not s:
        s = UserSetting(key=key, value={"value": body.value})
        db.add(s)
    else:
        s.value = {"value": body.value}
    db.commit()
    return {"key": key, "value": body.value}


@router.get("/scoring/versions")
def scoring_versions(db: Session = Depends(get_db)):
    return [{"id": v.id, "name": v.name, "is_active": v.is_active, "created_at": v.created_at.isoformat(), "config": v.config}
            for v in db.query(ScoringVersion).order_by(ScoringVersion.created_at.desc()).all()]


@router.post("/scoring", status_code=201)
def new_scoring(body: schemas.ScoringConfigIn, db: Session = Depends(get_db)):
    """새 배점 버전을 만들고 활성화한다(기존 점수는 이전 버전에 남음)."""
    total = sum(int(i.get("max", 0)) for i in body.items)
    if total != 100:
        raise HTTPException(400, f"배점 합계는 100이어야 합니다(현재 {total})")
    for i in body.items:
        if not i.get("key") or not i.get("label"):
            raise HTTPException(400, "각 항목에 key 와 label 이 필요합니다")
    for g in body.grades:
        if "min" not in g or not g.get("key"):
            raise HTTPException(400, "등급에는 min, key, label 이 필요합니다")
    db.query(ScoringVersion).update({ScoringVersion.is_active: False})
    cfg = {"name": body.name, "description": body.description, "items": body.items, "grades": body.grades}
    v = ScoringVersion(name=body.name, config=cfg, is_active=True)
    db.add(v)
    save_config_json("scoring.json", cfg)
    log(db, "scoring_version", None, "create", {"name": body.name})
    db.commit()
    return {"id": v.id, "name": v.name, "config": v.config}


@router.put("/config/{name}")
def put_config(name: str, body: schemas.SettingIn, db: Session = Depends(get_db)):
    if name not in EDITABLE_CONFIGS:
        raise HTTPException(400, f"수정 가능한 설정: {sorted(EDITABLE_CONFIGS)}")
    if not isinstance(body.value, dict):
        raise HTTPException(400, "JSON 객체가 필요합니다")
    save_config_json(name, body.value)
    log(db, "config", None, "update", {"name": name})
    db.commit()
    return load_config_json(name)
