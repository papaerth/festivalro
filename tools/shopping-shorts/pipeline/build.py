"""plan(JSON) + 원본 영상 → 완성본 두 개(배경음O / 배경음X)와 썸네일.

  python pipeline/build.py --plan plans/<편>.json --src input/<편>/원본.mp4 \
         --out output/<편> --name <제품명> --uvr-model models/UVR_MDXNET_9482.onnx

고정 규칙: 1:1 크롭(위쪽), 거울반전, 1.1배속, 색보정, 상단 제목 두 줄, 중앙 하단 출처,
두 어절 자막(크기 66, 흰색·검은 테두리, 강조 노란색, 짧은 페이드), 댓글 카드, 효과음,
TTS 구간 원본 소리 끔, 음량 정규화(-14 LUFS).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random  # numpy.random 은 일부 윈도우 PC의 보안 정책(스마트 앱 컨트롤)에 막혀 쓰지 않는다
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402
from pipeline.util import FPS, SR  # noqa: E402

CW, CH = 1080, 1920          # 완성본 캔버스(9:16)
WHITE, YELLOW, BLACK = (255, 255, 255), (255, 230, 0), (0, 0, 0)

# 자막 강조 색(노랑 → 민트 → 분홍 순으로 번갈아 쓴다)
SUB_COLORS = [(255, 230, 0), (110, 240, 200), (255, 150, 195)]
# 자막이 뜰 때의 움직임: 첫 프레임들의 크기 비율(그 뒤는 1.0). 강조 자막은 조금 더 크게 튄다.
POP, POP_EM = [0.80, 0.97, 1.08, 1.03], [0.70, 0.95, 1.15, 1.07, 1.02]
RISE = [(26, 0.35), (14, 0.7), (6, 0.92), (2, 1.0)]     # 아래에서 올라오기: (아래로 밀린 픽셀, 불투명도)

RED_BAND, CYAN = (232, 38, 30), (70, 222, 255)      # 제목 '빨간 띠' 모양의 띠 색과 윗줄 강조 색
PEOPLE_PREFIX = "인물_"                               # input/<편>/인물_<이름>.jpg — 그 이름이 언급될 때 띄울 사진

DEFAULTS = {
    "speed": 1.1,
    "mirror": True,
    "color_filter": "eq=contrast=1.06:saturation=1.15:brightness=0.015,unsharp=5:5:0.4",
    "still_zoom": 0.05,
    "card_read": 0.85,         # 댓글 카드 표시 시간 = 읽는 데 드는 시간 × 이 비율(살짝 모자라게)
    "sub_anim": "pop",         # 자막 등장 움직임: pop(톡 튀어나오기) · rise(아래에서 올라오기) · none
    "sub_vary": True,          # 강조 낱말·강조 자막을 크게, 다른 색, 다른 글자체로
    "sub_colors": "cycle",     # 강조 색: cycle(노랑·민트·분홍 번갈아) · yellow(노랑만)
    "em_scale": 125,           # 강조 글자 크기(%)
    "title_style": "plain",    # 상단 제목 모양: plain(윗줄 흰색·아랫줄 노랑) · band(윗줄 빨간 띠, 낱말마다 색)
    "source_format": "plain",  # 출처 문구: plain(출처 : 유튜브 '채널') · bar(출처 | 채널)
    "source_alpha": 84,        # 출처 문구 불투명도(%)
    "pip_pos": "left",         # 언급 인물 사진을 띄울 자리: left · right (영상 아래쪽 모서리, 자막 위)
    "layout": {
        "video_y": 420,        # 1:1 영상이 놓이는 세로 위치(1080×1080)
        "title_y": [205, 335],  # 상단 제목 두 줄의 가운데 y
        "title_size": 112,
        "sub_y": 1350,         # 자막 가운데 y
        "sub_size": 66,
        "card_gap": 4,         # 댓글 상자는 영상 바로 아래에 붙인다(영상 밑변에서 이만큼 띄움)
        "card_h": 146,         # 그린 댓글 상자의 높이. 캡처한 댓글은 제 높이대로(최대 card_max_h)
        "card_max_h": 230,
        "source_y": 1700,      # 출처 문구 가운데 y(댓글 상자 아래)
        "source_size": 30,
    },
}

EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF"
    "\U0000FE00-\U0000FE0F\U0000200D\U000020E3\U00002190-\U000021FF\U00003030\U0000303D\U00003297\U00003299]")


def apply_defaults(plan: dict, settings: dict | None = None) -> dict:
    """plan에 고정 기본값과 사용자 설정(글자체·크기)을 채운다. plan에 직접 적은 값이 가장 우선."""
    st = util.settings() if settings is None else settings
    own_layout = plan.get("layout") or {}
    own = set(plan)            # plan 에 직접 적혀 있던 값(기본값을 채우기 전)
    for k, v in DEFAULTS.items():
        if isinstance(v, dict):
            plan[k] = {**v, **(plan.get(k) or {})}
        else:
            plan.setdefault(k, v)
    for key in ("title_size", "sub_size", "source_size", "source_y"):
        if st.get(key) and key not in own_layout:
            plan["layout"][key] = int(st[key])
    for key in ("font_title", "font_sub", "font_em"):
        if st.get(key) and not plan.get(key):
            plan[key] = st[key]
    for key in ("title_bold", "sub_bold", "music_file", "music_volume", "sub_anim", "sub_vary", "sub_colors", "em_scale",
                "title_style", "source_format", "source_alpha", "pip_pos"):
        if key in st and key not in own:
            plan[key] = st[key]
    return plan


def load_plan(path) -> dict:
    return apply_defaults(json.loads(Path(path).read_text(encoding="utf-8")))


def source_text_at(plan: dict, i: int | None = None) -> str:
    """timeline i번째 구간에 띄울 출처 문구(i 가 None 이면 썸네일 장면).
    두 영상을 섞는 편은 그때 화면에 나오는 영상의 출처만 적는다(둘을 나란히 적지 않는다)."""
    tl = plan.get("timeline") or []
    seg = tl[i] if i is not None and 0 <= i < len(tl) else None
    if seg and seg.get("type") == "tts" and seg.get("image") and plan.get("image_source_text"):
        return plan["image_source_text"]       # 사용자가 준 이미지는 받은 곳을 따로 표기
    k = 0
    if seg is None:
        k = int((plan.get("thumbnail") or {}).get("src", 0) or 0)
    else:
        for s in reversed(tl[:i + 1]):          # 이미지 구간은 바로 앞 장면의 영상을 따른다
            if not s.get("image"):
                k = int(s.get("src", 0) or 0)
                break
    text = (plan.get("source_text_b") if k else "") or plan.get("source_text", "")
    if plan.get("source_format") == "bar":      # "출처 : 유튜브 '채널'" → "출처 | 채널"
        m = re.search(r"'(.+)'", text)
        text = f"출처 | {m.group(1)}" if m else text
    return text


def _title_words(line: str, keys: str, i: int, style: str):
    """제목 한 줄을 (낱말, 색) 목록으로. keys 는 색을 줄 낱말들(모델이 *별표*로 표시한 것)."""
    words = line.split()
    if style != "band":
        return [(w, WHITE if i == 0 else YELLOW) for w in words]
    ks = set(str(keys or "").split())
    hit = [any(k in w for k in ks) for w in words] if ks else []
    if i == 0:      # 윗줄(빨간 띠): 표시한 낱말은 하늘색, 나머지는 흰색. 표시가 없으면 첫 낱말만 흰색
        hit = hit if any(hit) else [k > 0 for k in range(len(words))] if len(words) > 1 else [False] * len(words)
        return [(w, CYAN if h else WHITE) for w, h in zip(words, hit)]
    # 아랫줄: 표시한 낱말은 노랑, 나머지는 흰색. 표시가 없으면 노랑·흰색을 번갈아
    hit = hit if any(hit) else [k % 2 == 0 for k in range(len(words))]
    return [(w, YELLOW if h else WHITE) for w, h in zip(words, hit)]


def title_images(plan: dict) -> list:
    """상단 제목 두 줄의 그림 [(이미지, 가운데 y)]. title_style 이 band 면 윗줄에 빨간 띠를 깔고 낱말마다 색을 준다."""
    from PIL import Image, ImageDraw
    L = plan["layout"]
    ft = plan.get("font_title") or plan.get("font_bold")
    style = plan.get("title_style") or "plain"
    title = [str(x) for x in (plan.get("title") or ["", ""])[:2]]
    keys = list(plan.get("title_keys") or []) + ["", ""]
    room = CW - (150 if style == "band" else 90)
    longest = max(title, key=lambda t: util.font(L["title_size"], True, ft).getlength(t)) if title else ""
    # 띠 모양은 띠가 아랫줄을 덮지 않게 글자를 조금 작게 잡는다
    tf = fit_font(longest, min(L["title_size"], 96) if style == "band" else L["title_size"], room, True, ft)
    bd = bold_px(tf.size, bool(plan.get("title_bold")))
    out = []
    for i, line in enumerate(title):
        if not line.strip():
            continue
        words = [(w, tf, col, bd) for w, col in _title_words(line, keys[i], i, style)]
        im = rich_image(words, 6 if not (style == "band" and i == 0) else 4, CW + 40)
        if style == "band" and i == 0:      # 글자 뒤에 빨간 띠
            pad_x, pad_y = 22, 2
            band = Image.new("RGBA", (im.width + 2 * pad_x, im.height + 2 * pad_y), (0, 0, 0, 0))
            ImageDraw.Draw(band).rounded_rectangle([0, 0, band.width - 1, band.height - 1], radius=8, fill=RED_BAND + (255,))
            band.alpha_composite(im, (pad_x, pad_y))
            im = band
        out.append((im, L["title_y"][i] - (8 if style == "band" and i == 0 else 0)))
    return out


def title_base(plan: dict):
    """검은 9:16 바탕에 상단 제목 두 줄을 그린 이미지."""
    from PIL import Image
    base = Image.new("RGB", (CW, CH), BLACK)
    for im, cy in title_images(plan):
        base.paste(im, (int(CW / 2 - im.width / 2), int(cy - im.height / 2)), im)
    return base


def source_image(text: str, plan: dict):
    """출처 문구 그림. 크기·불투명도는 설정(layout.source_size, source_alpha)을 따른다."""
    L = plan["layout"]
    alpha = int(round(255 * max(10, min(100, float(plan.get("source_alpha") or 84))) / 100))
    return text_image(text, util.font(L["source_size"], False, plan.get("font_regular")), (235, 235, 235), alpha=alpha)


def people_images(base_dir) -> dict:
    """사용자가 넣은 언급 인물 사진 {이름: 파일}. input/<편>/인물_<이름>.jpg (이름이 대사에 나오면 그 사진을 띄운다)."""
    base_dir = Path(base_dir)
    if not base_dir.is_dir():
        return {}
    out = {}
    for p in sorted(base_dir.iterdir()):
        if p.suffix.lower() in util.IMAGE_EXT and p.stem.startswith(PEOPLE_PREFIX) and p.stem[len(PEOPLE_PREFIX):].strip():
            out[p.stem[len(PEOPLE_PREFIX):].strip()] = p
    return out


def people_hits(plan: dict, people: dict) -> list[tuple]:
    """언급 인물이 나오는 자막 [(구간 순번, 자막 순번, 이름)]. 한 컷에서 한 사람은 처음 나올 때 한 번만."""
    hits = []
    for i, seg in enumerate(plan.get("timeline") or []):
        seen = set()
        for k, sb in enumerate(seg.get("subs") or []):
            flat = re.sub(r"\s+", "", str(sb.get("text", "")))
            for name in people:
                if name not in seen and re.sub(r"\s+", "", name) in flat:
                    seen.add(name)
                    hits.append((i, k, name))
    return hits


def pip_image(path, size: int = 300):
    """언급 인물 사진을 흰 테두리의 동그란 그림으로(세로 사진은 위쪽, 가로 사진은 가운데를 쓴다)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    side = min(im.size)
    x0 = (im.width - side) // 2
    y0 = 0 if im.height > im.width else (im.height - side) // 2
    ring, big = 8, 4                      # 가장자리를 매끄럽게 하려고 4배로 그렸다가 줄인다
    face = im.crop((x0, y0, x0 + side, y0 + side)).resize((size - 2 * ring, size - 2 * ring), Image.LANCZOS)
    mask = Image.new("L", (size * big, size * big), 0)
    ImageDraw.Draw(mask).ellipse([ring * big, ring * big, (size - ring) * big - 1, (size - ring) * big - 1], fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    disc = Image.new("L", (size * big, size * big), 0)
    ImageDraw.Draw(disc).ellipse([0, 0, size * big - 1, size * big - 1], fill=255)
    disc = disc.resize((size, size), Image.LANCZOS)
    pad = 14
    out = Image.new("RGBA", (size + 2 * pad, size + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 150), (pad, pad + 4), disc)
    out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(7)))
    out.paste((255, 255, 255, 255), (pad, pad), disc)
    photo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    photo.paste(face, (ring, ring))
    out.paste(photo, (pad, pad), mask)
    return out


