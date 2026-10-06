"""ffmpeg/ffprobe 실행 도우미."""

import json
import shutil
import subprocess
import sys

from . import ShortsError


def _no_window():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}


def find(name):
    exe = shutil.which(name)
    if not exe:
        raise ShortsError(f"{name}을(를) 찾을 수 없습니다. ffmpeg를 설치하고 PATH에 추가하세요.")
    return exe


def run(args, what="ffmpeg 실행"):
    """ffmpeg를 실행하고 실패하면 마지막 오류 줄을 한글 메시지와 함께 올린다."""
    cmd = [find("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-loglevel", "error"] + [str(a) for a in args]
    proc = subprocess.run(cmd, capture_output=True, **_no_window())
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        tail = "\n".join(err[-5:]) if err else "알 수 없는 오류"
        raise ShortsError(f"{what} 실패:\n{tail}\n명령: {' '.join(cmd)}")
    return proc


def probe(path):
    """영상 정보: duration(초), width, height, has_audio."""
    cmd = [find("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    proc = subprocess.run(cmd, capture_output=True, **_no_window())
    if proc.returncode != 0:
        raise ShortsError(f"영상 정보를 읽을 수 없습니다: {path}")
    info = json.loads(proc.stdout.decode("utf-8", "replace"))
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if not video:
        raise ShortsError(f"영상 스트림이 없습니다: {path}")
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    duration = float(info.get("format", {}).get("duration") or video.get("duration") or 0)
    return {
        "duration": duration,
        "width": int(video.get("width", 0)),
        "height": int(video.get("height", 0)),
        "has_audio": has_audio,
    }


def escape_filter_path(path):
    """필터 인자(ass=..., fontsdir=...)에 넣는 경로 이스케이프."""
    s = str(path)
    s = s.replace("\\", "/")
    s = s.replace(":", "\\:").replace("'", "\\'").replace("[", "\\[").replace("]", "\\]").replace(",", "\\,")
    return s
