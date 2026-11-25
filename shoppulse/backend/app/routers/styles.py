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


@router.get("/audio")
def audio_status():
    """내레이션 음성 상태와 배경음악 보관함."""
    from ..services import audio_fx
    voices, verr = [], None
    if get_settings().elevenlabs_api_key:
        try:
            voices = audio_fx.elevenlabs_voices()
        except audio_fx.TTSError as e:
            verr = str(e)
    return {"tts": audio_fx.tts_status(), "bgm": audio_fx.bgm_library(), "voices": voices, "voices_error": verr,
            "voice_locked": bool(get_settings().elevenlabs_voice_id),
            "note": "배경음악은 직접 사용 권한이 있는 곡만 넣어 주세요(예: 유튜브 오디오 보관함). 보관함이 비어 있으면 단순한 내장 합성 반주를 씁니다. 효과음은 프로그램이 직접 합성합니다."}


@router.post("/bgm")
def add_bgm(files: list[UploadFile] = File(...)):
    from ..services import audio_fx
    import re as _re
    if len(audio_fx.bgm_library()) + len(files) > 30:
        raise HTTPException(400, "배경음악은 30곡까지 보관할 수 있습니다")
    saved = 0
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in audio_fx.BGM_EXT:
            raise HTTPException(400, f"{f.filename}: 음악 파일(mp3, m4a, wav 등)만 올릴 수 있습니다")
        stem = _re.sub(r"[^0-9A-Za-z가-힣 _.()-]", "_", Path(f.filename or "bgm").stem).strip(" ._")[:80] or "bgm"
        if stem.startswith("_builtin"):
            stem = "my" + stem
        data = f.file.read(40 * 1024 * 1024 + 1)
        if len(data) > 40 * 1024 * 1024:
            raise HTTPException(400, f"{f.filename}: 40MB 이하 파일만 올릴 수 있습니다")
        (audio_fx.bgm_dir() / f"{stem}{ext}").write_bytes(data)
        saved += 1
    return {"saved": saved, "bgm": audio_fx.bgm_library()}


@router.get("/bgm/{name}")
def get_bgm(name: str):
    from fastapi.responses import FileResponse
    from ..services import audio_fx
    if not any(x["name"] == name for x in audio_fx.bgm_library()):
        raise HTTPException(404, "그 곡이 없습니다")
    return FileResponse(audio_fx.bgm_dir() / name)


@router.delete("/bgm/{name}")
def delete_bgm(name: str):
    from ..services import audio_fx
    if not any(x["name"] == name for x in audio_fx.bgm_library()):  # 보관함 목록에 있는 이름만(경로 조작 방지)
        raise HTTPException(404, "그 곡이 없습니다")
    (audio_fx.bgm_dir() / name).unlink(missing_ok=True)
    return {"bgm": audio_fx.bgm_library()}


@router.put("/voice")
def set_voice(body: schemas.SettingIn, db: Session = Depends(get_db)):
    """ElevenLabs 목소리 고르기(내 계정의 목소리 목록에 있는 것만)."""
    from ..models import UserSetting
    from ..services import audio_fx
    vid = str(body.value or "").strip()
    try:
        ok = any(v["id"] == vid for v in audio_fx.elevenlabs_voices())
    except audio_fx.TTSError as e:
        raise HTTPException(400, str(e))
    if not ok:
        raise HTTPException(400, "내 ElevenLabs 계정의 목소리 목록에 없는 목소리입니다")
    st = db.get(UserSetting, "elevenlabs_voice_id")
    if st:
        st.value = {"value": vid}
    else:
        db.add(UserSetting(key="elevenlabs_voice_id", value={"value": vid}))
    db.commit()
    return {"tts": audio_fx.tts_status()}


@router.post("/tts-test")
def tts_test(text: str = Form("이 목소리로 첫 장면을 소개합니다"), voice_id: str = Form("")):
    """내레이션 목소리 미리 듣기."""
    import uuid
    from fastapi.responses import FileResponse
    from ..services import audio_fx
    out = get_settings().media_dir / "work" / f"tts_test_{uuid.uuid4().hex[:8]}.wav"
    try:
        got = audio_fx.synthesize(text[:80], out, voice_id=voice_id or None)
    except audio_fx.TTSError as e:
        raise HTTPException(400, str(e))
    path = Path(got.get("path") or out)
    return FileResponse(path, media_type="audio/mpeg" if path.suffix == ".mp3" else "audio/wav")


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
