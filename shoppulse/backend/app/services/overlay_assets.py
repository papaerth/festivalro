"""영상 위에 띄우는 상품 사진·로고(팝업). 올린 이미지를 '누끼'(배경 제거)해 흰 테두리 스티커로 만든다.

배경 제거 방식(위에서부터 되는 것을 쓴다. 무엇을 썼는지 결과에 적는다):
 1) alpha  — 이미 배경이 투명한 PNG/WebP: 그대로 사용
 2) ai     — rembg 가 설치돼 있으면(선택) AI 로 배경 제거
 3) flood  — 배경이 흰색 등 단색이면 가장자리에서부터 같은 색만 지움(쇼핑몰 상품 사진에 잘 맞음)
 4) card   — 배경이 복잡하면 지우지 않고 둥근 흰 테두리 카드로 표시
"""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("shoppulse.overlay")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
KINDS = {"product": "상품 사진", "logo": "로고"}
METHOD_LABEL = {"alpha": "투명 배경 그대로 사용", "ai": "AI 로 배경 제거", "flood": "단색 배경 제거", "card": "배경이 복잡해 카드 모양으로 표시"}
_WORK = 900  # 처리용 최대 변 길이


def _border_pixels(img):
    w, h = img.size
    px = img.load()
    step = max(1, min(w, h) // 60)
    pts = [(x, y) for x in range(0, w, step) for y in (0, h - 1)] + [(x, y) for y in range(0, h, step) for x in (0, w - 1)]
    return pts, [px[p][:3] for p in pts]


def _flood_cutout(img):
    """가장자리 색이 거의 한 가지면 그 색과 이어진 영역만 투명하게. 실패하면 None."""
    from PIL import ImageDraw
    pts, cols = _border_pixels(img)
    med = tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))
    near = [p for p, c in zip(pts, cols) if sum(abs(c[i] - med[i]) for i in range(3)) <= 36]
    if len(near) < len(pts) * 0.85:  # 가장자리가 단색이 아니다
        return None
    out = img.copy()
    px = out.load()
    for p in near[:: max(1, len(near) // 40)]:
        if px[p][3] != 0:
            ImageDraw.floodfill(out, p, (med[0], med[1], med[2], 0), thresh=48)
    alpha = out.getchannel("A")
    removed = alpha.histogram()[0] / (out.width * out.height)
    if not 0.04 <= removed <= 0.93:  # 거의 안 지워졌거나 상품까지 다 지워졌다
        return None
    return out


def _sticker(img, stroke: int):
    """투명 배경 그림에 흰 테두리(스티커 느낌)."""
    from PIL import Image, ImageFilter
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    pad = stroke + 4
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    a = canvas.getchannel("A")
    grown = a.filter(ImageFilter.MaxFilter(stroke * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    white.putalpha(grown)
    white.alpha_composite(canvas)
    return white


def _card(img, stroke: int):
    from PIL import Image, ImageDraw
    r = max(12, min(img.size) // 12)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=r, fill=255)
    img = img.copy()
    img.putalpha(mask)
    canvas = Image.new("RGBA", (img.width + stroke * 2, img.height + stroke * 2), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle([0, 0, canvas.width - 1, canvas.height - 1], radius=r + stroke, fill=(255, 255, 255, 255))
    canvas.alpha_composite(img, (stroke, stroke))
    return canvas


def prepare_overlay(src: Path, out: Path, kind: str = "product") -> dict:
    """이미지를 팝업용 PNG 로 만든다. → {"method", "label", "width", "height"}"""
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGBA")
    img.thumbnail((_WORK, _WORK))
    alpha = img.getchannel("A")
    transparent = sum(alpha.histogram()[:200]) / (img.width * img.height)
    method, cut = "card", None
    if transparent > 0.03:
        method, cut = "alpha", img
    else:
        try:  # 선택: rembg 가 설치돼 있으면 AI 누끼
            from rembg import remove  # type: ignore
            cut = remove(img)
            method = "ai"
        except Exception:
            cut = _flood_cutout(img)
            method = "flood" if cut is not None else "card"
    stroke = 5 if kind == "logo" else 8
    res = _sticker(cut, stroke) if cut is not None else _card(img, stroke)
    out.parent.mkdir(parents=True, exist_ok=True)
    res.save(out, "PNG")
    return {"method": method, "label": METHOD_LABEL[method], "width": res.width, "height": res.height}
