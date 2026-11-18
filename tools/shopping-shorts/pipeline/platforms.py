"""앱 안에서 보일 때의 화면 요소(버튼·글자)를 완성본 위에 덧그린다 — 무엇이 가려지는지 보는 용도.

실제 앱 화면을 그대로 옮긴 것은 아니고, 버튼과 글자가 놓이는 자리를 비슷하게 흉내 낸 것이다.
기기와 앱 버전에 따라 조금씩 다르다.
"""
from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402

W, H = 1080, 1920
PLATFORMS = {"shorts": "YouTube Shorts", "tiktok": "TikTok", "reels": "Instagram 릴스"}
WHITE = (255, 255, 255, 240)


def _shade(im, top: float, bottom: float):
    """위·아래를 앱처럼 살짝 어둡게."""
    from PIL import Image
    g = Image.new("L", (1, H), 0)
    for y in range(H):
        a = 0
        if y < top * H:
            a = int(110 * (1 - y / (top * H)))
        elif y > (1 - bottom) * H:
            a = int(170 * ((y - (1 - bottom) * H) / (bottom * H)))
        g.putpixel((0, y), a)
    black = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    black.putalpha(g.resize((W, H)))
    im.alpha_composite(black)


def _txt(d, xy, text, size, bold=True, fill=WHITE, anchor="la"):
    f = util.font(size, bold)
    d.text((xy[0] + 2, xy[1] + 2), text, font=f, fill=(0, 0, 0, 150), anchor=anchor)
    d.text(xy, text, font=f, fill=fill, anchor=anchor)


def _heart(d, cx, cy, s, fill=WHITE):
    r = s * 0.27
    d.ellipse([cx - 2 * r, cy - r * 1.5, cx, cy + r * 0.5], fill=fill)
    d.ellipse([cx, cy - r * 1.5, cx + 2 * r, cy + r * 0.5], fill=fill)
    d.polygon([(cx - 1.93 * r, cy - 0.05 * r), (cx + 1.93 * r, cy - 0.05 * r), (cx, cy + 2.0 * r)], fill=fill)


def _thumb(d, cx, cy, s, down=False, fill=WHITE):
    pts = [(0.30, 0.42), (0.52, 0.05), (0.66, 0.10), (0.60, 0.38), (0.95, 0.38), (0.98, 0.52), (0.86, 0.95), (0.30, 0.95)]
    cuff = [(0.02, 0.42), (0.22, 0.42), (0.22, 0.95), (0.02, 0.95)]
    if down:
        pts, cuff = [(x, 1 - y) for x, y in pts], [(x, 1 - y) for x, y in cuff]
    x0, y0 = cx - s / 2, cy - s / 2
    d.polygon([(x0 + x * s, y0 + y * s) for x, y in pts], fill=fill)
    d.polygon([(x0 + x * s, y0 + y * s) for x, y in cuff], fill=fill)


def _bubble(d, cx, cy, s, fill=WHITE):
    d.rounded_rectangle([cx - s / 2, cy - s * 0.42, cx + s / 2, cy + s * 0.28], radius=s * 0.16, fill=fill)
    d.polygon([(cx - s * 0.2, cy + s * 0.26), (cx - s * 0.02, cy + s * 0.26), (cx - s * 0.26, cy + s * 0.5)], fill=fill)


def _share(d, cx, cy, s, fill=WHITE):
    d.polygon([(cx + s * 0.5, cy - s * 0.05), (cx, cy - s * 0.48), (cx, cy - s * 0.22), (cx - s * 0.5, cy - s * 0.1),
               (cx - s * 0.5, cy + s * 0.42), (cx - s * 0.18, cy + s * 0.08), (cx, cy + s * 0.1), (cx, cy + s * 0.36)],
              fill=fill)


def _bookmark(d, cx, cy, s, fill=WHITE):
    d.polygon([(cx - s * 0.32, cy - s * 0.45), (cx + s * 0.32, cy - s * 0.45), (cx + s * 0.32, cy + s * 0.48),
               (cx, cy + s * 0.22), (cx - s * 0.32, cy + s * 0.48)], fill=fill)


def _plane(d, cx, cy, s, fill=WHITE):
    d.polygon([(cx - s * 0.5, cy - s * 0.38), (cx + s * 0.5, cy - s * 0.42), (cx - s * 0.02, cy + s * 0.48),
               (cx - s * 0.06, cy + s * 0.04)], fill=fill)


