from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models import utcnow
from .. import schemas, serializers
from ..database import get_db
from ..models import Product, ProductMention, ProductOffer, Video, VideoSegment
from ..services.audit import log
from .common import apply_patch, get_or_404

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("")
def list_products(q: str | None = None, category: str | None = None, identification_status: str | None = None,
                  include_demo: bool = False, db: Session = Depends(get_db)):
    qs = db.query(Product)
    if not include_demo:
        qs = qs.filter(Product.is_demo.is_(False))
    if q:
        qs = qs.filter(Product.name.contains(q) | Product.brand.contains(q))
    if category:
        qs = qs.filter(Product.category == category)
    if identification_status:
        qs = qs.filter(Product.identification_status == identification_status)
    return [serializers.product(p) for p in qs.order_by(Product.updated_at.desc()).all()]


@router.post("", status_code=201)
def create_product(body: schemas.ProductIn, db: Session = Depends(get_db)):
    p = Product(**body.model_dump())
    db.add(p)
    db.flush()
    log(db, "product", p.id, "create", {"name": p.name})
    db.commit()
    return serializers.product(p)


@router.get("/{pid}")
def get_product(pid: int, db: Session = Depends(get_db)):
    p = get_or_404(db, Product, pid, "상품")
    d = serializers.product(p)
    d["videos"] = [serializers.video_summary(m.video, with_graph=False) | {"segment_id": m.segment_id} for m in p.mentions]
    return d


@router.patch("/{pid}")
def patch_product(pid: int, body: schemas.ProductPatch, db: Session = Depends(get_db)):
    p = get_or_404(db, Product, pid, "상품")
    apply_patch(p, body)
    db.commit()
    return serializers.product(p)


@router.delete("/{pid}", status_code=204)
def delete_product(pid: int, db: Session = Depends(get_db)):
    p = get_or_404(db, Product, pid, "상품")
    db.delete(p)
    db.commit()


@router.post("/{pid}/offers", status_code=201)
def add_offer(pid: int, body: schemas.OfferIn, db: Session = Depends(get_db)):
    p = get_or_404(db, Product, pid, "상품")
    data = body.model_dump()
    data["checked_at"] = (data["checked_at"] or utcnow()).replace(tzinfo=None)
    o = ProductOffer(product_id=p.id, **data)
    db.add(o)
    db.commit()
    return serializers.product(p)


@router.delete("/{pid}/offers/{oid}", status_code=204)
def delete_offer(pid: int, oid: int, db: Session = Depends(get_db)):
    o = db.get(ProductOffer, oid)
    if not o or o.product_id != pid:
        raise HTTPException(404, "판매처를 찾을 수 없습니다")
    db.delete(o)
    db.commit()


@router.post("/mentions", status_code=201)
def add_mention(body: schemas.MentionIn, db: Session = Depends(get_db)):
    get_or_404(db, Video, body.video_id, "영상")
    get_or_404(db, Product, body.product_id, "상품")
    if body.segment_id:
        s = get_or_404(db, VideoSegment, body.segment_id, "장면")
        if s.video_id != body.video_id:
            raise HTTPException(400, "장면이 해당 영상에 속하지 않습니다")
    dup = db.query(ProductMention).filter_by(video_id=body.video_id, product_id=body.product_id, segment_id=body.segment_id).first()
    if dup:
        raise HTTPException(409, "이미 연결되어 있습니다")
    m = ProductMention(**body.model_dump())
    db.add(m)
    db.commit()
    return {"id": m.id, **body.model_dump()}


@router.delete("/mentions/{mid}", status_code=204)
def delete_mention(mid: int, db: Session = Depends(get_db)):
    m = get_or_404(db, ProductMention, mid, "연결")
    db.delete(m)
    db.commit()