def pip_center(plan: dict, im) -> tuple[int, int]:
    """언급 인물 사진의 가운데 좌표: 영상 아래쪽 모서리, 자막 바로 위."""
    L = plan["layout"]
    cy = int(L["sub_y"] - 70 - im.height / 2)
    cx = int(14 + im.width / 2) if (plan.get("pip_pos") or "left") != "right" else int(CW - 14 - im.width / 2)
    return cx, cy


def sub_color(plan: dict, n: int = 0):
    """n번째 강조에 쓸 색."""
    return SUB_COLORS[n % len(SUB_COLORS)] if plan.get("sub_colors", "cycle") == "cycle" else YELLOW


def is_emph(sub: dict) -> bool:
    """이 자막 덩이에 강조(덩이 전체 em 또는 강조 낱말 key)가 있는지."""
    return bool(sub.get("em")) or bool(str(sub.get("key") or "").strip())


def emph_index(plan: dict, seg_i: int, sub_i: int) -> int:
    """timeline 의 이 자막 앞에 강조가 몇 번 나왔는지(강조 색을 번갈아 쓰는 순번). 미리보기와 렌더링이 같은 색을 쓰게 한다."""
    n = 0
    for i, seg in enumerate(plan.get("timeline") or []):
        subs = seg.get("subs") or ([{"em": seg.get("em")}] if seg.get("type") == "tts" else [])
        for k, sb in enumerate(subs):
            if (i, k) >= (seg_i, sub_i):
                return n
            n += 1 if is_emph(sb) else 0
    return n


def rich_image(words: list[tuple], stroke_w: int, max_w: int, line_gap: int = 8):
    """낱말마다 글자체·색이 다른 가운데 정렬 글자 이미지. words: [(글자, 글자체, 색, 굵게 픽셀), …]. 밑줄(기준선)을 맞춘다."""
    from PIL import Image, ImageDraw
    edge = stroke_w + max((bd for *_, bd in words), default=0)
    lines, cur, cur_w = [], [], 0.0
    for text, fnt, fill, bd in words:
        w = fnt.getlength(text)
        gap = fnt.getlength(" ") * 0.9 if cur else 0.0
        if cur and cur_w + gap + w > max_w - 2 * edge:
            lines.append(cur)
            cur, cur_w, gap = [], 0.0, 0.0
        cur.append((text, fnt, fill, bd, cur_w + gap, w))
        cur_w += gap + w
    if cur:
        lines.append(cur)
    sizes = [(max(it[4] + it[5] for it in ln), max(it[1].getmetrics()[0] for it in ln), max(it[1].getmetrics()[1] for it in ln))
             for ln in lines] or [(0, 0, 0)]
    W = int(max(w for w, _, _ in sizes)) + 2 * edge + 8
    H = int(sum(a + d + line_gap for _, a, d in sizes)) + 2 * edge
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for layer in ("stroke", "fill"):        # 테두리를 모두 먼저 그려 옆 낱말의 글자를 덮지 않게
        y = edge
        for ln, (lw, asc, desc) in zip(lines, sizes):
            x0 = (W - lw) / 2
            for text, fnt, fill, bd, x, _ in ln:
                xy = (x0 + x, y + asc - fnt.getmetrics()[0])
                if layer == "stroke" and stroke_w:
                    d.text(xy, text, font=fnt, fill=BLACK + (255,), stroke_width=stroke_w + bd, stroke_fill=BLACK + (255,))
                elif layer == "fill":
                    d.text(xy, text, font=fnt, fill=tuple(fill) + (255,), stroke_width=bd, stroke_fill=tuple(fill) + (255,))
            y += asc + desc + line_gap
    return im


def sub_image(text: str, em: bool, plan: dict, key: str = "", n: int = 0):
    """자막 한 덩이 이미지(흰색·검은 테두리).

    변화 주기(sub_vary)가 켜져 있으면 강조 덩이(em)는 통째로, 강조 낱말(key)은 그 낱말만 크게·색 있게·강조 글자체로 그린다.
    n 은 강조 순번(색을 번갈아 쓴다). 꺼져 있으면 예전처럼 강조 덩이만 노란색."""
    size = plan["layout"]["sub_size"]
    base = util.font(size, True, plan.get("font_sub") or plan.get("font_bold"))
    bd = bold_px(base.size, bool(plan.get("sub_bold")))
    keys = set(str(key or "").split())
    if not plan.get("sub_vary") or not (em or keys):
        return text_image(text, base, YELLOW if em else WHITE, stroke_w=6, max_w=CW - 60, bold=bd)
    big = max(size, int(round(size * float(plan.get("em_scale") or 125) / 100)))
    emf = util.font(big, True, plan.get("font_em") or plan.get("font_sub") or plan.get("font_bold"))
    ebd = bold_px(emf.size, bool(plan.get("sub_bold")))
    color = sub_color(plan, n)
    words = [(w, emf, color, ebd) if (em or any(k in w for k in keys)) else (w, base, WHITE, bd)
             for w in text.split()]      # 강조 낱말이 든 어절을 통째로 강조한다
    return rich_image(words, 6, CW - 60)


