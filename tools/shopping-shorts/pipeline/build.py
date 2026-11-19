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

DEFAULTS = {
    "speed": 1.1,
    "mirror": True,
    "color_filter": "eq=contrast=1.06:saturation=1.15:brightness=0.015,unsharp=5:5:0.4",
    "still_zoom": 0.05,
    "layout": {
        "video_y": 420,        # 1:1 영상이 놓이는 세로 위치(1080×1080)
        "title_y": [205, 335],  # 상단 제목 두 줄의 가운데 y
        "title_size": 112,
        "sub_y": 1350,         # 자막 가운데 y
        "sub_size": 66,
        "source_y": 1528,      # 출처 문구 가운데 y
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
    for k, v in DEFAULTS.items():
        if isinstance(v, dict):
            plan[k] = {**v, **(plan.get(k) or {})}
        else:
            plan.setdefault(k, v)
    for key in ("title_size", "sub_size"):
        if st.get(key) and key not in own_layout:
            plan["layout"][key] = int(st[key])
    for key in ("font_title", "font_sub"):
        if st.get(key) and not plan.get(key):
            plan[key] = st[key]
    for key in ("title_bold", "sub_bold", "music_file", "music_volume"):
        if key in st and key not in plan:
            plan[key] = st[key]
    return plan


def load_plan(path) -> dict:
    return apply_defaults(json.loads(Path(path).read_text(encoding="utf-8")))


def title_base(plan: dict):
    """검은 9:16 바탕에 상단 제목 두 줄(윗줄 흰색, 아랫줄 노란색)을 그린 이미지."""
    from PIL import Image
    L = plan["layout"]
    ft = plan.get("font_title") or plan.get("font_bold")
    base = Image.new("RGB", (CW, CH), BLACK)
    title = (plan.get("title") or ["", ""])[:2]
    longest = max(title, key=lambda s: util.font(L["title_size"], True, ft).getlength(s)) if title else ""
    tf = fit_font(longest, L["title_size"], CW - 90, True, ft)
    for i, line in enumerate(title):
        im = text_image(line, tf, WHITE if i == 0 else YELLOW, stroke_w=6, max_w=CW + 40,
                        bold=bold_px(tf.size, bool(plan.get("title_bold"))))
        base.paste(im, (int(CW / 2 - im.width / 2), int(L["title_y"][i] - im.height / 2)), im)
    return base


def sub_image(text: str, em: bool, plan: dict):
    """자막 한 덩이 이미지(흰색·검은 테두리, 강조는 노란색)."""
    fnt = util.font(plan["layout"]["sub_size"], True, plan.get("font_sub") or plan.get("font_bold"))
    return text_image(text, fnt, YELLOW if em else WHITE, stroke_w=6, max_w=CW - 60,
                      bold=bold_px(fnt.size, bool(plan.get("sub_bold"))))


def crop_of(plan: dict, meta: dict) -> tuple[int, int]:
    """(한 변, y0). 지정이 없으면 높이의 7/9(1080p → 840), 위쪽부터."""
    from pipeline.sheets import default_crop_size
    c = plan.get("crop") or {}
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
        im = Image.open(base_dir / card["image"]).convert("RGBA")
        sx = width / im.width
        im = im.resize((width, int(im.height * sx)), Image.LANCZOS)
        for x, y, w, h in card.get("mosaic", []):
            box = tuple(int(v * sx) for v in (x, y, x + w, y + h))
            reg = im.crop(box)
            small = reg.resize((max(1, reg.width // 14), max(1, reg.height // 14)), Image.BILINEAR)
            im.paste(small.resize(reg.size, Image.NEAREST), box)
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
    for r in list(plan.get("erase") or []) + list(seg.get("erase") or []):
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
    def __init__(self, im, cx, cy, f0, f1, fade_in=2, fade_out=0, top_left=None):
        arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
        self.rgb = arr[..., :3]
        self.a = arr[..., 3:4] / 255.0
        h, w = arr.shape[:2]
        self.x, self.y = top_left if top_left else (int(cx - w / 2), int(cy - h / 2))
        self.x = max(0, min(self.x, CW - w))
        self.y = max(0, min(self.y, CH - h))
        self.w, self.h, self.f0, self.f1, self.fi, self.fo = w, h, f0, f1, fade_in, fade_out

    def blend(self, frame, f):
        k = 1.0
        if self.fi:
            k = min(k, (f - self.f0 + 1) / self.fi)
        if self.fo:
            k = min(k, (self.f1 - f) / self.fo)
        a = self.a * max(0.0, min(1.0, k))
        reg = frame[self.y:self.y + self.h, self.x:self.x + self.w]
        reg[:] = (reg * (1 - a) + self.rgb * a + 0.5).astype(np.uint8)


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


def card_y(card: dict, im, plan: dict) -> int:
    L = plan["layout"]
    pos = card.get("pos", "top")
    if isinstance(pos, (int, float)):
        return int(pos)
    if pos == "bottom":
        return L["sub_y"] - 70 - im.height
    if pos == "mid":
        return L["video_y"] + 540 - im.height // 2
    return L["video_y"] + 6


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
        want = {**{k: seg[k] for k in ("mirror", "erase") if k in seg},
                "still_t": float(sub["t"]) + 0.15 if sub else float(seg["a"]) + 0.2, "x0": seg.get("x0", 0)}
    elif seg:
        chunks = split_tts_text(seg.get("text", ""))
        sub = {"text": chunks[min(scene.get("sub", 0), len(chunks) - 1)], "em": seg.get("em", False)}
        want = seg
    else:
        want = thumb_seg(plan)
    vid = None
    if src:
        meta = meta or util.probe(src)
        size, y0 = crop_of(plan, meta)
        key = (str(src), want.get("image"), want.get("still_t"), want.get("x0"), size, y0,
               want.get("mirror", plan["mirror"]), json.dumps([plan.get("erase"), want.get("erase")]),
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
        im = sub_image(sub["text"], bool(sub.get("em")), plan)
        out.alpha_composite(im, (int(CW / 2 - im.width / 2), int(L["sub_y"] - im.height / 2)))
    txt = plan.get("source_text", "")
    if seg and seg.get("type") == "tts" and seg.get("image") and plan.get("image_source_text"):
        txt = plan["image_source_text"]
    if txt:
        im = text_image(txt, util.font(L["source_size"], False, plan.get("font_regular")), (235, 235, 235), alpha=215)
        out.alpha_composite(im, (int(CW / 2 - im.width / 2), int(L["source_y"] - im.height / 2)))
    cards = plan.get("cards") or []
    if show_card and cards and seg is not None:
        c = next((c for c in cards if int(c.get("seg", -1)) == scene.get("seg")), cards[0])
        im = card_image(c, plan, [], Path(base_dir))
        out.alpha_composite(im, (int(CW / 2 - im.width / 2), max(0, min(card_y(c, im, plan), CH - im.height))))
    return out.convert("RGB")


# ------------------------------------------------------------------ 본체
def build(plan_path, src, out_dir, name, uvr_model=None, assets=None, no_uvr=False, only_thumbnail=False) -> dict:
    plan = load_plan(plan_path)
    src, out_dir = Path(src), Path(out_dir)
    base_dir = Path(assets) if assets else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = util.probe(src)
    size, y0 = crop_of(plan, meta)
    speed, L = float(plan["speed"]), plan["layout"]
    fr_ = plan.get("font_regular")
    name = util.safe_name(name)

    # --- 상단 제목 + 바탕
    base = title_base(plan)
    title = (plan.get("title") or ["", ""])[:2]

    # --- 썸네일
    first_cut = next((s for s in plan["timeline"] if s["type"] == "cut"), None)
    if first_cut is None:
        util.die("plan에 컷이 하나도 없습니다.")
    thumb = base.copy()
    thumb.paste(still_image(thumb_seg(plan), src, size, y0, plan, base_dir, meta), (0, L["video_y"]))
    thumb_path = out_dir / f"{name}_썸네일.jpg"
    thumb.save(thumb_path, quality=93)
    if only_thumbnail:
        return {"thumbnail": str(thumb_path)}

    # --- 구간별 길이(프레임 수) 정하기
    segs, f = [], 0
    for i, s in enumerate(plan["timeline"]):
        r = {"i": i, "type": s["type"], "f0": f}
        if s["type"] == "cut":
            a, b = float(s["a"]), min(float(s["b"]), meta["duration"])
            r.update(a=a, b=b, x0=int(s.get("x0", 0)), n=max(1, int(round((b - a) / speed * FPS))))
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
    for r in cuts:
        r["au"] = util.read_audio(src, a=r["a"], b=r["b"], af=f"atempo={speed}") if meta["has_audio"] \
            else np.zeros((1, 2), np.float32)
    if no_uvr or not meta["has_audio"]:
        util.log("[주의] 배경음 제거를 건너뜁니다. 배경음X 파일은 배경음O와 같은 소리입니다.")
        for r in cuts:
            r["vo"] = r["au"]
    else:
        padd = 0.4
        raws, spans = [], []
        for r in cuts:
            a0 = max(0.0, r["a"] - padd)
            raws.append(util.read_audio(src, sr=44100, a=a0, b=min(meta["duration"], r["b"] + padd)))
            spans.append((int(round((r["a"] - a0) * 44100)), int(round((r["b"] - a0) * 44100))))
        util.log(f"[배경음 제거] {sum(len(x) for x in raws) / 44100:.1f}초 분량 처리 중…")
        for r, v, (i0, i1) in zip(cuts, separate_vocals(raws, uvr_model), spans):
            r["vo"] = util.filter_audio(v[i0:i1], 44100, f"atempo={speed}")
    ref = np.concatenate([r["vo"] for r in cuts])
    gain = min(10 ** (-20 / 20) / active_rms(ref), 8.0)   # 목소리를 -20dBFS 근처로
    for r in cuts:
        i0, n = r["f0"] * spf, r["n"] * spf
        mix_o[i0:i0 + n] += fit_len(r["au"], n) * gain
        mix_x[i0:i0 + n] += fit_len(r["vo"], n) * gain
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
    src_font = util.font(L["source_size"], False, fr_)

    def add_sfx(kind, t):
        if kind:
            sfx_out.append({"type": kind, "t": round(t, 3)})

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
            im = sub_image(sb["text"], bool(sb.get("em")), plan)
            overlays.append(Overlay(im, CW / 2, L["sub_y"], f0, f1, fade_in=2))
            subs_out.append({"seg": r["i"], "start": round(f0 / FPS, 3), "end": round(f1 / FPS, 3),
                             "text": sb["text"], "kind": r["type"]})
            add_sfx(sb.get("sfx"), f0 / FPS)
        # 출처 문구(사용자가 준 이미지를 쓰는 구간은 받은 곳을 따로 표기)
        txt = plan.get("source_text", "")
        if r["type"] == "tts" and s.get("image") and plan.get("image_source_text"):
            txt = plan["image_source_text"]
        if txt:
            im = text_image(txt, src_font, (235, 235, 235), stroke_w=0, alpha=215)
            overlays.append(Overlay(im, CW / 2, L["source_y"], r["f0"], r["f1"], fade_in=0))

    cards_out = []
    for c in plan.get("cards", []):
        si = int(c.get("seg", 0))
        if not 0 <= si < len(segs):
            util.die(f"cards의 seg={si} 가 timeline 범위를 벗어났습니다.")
        t0 = segs[si]["f0"] / FPS + float(c.get("offset", 0.1))
        t1 = min(t0 + float(c.get("dur", 2.5)), total_f / FPS)
        im = card_image(c, plan, dropped, base_dir)
        y = card_y(c, im, plan)
        f0, f1 = int(round(t0 * FPS)), int(round(t1 * FPS))
        overlays.append(Overlay(im, 0, 0, f0, f1, fade_in=4, fade_out=4, top_left=(int(CW / 2 - im.width / 2), y)))
        cards_out.append({"seg": si, "start": round(f0 / FPS, 3), "end": round(f1 / FPS, 3),
                          "y": y, "height": im.height, "text": c.get("text", "")})

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
            frames = cut_frames(src, {**s, "a": r["a"], "b": r["b"]}, size, y0, plan, r["n"], meta)
        else:
            frames = still_frames(still_image(s, src, size, y0, plan, base_dir, meta), r["n"], plan["still_zoom"])
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
        "source": str(src), "crop": {"size": size, "y0": y0}, "title": title,
        "segments": [{"i": r["i"], "type": r["type"], "start": round(r["f0"] / FPS, 3),
                      "end": round(r["f1"] / FPS, 3),
                      **({"a": r["a"], "b": r["b"], "x0": r["x0"],
                          "mirror": bool(plan["timeline"][r["i"]].get("mirror", plan["mirror"]))}
                         if r["type"] == "cut" else {"text": r["text"]})}
                     for r in segs],
        "subs": subs_out, "cards": cards_out, "sfx": sfx_out, "tts": tts_report,
        "dropped_emoji": dropped, "bgm_removed": not (no_uvr or not meta["has_audio"]), "music": music_note,
        "outputs": {**outs, "thumbnail": thumb_path.name},   # out_dir 안의 파일 이름
    }
    util.write_json(out_dir / "_plan_resolved.json", resolved)
    util.log(f"[완료] {resolved['duration']}초 · {out_dir}")
    return resolved


def main():
    ap = argparse.ArgumentParser(description="쇼핑 쇼츠 렌더링")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--src", required=True, help="원본 영상")
    ap.add_argument("--out", required=True, help="출력 폴더")
    ap.add_argument("--name", required=True, help="제품명(파일 이름 앞부분)")
    ap.add_argument("--uvr-model", help="배경음 제거 모델(.onnx). 없으면 models/에 내려받는다")
    ap.add_argument("--assets", help="tts1.mp3 · 이미지가 있는 폴더(기본: 원본 영상 폴더)")
    ap.add_argument("--no-uvr", action="store_true", help="배경음 제거를 건너뛴다(빠른 확인용)")
    ap.add_argument("--only-thumbnail", action="store_true")
    a = ap.parse_args()
    build(a.plan, a.src, a.out, a.name, a.uvr_model, a.assets, a.no_uvr, a.only_thumbnail)


if __name__ == "__main__":
    main()
