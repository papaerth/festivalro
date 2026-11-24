from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..database import get_db
from ..models import Celebrity
from ..services.audit import log
from .common import apply_patch, get_or_404

router = APIRouter(prefix="/api/celebrities", tags=["celebrities"])


@router.get("")
def list_celebrities(q: str | None = None, db: Session = Depends(get_db)):
    qs = db.query(Celebrity)
    if q:
        qs = qs.filter(Celebrity.name.contains(q) | Celebrity.name_en.contains(q))
    return [serializers.celebrity(c) for c in qs.order_by(Celebrity.name).all()]


@router.post("", status_code=201)
def create_celebrity(body: schemas.CelebrityIn, db: Session = Depends(get_db)):
    if db.query(Celebrity).filter(Celebrity.name == body.name).first():
        raise HTTPException(409, "같은 이름의 연예인이 이미 있습니다")
    c = Celebrity(**body.model_dump())
    db.add(c)
    db.flush()
    log(db, "celebrity", c.id, "create", {"name": c.name})
    db.commit()
    return serializers.celebrity(c)


@router.patch("/{cid}")
def patch_celebrity(cid: int, body: schemas.CelebrityPatch, db: Session = Depends(get_db)):
    c = get_or_404(db, Celebrity, cid, "연예인")
    apply_patch(c, body)
    db.commit()
    return serializers.celebrity(c)


@router.delete("/{cid}", status_code=204)
def delete_celebrity(cid: int, db: Session = Depends(get_db)):
    c = get_or_404(db, Celebrity, cid, "연예인")
    db.delete(c)
    log(db, "celebrity", cid, "delete", {})
    db.commit()
