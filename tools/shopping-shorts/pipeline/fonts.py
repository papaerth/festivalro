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


# 버튼 한 번으로 받는 무료 글자체(구글 폰트, SIL Open Font License — 영상에 써도 된다). (보일 이름, 저장소 안 경로)
FONT_BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
RECOMMENDED = [
    ("Black Han Sans · 굵고 힘 있는 제목", "blackhansans/BlackHanSans-Regular.ttf"),
    ("Do Hyeon · 또박또박한 고딕", "dohyeon/DoHyeon-Regular.ttf"),
    ("Jua · 둥글고 귀여운", "jua/Jua-Regular.ttf"),
    ("Bagel Fat One · 통통한 강조", "bagelfatone/BagelFatOne-Regular.ttf"),
    ("Gasoek One · 묵직한 강조", "gasoekone/GasoekOne-Regular.ttf"),
    ("Gugi · 각진 개성", "gugi/Gugi-Regular.ttf"),
    ("Sunflower Bold · 깔끔한 굵은 글씨", "sunflower/Sunflower-Bold.ttf"),
    ("Nanum Gothic ExtraBold · 무난한 굵은 고딕", "nanumgothic/NanumGothic-ExtraBold.ttf"),
    ("Gaegu Bold · 손글씨", "gaegu/Gaegu-Bold.ttf"),
    ("Nanum Pen Script · 펜 손글씨", "nanumpenscript/NanumPenScript-Regular.ttf"),
    ("Single Day · 가벼운 손글씨", "singleday/SingleDay-Regular.ttf"),
    ("Yeon Sung · 붓글씨 느낌", "yeonsung/YeonSung-Regular.ttf"),
]


def user_font_dir() -> Path:
    """사용자가 글자체 파일(.ttf .otf)을 넣는 폴더. 여기 넣은 글자체는 설치하지 않아도 목록에 나온다."""
    d = util.ROOT / "fonts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def download_recommended(log=print) -> int:
    """추천 무료 글자체를 fonts 폴더로 내려받는다(이미 있는 것은 건너뛴다). 새로 받은 개수를 돌려준다."""
    import urllib.request
    d, n = user_font_dir(), 0
    for name, rel in RECOMMENDED:
        dst = d / Path(rel).name
        if dst.exists() and dst.stat().st_size > 10000:
            continue
        try:
            log(f"받는 중: {name}")
            with urllib.request.urlopen(FONT_BASE + rel, timeout=90) as r:
                data = r.read()
            if data[:4] not in (b"\x00\x01\x00\x00", b"OTTO", b"true", b"ttcf"):
                raise OSError("글자체 파일이 아닙니다")
            tmp = dst.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(dst)
            n += 1
        except OSError as e:
            log(f"받지 못했습니다: {name} ({e})")
    return n


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
