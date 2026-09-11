"""노래방 스타일 프레임 렌더링과 ffmpeg 파이프 인코딩(투명 MOV)."""

import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

from .ffmpeg_utils import find_ffmpeg

ASPECTS = {
    "16:9": {"1080p": (1920, 1080), "720p": (1280, 720), "4k": (3840, 2160)},
    "9:16": {"1080p": (1080, 1920), "720p": (720, 1280), "4k": (2160, 3840)},
}
RESOLUTIONS = ["1080p", "720p", "4k"]

CODECS = {
    "prores4444": ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"],
    "qtrle": ["-c:v", "qtrle", "-pix_fmt", "argb"],
    "png": ["-c:v", "png", "-pix_fmt", "rgba"],
}

_FONT_CANDIDATES = [
    # Windows
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\NanumGothicBold.ttf",
    r"C:\Windows\Fonts\NanumGothic.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    # macOS
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/Library/Fonts/NanumGothicBold.ttf",
    # Linux
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def default_font_path():
    for p in _FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def hex_to_rgba(color, alpha=255):
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return (r, g, b, alpha)


@dataclass
class RenderStyle:
    font_path: str = None
    font_index: int = 0           # .ttc 안의 폰트 번호
    font_size: int = 0            # 0 = 화면 폭 기준 자동
    base_color: str = "#FFFFFF"   # 아직 부르지 않은 글자
    highlight_color: str = "#FFD400"  # 부른 글자(채워지는 색)
    outline_color: str = "#000000"
    outline_ratio: float = 0.08   # 외곽선 두께 = 글자 크기 × 비율
    bottom_margin_ratio: float = 0.10
    max_width_ratio: float = 0.90
    show_next: bool = True        # 다음 줄 미리보기
    next_scale: float = 0.7
    next_alpha: float = 0.8
    lead_in: float = 0.6
    tail: float = 1.0


class LineArt:
    """한 줄의 기본(미완) 이미지, 강조(완료) 이미지, 글자별 x 경계."""

    def __init__(self, line, font_path, size, style, width_limit, scale=1.0, alpha=1.0, highlight=True):
        text = line.text
        size = max(8, int(size * scale))
        font = ImageFont.truetype(font_path, size, index=style.font_index)
        stroke = max(1, int(size * style.outline_ratio))
        # 폭 제한을 넘으면 글자 크기를 줄인다
        w = font.getlength(text) + stroke * 2
        if w > width_limit:
            size = max(8, int(size * width_limit / w))
            font = ImageFont.truetype(font_path, size, index=style.font_index)
            stroke = max(1, int(size * style.outline_ratio))
        self.font_size = size

        dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        l, t, r, b = dummy.textbbox((0, 0), text, font=font, stroke_width=stroke)
        self.w, self.h = int(r - l) + 2, int(b - t) + 2
        ox, oy = -l + 1, -t + 1

        a = int(255 * alpha)
        self.base = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        ImageDraw.Draw(self.base).text(
            (ox, oy), text, font=font, fill=hex_to_rgba(style.base_color, a),
            stroke_width=stroke, stroke_fill=hex_to_rgba(style.outline_color, a),
        )
        self.hl = None
        if highlight:
            self.hl = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
            ImageDraw.Draw(self.hl).text(
                (ox, oy), text, font=font, fill=hex_to_rgba(style.highlight_color, a),
                stroke_width=stroke, stroke_fill=hex_to_rgba(style.outline_color, a),
            )

        # 단어별 글자 x 경계: [[(x0, x1), ...] per word]
        self.words = line.words
        self.char_x = []
        pos = 0
        for w in line.words:
            bounds = []
            for k in range(len(w.text)):
                x0 = ox + font.getlength(text[: pos + k])
                x1 = ox + font.getlength(text[: pos + k + 1])
                bounds.append((x0, x1))
            self.char_x.append(bounds)
            pos += len(w.text) + 1  # 공백 포함
        self.stroke = stroke
        self.ox = ox

    def sweep_x(self, t):
        """시각 t에서 강조색이 채워진 오른쪽 경계(픽셀). 글자 단위로 매끄럽게 진행."""
        if t < self.words[0].start:
            return 0
        if t >= self.words[-1].end:
            return self.w
        x = 0
        for w, bounds in zip(self.words, self.char_x):
            if not bounds:
                continue
            if t >= w.end:
                x = bounds[-1][1] + self.stroke
                continue
            if t < w.start:
                break
            frac = (t - w.start) / max(w.end - w.start, 1e-6)
            n = len(bounds)
            pos = frac * n
            k = min(int(pos), n - 1)
            sub = pos - k
            x0, x1 = bounds[k]
            return int(round(x0 + sub * (x1 - x0)))
        return int(round(x))


def _no_window_flags():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}


