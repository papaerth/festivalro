"""ffmpeg 실행 파일 탐색과 오디오 디코딩."""

import os
import shutil
import subprocess
import sys

import numpy as np

_FFMPEG = None


def _no_window_flags():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}


def find_ffmpeg():
    """PATH의 ffmpeg 또는 imageio-ffmpeg에 내장된 바이너리를 찾는다."""
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    exe = shutil.which("ffmpeg")
    if not exe:
        try:
            import imageio_ffmpeg

            exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            exe = None
    if not exe:
        raise RuntimeError(
            "ffmpeg를 찾을 수 없습니다. `pip install imageio-ffmpeg` 하거나 ffmpeg를 설치해 PATH에 추가하세요."
        )
    _FFMPEG = exe
    # whisperx 등 'ffmpeg' 이름으로 호출하는 라이브러리를 위해 PATH에 추가
    os.environ["PATH"] = os.path.dirname(exe) + os.pathsep + os.environ.get("PATH", "")
    return exe


def load_audio(path, sr=16000):
    """오디오 파일을 float32 모노 numpy 배열로 디코딩한다(WhisperX 입력 규격)."""
    exe = find_ffmpeg()
    cmd = [
        exe, "-nostdin", "-threads", "0", "-i", path,
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", str(sr), "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, **_no_window_flags())
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("오디오 디코딩 실패: " + (err[-1] if err else "알 수 없는 오류"))
    return np.frombuffer(proc.stdout, np.int16).astype(np.float32) / 32768.0
