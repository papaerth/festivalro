"""내 채널 기본 스타일: 레퍼런스 쇼츠 분석으로 만든 스타일을 프로그램에 내장하고(config/house_style.json),
「쇼츠 만들기」 기본 버튼이 이 스타일로 만들게 한다. 사용자가 고친 값은 덮어쓰지 않는다."""
from __future__ import annotations

import json
import logging

from ..config import PROJECT_DIR
from ..models import ReferenceStyle, UserSetting
from .style_profile import normalize_style

log = logging.getLogger("shoppulse.style")
HOUSE_FILE = PROJECT_DIR / "config" / "house_style.json"


def load_house() -> dict | None:
    try:
        d = json.loads(HOUSE_FILE.read_text(encoding="utf-8"))
        return d if isinstance(d.get("profile"), dict) else None
    except Exception:
        return None


def _get(db, key):
    st = db.get(UserSetting, key)
    return st.value.get("value") if st else None


def _set(db, key, value):
    st = db.get(UserSetting, key)
    if st:
        st.value = {"value": value}
    else:
        db.add(UserSetting(key=key, value={"value": value}))


def house_style(db) -> ReferenceStyle | None:
    hid = _get(db, "house_style_id")
    return db.get(ReferenceStyle, hid) if hid else None


def ensure_house_style(db) -> ReferenceStyle | None:
    """시작할 때: 내 채널 스타일이 없으면 만들고, 내장 값이 새 버전이면 갱신한다(사용자가 직접 고친 경우는 그대로 둔다).
    기본 스타일을 아직 고른 적이 없으면 내 채널 스타일을 기본으로 한다."""
    data = load_house()
    if not data:
        return None
    ver = int(data.get("version") or 1)
    st = house_style(db)
    if st is None:
        if _get(db, "house_style_removed"):  # 사용자가 지웠으면 다시 만들지 않는다
            return None
        st = ReferenceStyle(name=str(data.get("name") or "내 채널 스타일")[:100], status="ready", step="완료")
        db.add(st)
        db.flush()
        _set(db, "house_style_id", st.id)
        seeded = 0
    else:
        seeded = int((st.stats or {}).get("house_version") or 0)
    if seeded < ver and not (st.stats or {}).get("user_edited"):
        st.profile = normalize_style(data["profile"])
        st.stats = {"house": True, "house_version": ver, "sources": data.get("basis") or [], "notes": [data.get("note")] if data.get("note") else [],
                    "evidence": data.get("evidence") or [], "confidence": data.get("confidence") or "medium", "learned_by": "레퍼런스 쇼츠 분석"}
        st.status, st.error = "ready", None
        log.info("내 채널 스타일 v%d 적용", ver)
    if _get(db, "default_style_id") is None:
        _set(db, "default_style_id", st.id)
    db.commit()
    return st


def default_style_id(db) -> int | None:
    """「쇼츠 만들기」 기본 버튼이 쓸 스타일(준비된 것만)."""
    sid = _get(db, "default_style_id")
    st = db.get(ReferenceStyle, sid) if sid else None
    return st.id if st and st.status == "ready" and st.profile else None


def set_default_style(db, sid: int | None) -> None:
    _set(db, "default_style_id", sid or 0)
    db.commit()