def render_video(lines, display_times, out_path, width, height, fps=30, style=None,
                 codec="prores4444", audio_path=None, audio_offset=0.0, duration=None,
                 log=print, progress=None):
    """lines(구간 기준 시각)와 표시 구간을 받아 투명 배경 MOV로 렌더링한다."""
    style = style or RenderStyle()
    font_path = style.font_path or default_font_path()
    if not font_path or not os.path.exists(font_path):
        raise RuntimeError("폰트 파일을 찾을 수 없습니다. 폰트(.ttf/.ttc)를 지정하세요.")
    ffmpeg = find_ffmpeg()
    if codec not in CODECS:
        raise ValueError(f"지원하지 않는 코덱: {codec}")

    if duration is None:
        duration = max((e for _, e in display_times), default=0.0)
    total_frames = max(1, int(round(duration * fps)))

    base_size = style.font_size or int(width * (0.052 if width >= height else 0.07))
    width_limit = width * style.max_width_ratio

    log(f"[렌더] {width}x{height} @ {fps}fps, {total_frames}프레임, 폰트 {os.path.basename(font_path)} {base_size}px")
    arts = [LineArt(ln, font_path, base_size, style, width_limit) for ln in lines]
    nexts = [
        LineArt(ln, font_path, base_size, style, width_limit, scale=style.next_scale,
                alpha=style.next_alpha, highlight=False)
        for ln in lines
    ] if style.show_next else [None] * len(lines)

    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0"]
    if audio_path:
        cmd += ["-ss", f"{audio_offset:.3f}", "-t", f"{duration:.3f}", "-i", audio_path]
    cmd += CODECS[codec]
    if audio_path:
        cmd += ["-map", "0:v", "-map", "1:a", "-c:a", "pcm_s16le", "-shortest"]
    cmd += ["-r", str(fps), out_path]

    err_file = tempfile.TemporaryFile()
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=err_file,
                            **_no_window_flags())

    blank = Image.new("RGBA", (width, height), (0, 0, 0, 0)).tobytes()
    bottom = height - int(height * style.bottom_margin_ratio)
    # last_key는 '아직 아무 프레임도 없음'을 뜻하는 고유 값으로 시작한다(None은 '빈 화면' 키로 쓰임).
    last_key, last_bytes = object(), blank
    active = 0
    try:
        for fi in range(total_frames):
            t = fi / fps
            # 현재 줄 찾기(표시 구간은 시간순)
            while active < len(lines) and t >= display_times[active][1]:
                active += 1
            cur = active if active < len(lines) and t >= display_times[active][0] else None
            if cur is None:
                if last_key is not None:
                    last_key, last_bytes = None, blank
                proc.stdin.write(last_bytes)
            else:
                art = arts[cur]
                sx = art.sweep_x(t)
                key = (cur, sx)
                if key != last_key:
                    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
                    x = (width - art.w) // 2
                    y = bottom - art.h
                    nx_art = nexts[cur + 1] if style.show_next and cur + 1 < len(lines) else None
                    if nx_art is not None:
                        frame.paste(nx_art.base, ((width - nx_art.w) // 2, y - nx_art.h - int(art.font_size * 0.25)))
                    frame.paste(art.base, (x, y))
                    if sx > 0:
                        frame.paste(art.hl.crop((0, 0, min(sx, art.w), art.h)), (x, y))
                    last_key, last_bytes = key, frame.tobytes()
                proc.stdin.write(last_bytes or blank)
            if progress and fi % 30 == 0:
                progress(fi / total_frames, f"렌더링 {fi}/{total_frames}")
        proc.stdin.close()
        proc.wait()
    except BrokenPipeError:
        proc.wait()
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
    if proc.returncode != 0:
        err_file.seek(0)
        msg = err_file.read().decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("ffmpeg 인코딩 실패: " + (msg[-1] if msg else f"코드 {proc.returncode}"))
    err_file.close()
    if progress:
        progress(1.0, "렌더링 완료")
    return out_path


PREVIEW_SIZES = {"16:9": (1920, 1080), "9:16": (1080, 1920)}


def render_preview_mp4(mov_path, out_path, aspect, fps=30, audio_path=None, audio_offset=0.0,
                       duration=None, bg_color="808080", log=print):
    """투명 MOV를 회색 배경 위에 합성한 1080p H.264 미리보기 mp4를 만든다(구간 오디오 포함)."""
    ffmpeg = find_ffmpeg()
    w, h = PREVIEW_SIZES.get(aspect, (1920, 1080))
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
           "-f", "lavfi", "-i", f"color=c=0x{bg_color}:s={w}x{h}:r={fps}",
           "-i", mov_path]
    if audio_path:
        cmd += ["-ss", f"{audio_offset:.3f}", "-i", audio_path]
    cmd += ["-filter_complex", f"[1:v]scale={w}:{h}:flags=lanczos[sub];[0:v][sub]overlay=shortest=1[v]",
            "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
    if audio_path:
        cmd += ["-map", "2:a", "-c:a", "aac", "-b:a", "192k"]
    if duration:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += ["-shortest", "-movflags", "+faststart", out_path]
    log(f"[미리보기] {w}x{h} mp4 인코딩 중")
    proc = subprocess.run(cmd, capture_output=True, **_no_window_flags())
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("미리보기 mp4 생성 실패: " + (err[-1] if err else f"코드 {proc.returncode}"))
    return out_path
