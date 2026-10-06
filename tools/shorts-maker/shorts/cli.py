"""명령줄: shorts analyze <편 폴더> / shorts build <편 폴더>  (python -m shorts.cli ...)."""

import json
import shutil
import sys
from pathlib import Path

import typer

from . import ShortsError, __version__
from .config import load_config

app = typer.Typer(add_completion=False, help="연예인 추천템 쇼츠 제작기", no_args_is_help=True)


def _warn(msg):
    typer.secho(msg, fg=typer.colors.YELLOW, err=True)


def _info(msg):
    typer.echo(msg)


def _fail(e):
    typer.secho(f"[오류] {e}", fg=typer.colors.RED, err=True)
    raise typer.Exit(code=1)


@app.command()
def analyze(episode: Path = typer.Argument(..., help="편 폴더 (예: episodes/021_윤은혜_온슬로패치)"),
            config: Path = typer.Option(None, "--config", "-c", help="config.yaml 경로")):
    """두 영상을 받아쓰고 후킹 후보 구간을 candidates.md로 만든다 (2단계에서 구현)."""
    try:
        from .episode import Episode

        cfg = load_config(config)
        ep = Episode(episode)
        ep.videos()
        _info(f"편: {ep.dir.name}  제품: {ep.brief['product']}  연예인: {ep.brief['celeb']}")
        raise ShortsError(
            "analyze(받아쓰기·후보 추출)는 2단계에서 구현됩니다.\n"
            f"지금은 {ep.candidates_path} 를 직접 적고 build를 실행하세요:\n"
            "  - [x] 1 | video1 | 00:12.4 - 00:16.8 | (대사)"
        )
    except ShortsError as e:
        _fail(e)


@app.command()
def build(episode: Path = typer.Argument(..., help="편 폴더 (예: episodes/021_윤은혜_온슬로패치)"),
          config: Path = typer.Option(None, "--config", "-c", help="config.yaml 경로"),
          keep_clips: bool = typer.Option(False, "--keep-clips", help="구간별 중간 클립을 남긴다")):
    """candidates.md의 체크된 구간으로 편집·오버레이해 output/final.mp4 를 만든다."""
    try:
        _build(episode, config, keep_clips)
    except ShortsError as e:
        _fail(e)


def _build(episode, config, keep_clips):
    from .candidates import read_candidates
    from .edit import build_timeline, concat_clips, cut_segment
    from .episode import Episode
    from .overlay import build_ass, layout_report, placeholder_words, resolve_fonts
    from .render import render_final, render_frame

    cfg = load_config(config)
    ep = Episode(episode)
    videos = ep.videos()
    segments = read_candidates(ep.candidates_path)
    fonts, fonts_dir = resolve_fonts(cfg, warn=_warn)

    out = ep.output
    out.mkdir(exist_ok=True)
    work = out / "clips"
    work.mkdir(exist_ok=True)

    _info(f"편: {ep.dir.name}  제품: {ep.brief['product']}  연예인: {ep.brief['celeb']}  출처: {ep.brief['source']}")
    timeline, total, infos = build_timeline(segments, videos, cfg)
    speed = cfg["video"]["speed"]
    _info(f"구간 {len(segments)}개, 배속 {speed}x 적용 후 총 {total:.1f}초")
    limit = cfg.get("limits", {}).get("segments_total")
    if limit and total > limit:
        _warn(f"[경고] 구간 합이 {limit}초를 넘습니다 ({total:.1f}초). 구간을 줄이는 게 좋습니다.")

    # 1) 구간별 컷 + 변환
    clips = []
    for i, item in enumerate(timeline, 1):
        s = item["segment"]
        clip = work / f"{i:02d}_{s.video}_{s.start:.1f}-{s.end:.1f}.mp4"
        _info(f"  [{i}/{len(timeline)}] {s.video} {s.start:.1f}~{s.end:.1f}초 → {item['out_duration']:.1f}초  {s.text[:30]}")
        cut_segment(item["src"], s.start, s.end, clip, cfg, has_audio=item["has_audio"])
        clips.append(clip)

    # 2) 이어붙이기
    concat_mp4 = out / "concat.mp4"
    concat_clips(clips, concat_mp4)

    # 3) 오버레이 (1단계: 썸네일 문구·출처는 brief 또는 샘플 텍스트, 자막은 임시 단어 시간)
    thumb_top = ep.brief.get("thumb_top") or "썸네일 윗줄 샘플"
    thumb_bottom = ep.brief.get("thumb_bottom") or f"{ep.brief['celeb']} 아랫줄 샘플"
    words = placeholder_words(timeline)
    ass_full = build_ass(cfg, fonts, total, thumb_top, thumb_bottom, ep.brief["source"], words)
    ass_path = out / "subtitles.ass"
    ass_path.write_text(ass_full, encoding="utf-8")
    ass_thumb = build_ass(cfg, fonts, total, thumb_top, thumb_bottom, ep.brief["source"], None)
    thumb_ass_path = work / "thumbnail.ass"
    thumb_ass_path.write_text(ass_thumb, encoding="utf-8")

    _info("좌표 환산 결과 (config.yaml capcut 항목으로 조정):")
    _info(layout_report(cfg, fonts))

    # 4) 렌더
    final = out / "final.mp4"
    render_final(concat_mp4, ass_path, fonts_dir, final, cfg)
    render_frame(concat_mp4, thumb_ass_path, fonts_dir, out / "thumbnail.png", at=0.0)
    check_at = min(1.0, max(0.0, total - 0.1))
    render_frame(concat_mp4, ass_path, fonts_dir, out / "check.png", at=check_at)

    # 5) 편집 기록
    edit = {
        "episode": ep.dir.name,
        "brief": ep.brief,
        "config": str(cfg["_path"]),
        "video": cfg["video"],
        "capcut": cfg["capcut"],
        "fonts": {k: str(v[0]) for k, v in fonts.items()},
        "segments": [{
            "order": it["segment"].order, "video": it["segment"].video,
            "src": str(it["src"]), "start": it["segment"].start, "end": it["segment"].end,
            "text": it["segment"].text,
            "out_start": round(it["out_start"], 3), "out_end": round(it["out_end"], 3),
        } for it in timeline],
        "total_seconds": round(total, 3),
        "overlay": {"thumbnail_top": thumb_top, "thumbnail_bottom": thumb_bottom, "source": ep.brief["source"],
                    "subtitle_words": "placeholder(1단계)"},
        "sfx": [], "tts": [],
    }
    (out / "edit.json").write_text(json.dumps(edit, ensure_ascii=False, indent=2), encoding="utf-8")

    if not keep_clips:
        shutil.rmtree(work, ignore_errors=True)
        concat_mp4.unlink(missing_ok=True)
        concat_mp4.with_suffix(".txt").unlink(missing_ok=True)

    _info("")
    _info(f"완료: {final}")
    _info(f"  확인용: {out / 'check.png'} (자막 포함), {out / 'thumbnail.png'} (썸네일 문구·출처)")
    _info(f"  기록:   {out / 'edit.json'}, {ass_path}")


@app.callback(invoke_without_command=True)
def _main(ctx: typer.Context, version: bool = typer.Option(False, "--version", help="버전 표시")):
    if version:
        typer.echo(f"shorts-maker {__version__}")
        raise typer.Exit()
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


def main():
    try:
        app()
    except ShortsError as e:  # 혹시 잡히지 않은 것
        _fail(e)


if __name__ == "__main__":
    main()
