"""음성 정리 (4단계): Demucs 보컬 분리, 접속사·추임새·무음 제거, 효과음 (7단계)."""

from . import ShortsError


def clean_audio(clip_path, transcript, cfg):
    raise ShortsError("음성 정리(Demucs·무음 제거)는 4단계에서 구현됩니다.")
