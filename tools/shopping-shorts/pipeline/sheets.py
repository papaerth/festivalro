"""프레임 시트: 일정 간격으로 프레임을 뽑아 한 장에 모은다(컷 경계·크롭 위치 확인용).

  python pipeline/sheets.py 원본.mp4 --a 120 --b 150 --step 0.5 --ruler --out work/편/zoom
  python pipeline/sheets.py 완성본.mp4 --step 1 --out output/편/_검수

--ruler 를 주면 원본 x좌표 눈금(세로선)과 1:1 크롭 아래 경계(가로선)를 그려 x0를 고르기 쉽게 한다.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402


def _frames(src, a, b, step, tw, th):
    """a~b 구간을 step 간격으로 (시각, PIL 이미지) 로 내놓는다."""
    from PIL import Image
    n = max(1, int(round((b - a) / step)))
    if step >= 2.0:
        # 드문드문 뽑을 때는 프레임마다 직접 찾아가는 편이 빠르다
        for i in range(n):
            t = a + i * step
            yield t, util.grab_frame(src, t, f"scale={tw}:{th}")
        return
    cmd = [util.ffmpeg_bin(), "-v", "error", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(src),
           "-vf", (f"select='isnan(prev_selected_t)+gt(floor(t/{step}),floor(prev_selected_t/{step}))',"
                   f"scale={tw}:{th}"), "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size, i = tw * th * 3, 0
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield a + i * step, Image.frombytes("RGB", (tw, th), buf)
        i += 1
    p.wait()


def make_sheets(src, out_prefix, a=0.0, b=None, step=0.5, cols=4, rows=3, thumb_w=480,
                ruler=False, crop_size=None, max_sheets=None) -> list[Path]:
    from PIL import Image, ImageDraw
    meta = util.probe(src)
    W, H = meta["width"], meta["height"]
    b = min(b if b is not None else meta["duration"], meta["duration"])
    if max_sheets:
        per = cols * rows
        while (b - a) / step > per * max_sheets:
            step *= 1.5
    tw = thumb_w - thumb_w % 2
    th = int(round(tw * H / W)) // 2 * 2
    label_h, per = 26, cols * rows
    f = util.font(20, bold=True)
    fs = util.font(13, bold=False)
    out, sheet, k = [], None, 0
    out_prefix = Path(out_prefix)
    out_prefix.parent.mkdir(parents=True, exist_ok=True)

    def flush():
        nonlocal sheet
        if sheet is not None:
            p = Path(f"{out_prefix}_{len(out) + 1:02d}.jpg")
            sheet.save(p, quality=85)
            out.append(p)
            sheet = None

    for t, im in _frames(src, a, b, step, tw, th):
        if k % per == 0:
            flush()
            sheet = Image.new("RGB", (cols * tw, rows * (th + label_h)), (18, 18, 18))
        if ruler:
            d = ImageDraw.Draw(im)
            sx = tw / W
            for x in range(0, W + 1, max(120, (W // 16) // 10 * 10)):
                major = x % 240 == 0
                d.line([(x * sx, 0), (x * sx, th)], fill=(0, 255, 255) if major else (0, 150, 150), width=1)
                if major:
                    d.text((x * sx + 2, 2), str(x), font=fs, fill=(255, 255, 0), stroke_width=2, stroke_fill=(0, 0, 0))
            if crop_size and crop_size < H:
                y = crop_size * th / H
                d.line([(0, y), (tw, y)], fill=(255, 60, 60), width=2)
        i = k % per
        x0, y0 = (i % cols) * tw, (i // cols) * (th + label_h)
        sheet.paste(im, (x0, y0 + label_h))
        ImageDraw.Draw(sheet).text((x0 + 6, y0 + 1), f"{t:.1f}s  ({int(t // 60)}:{t % 60:04.1f})",
                                   font=f, fill=(255, 255, 255))
        k += 1
    flush()
    return out


def main():
    ap = argparse.ArgumentParser(description="프레임 시트 만들기")
    ap.add_argument("src")
    ap.add_argument("--a", type=float, default=0.0)
    ap.add_argument("--b", type=float)
    ap.add_argument("--step", type=float, default=0.5)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--thumb", type=int, default=480)
    ap.add_argument("--ruler", action="store_true", help="x좌표 눈금과 크롭 아래 경계 표시")
    ap.add_argument("--crop-size", type=int, help="1:1 크롭 한 변(원본 픽셀). 기본은 높이의 7/9")
    ap.add_argument("--out", required=True, help="출력 경로 앞부분 (뒤에 _01.jpg … 가 붙는다)")
    args = ap.parse_args()
    cs = args.crop_size
    if args.ruler and not cs:
        cs = default_crop_size(util.probe(args.src))
    for p in make_sheets(args.src, args.out, args.a, args.b, args.step, args.cols, args.rows, args.thumb,
                         args.ruler, cs):
        print(p)


def default_crop_size(meta: dict) -> int:
    """1920×1080이면 840. 아래쪽에 박힌 자막을 피하려고 높이의 7/9만 쓴다."""
    return min(int(meta["height"] * 7 / 9) // 2 * 2, meta["width"] // 2 * 2)


if __name__ == "__main__":
    main()
