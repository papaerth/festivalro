from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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


@router.get("/search-offers")
def search_offers(q: str, limit: int = 10):
    """네이버 쇼핑·쿠팡 파트너스 공식 API 로 판매처를 조회한다(키가 있는 소스만)."""
    from ..services.commerce import search_offers as _search
    if not q.strip():
        raise HTTPException(400, "검색어를 입력하세요")
    return _search(q.strip(), limit)


@router.post("/investigate")
async def investigate(files: list[UploadFile] = File(...), hint: str | None = Form(None), video_id: int | None = Form(None),
                      db: Session = Depends(get_db)):
    """캡처 이미지로 상품을 AI 조사하고 쿠팡·네이버 검색 링크(+네이버 API 결과)를 돌려준다."""
    from ..services.commerce import naver_status, search_naver
    from ..services.product_identifier import AINotConfigured, investigate_capture
    images = []
    for f in files[:4]:
        data = await f.read()
        if not (f.content_type or "").startswith("image/") or len(data) > 8 * 1024 * 1024:
            raise HTTPException(400, f"이미지 파일만 8MB 이하로 올려주세요: {f.filename}")
        images.append((data, f.content_type))
    ctx = None
    if video_id:
        v = db.get(Video, video_id)
        if v:
            ctx = {"title": v.title, "celebrity": v.celebrity.name if v.celebrity else None,
                   "description": (v.description or "")[:800]}
    try:
        result = investigate_capture(images, hint=hint, context=ctx)
    except AINotConfigured as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI 조사 실패: {e}")
    if naver_status() == "configured":
        for it in result.get("items", []):
            q = (it.get("search_queries") or [it.get("name")])[0]
            it["naver_results"] = search_naver(q, 5).get("items", [])[:5] if q else []
    result["naver_api"] = naver_status()
    return result


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
