"""명령줄 인터페이스."""

import argparse
import sys

from .pipeline import JobOptions, parse_time, run_job
from .render import CODECS, RESOLUTIONS, RenderStyle


def build_parser():
    p = argparse.ArgumentParser(prog="karaoke-subtitle", description="노래방 자막 생성기 (WhisperX)")
    p.add_argument("audio", help="음원 파일(mp3/wav 등)")
    p.add_argument("--lyrics", help="가사 텍스트 파일(UTF-8)")
    p.add_argument("--timings", help="이전에 저장된 *.timings.json 재사용(WhisperX 생략)")
    p.add_argument("--aspect", choices=["16:9", "9:16"], default="16:9")
    p.add_argument("--resolution", choices=RESOLUTIONS, default="1080p")
    p.add_argument("--start", default="", help="9:16 구간 시작 (예: 1:05.5)")
    p.add_argument("--end", default="", help="9:16 구간 끝 (예: 1:35)")
    p.add_argument("--language", default="auto", help="언어 코드(auto, ko, en, ja ...)")
    p.add_argument("--model", default="small", help="Whisper 모델(tiny/base/small/medium/large-v3)")
    p.add_argument("--device", default="auto", help="auto/cpu/cuda")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--codec", choices=list(CODECS), default="prores4444")
    p.add_argument("--audio-in-mov", action="store_true", help="MOV에 (구간) 오디오 트랙 포함")
    p.add_argument("--font", default=None, help="폰트 파일(.ttf/.ttc)")
    p.add_argument("--font-size", type=int, default=0, help="글자 크기(px), 0=자동")
    p.add_argument("--base-color", default="#FFFFFF")
    p.add_argument("--highlight-color", default="#FFD400")
    p.add_argument("--outline-color", default="#000000")
    p.add_argument("--no-next-line", action="store_true", help="다음 줄 미리보기 끄기")
    p.add_argument("--out-dir", default="")
    p.add_argument("--name", default="", help="출력 파일 이름(확장자 제외)")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    lyrics_text = ""
    if args.lyrics:
        with open(args.lyrics, encoding="utf-8-sig") as f:
            lyrics_text = f.read()
    elif not args.timings:
        print("--lyrics 또는 --timings 중 하나는 필요합니다.", file=sys.stderr)
        return 2

    style = RenderStyle(
        font_path=args.font, font_size=args.font_size, base_color=args.base_color,
        highlight_color=args.highlight_color, outline_color=args.outline_color,
        show_next=not args.no_next_line,
    )
    opts = JobOptions(
        audio_path=args.audio, lyrics_text=lyrics_text, aspect=args.aspect, resolution=args.resolution,
        clip_start=parse_time(args.start) or 0.0, clip_end=parse_time(args.end),
        language=args.language, model_name=args.model, device=args.device, fps=args.fps,
        codec=args.codec, include_audio=args.audio_in_mov, out_dir=args.out_dir,
        base_name=args.name, timings_json=args.timings or "", style=style,
    )
    outputs = run_job(opts, log=print, progress=lambda f, m: print(f"  [{f * 100:5.1f}%] {m}"))
    print("완료:", outputs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
