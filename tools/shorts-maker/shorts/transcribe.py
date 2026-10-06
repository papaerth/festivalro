"""받아쓰기 (2단계): faster-whisper medium, 한국어 → transcript.json (단어 단위 시간)."""

from . import ShortsError


def transcribe(video_path, out_json, model="medium", language="ko"):
    raise ShortsError("받아쓰기(Whisper)는 2단계에서 구현됩니다.")