def _remix(d, cx, cy, s, fill=WHITE):
    d.arc([cx - s * 0.42, cy - s * 0.42, cx + s * 0.42, cy + s * 0.42], 30, 330, fill=fill, width=max(4, int(s * 0.12)))
    d.polygon([(cx + s * 0.2, cy - s * 0.5), (cx + s * 0.55, cy - s * 0.2), (cx + s * 0.12, cy - s * 0.08)], fill=fill)


def _dots(d, cx, cy, s, fill=WHITE, vertical=True):
    for k in (-1, 0, 1):
        x, y = (cx, cy + k * s * 0.32) if vertical else (cx + k * s * 0.32, cy)
        d.ellipse([x - s * 0.09, y - s * 0.09, x + s * 0.09, y + s * 0.09], fill=fill)


def _search(d, cx, cy, s, fill=WHITE):
    w = max(4, int(s * 0.12))
    d.ellipse([cx - s * 0.42, cy - s * 0.42, cx + s * 0.18, cy + s * 0.18], outline=fill, width=w)
    d.line([(cx + s * 0.1, cy + s * 0.1), (cx + s * 0.45, cy + s * 0.45)], fill=fill, width=w)


def _disc(d, cx, cy, s):
    d.ellipse([cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2], fill=(40, 40, 40, 235), outline=WHITE, width=4)
    d.ellipse([cx - s * 0.16, cy - s * 0.16, cx + s * 0.16, cy + s * 0.16], fill=(190, 190, 190, 255))


def _avatar(d, cx, cy, s, plus=False):
    d.ellipse([cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2], fill=(170, 170, 170, 255), outline=WHITE, width=4)
    d.ellipse([cx - s * 0.17, cy - s * 0.26, cx + s * 0.17, cy + s * 0.08], fill=(95, 95, 95, 255))
    d.pieslice([cx - s * 0.34, cy + s * 0.1, cx + s * 0.34, cy + s * 0.74], 180, 360, fill=(95, 95, 95, 255))
    if plus:
        d.ellipse([cx - 22, cy + s / 2 - 22, cx + 22, cy + s / 2 + 22], fill=(254, 44, 85, 255))
        _txt(d, (cx, cy + s / 2 - 1), "+", 34, True, anchor="mm")


def _column(d, x, items, size=64, label=28):
    """오른쪽 버튼 줄. items: [(y비율, 그리는 함수, 숫자)]"""
    for fy, fn, cnt in items:
        fn(d, x, fy * H, size)
        if cnt:
            _txt(d, (x, fy * H + size * 0.62), cnt, label, True, anchor="ma")


def _status(d):
    _txt(d, (64, 62), "9:41", 34, True)
    d.rounded_rectangle([W - 122, 54, W - 62, 82], radius=8, outline=WHITE, width=3)
    d.rectangle([W - 118, 58, W - 76, 78], fill=WHITE)
    for i in range(4):
        d.rectangle([W - 212 + i * 14, 80 - 8 - i * 6, W - 204 + i * 14, 82], fill=WHITE)