def src_list(src) -> list[Path]:
    """원본 영상 경로를 목록으로(하나만 줘도, 둘을 줘도 된다)."""
    return [Path(p) for p in src] if isinstance(src, (list, tuple)) else [Path(src)]


def seg_src(seg: dict, n: int) -> int:
    """그 장면이 몇 번째 원본 영상인지(0 또는 1)."""
    return min(max(int(seg.get("src", 0) or 0), 0), n - 1)


def crop_of(plan: dict, meta: dict, k: int = 0) -> tuple[int, int]:
    """(한 변, y0). 지정이 없으면 높이의 7/9(1080p → 840), 위쪽부터. k 는 원본 영상 번호(둘째 영상은 crop_b)."""
    from pipeline.sheets import default_crop_size
    c = plan.get("crop_b" if k else "crop") or {}
    size = int(c.get("size") or default_crop_size(meta))
    size = min(size, meta["width"], meta["height"]) // 2 * 2
    y0 = int(c.get("y0") or 0)
    return size, max(0, min(y0, meta["height"] - size))


# ------------------------------------------------------------------ 글자 그리기
def wrap_text(text: str, fnt, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if fnt.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    out = []
    for ln in lines:  # 띄어쓰기 없이 긴 줄은 글자 단위로 자른다
        while fnt.getlength(ln) > max_w and len(ln) > 1:
            k = len(ln)
            while k > 1 and fnt.getlength(ln[:k]) > max_w:
                k -= 1
            out.append(ln[:k])
            ln = ln[k:]
        out.append(ln)
    return out


def bold_px(size: int, on: bool) -> int:
    """'굵게'를 켰을 때 글자를 두껍게 할 픽셀 수(글자 크기에 비례)."""
    return max(1, round(size * 0.02)) if on else 0   # 더 두껍게 하면 획이 많은 글자가 뭉개진다


def text_image(text: str, fnt, fill, stroke_w: int = 0, max_w: int = CW - 80, line_gap: int = 8, alpha: int = 255,
               bold: int = 0):
    """가운데 정렬 글자 이미지(RGBA). bold 는 글자를 더 두껍게 할 픽셀 수(어떤 글자체에도 쓸 수 있다)."""
    from PIL import Image, ImageDraw
    edge = stroke_w + bold
    lines = wrap_text(text, fnt, max_w - 2 * edge) or [""]
    asc, desc = fnt.getmetrics()
    lh = asc + desc + line_gap
    w = int(max(fnt.getlength(ln) for ln in lines)) + 2 * edge + 8
    h = lh * len(lines) + 2 * edge
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, ln in enumerate(lines):
        xy = ((w - fnt.getlength(ln)) / 2, edge + i * lh)
        if stroke_w:      # 바깥 검은 테두리
            d.text(xy, ln, font=fnt, fill=BLACK + (alpha,), stroke_width=edge, stroke_fill=BLACK + (alpha,))
        d.text(xy, ln, font=fnt, fill=fill + (alpha,), stroke_width=bold, stroke_fill=fill + (alpha,))
    return im


def fit_font(text: str, size: int, max_w: int, bold=True, explicit=None, min_size: int = 60):
    while size > min_size and util.font(size, bold, explicit).getlength(text) > max_w:
        size -= 4
    return util.font(size, bold, explicit)


def _mosaic(d, box, seed: int, block: int, palette):
    rng = random.Random(seed)
    x0, y0, x1, y1 = box
    for y in range(y0, y1, block):
        for x in range(x0, x1, block):
            c = palette[rng.randrange(len(palette))]
            d.rectangle([x, y, min(x + block, x1) - 1, min(y + block, y1) - 1], fill=c)


def _thumb_icon(d, x, y, s, color, down=False):
    """엄지 아이콘(선 그림). s: 크기."""
    pts = [(0.30, 0.42), (0.52, 0.05), (0.66, 0.10), (0.60, 0.38), (0.95, 0.38), (0.98, 0.52),
           (0.86, 0.95), (0.30, 0.95)]
    cuff = [(0.02, 0.42), (0.22, 0.42), (0.22, 0.95), (0.02, 0.95)]
    if down:
        pts = [(px, 1 - py) for px, py in pts]
        cuff = [(px, 1 - py) for px, py in cuff]
    d.line([(x + px * s, y + py * s) for px, py in pts + pts[:1]], fill=color, width=3, joint="curve")
    d.line([(x + px * s, y + py * s) for px, py in cuff + cuff[:1]], fill=color, width=3, joint="curve")


def _heart(d, cx, cy, s, color):
    r = s * 0.27
    d.ellipse([cx - 2 * r, cy - r * 1.5, cx, cy + r * 0.5], fill=color)
    d.ellipse([cx, cy - r * 1.5, cx + 2 * r, cy + r * 0.5], fill=color)
    d.polygon([(cx - 1.93 * r, cy - 0.05 * r), (cx + 1.93 * r, cy - 0.05 * r), (cx, cy + 2.0 * r)], fill=color)


def card_image(card: dict, plan: dict, dropped: list, base_dir: Path):
    """유튜브 댓글창 모양 카드(RGBA). 프로필 사진과 이름은 모자이크."""
    from PIL import Image, ImageDraw, ImageFilter
    width = int(card.get("width", 960))
    if card.get("image"):
        # 실제 캡처 이미지를 쓰는 경우: mosaic 에 준 사각형들을 모자이크한다
        im = Image.open(Path(base_dir) / card["image"]).convert("RGBA")
        sx = width / im.width
        im = im.resize((width, int(im.height * sx)), Image.LANCZOS)
        for x, y, w, h in card.get("mosaic", []):     # 프로필 사진과 핸들 자리만 알아볼 수 없게 흐린다
            box = (max(0, int(x * sx)), max(0, int(y * sx)), min(im.width, int((x + w) * sx)), min(im.height, int((y + h) * sx)))
            if box[2] - box[0] < 2 or box[3] - box[1] < 2:
                continue
            reg = im.crop(box)
            # 먼저 아주 작게 줄였다 키워 글자 모양을 없앤 뒤 부드럽게 흐린다(흐리기만 하면 큰 글자는 읽힐 수 있다)
            small = reg.resize((max(1, reg.width // 12), max(1, reg.height // 12)), Image.BILINEAR)
            reg = small.resize(reg.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(max(4, reg.height // 6)))
            im.paste(reg, box)
        return im
    raw = str(card.get("text", ""))
    text = EMOJI.sub("", raw)
    text = re.sub(r"[ \t]+", " ", text).strip()
    if text != raw.strip():
        gone = "".join(sorted(set(EMOJI.findall(raw))))
        if gone:
            dropped.append(gone)
    fr = util.font(38, False, plan.get("font_regular"))
    fs = util.font(28, False, plan.get("font_regular"))
    pad, ax = 30, 124
    lines = []
    for para in text.split("\n"):
        lines += wrap_text(para, fr, width - ax - pad) or [""]
    lh = 54
    h = pad + 46 + lh * len(lines) + 62 + pad - 8
    S = 2  # 2배로 그려 줄여서 가장자리를 매끄럽게
    im = Image.new("RGBA", (width * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, width * S - 1, h * S - 1], radius=30 * S, fill=(255, 255, 255, 244))
    im = im.resize((width, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    seed = int(hashlib.md5(raw.encode("utf-8")).hexdigest()[:8], 16)
    # 프로필 사진(모자이크한 원)
    av = Image.new("RGBA", (76, 76), (0, 0, 0, 0))
    _mosaic(ImageDraw.Draw(av), (0, 0, 76, 76), seed, 13,
            [(214, 180, 160), (190, 150, 130), (120, 110, 120), (230, 210, 200), (90, 80, 90), (170, 190, 210)])
    mask = Image.new("L", (76 * 4, 76 * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 76 * 4 - 1, 76 * 4 - 1], fill=255)
    im.paste(av, (pad, pad), mask.resize((76, 76), Image.LANCZOS))
    # 이름(모자이크한 막대)
    name_w = 150 + seed % 90
    _mosaic(d, (ax, pad + 2, ax + name_w, pad + 30), seed + 1, 10,
            [(60, 60, 60), (110, 110, 110), (150, 150, 150), (200, 200, 200), (85, 85, 85)])
    y = pad + 46
    for ln in lines:
        d.text((ax, y), ln, font=fr, fill=(15, 15, 15, 255))
        y += lh
    y += 12
    gray = (96, 96, 96, 255)
    _thumb_icon(d, ax, y, 32, gray)
    likes = str(card.get("likes", "") or "")
    d.text((ax + 44, y - 4), likes, font=fs, fill=gray)
    x = ax + 44 + int(fs.getlength(likes)) + 34
    _thumb_icon(d, x, y + 2, 32, gray, down=True)
    if card.get("heart"):
        _heart(d, x + 86, y + 14, 34, (255, 48, 64, 255))
    # 옅은 그림자
    sh = Image.new("RGBA", (width + 40, h + 40), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([20, 24, width + 19, h + 23], radius=30, fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    sh.alpha_composite(im, (20, 20))
    return sh


# ------------------------------------------------------------------ 효과음(합성)
def synth_sfx(kind: str) -> np.ndarray:
    def env_exp(n, tau):
        return np.exp(-np.arange(n) / (tau * SR))

    if kind == "whoosh":   # 컷 전환 휙
        n = int(0.26 * SR)
        rng = random.Random(7)
        noise = np.array([rng.gauss(0.0, 1.0) for _ in range(n)], dtype=np.float32)
        y = np.zeros(n, np.float32)
        acc = 0.0
        for i in range(n):  # 차단 주파수가 올라가는 저역통과
            a = 0.02 + 0.35 * (i / n) ** 2
            acc += a * (noise[i] - acc)
            y[i] = acc
        y *= np.sin(np.pi * np.arange(n) / n) ** 2
        y = 0.5 * y / (np.abs(y).max() + 1e-9)
    elif kind == "pop":    # 팁 시작 팝
        n = int(0.10 * SR)
        t = np.arange(n) / SR
        f = 950 * np.exp(-t * 22) + 260
        y = 0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.025)
    elif kind == "ding":   # 핵심 멘트 딩
        n = int(0.7 * SR)
        t = np.arange(n) / SR
        y = (np.sin(2 * np.pi * 1568 * t) + 0.4 * np.sin(2 * np.pi * 3136 * t) + 0.15 * np.sin(2 * np.pi * 4704 * t))
        y = 0.32 * y * env_exp(n, 0.16)
    elif kind == "sparkle":  # 제품 공개 반짝
        n = int(0.75 * SR)
        y = np.zeros(n, np.float32)
        for k, f in enumerate([2093, 2637, 3136, 4186, 5274]):
            s = int(k * 0.07 * SR)
            m = n - s
            t = np.arange(m) / SR
            y[s:] += 0.2 * np.sin(2 * np.pi * f * t) * env_exp(m, 0.09)
    else:
        raise ValueError(f"모르는 효과음: {kind} (whoosh / pop / ding / sparkle)")
    y = y.astype(np.float32)
    y[:48] *= np.linspace(0, 1, 48)
    return np.stack([y, y], axis=1)


# ------------------------------------------------------------------ 오디오
def trim_silence(x: np.ndarray, thresh_db: float = -42.0, keep: float = 0.03) -> np.ndarray:
    """앞뒤 무음을 자른다."""
    if len(x) == 0:
        return x
    win = int(0.01 * SR)
    mono = np.abs(x).max(axis=1)
    n = len(mono) // win
    if n == 0:
        return x
    lv = mono[: n * win].reshape(n, win).max(axis=1)
    th = max(10 ** (thresh_db / 20), lv.max() * 0.02)
    idx = np.nonzero(lv > th)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] * win - int(keep * SR))
    b = min(len(x), (idx[-1] + 1) * win + int(keep * SR))
    return x[a:b]


def active_rms(x: np.ndarray) -> float:
    """말이 있는 부분만의 RMS."""
    win = int(0.05 * SR)
    mono = x.mean(axis=1)
    n = len(mono) // win
    if n == 0:
        return 1e-4
    e = np.sqrt((mono[: n * win].reshape(n, win) ** 2).mean(axis=1))
    act = e[e > max(1e-4, e.max() * 0.1)]
    return float(np.sqrt((act ** 2).mean())) if len(act) else 1e-4


def fit_len(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) >= n:
        y = x[:n].copy()
    else:
        y = np.concatenate([x, np.zeros((n - len(x), x.shape[1]), np.float32)])
    k = min(int(0.008 * SR), n // 2)
    if k > 0:  # 컷 경계에서 딱 소리가 나지 않게 아주 짧은 페이드
        ramp = np.linspace(0, 1, k, dtype=np.float32)[:, None]
        y[:k] *= ramp
        y[-k:] *= ramp[::-1]
    return y


def separate_vocals(pieces: list[np.ndarray], uvr_model) -> list[np.ndarray]:
    """44.1kHz 스테레오 조각들에서 배경음악을 뺀 목소리만 돌려준다(한 번에 처리)."""
    import sherpa_onnx as so
    cfg = so.OfflineSourceSeparationConfig(model=so.OfflineSourceSeparationModelConfig(
        uvr=so.OfflineSourceSeparationUvrModelConfig(model=str(util.model_path("uvr", uvr_model))),
        num_threads=4))
    sep = so.OfflineSourceSeparation(cfg)
    gap = np.zeros((int(0.2 * 44100), 2), np.float32)
    joined, spans, pos = [], [], 0
    for p in pieces:
        spans.append((pos, pos + len(p)))
        joined += [p, gap]
        pos += len(p) + len(gap)
    x = np.concatenate(joined)
    out = sep.process(44100, np.ascontiguousarray(x.T))
    voc = np.array(out.stems[0].data, dtype=np.float32).T
    if len(voc) < len(x):
        voc = np.concatenate([voc, np.zeros((len(x) - len(voc), 2), np.float32)])
    return [voc[a:b] for a, b in spans]


def add_music(voice: np.ndarray, music_path: Path, volume: float = 0.15) -> np.ndarray:
    """목소리만 있는 소리(voice) 밑에 음악을 깐다. 길이에 맞춰 반복·자르고 앞뒤를 부드럽게 한다.
    volume: 목소리 크기를 1로 봤을 때 음악의 크기(0.15 = 15%)."""
    m = trim_silence(util.read_audio(music_path), keep=0.0)
    n = len(voice)
    if len(m) < SR // 2:
        return voice
    if len(m) < n:
        m = np.tile(m, (n // len(m) + 1, 1))
    m = m[:n].copy()
    m *= (10 ** (-20 / 20) / active_rms(m)) * max(0.0, min(volume, 1.0))   # 목소리 기준(-20dBFS)에 맞춘 뒤 비율 적용
    fi, fo = min(int(0.3 * SR), n // 4), min(int(0.8 * SR), n // 4)
    m[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    m[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
    return voice + m


def loudnorm_filter(wav: Path, target: float = -14.0) -> tuple[str, float]:
    """2단계 loudnorm: 먼저 재고(measure) 그 값으로 선형 보정한다."""
    r = subprocess.run([util.ffmpeg_bin(), "-hide_banner", "-nostats", "-i", str(wav), "-af",
                        f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True)
    txt = r.stderr.decode("utf-8", "replace")
    m = json.loads(txt[txt.rindex("{"): txt.rindex("}") + 1])
    f = (f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
         f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}"
         f":linear=true")
    return f, float(m["input_i"])


# ------------------------------------------------------------------ 영상 프레임
def _rect(r) -> tuple[int, int, int, int]:
    if isinstance(r, dict):
        return int(r["x"]), int(r["y"]), int(r["w"]), int(r["h"])
    x, y, w, h = r
    return int(x), int(y), int(w), int(h)


def seg_filters(seg: dict, size: int, y0: int, plan: dict, meta: dict | None = None) -> list[str]:
    """한 구간의 영상 필터: 원본 글씨 지우기 → 1:1 크롭 → 거울반전(구간별로 끌 수 있다) → 크기 → 색보정.

    글씨 지우기(erase)는 원본 좌표의 사각형 [x, y, w, h] 를 주변 화소로 메운다(작고 단순한 배경일 때만 깔끔하다).
    구간에 "mirror": false 를 주면 그 구간만 거울반전을 하지 않는다(읽히는 글씨가 화면에 남을 때)."""
    vf = []
    W, H = (meta or {}).get("width"), (meta or {}).get("height")
    static = plan.get("erase_b" if int(seg.get("src", 0) or 0) else "erase") or []
    for r in list(static) + list(seg.get("erase") or []):
        x, y, w, h = _rect(r)
        if W and H:      # delogo 는 화면 가장자리에 닿으면 안 된다
            x, y = max(1, min(x, W - 3)), max(1, min(y, H - 3))
            w, h = max(1, min(w, W - 1 - x)), max(1, min(h, H - 1 - y))
        if w > 1 and h > 1:
            vf.append(f"delogo=x={x}:y={y}:w={w}:h={h}")
    vf.append(f"crop={size}:{size}:{int(seg.get('x0', 0))}:{y0}")
    if seg.get("mirror", plan["mirror"]):
        vf.append("hflip")
    vf.append("scale=1080:1080:flags=lanczos")
    if plan["color_filter"]:
        vf.append(plan["color_filter"])
    return vf


def cut_frames(src, seg: dict, size, y0, plan, n, meta=None):
    """컷 하나를 1080×1080 RGB 프레임 n장으로."""
    a, b = float(seg["a"]), float(seg["b"])
    vf = seg_filters(seg, size, y0, plan, meta) + [f"setpts=(PTS-STARTPTS)/{plan['speed']}", f"fps={FPS}"]
    cmd = [util.ffmpeg_bin(), "-v", "error", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(src),
           "-an", "-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size_b, last, got = 1080 * 1080 * 3, None, 0
    while got < n:
        buf = p.stdout.read(size_b)
        if len(buf) < size_b:
            break
        last = np.frombuffer(buf, np.uint8).reshape(1080, 1080, 3)
        got += 1
        yield last
    p.stdout.close()
    p.kill()
    p.wait()
    if last is None:
        raise RuntimeError(f"컷 {a:.2f}~{b:.2f}초에서 프레임을 읽지 못했습니다.")
    while got < n:
        got += 1
        yield last


def still_image(seg, src, size, y0, plan, base_dir: Path, meta=None):
    """TTS 구간에 깔 1080×1080 이미지: 사용자가 준 이미지 또는 원본의 정지 화면."""
    from PIL import Image, ImageOps
    if seg.get("image"):
        im = Image.open(base_dir / seg["image"]).convert("RGB")
        return ImageOps.fit(im, (1080, 1080), Image.LANCZOS, centering=(0.5, 0.35))
    return util.grab_frame(src, float(seg["still_t"]), ",".join(seg_filters(seg, size, y0, plan, meta)))


def thumb_seg(plan: dict) -> dict:
    """썸네일로 쓸 정지 화면 설정. 그 시각이 들어 있는 컷의 거울반전·지우기 설정을 따른다."""
    tl = plan.get("timeline") or []
    first = next((s for s in tl if s.get("type") == "cut"), None)
    th = plan.get("thumbnail") or {}
    t = float(th.get("t", (first["a"] + min(0.3, (first["b"] - first["a"]) / 2)) if first else 0.0))
    host = next((s for s in tl if s.get("type") == "cut" and float(s["a"]) - 0.05 <= t <= float(s["b"]) + 0.05), first) or {}
    seg = {"still_t": t, "x0": th.get("x0", host.get("x0", 0))}
    k_src = int(th.get("src", 0) or 0)
    if k_src:
        seg["src"] = k_src
        host = next((s for s in tl if s.get("type") == "cut" and int(s.get("src", 0) or 0) == k_src
                     and float(s["a"]) - 0.05 <= t <= float(s["b"]) + 0.05), {})
    elif int(host.get("src", 0) or 0):
        host = {}
    for k in ("mirror", "erase"):
        if k in th or k in host:
            seg[k] = th.get(k, host.get(k))
    return seg


def still_frames(im, n, zoom):
    from PIL import Image
    if not zoom:
        arr = np.asarray(im)
        for _ in range(n):
            yield arr
        return
    for i in range(n):  # 아주 느린 확대(정지 화면이 멈춘 것처럼 보이지 않게)
        s = 1.0 + zoom * (i / max(1, n - 1))
        w = 1080 / s
        off = (1080 - w) / 2
        yield np.asarray(im.transform((1080, 1080), Image.AFFINE, (1 / s, 0, off, 0, 1 / s, off), Image.BICUBIC))


class Overlay:
    """화면에 얹는 그림 하나(자막·출처·댓글 상자). anim 으로 등장 움직임을 준다:
    None(없음) · [크기 비율, …](톡 튀어나오기) · [(아래로 밀린 픽셀, 불투명도), …](아래에서 올라오기)."""

    def __init__(self, im, cx, cy, f0, f1, fade_in=2, fade_out=0, top_left=None, anim=None):
        self.f0, self.f1, self.fi, self.fo = f0, f1, fade_in, fade_out
        self.base = self._layer(im, cx, cy, top_left)
        self.first = []            # 등장 첫 프레임들에 쓸 (그림, 불투명도 배율)
        for step in anim or []:
            if isinstance(step, (tuple, list)):      # 아래에서 올라오기
                dy, k = step
                self.first.append((self._layer(im, cx, cy + dy, top_left and (top_left[0], top_left[1] + dy)), k))
            else:                                    # 크기 변화(가운데를 기준으로)
                w, h = max(2, round(im.width * step)), max(2, round(im.height * step))
                c = (cx, cy) if not top_left else (top_left[0] + im.width / 2, top_left[1] + im.height / 2)
                self.first.append((self._layer(im.resize((w, h)), c[0], c[1], None, clamp=False), 1.0))

    @staticmethod
    def _layer(im, cx, cy, top_left, clamp=True):
        arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
        h, w = arr.shape[:2]
        x, y = top_left if top_left else (int(cx - w / 2), int(cy - h / 2))
        if clamp:
            x, y = max(0, min(x, CW - w)), max(0, min(y, CH - h))
        # 캔버스 밖으로 나가는 부분은 잘라 둔다
        sx, sy = max(0, -x), max(0, -y)
        ex, ey = min(w, CW - x), min(h, CH - y)
        arr = arr[sy:ey, sx:ex]
        return {"rgb": arr[..., :3], "a": arr[..., 3:4] / 255.0, "x": x + sx, "y": y + sy,
                "w": arr.shape[1], "h": arr.shape[0]}

    @property
    def x(self):
        return self.base["x"]

    @property
    def y(self):
        return self.base["y"]

    @property
    def w(self):
        return self.base["w"]

    @property
    def h(self):
        return self.base["h"]

    def blend(self, frame, f):
        k = 1.0
        if self.fi:
            k = min(k, (f - self.f0 + 1) / self.fi)
        if self.fo:
            k = min(k, (self.f1 - f) / self.fo)
        ly, n = self.base, f - self.f0
        if 0 <= n < len(self.first):
            ly, mul = self.first[n]
            k = min(1.0, max(k, 0.0) * mul) if self.fi else mul
        if ly["w"] <= 0 or ly["h"] <= 0:
            return
        a = ly["a"] * max(0.0, min(1.0, k))
        reg = frame[ly["y"]:ly["y"] + ly["h"], ly["x"]:ly["x"] + ly["w"]]
        reg[:] = (reg * (1 - a) + ly["rgb"] * a + 0.5).astype(np.uint8)


def sub_anim(plan: dict, emph: bool = False):
    """자막 등장 움직임 설정을 Overlay 의 anim 값으로."""
    kind = plan.get("sub_anim") or "none"
    return (POP_EM if emph else POP) if kind == "pop" else RISE if kind == "rise" else None


def split_tts_text(text: str) -> list[str]:
    """TTS 문구를 화면 자막 한두 덩이로 나눈다."""
    words = text.split()
    if len(text.replace(" ", "")) <= 9 or len(words) < 2:
        return [text]
    best, k = None, 1
    for i in range(1, len(words)):
        d = abs(len("".join(words[:i])) - len("".join(words[i:])))
        if best is None or d < best:
            best, k = d, i
    return [" ".join(words[:k]), " ".join(words[k:])]


STRIP_X, STRIP_W = 20, 1040   # 영상 아래 댓글 상자의 왼쪽 x 와 너비(화면 폭에 가깝게)


def card_box(plan: dict) -> tuple[int, int]:
    """댓글 상자의 (위쪽 y, 높이). 영상 바로 아래 검은 띠에 붙는다 — 영상 속 인물·제품·자막을 가리지 않는다."""
    L = plan["layout"]
    top = int(L["card_y"]) if L.get("card_y") else int(L["video_y"] + 1080 + L.get("card_gap", 4))
    return top, max(90, int(L.get("card_h") or 146))


def card_seconds(text: str, ratio: float = 0.85) -> float:
    """댓글 카드를 보여 줄 시간(초): 영상을 보면서 그 댓글을 읽는 데 드는 시간보다 살짝 짧게.
    (알아차리는 데 1초 + 글자당 0.16초) × ratio, 1.8~5초 사이. 다 못 읽고 다시 보게 하려는 뜻이다."""
    n = len(re.sub(r"\s+", "", EMOJI.sub("", str(text))))
    return round(max(1.8, min(5.0, (1.0 + 0.16 * n) * ratio)), 2)


def fit_card_text(text: str, room_w: int, room_h: int, explicit=None, max_size: int = 44):
    """댓글을 상자 안에 가장 큰 글씨로 맞춘다(필요하면 줄을 나눈다).
    돌려주는 값: (글꼴, 줄들, 줄 높이, 잘렸는지). 가장 작은 글씨로도 안 들어갈 때만 끝을 … 로 줄인다."""
    for size in range(max_size, 19, -2):
        f = util.font(size, False, explicit)
        lines = wrap_text(text, f, room_w)
        lh = size + 10
        if lh * len(lines) <= room_h and all(f.getlength(ln) <= room_w for ln in lines):
            return f, lines, lh, False
    f = util.font(20, False, explicit)
    lines = wrap_text(text, f, room_w)[: max(1, room_h // 28)]
    while lines and f.getlength(lines[-1] + "…") > room_w and len(lines[-1]) > 1:
        lines[-1] = lines[-1][:-1]
    lines[-1] += "…"
    return f, lines, 28, True


def _reply_icon(d, x, y, s, color):
    """답글(말풍선) 아이콘 — 선 그림."""
    d.rounded_rectangle([x, y + s * 0.08, x + s, y + s * 0.74], radius=s * 0.14, outline=color, width=3)
    d.line([(x + s * 0.22, y + s * 0.74), (x + s * 0.22, y + s * 0.98), (x + s * 0.48, y + s * 0.74)], fill=color, width=3)


def card_strip_image(card: dict, plan: dict, dropped: list):
    """영상 바로 아래에 붙는 댓글 상자(RGBA) — 실제 댓글을 캡처하지 못했을 때 대신 그린다.
    사용자가 준 참고 화면 모양: 흰 띠 안에 모자이크한 프로필, 그 옆 윗줄에 모자이크한 아이디(와 작성 시기), 아랫줄에 댓글."""
    from PIL import Image, ImageDraw
    width, h = STRIP_W, card_box(plan)[1]
    raw = str(card.get("text", ""))
    text = re.sub(r"\s+", " ", EMOJI.sub("", raw)).strip()
    gone = "".join(sorted(set(EMOJI.findall(raw))))
    if gone:
        dropped.append(gone)
    reg = plan.get("font_regular")
    ink, gray = (15, 15, 15, 255), (96, 96, 96, 255)
    ax, top = 128, 58
    fr, lines, lh, cut = fit_card_text(text, width - ax - 28, h - top - 12, reg)
    if cut:
        dropped.append("(댓글이 길어 끝을 줄임)")
    im = Image.new("RGBA", (width, h), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    seed = int(hashlib.md5(raw.encode("utf-8")).hexdigest()[:8], 16)
    av = Image.new("RGBA", (84, 84), (0, 0, 0, 0))
    _mosaic(ImageDraw.Draw(av), (0, 0, 84, 84), seed, 14,
            [(214, 180, 160), (190, 150, 130), (120, 110, 120), (230, 210, 200), (90, 80, 90), (170, 190, 210)])
    mask = Image.new("L", (84 * 4, 84 * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 84 * 4 - 1, 84 * 4 - 1], fill=255)
    from PIL import ImageFilter
    av = av.filter(ImageFilter.GaussianBlur(7))
    im.paste(av, (24, (h - 84) // 2), mask.resize((84, 84), Image.LANCZOS))
    name_w = 170 + seed % 90
    nm = Image.new("RGB", (name_w, 24), (255, 255, 255))
    _mosaic(ImageDraw.Draw(nm), (0, 0, name_w, 24), seed + 1, 12,
            [(60, 60, 60), (110, 110, 110), (150, 150, 150), (200, 200, 200), (85, 85, 85)])
    im.paste(nm.filter(ImageFilter.GaussianBlur(5)), (ax, 22))
    if card.get("when"):
        d.text((ax + name_w + 12, 17), card["when"], font=util.font(26, False, reg), fill=gray)
    y = top + max(0, (h - top - 12 - lh * len(lines)) // 2)
    for i, ln in enumerate(lines):
        d.text((ax, y + i * lh), ln, font=fr, fill=ink)
    return im


def card_capture_image(card: dict, plan: dict, base_dir: Path):
    """실제 유튜브 댓글 캡처를 그대로 쓴다. 다시 그리지 않고, 상자(너비·높이) 안에 들어가게 비율대로 줄이기만 한다.
    프로필 사진과 아이디 자리(mosaic)만 모자이크한다."""
    from PIL import Image
    h = int(plan["layout"].get("card_max_h") or 230)
    src = card_image({**card, "width": STRIP_W}, plan, [], base_dir)
    if src.height > h:
        k = h / src.height
        src = src.resize((max(1, int(src.width * k)), h), Image.LANCZOS)
    return src


def place_card(card: dict, plan: dict, dropped: list, base_dir: Path):
    """댓글 카드 (이미지, x, y). 영상 바로 아래 검은 띠의 고정된 자리(영상 속 인물·제품·자막을 가리지 않는다).
    카드에 "on_video": true 를 주거나 pos 를 숫자(y)로 줄 때만 예전처럼 영상 위에 놓는다."""
    L = plan["layout"]
    pos = card.get("pos", "below")

    def centered(im, y):
        return im, int(CW / 2 - im.width / 2), int(y)

    if isinstance(pos, (int, float)):
        return centered(card_image(card, plan, dropped, base_dir), pos)
    if not card.get("on_video"):     # 크기와 자리가 고정된 상자. 길어도 영상 위로 올리지 않는다
        im = card_capture_image(card, plan, base_dir) if card.get("image") else card_strip_image(card, plan, dropped)
        return im, STRIP_X, card_box(plan)[0]
    im = card_image(card, plan, dropped, base_dir)
    if pos == "bottom":
        return centered(im, L["sub_y"] - 70 - im.height)
    if pos == "mid":
        return centered(im, L["video_y"] + 540 - im.height // 2)
    return centered(im, L["video_y"] + 6)


def preview_frame(plan: dict, src, base_dir, scene: dict | None = None, show_card: bool = False,
                  meta: dict | None = None, cache: dict | None = None):
    """완성본의 한 장면을 실제 렌더링과 같은 그리기 코드로 그린다(1080×1920 이미지).

    scene: None/{"thumb": True} 는 썸네일, {"seg": 구간 순번, "sub": 자막 순번} 은 그 자막이 뜬 장면.
    src 가 없으면 영상 자리를 회색으로 채운다(글자체만 볼 때)."""
    from PIL import Image, ImageDraw
    L = plan["layout"]
    frame = title_base(plan)
    scene = scene or {"thumb": True}
    tl = plan.get("timeline") or []
    seg = tl[scene["seg"]] if "seg" in scene and 0 <= scene["seg"] < len(tl) else None
    sub = None
    if seg and seg.get("type") == "cut":
        subs = seg.get("subs") or []
        sub = subs[min(scene.get("sub", 0), len(subs) - 1)] if subs else None
        want = {**{k: seg[k] for k in ("mirror", "erase", "src") if k in seg},
                "still_t": float(sub["t"]) + 0.15 if sub else float(seg["a"]) + 0.2, "x0": seg.get("x0", 0)}
    elif seg:
        chunks = split_tts_text(seg.get("text", ""))
        sub = {"text": chunks[min(scene.get("sub", 0), len(chunks) - 1)], "em": seg.get("em", False)}
        want = seg
    else:
        want = thumb_seg(plan)
    vid = None
    if src:
        srcs = src_list(src)
        k = seg_src(want, len(srcs))
        metas = meta if isinstance(meta, list) else [meta] if meta else []
        meta = metas[k] if k < len(metas) and metas[k] else util.probe(srcs[k])
        src = srcs[k]
        size, y0 = crop_of(plan, meta, k)
        key = (str(src), want.get("image"), want.get("still_t"), want.get("x0"), size, y0,
               want.get("mirror", plan["mirror"]), json.dumps([plan.get("erase_b" if k else "erase"), want.get("erase")]),
               plan["color_filter"])
        vid = (cache or {}).get(key)
        if vid is None:
            vid = still_image(want, src, size, y0, plan, Path(base_dir), meta)
            if cache is not None:
                cache[key] = vid
    if vid is None:   # 영상 없이 글자체만 볼 때
        vid = Image.new("RGB", (1080, 1080), (96, 104, 116))
        d = ImageDraw.Draw(vid)
        d.ellipse([390, 240, 690, 540], fill=(150, 158, 170))
        d.rounded_rectangle([280, 600, 800, 1180], radius=160, fill=(150, 158, 170))
    frame.paste(vid, (0, L["video_y"]))
    out = frame.convert("RGBA")
    if seg is not None and sub and str(sub.get("text", "")).strip():
        im = sub_image(sub["text"], bool(sub.get("em")), plan, sub.get("key", ""),
                       emph_index(plan, scene["seg"], scene.get("sub", 0)))
        out.alpha_composite(im, (int(CW / 2 - im.width / 2), int(L["sub_y"] - im.height / 2)))
    txt = source_text_at(plan, scene["seg"] if seg is not None else None)
    if txt:
        im = source_image(txt, plan)
        out.alpha_composite(im, (int(CW / 2 - im.width / 2), int(L["source_y"] - im.height / 2)))
    if seg is not None and sub is not None and seg.get("type") == "cut":      # 이 자막에서 언급되는 인물 사진
        people = people_images(base_dir)
        for i_, k_, name in people_hits(plan, people):
            if (i_, k_) == (scene["seg"], min(scene.get("sub", 0), len(seg.get("subs") or [1]) - 1)):
                pim = pip_image(people[name])
                cx, cy = pip_center(plan, pim)
                out.alpha_composite(pim, (int(cx - pim.width / 2), int(cy - pim.height / 2)))
    cards = plan.get("cards") or []
    if show_card and cards and seg is not None:
        c = next((c for c in cards if int(c.get("seg", -1)) == scene.get("seg")), cards[0])
        im, x, y = place_card(c, plan, [], Path(base_dir))
        out.alpha_composite(im, (x, max(0, min(y, CH - im.height))))
    return out.convert("RGB")


# ------------------------------------------------------------------ 본체
def build(plan_path, src, out_dir, name, uvr_model=None, assets=None, no_uvr=False, only_thumbnail=False) -> dict:
    plan = load_plan(plan_path)
    srcs, out_dir = src_list(src), Path(out_dir)
    src = srcs[0]
    base_dir = Path(assets) if assets else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    metas = [util.probe(p) for p in srcs]
    crops = [crop_of(plan, m, k) for k, m in enumerate(metas)]
    size, y0 = crops[0]
    speed, L = float(plan["speed"]), plan["layout"]
    name = util.safe_name(name)

    # --- 상단 제목 + 바탕
    base = title_base(plan)
    title = (plan.get("title") or ["", ""])[:2]

    # --- 썸네일
    first_cut = next((s for s in plan["timeline"] if s["type"] == "cut"), None)
    if first_cut is None:
        util.die("plan에 컷이 하나도 없습니다.")
    thumb = base.copy()
    ts = thumb_seg(plan)
    kt = seg_src(ts, len(srcs))
    thumb.paste(still_image(ts, srcs[kt], crops[kt][0], crops[kt][1], plan, base_dir, metas[kt]), (0, L["video_y"]))
    thumb_path = out_dir / f"{name}_썸네일.jpg"
    thumb.save(thumb_path, quality=93)
    if only_thumbnail:
        return {"thumbnail": str(thumb_path)}

    # --- 구간별 길이(프레임 수) 정하기
    segs, f = [], 0
    for i, s in enumerate(plan["timeline"]):
        r = {"i": i, "type": s["type"], "f0": f}
        if s["type"] == "cut":
            k = seg_src(s, len(srcs))
            a, b = float(s["a"]), min(float(s["b"]), metas[k]["duration"])
            r.update(a=a, b=b, x0=int(s.get("x0", 0)), k=k, n=max(1, int(round((b - a) / speed * FPS))))
        elif s["type"] == "tts":
            ap = base_dir / s.get("audio", "")
            if not s.get("audio") or not ap.exists():
                util.die(f"TTS 음성 파일이 없습니다: {ap} (문구: {s.get('text', '')})")
            wav = trim_silence(util.read_audio(ap))
            r.update(wav=wav, text=s.get("text", ""), n=int(np.ceil((len(wav) / SR + 0.12) * FPS)),
                     speech=len(wav) / SR)
        else:
            util.die(f"timeline[{i}].type 은 cut 또는 tts 여야 합니다: {s['type']}")
        f += r["n"]
        r["f1"] = f
        segs.append(r)
    total_f = f
    spf = SR // FPS

    # --- 오디오 조립
    cuts = [r for r in segs if r["type"] == "cut"]
    mix_o = np.zeros((total_f * spf, 2), np.float32)
    mix_x = np.zeros_like(mix_o)
    has_audio = all(m["has_audio"] for m in metas)
    for r in cuts:
        r["au"] = util.read_audio(srcs[r["k"]], a=r["a"], b=r["b"], af=f"atempo={speed}") if metas[r["k"]]["has_audio"] \
            else np.zeros((1, 2), np.float32)
    if no_uvr or not has_audio:
        util.log("[주의] 배경음 제거를 건너뜁니다. 배경음X 파일은 배경음O와 같은 소리입니다.")
        for r in cuts:
            r["vo"] = r["au"]
    else:
        padd = 0.4
        raws, spans = [], []
        for r in cuts:
            a0 = max(0.0, r["a"] - padd)
            raws.append(util.read_audio(srcs[r["k"]], sr=44100, a=a0, b=min(metas[r["k"]]["duration"], r["b"] + padd)))
            spans.append((int(round((r["a"] - a0) * 44100)), int(round((r["b"] - a0) * 44100))))
        util.log(f"[배경음 제거] {sum(len(x) for x in raws) / 44100:.1f}초 분량 처리 중…")
        for r, v, (i0, i1) in zip(cuts, separate_vocals(raws, uvr_model), spans):
            r["vo"] = util.filter_audio(v[i0:i1], 44100, f"atempo={speed}")
    # 목소리를 -20dBFS 근처로. 원본 영상이 둘이면 영상마다 따로 맞춰 두 영상의 목소리 크기가 같게 한다
    gains = {}
    for k in sorted({r["k"] for r in cuts}):
        ref = np.concatenate([r["vo"] for r in cuts if r["k"] == k])
        gains[k] = min(10 ** (-20 / 20) / active_rms(ref), 8.0)
    for r in cuts:
        i0, n = r["f0"] * spf, r["n"] * spf
        mix_o[i0:i0 + n] += fit_len(r["au"], n) * gains[r["k"]]
        mix_x[i0:i0 + n] += fit_len(r["vo"], n) * gains[r["k"]]
    tts_report = []
    for r in segs:
        if r["type"] != "tts":
            continue
        i0, n = r["f0"] * spf, r["n"] * spf
        # TTS 구간에는 원본 소리를 넣지 않는다(완전히 끔)
        w = fit_len(r["wav"] * (10 ** (-19 / 20) / active_rms(r["wav"])), n)
        mix_o[i0:i0 + n] += w
        mix_x[i0:i0 + n] += w
        tts_report.append({"seg": r["i"], "start": r["f0"] / FPS, "end": r["f1"] / FPS, "text": r["text"],
                           "source_audio": "muted"})

    # --- 자막·카드·효과음 배치
    overlays, subs_out, sfx_out, dropped = [], [], [], []

    def add_sfx(kind, t):
        # 컷 전환 '휙' 소리는 쓰지 않는다(거슬린다는 피드백). 이전에 만든 plan 에 남아 있어도 넣지 않는다
        if kind and kind not in (plan.get("sfx_off") or ["whoosh"]):
            sfx_out.append({"type": kind, "t": round(t, 3)})

    emph_n = 0          # 지금까지 나온 강조 수(강조 색을 번갈아 쓴다)
    people = people_images(base_dir)
    pip_at, people_out = {}, []
    for i_, k_, who in people_hits(plan, people):      # (name 은 출력 파일 이름이라 다른 이름을 쓴다)
        pip_at.setdefault((i_, k_), []).append(who)
    for r in segs:
        s = plan["timeline"][r["i"]]
        seg_t0, seg_t1 = r["f0"] / FPS, r["f1"] / FPS
        add_sfx(s.get("sfx"), seg_t0)
        items = []
        if r["type"] == "cut":
            for sb in s.get("subs", []):
                t = seg_t0 + max(0.0, float(sb["t"]) - r["a"]) / speed
                if t < seg_t1 - 1 / FPS:
                    items.append((t, sb))
        else:
            given = s.get("subs")
            if given:
                items = [(seg_t0 + float(sb.get("t", 0)), sb) for sb in given]
            else:
                chunks = split_tts_text(r["text"])
                tot, acc = sum(len(c.replace(" ", "")) for c in chunks) or 1, 0
                for c in chunks:
                    items.append((seg_t0 + r["speech"] * acc / tot, {"text": c, "em": s.get("em", False)}))
                    acc += len(c.replace(" ", ""))
        for k, (t, sb) in enumerate(items):
            t_end = items[k + 1][0] if k + 1 < len(items) else seg_t1
            f0, f1 = int(round(t * FPS)), int(round(t_end * FPS))
            if f1 <= f0 or not str(sb.get("text", "")).strip():
                continue
            if r["type"] == "cut" and sb in (s.get("subs") or []):
                for who in pip_at.get((r["i"], s["subs"].index(sb)), []):      # 이 자막에서 언급되는 인물 사진
                    pim = pip_image(people[who])
                    cx, cy = pip_center(plan, pim)
                    p1 = min(total_f, max(f0 + int(1.6 * FPS), min(f0 + int(2.6 * FPS), r["f1"])))
                    overlays.append(Overlay(pim, cx, cy, f0, p1, fade_in=0, fade_out=4, anim=POP_EM))
                    people_out.append({"name": who, "seg": r["i"], "start": round(f0 / FPS, 3), "end": round(p1 / FPS, 3)})
            emph = is_emph(sb)
            im = sub_image(sb["text"], bool(sb.get("em")), plan, sb.get("key", ""), emph_n)
            emph_n += 1 if emph else 0
            anim = sub_anim(plan, emph)
            overlays.append(Overlay(im, CW / 2, L["sub_y"], f0, f1, fade_in=0 if anim else 2, anim=anim))
            subs_out.append({"seg": r["i"], "start": round(f0 / FPS, 3), "end": round(f1 / FPS, 3),
                             "text": sb["text"], "kind": r["type"]})
            add_sfx(sb.get("sfx"), f0 / FPS)
        # 출처 문구: 그 구간에 나오는 영상의 출처만(사용자가 준 이미지를 쓰는 구간은 받은 곳을 따로 표기)
        txt = source_text_at(plan, r["i"])
        if txt:
            im = source_image(txt, plan)
            overlays.append(Overlay(im, CW / 2, L["source_y"], r["f0"], r["f1"], fade_in=0))

    cards_out, card_ovs = [], []
    for c in plan.get("cards", []):
        si = int(c.get("seg", 0))
        if not 0 <= si < len(segs):
            util.die(f"cards의 seg={si} 가 timeline 범위를 벗어났습니다.")
        t0 = segs[si]["f0"] / FPS + float(c.get("offset", 0.1))
        # 표시 시간은 댓글 길이로 정한다(읽기에 살짝 모자라게). "dur_fixed": true 인 카드만 plan 의 dur 를 쓴다
        secs = float(c["dur"]) if c.get("dur_fixed") and c.get("dur") else \
            card_seconds(c.get("text", ""), float(plan.get("card_read") or 0.85)) if c.get("text") else 3.0
        t1 = min(t0 + secs, total_f / FPS)
        im, x, y = place_card(c, plan, dropped, base_dir)
        f0, f1 = int(round(t0 * FPS)), int(round(t1 * FPS))
        ov = Overlay(im, 0, 0, f0, f1, fade_in=4, fade_out=4, top_left=(x, y))
        overlays.append(ov)
        card_ovs.append(ov)
        cards_out.append({"seg": si, "start": round(f0 / FPS, 3), "end": round(f1 / FPS, 3),
                          "y": y, "height": im.height, "text": c.get("text", "")})
    order = sorted(range(len(card_ovs)), key=lambda k: card_ovs[k].f0)
    for a_, b_ in zip(order, order[1:]):     # 두 카드가 같은 시간에 뜨면 앞 카드를 일찍 내린다
        if card_ovs[a_].f1 > card_ovs[b_].f0 - 3:
            card_ovs[a_].f1 = max(card_ovs[a_].f0 + 1, card_ovs[b_].f0 - 3)
            cards_out[a_]["end"] = round(card_ovs[a_].f1 / FPS, 3)

    sfx_files = plan.get("sfx_files") or {}
    for e in sfx_out:
        fpath = sfx_files.get(e["type"])
        y = trim_silence(util.read_audio(base_dir / fpath if not Path(fpath).is_absolute() else fpath)) * 0.6 \
            if fpath else synth_sfx(e["type"])
        i0 = int(e["t"] * SR)
        n = min(len(y), len(mix_o) - i0)
        if n > 0:
            mix_o[i0:i0 + n] += y[:n]
            mix_x[i0:i0 + n] += y[:n]

    # --- 영상 인코딩(영상은 한 번만 만들고 소리만 바꿔 두 번 합친다)
    tmp = Path(tempfile.mkdtemp(prefix="shorts_"))
    vid_tmp = tmp / "video.mp4"
    enc = subprocess.Popen(
        [util.ffmpeg_bin(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{CW}x{CH}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", str(vid_tmp)],
        stdin=subprocess.PIPE)
    base_arr = np.asarray(base)
    vy = L["video_y"]
    fidx = 0
    for r in segs:
        s = plan["timeline"][r["i"]]
        if r["type"] == "cut":
            k = r["k"]
            frames = cut_frames(srcs[k], {**s, "a": r["a"], "b": r["b"]}, crops[k][0], crops[k][1], plan, r["n"], metas[k])
        else:
            k = seg_src(s, len(srcs))
            frames = still_frames(still_image(s, srcs[k], crops[k][0], crops[k][1], plan, base_dir, metas[k]),
                                  r["n"], plan["still_zoom"])
        for fr in frames:
            frame = base_arr.copy()
            frame[vy:vy + 1080] = fr
            for ov in overlays:
                if ov.f0 <= fidx < ov.f1:
                    ov.blend(frame, fidx)
            enc.stdin.write(frame.tobytes())
            fidx += 1
        util.log(f"[영상] {r['i'] + 1}/{len(segs)} 구간 ({r['type']}) 완료")
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError("영상 인코딩 실패")

    mixes = [("배경음O", mix_o), ("배경음X", mix_x)]
    music_note = ""
    mfile = plan.get("music_file")
    if mfile:
        mp = Path(mfile) if Path(mfile).is_absolute() else base_dir / mfile
        if mp.exists():
            mixes.append(("음악", add_music(mix_x, mp, float(plan.get("music_volume") or 0.15))))
            music_note = mp.name
        else:
            util.log(f"[주의] 고른 음악 파일이 없어 음악 버전은 만들지 않습니다: {mp}")
    outs, loud = {}, {}
    for tag, mix in mixes:
        wav = tmp / f"{tag}.wav"
        util.write_wav(wav, mix * 0.5)
        af, measured = loudnorm_filter(wav)
        dst = out_dir / f"{name}_{tag}.mp4"
        util.run([util.ffmpeg_bin(), "-v", "error", "-y", "-i", vid_tmp, "-i", wav, "-map", "0:v", "-map", "1:a",
                  "-c:v", "copy", "-af", af + ",alimiter=limit=0.84:level=false", "-ar", SR, "-c:a", "aac",
                  "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total_f / FPS:.3f}", dst])
        outs[tag], loud[tag] = dst.name, measured
    for p in tmp.iterdir():
        p.unlink()
    tmp.rmdir()

    resolved = {
        "name": name, "duration": round(total_f / FPS, 3), "fps": FPS, "speed": speed,
        "source": str(src), "sources": [str(p) for p in srcs], "crop": {"size": size, "y0": y0}, "title": title,
        "segments": [{"i": r["i"], "type": r["type"], "start": round(r["f0"] / FPS, 3),
                      "end": round(r["f1"] / FPS, 3),
                      **({"a": r["a"], "b": r["b"], "x0": r["x0"], "src": r["k"],
                          "mirror": bool(plan["timeline"][r["i"]].get("mirror", plan["mirror"]))}
                         if r["type"] == "cut" else {"text": r["text"]})}
                     for r in segs],
        "subs": subs_out, "cards": cards_out, "sfx": sfx_out, "tts": tts_report, "people": people_out,
        "dropped_emoji": dropped, "bgm_removed": not (no_uvr or not has_audio), "music": music_note,
        "outputs": {**outs, "thumbnail": thumb_path.name},   # out_dir 안의 파일 이름
    }
    util.write_json(out_dir / "_plan_resolved.json", resolved)
    util.log(f"[완료] {resolved['duration']}초 · {out_dir}")
    return resolved


def main():
    ap = argparse.ArgumentParser(description="쇼핑 쇼츠 렌더링")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--src", required=True, nargs="+", help="원본 영상(둘을 섞을 때는 두 개를 순서대로)")
    ap.add_argument("--out", required=True, help="출력 폴더")
    ap.add_argument("--name", required=True, help="제품명(파일 이름 앞부분)")
    ap.add_argument("--uvr-model", help="배경음 제거 모델(.onnx). 없으면 models/에 내려받는다")
    ap.add_argument("--assets", help="tts1.mp3 · 이미지가 있는 폴더(기본: 원본 영상 폴더)")
    ap.add_argument("--no-uvr", action="store_true", help="배경음 제거를 건너뛴다(빠른 확인용)")
    ap.add_argument("--only-thumbnail", action="store_true")
    a = ap.parse_args()
    build(a.plan, a.src if len(a.src) > 1 else a.src[0], a.out, a.name, a.uvr_model, a.assets, a.no_uvr, a.only_thumbnail)


if __name__ == "__main__":
    main()
