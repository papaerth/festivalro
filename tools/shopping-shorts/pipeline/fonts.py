"""PC에 설치된 글자체 목록(한글이 되는 것만). 미리보기 창에서 고를 때 쓴다.

  python pipeline/fonts.py          # 목록 출력

글자체 하나는 "파일경로::묶음 안 번호" 문자열로 가리킨다(util.font 가 그대로 읽는다).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402

EXTS = (".ttf", ".otf", ".ttc")
CACHE = util.ROOT / "work" / "fonts_cache.json"


def font_dirs() -> list[Path]:
    dirs = [util.ROOT / "fonts"]
    if os.name == "nt":
        dirs.append(Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts")
        if os.environ.get("LOCALAPPDATA"):
            dirs.append(Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "Windows" / "Fonts")
    elif sys.platform == "darwin":
        dirs += [Path("/System/Library/Fonts"), Path("/Library/Fonts"), Path.home() / "Library/Fonts"]
    else:
        dirs += [Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home() / ".fonts",
                 Path.home() / ".local/share/fonts"]
    return [d for d in dirs if d.is_dir()]


def _has_hangul(fnt) -> bool:
    """'한' 을 그린 모양이 없는 글자를 그린 모양과 다르면 한글이 있는 글자체다."""
    from PIL import Image, ImageDraw

    def draw(ch):
        im = Image.new("L", (40, 40), 0)
        ImageDraw.Draw(im).text((4, 4), ch, font=fnt, fill=255)
        return im.tobytes()

    a = draw("한")
    return any(a) and a != draw("\U0010FFFD") and a != draw("\uFFFF")


def _entries(path: Path) -> list[dict]:
    from PIL import ImageFont
    out = []
    for index in range(16):
        try:
            f = ImageFont.truetype(str(path), 24, index=index)
        except Exception:
            break
        try:
            family, style = f.getname()
        except Exception:
            family, style = path.stem, ""
        try:
            hangul = _has_hangul(f)
        except Exception:
            hangul = False
        name = f"{family or path.stem} {style or ''}".replace(" Regular", "").strip()
        out.append({"name": name, "ref": f"{path}::{index}", "hangul": hangul})
        if path.suffix.lower() != ".ttc":
            break
    return out


def scan(refresh: bool = False) -> list[dict]:
    """한글이 되는 글자체 [{"name", "ref"}] (이름순). 결과는 파일로 기억해 두 번째부터는 바로 나온다."""
    files = sorted({p for d in font_dirs() for p in d.rglob("*") if p.suffix.lower() in EXTS})
    stamp = [[str(p), int(p.stat().st_mtime)] for p in files]
    cached = util.read_json(CACHE, {}) or {}
    if not refresh and cached.get("stamp") == stamp:
        return cached["fonts"]
    seen, fonts = set(), []
    for p in files:
        for e in _entries(p):
            if e["hangul"] and e["name"] not in seen:
                seen.add(e["name"])
                fonts.append({"name": e["name"], "ref": e["ref"]})
    fonts.sort(key=lambda e: e["name"].lower())
    try:
        util.write_json(CACHE, {"stamp": stamp, "fonts": fonts})
    except OSError:
        pass
    return fonts


if __name__ == "__main__":
    for e in scan(refresh="--refresh" in sys.argv):
        print(f"{e['name']}\t{e['ref']}")