def overlay(img, platform: str, channel: str = "내 채널", caption: str = "영상 설명이 여기에 표시됩니다 #쇼핑쇼츠"):
    """img(1080×1920)에 platform(shorts / tiktok / reels) 화면 요소를 덧그려 돌려준다."""
    from PIL import ImageDraw
    if platform not in PLATFORMS:
        return img
    im = img.convert("RGBA")
    _shade(im, 0.10, 0.24)
    d = ImageDraw.Draw(im, "RGBA")
    _status(d)
    x = W - 84
    if platform == "shorts":
        _search(d, W - 192, 276, 54)
        _dots(d, W - 62, 276, 56)
        _column(d, x, [(0.415, _thumb, "2.8M"), (0.522, lambda d, x, y, s: _thumb(d, x, y, s, down=True), "싫어요"),
                       (0.636, _bubble, "1,204"), (0.753, _share, "공유"), (0.864, _remix, "리믹스")])
        d.rounded_rectangle([W - 124, 0.948 * H, W - 44, 0.948 * H + 80], radius=12, fill=(70, 70, 70, 240),
                            outline=WHITE, width=3)
        # 쇼핑 쇼츠의 제품 태그 칩
        d.rounded_rectangle([36, 0.868 * H, 430, 0.868 * H + 74], radius=14, fill=(255, 255, 255, 235))
        d.rounded_rectangle([48, 0.868 * H + 10, 102, 0.868 * H + 64], radius=8, fill=(200, 200, 200, 255))
        d.text((118, 0.868 * H + 16), "제품 보기", font=util.font(32, True), fill=(20, 20, 20, 255))
        _avatar(d, 76, 0.938 * H, 72)
        _txt(d, (128, 0.938 * H), f"@{channel}", 34, True, anchor="lm")
        d.rounded_rectangle([420, 0.938 * H - 30, 546, 0.938 * H + 30], radius=30, fill=WHITE)
        d.text((483, 0.938 * H), "구독", font=util.font(28, True), fill=(20, 20, 20, 255), anchor="mm")
        _txt(d, (44, 0.975 * H), caption, 30, False, anchor="lm")
    elif platform == "tiktok":
        _txt(d, (W / 2 - 110, 150), "팔로잉", 38, False, (255, 255, 255, 170), anchor="mm")
        _txt(d, (W / 2 + 90, 150), "추천", 40, True, anchor="mm")
        d.line([(W / 2 + 60, 182), (W / 2 + 120, 182)], fill=WHITE, width=5)
        _search(d, W - 78, 150, 50)
        _avatar(d, x, 0.505 * H, 100, plus=True)
        _column(d, x, [(0.60, _heart, "328.5K"), (0.685, _bubble, "1,204"), (0.77, _bookmark, "9,812"),
                       (0.853, _share, "공유")], size=70)
        _disc(d, x, 0.922 * H, 92)
        _txt(d, (40, 0.846 * H), f"@{channel}", 36, True, anchor="lm")
        _txt(d, (40, 0.878 * H), caption, 30, False, anchor="lm")
        _txt(d, (40, 0.908 * H), "♪ 오리지널 사운드 - " + channel, 28, False, anchor="lm")
        d.rectangle([0, 0.938 * H, W, H], fill=(0, 0, 0, 255))
        for i, label in enumerate(["홈", "친구", "+", "받은함", "프로필"]):
            _txt(d, (W * (i + 0.5) / 5, 0.968 * H), label, 30 if label != "+" else 54, True, anchor="mm")
    else:  # reels
        _txt(d, (48, 150), "릴스", 46, True, anchor="lm")
        d.rounded_rectangle([W - 118, 122, W - 50, 178], radius=14, outline=WHITE, width=5)
        d.ellipse([W - 98, 136, W - 70, 164], outline=WHITE, width=5)
        _column(d, x, [(0.612, _heart, "32.8만"), (0.695, _bubble, "1,204"), (0.778, _plane, "공유")], size=68)
        _dots(d, x, 0.852 * H, 60, vertical=False)
        d.rounded_rectangle([x - 40, 0.905 * H - 40, x + 40, 0.905 * H + 40], radius=12, fill=(60, 60, 60, 240),
                            outline=WHITE, width=4)
        _avatar(d, 80, 0.855 * H, 76)
        _txt(d, (134, 0.855 * H), channel, 34, True, anchor="lm")
        d.rounded_rectangle([430, 0.855 * H - 30, 560, 0.855 * H + 30], radius=12, outline=WHITE, width=3)
        _txt(d, (495, 0.855 * H), "팔로우", 28, True, anchor="mm")
        _txt(d, (44, 0.893 * H), caption, 30, False, anchor="lm")
        _txt(d, (44, 0.922 * H), "♫ " + channel + " · 원본 오디오", 28, False, anchor="lm")
        d.rectangle([0, 0.942 * H, W, H], fill=(0, 0, 0, 255))
        for i in range(5):
            cx = W * (i + 0.5) / 5
            d.rounded_rectangle([cx - 26, 0.97 * H - 26, cx + 26, 0.97 * H + 26], radius=10, outline=WHITE, width=4)
    return im.convert("RGB")


if __name__ == "__main__":
    from PIL import Image
    src, out = sys.argv[1], Path(sys.argv[2])
    for key in PLATFORMS:
        overlay(Image.open(src).convert("RGB").resize((W, H)), key).save(out.with_name(f"{out.stem}_{key}.jpg"), quality=88)
        print(out.with_name(f"{out.stem}_{key}.jpg"))
