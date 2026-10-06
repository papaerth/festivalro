"""최종 합성: 이어붙인 영상 + ASS 오버레이 → final.mp4, thumbnail.png, check.png."""

from .ffmpeg_utils import escape_filter_path, run


def _ass_filter(ass_path, fonts_dir):
    return f"ass={escape_filter_path(ass_path)}:fontsdir={escape_filter_path(fonts_dir)}"


def render_final(concat_mp4, ass_path, fonts_dir, out, cfg):
    v, c = cfg["video"], cfg["canvas"]
    run([
        "-i", concat_mp4,
        "-vf", _ass_filter(ass_path, fonts_dir),
        "-r", str(c["fps"]),
        "-c:v", "libx264", "-preset", v.get("preset", "medium"), "-crf", str(v.get("crf", 18)),
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-c:a", "aac", "-b:a", str(v.get("audio_bitrate", "192k")),
        "-movflags", "+faststart", out,
    ], what="최종 렌더")


def render_frame(src_mp4, ass_path, fonts_dir, out_png, at=0.0):
    """src의 at초 프레임에 ASS를 얹어 PNG로 저장 (좌표 확인·썸네일)."""
    # -ss 를 출력 옵션으로 두어야 원래 시각 기준으로 자막이 얹힌다
    run([
        "-i", src_mp4,
        "-ss", f"{at:.3f}",
        "-vf", _ass_filter(ass_path, fonts_dir),
        "-frames:v", "1", "-update", "1", out_png,
    ], what="확인용 프레임 추출")
