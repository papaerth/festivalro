"""싱크 보정용 간단 오디오 재생(추가 패키지 없이).

Windows는 winsound, 그 밖에는 ffplay/afplay를 쓴다. 지정 위치부터 재생하려고 ffmpeg로 임시 wav를 잘라 만든다.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time

from .ffmpeg_utils import _no_window_flags, find_ffmpeg

LATENCY = 0.08  # 재생 명령부터 실제 소리가 나기까지의 대략적인 지연(초)


class Player:
    def __init__(self):
        self._tmp = os.path.join(tempfile.gettempdir(), f"karaoke_sync_{os.getpid()}.wav")
        self._proc = None
        self._t0 = None      # 재생을 시작한 순간(perf_counter)
        self._offset = 0.0   # 곡에서의 재생 시작 위치(초)
        self._length = 0.0

    def play(self, path, start=0.0, length=None):
        """path를 start초부터 재생한다(비동기)."""
        self.stop()
        start = max(0.0, start)
        cmd = [find_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", path]
        if length:
            cmd += ["-t", f"{length:.3f}"]
        cmd += ["-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", self._tmp]
        proc = subprocess.run(cmd, capture_output=True, **_no_window_flags())
        if proc.returncode != 0 or not os.path.exists(self._tmp):
            err = proc.stderr.decode("utf-8", "replace").strip().splitlines()
            raise RuntimeError("재생 준비 실패: " + (err[-1] if err else "알 수 없는 오류"))
        self._length = max(0.0, (os.path.getsize(self._tmp) - 44) / (44100 * 4))
        if sys.platform == "win32":
            import winsound

            winsound.PlaySound(self._tmp, winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT)
        else:
            exe = shutil.which("ffplay")
            args = [exe, "-nodisp", "-autoexit", "-loglevel", "quiet", self._tmp] if exe else None
            if not args and shutil.which("afplay"):
                args = ["afplay", self._tmp]
            if not args:
                raise RuntimeError("이 컴퓨터에서 소리를 재생할 프로그램(ffplay/afplay)을 찾지 못했습니다.")
            self._proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._offset = start
        self._t0 = time.perf_counter()

    def position(self):
        """지금 들리는 곡 위치(초). 재생 중이 아니면 None."""
        if self._t0 is None:
            return None
        elapsed = time.perf_counter() - self._t0 - LATENCY
        if elapsed > self._length + 0.3:
            self._t0 = None
            return None
        return self._offset + max(0.0, elapsed)

    def stop(self):
        self._t0 = None
        if sys.platform == "win32":
            try:
                import winsound

                winsound.PlaySound(None, winsound.SND_PURGE)
            except Exception:
                pass
        if self._proc is not None:
            try:
                self._proc.terminate()
            except Exception:
                pass
            self._proc = None

    def close(self):
        self.stop()
        try:
            os.remove(self._tmp)
        except OSError:
            pass
