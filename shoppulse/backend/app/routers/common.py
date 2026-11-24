from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_or_404(db: Session, model, obj_id: int, label: str = "항목"):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(404, f"{label}을(를) 찾을 수 없습니다 (id={obj_id})")
    return obj


def apply_patch(obj, patch) -> None:
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
