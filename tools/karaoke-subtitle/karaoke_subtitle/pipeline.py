"""입력 옵션 → 정렬 → 렌더 → SRT 전체 파이프라인."""

import json
import os
import re
from dataclasses import dataclass, field

from .ffmpeg_utils import load_audio
from .lyrics import parse_lyrics
from .render import ASPECTS, RenderStyle, render_video
from .srt import write_srt
from .timing import clip_lines, compute_display_times, lines_from_dict, lines_to_dict


@dataclass
class JobOptions:
    audio_path: str
    lyrics_text: str = ""
    aspect: str = "16:9"          # "16:9" | "9:16"
    resolution: str = "1080p"     # "1080p" | "720p" | "4k"
    clip_start: float = 0.0       # 9:16일 때 구간 시작(초)
    clip_end: float = None        # 9:16일 때 구간 끝(초), None=끝까지
    language: str = "auto"
    model_name: str = "small"
    device: str = "auto"
    fps: int = 30
    codec: str = "prores4444"
    include_audio: bool = False
    out_dir: str = ""
    base_name: str = ""
    timings_json: str = ""        # 이전 정렬 결과 재사용(WhisperX 생략)
    style: RenderStyle = field(default_factory=RenderStyle)


def parse_time(text):
    """'83.5', '1:23.5', '0:01:23' → 초. 빈 문자열은 None."""
    text = (text or "").strip()
    if not text:
        return None
    parts = text.split(":")
    if not all(re.fullmatch(r"\d+(\.\d+)?", p) for p in parts) or len(parts) > 3:
        raise ValueError(f"시간 형식이 잘못되었습니다: {text!r} (예: 83.5, 1:23.5)")
    total = 0.0
    for p in parts:
        total = total * 60 + float(p)
    return total


def run_job(opts, log=print, progress=None):
    """전체 작업 실행. 반환: {"mov": 경로, "srt": 경로, "json": 경로}"""

    def prog(frac, msg):
        if progress:
            progress(frac, msg)

    if not os.path.exists(opts.audio_path):
        raise FileNotFoundError(f"음원 파일이 없습니다: {opts.audio_path}")
    if opts.aspect not in ASPECTS:
        raise ValueError(f"화면 비율은 16:9 또는 9:16 이어야 합니다: {opts.aspect}")
    if opts.resolution not in ASPECTS[opts.aspect]:
        raise ValueError(f"해상도는 {', '.join(ASPECTS[opts.aspect])} 중 하나여야 합니다: {opts.resolution}")
    width, height = ASPECTS[opts.aspect][opts.resolution]

    out_dir = opts.out_dir or os.path.dirname(os.path.abspath(opts.audio_path))
    os.makedirs(out_dir, exist_ok=True)
    base = opts.base_name or os.path.splitext(os.path.basename(opts.audio_path))[0]
    suffix = "_16x9" if opts.aspect == "16:9" else "_9x16"

    prog(0.02, "오디오 로드")
    audio = load_audio(opts.audio_path)
    duration = len(audio) / 16000.0
    log(f"[입력] {os.path.basename(opts.audio_path)} 길이 {duration:.1f}초")

    # 1) 단어 타이밍
    if opts.timings_json:
        with open(opts.timings_json, encoding="utf-8") as f:
            data = json.load(f)
        lines = lines_from_dict(data)
        language = data.get("language")
        log(f"[정렬] 타이밍 파일 재사용: {os.path.basename(opts.timings_json)} ({len(lines)}줄)")
        if not lines:
            raise ValueError("타이밍 파일에 줄 정보가 없습니다.")
    else:
        lyric_lines = parse_lyrics(opts.lyrics_text)
        if not lyric_lines:
            raise ValueError("가사가 비어 있습니다.")
        log(f"[입력] 가사 {len(lyric_lines)}줄, {sum(len(l) for l in lyric_lines)}단어")
        from .align import align_lyrics

        lines, language = align_lyrics(audio, lyric_lines, language=opts.language,
                                       model_name=opts.model_name, device=opts.device,
                                       log=log, progress=lambda f, m: prog(0.05 + f * 0.45, m))
    del audio

    json_path = os.path.join(out_dir, f"{base}.timings.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(lines_to_dict(lines, language), f, ensure_ascii=False, indent=1)
    log(f"[저장] 단어 타이밍 → {json_path}")

    # 2) 구간 자르기(9:16)
    clip_start, clip_end = 0.0, duration
    if opts.aspect == "9:16":
        clip_start = max(0.0, opts.clip_start or 0.0)
        clip_end = min(duration, opts.clip_end) if opts.clip_end else duration
        if clip_end <= clip_start:
            raise ValueError("구간 끝 시간이 시작 시간보다 커야 합니다.")
        log(f"[구간] {clip_start:.2f}s ~ {clip_end:.2f}s ({clip_end - clip_start:.2f}s)")
    clip_len = clip_end - clip_start
    clipped = clip_lines(lines, clip_start, clip_end)
    if not clipped:
        log("[경고] 선택한 구간에 가사가 없습니다. 빈 자막이 생성됩니다.")
    shows = compute_display_times(clipped, lead_in=opts.style.lead_in, tail=opts.style.tail, duration=clip_len)

    # 3) MOV
    mov_path = os.path.join(out_dir, f"{base}{suffix}.mov")
    prog(0.5, "렌더링 시작")
    render_video(
        clipped, shows, mov_path, width, height, fps=opts.fps, style=opts.style, codec=opts.codec,
        audio_path=opts.audio_path if opts.include_audio else None, audio_offset=clip_start,
        duration=clip_len, log=log, progress=lambda f, m: prog(0.5 + f * 0.48, m),
    )
    log(f"[저장] 영상 → {mov_path}")

    # 4) SRT
    srt_path = os.path.join(out_dir, f"{base}{suffix}.srt")
    write_srt(clipped, srt_path, duration=clip_len)
    log(f"[저장] 자막 → {srt_path}")
    prog(1.0, "완료")
    return {"mov": mov_path, "srt": srt_path, "json": json_path}
