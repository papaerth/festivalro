"""쇼츠 제작실: 원본 URL 연결 + 사용자가 준비한 원본 mp4 업로드 → 버튼 한 번으로 20~30초 쇼츠 자동 제작."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..config import get_settings
from ..database import get_db
from ..models import ReferenceStyle, ShortsProject, ShortsRender, SourcingCandidate, Video, utcnow
from ..services import audio_fx, overlay_assets, shorts_maker
from ..services.audit import log
from ..services.scoring import get_active_version
from .common import get_or_404

router = APIRouter(prefix="/api/studio", tags=["studio"])
ALLOWED_EXT = (".mp4", ".mov", ".mkv", ".webm", ".m4v")
MAX_BYTES = 6 * 1024 ** 3


def _hms(text: str | None) -> int | None:
    if text is None or not str(text).strip():
        return None
    t = str(text).strip()
    if re.fullmatch(r"\d+", t):
        return int(t)
    m = re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})", t)
    if not m:
        raise HTTPException(400, "위치는 분:초(예: 3:15) 또는 초(예: 195)로 적어 주세요")
    return int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + int(m.group(3))


def _render(r: ShortsRender) -> dict:
    return {"id": r.id, "status": r.status, "step": r.step, "progress": r.progress, "edl": r.edl, "decided_by": r.decided_by,
            "output_info": r.output_info, "notes": r.notes or [], "error": r.error, "style_id": r.style_id,
            "file_url": f"/api/studio/renders/{r.id}/file" if r.status == "done" and r.output_path else None,
            "created_at": serializers.iso(r.created_at), "finished_at": serializers.iso(r.finished_at)}


def _source_warning(proj: ShortsProject, short: Video) -> str | None:
    """올린 파일이 원본(롱폼)이 아니라 쇼츠처럼 보이면 알려 준다(막지는 않는다). 참고 쇼츠를 다시 가공하는 프로그램이 아니기 때문."""
    info = proj.source_info or {}
    dur, w, h = info.get("duration"), info.get("width") or 0, info.get("height") or 0
    if not dur or not proj.source_path:
        return None
    if short.duration_seconds and abs(dur - short.duration_seconds) <= 2 and dur <= 185:
        return "올린 파일의 길이가 참고 쇼츠와 같습니다. 참고 쇼츠 파일이 아니라, 그 장면이 들어 있는 원본(롱폼) 영상을 올려 주세요."
    if dur <= 90 and h > w:
        return "올린 파일이 세로형 짧은 영상입니다. 다른 사람이 만든 쇼츠가 아니라 연예인 채널의 원본 영상이 맞는지 확인해 주세요."
    return None


def _asset(cid: int, a: dict) -> dict:
    return {"id": a["id"], "kind": a.get("kind", "product"), "name": a.get("name"), "method": a.get("method"),
            "method_label": overlay_assets.METHOD_LABEL.get(a.get("method") or "", ""), "url": f"/api/studio/{cid}/assets/{a['id']}/file"}


def _state(db: Session, c: SourcingCandidate) -> dict:
    proj = db.get(ShortsProject, c.id)
    renders = db.query(ShortsRender).filter(ShortsRender.candidate_id == c.id).order_by(ShortsRender.id.desc()).limit(10).all()
    v, orig = c.video, c.video.original
    plan = max(c.plans, key=lambda p: p.created_at) if c.plans else None
    # 업로드용 제목 제안: 우리가 만든 편집안의 제목 → 확인된 연예인·상품 이름. 참고 쇼츠(타인의 재편집물) 제목은 제안하지 않는다
    done = next((r for r in renders if r.status == "done" and r.edl and r.edl.get("title_lines")), None)
    title = " ".join(done.edl["title_lines"]) if done else " ".join(shorts_maker.own_title_lines(c))
    desc = "\n".join(x for x in [
        f"원본: {(orig.channel.channel_name if orig and orig.channel else (orig.yt_channel_title if orig else '')) or ''} - {orig.title if orig else ''}".strip(" -"),
        orig.url if orig else None,
        "※ 원본 영상의 일부를 인용해 해설을 더한 영상입니다.",
        "※ 제휴 링크를 쓰는 경우: 이 포스팅은 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다."] if x)
    return {
        "candidate": {"id": c.id, "title": v.title, "url": v.url, "thumbnail_url": v.thumbnail_url, "view_count": v.view_count,
                      "celebrity_name": c.celebrity.name if c.celebrity else None, "channel_category": c.channel_category,
                      "recommended_slot": c.recommended_slot, "product_name": c.product.name if c.product else None,
                      "produced_at": serializers.iso(c.produced_at), "duration_seconds": v.duration_seconds},
        "original": ({"id": orig.id, "title": orig.title, "url": orig.url, "thumbnail_url": orig.thumbnail_url,
                      "channel": orig.channel.channel_name if orig.channel else orig.yt_channel_title,
                      "duration_seconds": orig.duration_seconds, "has_transcript": bool(orig.transcript)} if orig else None),
        "segment": serializers.segment(c.segment) if c.segment else None,
        "source": ({"name": proj.source_name, "info": proj.source_info, "exists": bool(proj.source_path and Path(proj.source_path).exists()),
                    "hint_start": proj.hint_start, "hint_end": proj.hint_end,
                    "warning": _source_warning(proj, v)} if proj else None),
        "renders": [_render(r) for r in renders],
        "ffmpeg": shorts_maker.capabilities(),
        "styles": [{"id": x.id, "name": x.name, "status": x.status, "summary": (x.profile or {}).get("summary")}
                   for x in db.query(ReferenceStyle).order_by(ReferenceStyle.id).all()],
        "ai": bool(get_settings().anthropic_api_key),
        "assets": [_asset(c.id, x) for x in ((proj.assets if proj else None) or [])],
        "tts": audio_fx.tts_status(),
        "upload_text": {"title_suggestion": title, "description": desc,
                        "plan_titles": (plan.plan.get("title_candidates") if plan else None)},
        "notice": "찾아 주신 원본 영상으로 쇼츠를 새로 만듭니다. 참고 쇼츠는 어떤 상품·장면인지 찾는 단서로만 쓰고, 그 화면·제목·자막은 가져오지 않습니다. 원본 mp4 는 직접 준비해 올려 주세요(프로그램은 유튜브 영상을 내려받지 않습니다). 원본 사용 권한·인용 범위는 직접 확인해야 하며, 출처 표기는 자동으로 들어갑니다.",
    }


@router.get("/{cid}")
def get_studio(cid: int, db: Session = Depends(get_db)):
    return _state(db, get_or_404(db, SourcingCandidate, cid, "후보"))


@router.post("/{cid}/original")
def set_original(cid: int, body: schemas.LinkOriginalIn, db: Session = Depends(get_db)):
    """원본 영상 URL 연결(유튜브 URL·ID). API 키가 있으면 제목·길이를 가져오고, 없으면 URL 만 기록한다."""
    from ..services.metrics import extract_video_id, get_or_create_video
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    yid = extract_video_id(body.url_or_id or "")
    if not yid:
        raise HTTPException(400, "유튜브 영상 URL 또는 11자리 ID를 입력하세요")
    if yid == c.video.youtube_video_id:
        raise HTTPException(400, "참고 쇼츠 자신의 주소입니다. 원본(롱폼) 영상 주소를 넣어 주세요")
    v = db.query(Video).filter(Video.youtube_video_id == yid).first()
    if v is None:
        from ..services import collection
        v, _, _err = collection.add_video_by_id(db, yid, None)
        if v is None:
            v, _ = get_or_create_video(db, yid, {"data_source": "manual"})
        v.source_type = "original_celebrity"
    c.video.original_video_id = v.id
    if c.video.celebrity_id is None:
        c.video.celebrity_id = v.celebrity_id or (v.channel.celebrity_id if v.channel else None)
    c.video.original_match = dict(c.video.original_match or {}, linked=True, confidence="manual", reason="사용자가 직접 연결")
    log(db, "candidate", c.id, "link_original", {"video_id": v.id, "via": "studio"})
    db.commit()
    return _state(db, c)


@router.post("/{cid}/source")
def upload_source(cid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """원본 mp4 업로드(사용자가 직접 준비한 파일). data/media/originals 에 저장한다."""
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"영상 파일만 올릴 수 있습니다({', '.join(ALLOWED_EXT)})")
    dest = get_settings().media_dir / "originals" / f"c{c.id}{ext}"
    for old in dest.parent.glob(f"c{c.id}.*"):
        old.unlink(missing_ok=True)
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = file.file.read(4 * 1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                out.close(); dest.unlink(missing_ok=True)
                raise HTTPException(400, "파일이 너무 큽니다(최대 6GB)")
            out.write(chunk)
    info = None
    caps = shorts_maker.capabilities()
    if caps.get("available"):
        try:
            info = shorts_maker.probe(caps["path"], str(dest))
        except shorts_maker.ShortsError as e:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, str(e))
    proj = db.get(ShortsProject, c.id)
    if not proj:
        proj = ShortsProject(candidate_id=c.id)
        db.add(proj)
    proj.source_path, proj.source_name, proj.source_info = str(dest), file.filename, info or {"size": size}
    log(db, "candidate", c.id, "upload_source", {"name": file.filename, "size": size})
    db.commit()
    return _state(db, c)


@router.post("/{cid}/make")
def make(cid: int, hint: str | None = Form(None), hint_end: str | None = Form(None), style_id: int | None = Form(None),
         db: Session = Depends(get_db)):
    """버튼 한 번: 장면 찾기 → 후킹·컷 구성 → 렌더링을 백그라운드로 시작. hint=대략 위치(분:초, 선택)."""
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    proj = db.get(ShortsProject, c.id)
    if not proj or not proj.source_path or not Path(proj.source_path).exists():
        raise HTTPException(400, "먼저 원본 mp4 파일을 올려 주세요")
    caps = shorts_maker.capabilities()
    if not caps.get("available"):
        raise HTTPException(503, caps.get("reason", "ffmpeg 없음"))
    proj.hint_start, proj.hint_end = _hms(hint), _hms(hint_end)
    db.commit()
    if style_id is not None:
        st = db.get(ReferenceStyle, style_id)
        if not st or st.status != "ready":
            raise HTTPException(400, "그 스타일은 아직 학습이 끝나지 않았습니다")
    shorts_maker.start_render(db, c.id, style_id=style_id)
    return _state(db, c)


@router.post("/{cid}/rerender")
def rerender(cid: int, body: schemas.EdlIn, db: Session = Depends(get_db)):
    """편집안(시간·자막)을 사람이 고쳐 다시 렌더링. AI 호출 없음."""
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    proj = db.get(ShortsProject, c.id)
    if not proj or not proj.source_path or not Path(proj.source_path).exists():
        raise HTTPException(400, "원본 mp4 파일이 없습니다")
    data = body.model_dump()
    sid = data.pop("style_id", None)
    if sid is None:  # 지정이 없으면 직전 렌더의 스타일을 그대로 쓴다
        last = db.query(ShortsRender).filter(ShortsRender.candidate_id == c.id).order_by(ShortsRender.id.desc()).first()
        sid = last.style_id if last else None
    shorts_maker.start_render(db, c.id, edl=data, style_id=sid)
    return _state(db, c)


@router.get("/renders/{rid}/file")
def render_file(rid: int, download: bool = False, db: Session = Depends(get_db)):
    r = get_or_404(db, ShortsRender, rid, "렌더")
    if not r.output_path or not Path(r.output_path).exists():
        raise HTTPException(404, "파일이 없습니다")
    return FileResponse(r.output_path, media_type="video/mp4",
                        filename=f"shoppulse_shorts_{r.candidate_id}_{r.id}.mp4" if download else None)


@router.delete("/{cid}/source", status_code=204)
def delete_source(cid: int, db: Session = Depends(get_db)):
    """원본 파일 삭제(디스크 정리). 만든 쇼츠는 남는다."""
    proj = db.get(ShortsProject, cid)
    if proj and proj.source_path:
        Path(proj.source_path).unlink(missing_ok=True)
        proj.source_path = None
        db.commit()


MAX_ASSETS, MAX_ASSET_BYTES = 6, 15 * 1024 * 1024


@router.post("/{cid}/assets")
def add_asset(cid: int, file: UploadFile = File(...), kind: str = Form("product"), db: Session = Depends(get_db)):
    """영상 위에 띄울 상품 사진·로고 올리기. 배경을 지워(누끼) 흰 테두리 스티커로 만들어 둔다."""
    import uuid
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    if kind not in overlay_assets.KINDS:
        raise HTTPException(400, "종류는 product(상품 사진), logo(로고), sticker(스티커) 중 하나입니다")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in overlay_assets.IMAGE_EXT:
        raise HTTPException(400, "이미지 파일(png, jpg, webp)만 올릴 수 있습니다")
    proj = db.get(ShortsProject, c.id)
    if not proj:
        proj = ShortsProject(candidate_id=c.id)
        db.add(proj)
    items = list(proj.assets or [])
    if len(items) >= MAX_ASSETS:
        raise HTTPException(400, f"사진·로고는 {MAX_ASSETS}개까지 올릴 수 있습니다. 안 쓰는 것을 지워 주세요")
    data = file.file.read(MAX_ASSET_BYTES + 1)
    if len(data) > MAX_ASSET_BYTES:
        raise HTTPException(400, "이미지가 너무 큽니다(최대 15MB)")
    aid = uuid.uuid4().hex[:10]
    folder = get_settings().media_dir / "assets" / f"c{c.id}"
    folder.mkdir(parents=True, exist_ok=True)
    raw, cut = folder / f"{aid}{ext}", folder / f"{aid}_cut.png"
    raw.write_bytes(data)
    try:
        info = overlay_assets.prepare_overlay(raw, cut, kind)
    except Exception as e:
        raw.unlink(missing_ok=True)
        raise HTTPException(400, f"이미지를 읽지 못했습니다: {str(e)[:120]}")
    items.append({"id": aid, "kind": kind, "name": (file.filename or "image")[:120], "path": str(raw), "cut_path": str(cut), "method": info["method"]})
    proj.assets = items
    db.commit()
    return _state(db, c)


@router.get("/{cid}/assets/{aid}/file")
def asset_file(cid: int, aid: str, db: Session = Depends(get_db)):
    proj = db.get(ShortsProject, cid)
    a = next((x for x in ((proj.assets if proj else None) or []) if x["id"] == aid), None)
    if not a or not Path(a["cut_path"]).exists():
        raise HTTPException(404, "이미지가 없습니다")
    return FileResponse(a["cut_path"], media_type="image/png")


@router.delete("/{cid}/assets/{aid}")
def delete_asset(cid: int, aid: str, db: Session = Depends(get_db)):
    c = get_or_404(db, SourcingCandidate, cid, "후보")
    proj = db.get(ShortsProject, c.id)
    items = list((proj.assets if proj else None) or [])
    for a in [x for x in items if x["id"] == aid]:
        for k in ("path", "cut_path"):
            Path(a.get(k) or "_").unlink(missing_ok=True)
    if proj:
        proj.assets = [x for x in items if x["id"] != aid]
        db.commit()
    return _state(db, c)
