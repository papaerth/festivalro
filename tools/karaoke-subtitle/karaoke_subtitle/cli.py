"""명령줄 인터페이스."""

import argparse
import sys

from .pipeline import JobOptions, parse_time, run_job
from .render import CHROMA_COLORS, CODECS, POSITIONS, RESOLUTIONS, RenderStyle


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
    p.add_argument("--preview-mp4", action="store_true", help="회색 배경에 합성한 1080p 미리보기 mp4도 생성")
    p.add_argument("--font", default=None, help="폰트 파일(.ttf/.ttc)")
    p.add_argument("--font-index", type=int, default=0, help=".ttc 안의 폰트 번호(기본 0)")
    p.add_argument("--font-size", type=int, default=0, help="글자 크기(px), 0=자동")
    p.add_argument("--base-color", default="#FFFFFF")
    p.add_argument("--highlight-color", default="#FFD400")
    p.add_argument("--outline-color", default="#000000")
    p.add_argument("--no-next-line", action="store_true", help="다음 줄 미리보기 끄기")
    p.add_argument("--position", choices=POSITIONS, default="bottom",
                   help="자막 위치: bottom(하단)/middle(중앙)/top(상단)/custom(--y로 지정)")
    p.add_argument("--y", type=float, default=None, help="세로 위치 %% (0=맨 위, 100=맨 아래). 주면 --position custom")
    p.add_argument("--x", type=float, default=50.0, help="가로 위치 %% (0=왼쪽, 50=가운데, 100=오른쪽)")
    p.add_argument("--sync-offset", type=float, default=0.0, help="자막 전체를 초 단위로 밀기(+늦게, -빨리)")
    p.add_argument("--separate-vocals", action="store_true", help="정렬 전에 Demucs로 보컬 분리(pip install demucs)")
    p.add_argument("--chroma", choices=list(CHROMA_COLORS), default="",
                   help="크로마키 배경 mp4도 생성(모바일 캡컷용)")
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
        font_path=args.font, font_index=args.font_index, font_size=args.font_size, base_color=args.base_color,
        highlight_color=args.highlight_color, outline_color=args.outline_color,
        show_next=not args.no_next_line,
        position="custom" if args.y is not None else args.position,
        y_percent=args.y if args.y is not None else 85.0, x_percent=args.x,
    )
    opts = JobOptions(
        audio_path=args.audio, lyrics_text=lyrics_text, aspect=args.aspect, resolution=args.resolution,
        clip_start=parse_time(args.start) or 0.0, clip_end=parse_time(args.end),
        language=args.language, model_name=args.model, device=args.device, fps=args.fps,
        codec=args.codec, include_audio=args.audio_in_mov, preview_mp4=args.preview_mp4, out_dir=args.out_dir,
        base_name=args.name, timings_json=args.timings or "", style=style,
        chroma=args.chroma, separate_vocals=args.separate_vocals, sync_offset=args.sync_offset,
    )
    outputs = run_job(opts, log=print, progress=lambda f, m: print(f"  [{f * 100:5.1f}%] {m}"))
    print("완료:", outputs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
