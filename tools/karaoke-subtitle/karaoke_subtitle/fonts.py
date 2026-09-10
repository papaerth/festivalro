"""시스템 폰트 폴더 탐색."""

import os
import sys
from dataclasses import dataclass

from PIL import ImageFont

_EXTS = (".ttf", ".ttc", ".otf")
_cache = None


@dataclass
class FontEntry:
    path: str
    index: int
    family: str
    style: str
    hangul: bool = None  # None = 알 수 없음

    @property
    def label(self):
        tag = "[한글] " if self.hangul else ""
        name = self.family if self.style.lower() in ("regular", "normal", "book", "") else f"{self.family} {self.style}"
        return f"{tag}{name}  ({os.path.basename(self.path)}{'#' + str(self.index) if self.index else ''})"


def font_dirs():
    dirs = []
    if sys.platform == "win32":
        dirs.append(os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts"))
        local = os.environ.get("LOCALAPPDATA")
        if local:
            dirs.append(os.path.join(local, "Microsoft", "Windows", "Fonts"))
    elif sys.platform == "darwin":
        dirs += ["/System/Library/Fonts", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
    else:
        dirs += ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts"),
                 os.path.expanduser("~/.local/share/fonts")]
    return [d for d in dirs if os.path.isdir(d)]


def _has_hangul(path, index):
    """fontTools가 있으면 cmap으로 한글 음절('한') 지원 여부를 확인한다."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return None
    try:
        f = TTFont(path, fontNumber=index, lazy=True)
        cmap = f.getBestCmap() or {}
        f.close()
        return 0xD55C in cmap
    except Exception:
        return None


def load_font_entries(path):
    """폰트 파일 하나에서 (ttc는 여러 개) FontEntry 목록을 만든다."""
    entries = []
    for index in range(32):
        try:
            f = ImageFont.truetype(path, 20, index=index)
        except Exception:
            break
        try:
            family, style = f.getname()
        except Exception:
            family, style = os.path.splitext(os.path.basename(path))[0], ""
        entries.append(FontEntry(path, index, family or "", style or "", _has_hangul(path, index)))
        if not path.lower().endswith(".ttc"):
            break
    return entries


def scan_fonts(refresh=False):
    """시스템 폰트 폴더의 폰트를 모두 읽어 이름순(한글 지원 먼저)으로 돌려준다."""
    global _cache
    if _cache is not None and not refresh:
        return _cache
    entries = []
    seen = set()
    for d in font_dirs():
        for root, _, files in os.walk(d):
            for fn in files:
                if not fn.lower().endswith(_EXTS):
                    continue
                p = os.path.join(root, fn)
                key = fn.lower()
                if key in seen:
                    continue
                seen.add(key)
                entries.extend(load_font_entries(p))
    entries.sort(key=lambda e: (e.hangul is not True, e.family.lower(), e.style.lower()))
    _cache = entries
    return entries


_PREFERRED = ["malgunbd.ttf", "malgun.ttf", "nanumgothicbold.ttf", "nanumgothic.ttf", "applesdgothicneo.ttc",
              "notosanscjk-bold.ttc", "notosanskr-bold", "wqy-zenhei.ttc", "dejavusans-bold.ttf"]


def default_font_entry(entries):
    by_name = {}
    for e in entries:
        by_name.setdefault(os.path.basename(e.path).lower(), e)
    for name in _PREFERRED:
        for k, e in by_name.items():
            if k.startswith(name):
                return e
    for e in entries:
        if e.hangul:
            return e
    return entries[0] if entries else None
