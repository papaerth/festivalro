"""입력 옵션 → 정렬 → 렌더 → SRT 전체 파이프라인."""

import json
import os
import re
from dataclasses import dataclass, field

from .ffmpeg_utils import load_audio
from .lyrics import parse_lyrics
from .render import ASPECTS, CHROMA_COLORS, POSITIONS, RenderStyle, render_chroma_mp4, render_preview_mp4, render_video
from .srt import write_srt
from .timing import clip_lines, compute_display_times, lines_from_dict, lines_to_dict, shift_lines


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
    preview_mp4: bool = False     # 회색 배경 합성 1080p 미리보기 mp4도 생성
    chroma: str = ""              # "green" | "blue" | "magenta": 크로마키 배경 mp4도 생성(모바일 캡컷용)
    separate_vocals: bool = False  # 정렬 전에 Demucs로 보컬만 분리(반주가 큰 곡의 정확도 향상)
    sync_offset: float = 0.0      # 자막 전체를 이 초만큼 밀기(+는 늦게, -는 빨리). timings.json은 그대로 둠
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
    if opts.style.position not in POSITIONS:
        raise ValueError(f"자막 위치는 {', '.join(POSITIONS)} 중 하나여야 합니다: {opts.style.position}")
    if opts.chroma and opts.chroma not in CHROMA_COLORS:
        raise ValueError(f"크로마키 색은 {', '.join(CHROMA_COLORS)} 중 하나여야 합니다: {opts.chroma}")

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
            raise ValueError(
                f"타이밍 파일에 가사 줄이 하나도 없습니다: {os.path.basename(opts.timings_json)}\n"
                "타이밍 재사용 칸을 비우고 가사를 입력해 다시 정렬하세요."
            )
    else:
        lyric_lines = parse_lyrics(opts.lyrics_text)
        if not lyric_lines:
            raise ValueError("가사가 비어 있습니다.")
        log(f"[입력] 가사 {len(lyric_lines)}줄, {sum(len(l) for l in lyric_lines)}단어")
        from .align import align_lyrics, resolve_device

        align_audio, a0 = audio, 0.05
        if opts.separate_vocals:
            from .vocals import separate_vocals

            align_audio = separate_vocals(opts.audio_path, device=resolve_device(opts.device), log=log,
                                          progress=lambda f, m: prog(0.03 + f * 0.17, m))
            a0 = 0.2
        lines, language = align_lyrics(align_audio, lyric_lines, language=opts.language,
                                       model_name=opts.model_name, device=opts.device,
                                       log=log, progress=lambda f, m: prog(a0 + f * (0.5 - a0), m))
        del align_audio
    del audio
    if not lines or not any(ln.words for ln in lines):
        raise RuntimeError("단어 타이밍이 비어 있어 자막을 만들 수 없습니다. 가사와 음원을 확인하세요.")

    json_path = os.path.join(out_dir, f"{base}.timings.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(lines_to_dict(lines, language), f, ensure_ascii=False, indent=1)
    log(f"[저장] 단어 타이밍 → {json_path}")

    if opts.sync_offset:
        lines = shift_lines(lines, opts.sync_offset)
        log(f"[싱크] 자막 전체를 {opts.sync_offset:+.2f}초 이동")

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
        raise ValueError(
            f"선택한 구간({clip_start:.1f}s ~ {clip_end:.1f}s)에 가사가 없습니다.\n"
            f"가사는 {lines[0].start:.1f}s ~ {lines[-1].end:.1f}s 사이에 있습니다. 구간을 다시 지정하세요."
        )
    shows = compute_display_times(clipped, lead_in=opts.style.lead_in, tail=opts.style.tail, duration=clip_len)

    if opts.chroma and opts.style.show_next and opts.style.next_alpha < 1.0:
        # 반투명 글자는 크로마키 배경색이 비쳐 키를 뺄 때 얼룩지므로 불투명하게 그린다
        opts.style.next_alpha = 1.0

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
    result = {"mov": mov_path, "srt": srt_path, "json": json_path, "out_dir": out_dir,
              "audio": opts.audio_path, "aspect": opts.aspect, "resolution": opts.resolution, "fps": opts.fps,
              "clip_start": clip_start if opts.aspect == "9:16" else None,
              "clip_end": clip_end if opts.aspect == "9:16" else None}

    # 5) 미리보기 mp4 (선택)
    if opts.preview_mp4:
        prog(0.985, "미리보기 mp4 생성")
        preview_path = os.path.join(out_dir, f"{base}{suffix}_preview.mp4")
        render_preview_mp4(mov_path, preview_path, opts.aspect, fps=opts.fps, audio_path=opts.audio_path,
                           audio_offset=clip_start, duration=clip_len, log=log)
        log(f"[저장] 미리보기 → {preview_path}")
        result["preview"] = preview_path
    # 6) 크로마키 mp4 (선택, 모바일 캡컷용)
    if opts.chroma:
        prog(0.992, "크로마키 mp4 생성")
        chroma_path = os.path.join(out_dir, f"{base}{suffix}_chroma.mp4")
        render_chroma_mp4(mov_path, chroma_path, opts.aspect, (width, height), fps=opts.fps, color=opts.chroma,
                          audio_path=opts.audio_path if opts.include_audio else None,
                          audio_offset=clip_start, duration=clip_len, log=log)
        log(f"[저장] 크로마키 → {chroma_path}")
        result["chroma"] = chroma_path
    prog(1.0, "완료")
    return result
