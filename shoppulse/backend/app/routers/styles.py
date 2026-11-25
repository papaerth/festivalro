"""레퍼런스 편집 스타일: 채널 주소·샘플 쇼츠·캡처로 편집 방식을 학습하고, 쇼츠 제작 때 골라 쓴다."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..config import get_settings
from ..database import get_db
from ..models import ReferenceStyle
from ..services import style_learner
from ..services.style_profile import DEFAULT_STYLE, normalize_style
from .common import get_or_404

router = APIRouter(prefix="/api/styles", tags=["styles"])
VIDEO_EXT, IMAGE_EXT = (".mp4", ".mov", ".mkv", ".webm", ".m4v"), (".png", ".jpg", ".jpeg", ".webp")
MAX_STYLES = 12


def _ser(s: ReferenceStyle) -> dict:
    return {"id": s.id, "name": s.name, "channel_url": s.channel_url, "channel_title": s.channel_title, "status": s.status,
            "step": s.step, "profile": s.profile, "stats": s.stats, "error": s.error,
            "created_at": serializers.iso(s.created_at), "updated_at": serializers.iso(s.updated_at)}


def _save_uploads(style_id: int, files: list[UploadFile]) -> tuple[list[str], list[str]]:
    work = get_settings().media_dir / "styles" / f"s{style_id}"
    work.mkdir(parents=True, exist_ok=True)
    vids, imgs = [], []
    for i, f in enumerate(files or []):
        ext = Path(f.filename or "").suffix.lower()
        if ext in VIDEO_EXT and len(vids) < 3:
            dest = work / f"sample_{i}{ext}"
            kind = vids
        elif ext in IMAGE_EXT and len(imgs) < 6:
            dest = work / f"capture_{i}{ext}"
            kind = imgs
        else:
            continue
        size = 0
        with dest.open("wb") as out:
            while chunk := f.file.read(4 * 1024 * 1024):
                size += len(chunk)
                if size > 400 * 1024 * 1024:
                    out.close(); dest.unlink(missing_ok=True)
                    raise HTTPException(400, f"{f.filename}: 샘플은 400MB 이하(쇼츠 한 편)로 올려 주세요")
                out.write(chunk)
        kind.append(str(dest))
    return vids, imgs


@router.get("")
def list_styles(db: Session = Depends(get_db)):
    return {"styles": [_ser(s) for s in db.query(ReferenceStyle).order_by(ReferenceStyle.id).all()],
            "default": normalize_style(DEFAULT_STYLE),
            "note": "스타일은 '편집 방식'만 학습합니다(화면 배치·자막 모양·후킹 방식·컷 속도). 다른 채널의 문구·장면은 복제하지 않습니다."}


@router.get("/export")
def export_styles(db: Session = Depends(get_db)):
    """학습된 스타일을 파일로 내보내기(다른 PC 로 옮기거나 보관)."""
    return {"format": "shoppulse-styles", "version": 1,
            "styles": [{"name": s.name, "channel_url": s.channel_url, "yt_channel_id": s.yt_channel_id, "channel_title": s.channel_title,
                        "profile": s.profile, "stats": s.stats}
                       for s in db.query(ReferenceStyle).filter(ReferenceStyle.status == "ready").order_by(ReferenceStyle.id).all()]}


@router.post("/import")
async def import_styles(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """스타일 파일(.json) 가져오기. 같은 채널(또는 같은 이름)이 이미 있으면 그 스타일을 새 값으로 바꾼다."""
    import json
    try:
        payload = json.loads((await file.read()).decode("utf-8-sig"))
    except Exception:
        raise HTTPException(400, "스타일 파일(.json)을 읽을 수 없습니다")
    if not isinstance(payload, dict) or payload.get("format") != "shoppulse-styles" or not isinstance(payload.get("styles"), list):
        raise HTTPException(400, "SHOPPULSE 스타일 파일이 아닙니다")
    created = updated = 0
    for it in payload["styles"][:MAX_STYLES]:
        if not isinstance(it, dict) or not isinstance(it.get("profile"), dict) or not str(it.get("name") or "").strip():
            continue
        name = str(it["name"]).strip()[:100]
        st = None
        if it.get("yt_channel_id"):
            st = db.query(ReferenceStyle).filter(ReferenceStyle.yt_channel_id == str(it["yt_channel_id"])).first()
        st = st or db.query(ReferenceStyle).filter(ReferenceStyle.name == name).first()
        if st and st.status == "learning":
            continue
        if not st:
            if db.query(ReferenceStyle).count() >= MAX_STYLES:
                break
            st = ReferenceStyle(name=name)
            db.add(st)
            created += 1
        else:
            updated += 1
        st.name = name
        st.channel_url = (str(it.get("channel_url") or "").strip() or None)
        st.yt_channel_id = (str(it.get("yt_channel_id") or "").strip() or None)
        st.channel_title = (str(it.get("channel_title") or "").strip()[:200] or None)
        st.profile = normalize_style(it["profile"])  # 값은 항상 안전 범위로 정리
        st.stats = it.get("stats") if isinstance(it.get("stats"), dict) else None
        st.status, st.step, st.error = "ready", "완료", None
    db.commit()
    return {"created": created, "updated": updated, "styles": [_ser(s) for s in db.query(ReferenceStyle).order_by(ReferenceStyle.id).all()]}


@router.post("", status_code=201)
def create_style(name: str = Form(""), channel_url: str = Form(""), files: list[UploadFile] = File(default=[]),
                 db: Session = Depends(get_db)):
    """채널 주소 + (선택) 샘플 쇼츠 mp4 최대 3개·캡처 최대 6장 → 학습 시작(백그라운드)."""
    if db.query(ReferenceStyle).count() >= MAX_STYLES:
        raise HTTPException(400, f"스타일은 {MAX_STYLES}개까지 저장할 수 있습니다. 안 쓰는 것을 지워 주세요")
    if not channel_url.strip() and not files:
        raise HTTPException(400, "채널 주소를 넣거나 샘플 쇼츠·캡처를 올려 주세요")
    st = ReferenceStyle(name=(name.strip() or channel_url.strip().rstrip("/").split("/")[-1] or "레퍼런스")[:100],
                        channel_url=channel_url.strip() or None, status="learning", step="대기")
    db.add(st)
    db.commit()
    vids, imgs = _save_uploads(st.id, files)
    style_learner.start_learning(db, st, vids, imgs)
    return _ser(st)


@router.post("/{sid}/relearn")
def relearn(sid: int, files: list[UploadFile] = File(default=[]), db: Session = Depends(get_db)):
    st = get_or_404(db, ReferenceStyle, sid, "스타일")
    if st.status == "learning":
        raise HTTPException(409, "이미 학습 중입니다")
    vids, imgs = _save_uploads(st.id, files)
    style_learner.start_learning(db, st, vids, imgs)
    return _ser(st)


@router.get("/{sid}")
def get_style(sid: int, db: Session = Depends(get_db)):
    return _ser(get_or_404(db, ReferenceStyle, sid, "스타일"))


@router.patch("/{sid}")
def patch_style(sid: int, body: schemas.StylePatch, db: Session = Depends(get_db)):
    """이름 변경 또는 스타일 값 직접 수정(색·크기·후킹 길이 등). 값은 안전 범위로 정리된다."""
    st = get_or_404(db, ReferenceStyle, sid, "스타일")
    if body.name:
        st.name = body.name[:100]
    if body.profile is not None:
        st.profile = normalize_style(body.profile)
        st.status = "ready"
    db.commit()
    return _ser(st)


@router.delete("/{sid}", status_code=204)
def delete_style(sid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, ReferenceStyle, sid, "스타일"))
    db.commit()
