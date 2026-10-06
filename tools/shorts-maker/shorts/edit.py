"""컷 편집: 구간 자르기 → 9:16 변환·확대 크롭·미러링·배속·색감 → 이어붙이기 (SPEC.md 3장 '컷 편집')."""

from pathlib import Path

from . import ShortsError
from .ffmpeg_utils import probe, run


def video_filter(cfg):
    """구간 하나에 적용하는 영상 필터 체인."""
    c, v = cfg["canvas"], cfg["video"]
    W, H, fps = c["width"], c["height"], c["fps"]
    zoom = float(v.get("zoom", 1.0))
    # 9:16 비율로 중앙 크롭 + 확대 (zoom 배만큼 더 좁게 잘라 확대 효과)
    crop_w = f"floor(min(iw\\,ih*{W}/{H})/{zoom}/2)*2"
    crop_h = f"floor(min(iw\\,ih*{W}/{H})*{H}/{W}/{zoom}/2)*2"
    chain = [
        f"crop=w='{crop_w}':h='{crop_h}'",
        f"scale={W}:{H}:flags=lanczos",
        "setsar=1",
    ]
    if v.get("mirror", True):
        chain.append("hflip")
    contrast = 1.0 + float(v.get("contrast", 0))
    saturation = 1.0 + float(v.get("saturation", 0))
    if contrast != 1.0 or saturation != 1.0:
        chain.append(f"eq=contrast={contrast:.3f}:saturation={saturation:.3f}")
    speed = float(v.get("speed", 1.0))
    if speed != 1.0:
        chain.append(f"setpts=PTS/{speed}")
    chain.append(f"fps={fps}")
    chain.append("format=yuv420p")
    return ",".join(chain)


def audio_filter(cfg):
    speed = float(cfg["video"].get("speed", 1.0))
    parts = []
    # atempo는 0.5~2.0 범위만 되므로 그 밖이면 나눠서 건다
    s = speed
    while s > 2.0:
        parts.append("atempo=2.0")
        s /= 2.0
    while s < 0.5:
        parts.append("atempo=0.5")
        s /= 0.5
    if abs(s - 1.0) > 1e-6:
        parts.append(f"atempo={s:.4f}")
    parts.append("aresample=48000")
    return ",".join(parts)


def cut_segment(src, start, end, out, cfg, has_audio=True):
    """src의 [start, end) 구간을 잘라 규격대로 변환한 클립을 out에 쓴다."""
    v = cfg["video"]
    dur = end - start
    args = ["-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src]
    if not has_audio:
        args += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    args += [
        "-vf", video_filter(cfg),
        "-af", audio_filter(cfg),
        "-map", "0:v:0", "-map", ("0:a:0" if has_audio else "1:a:0"),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", str(v.get("crf", 18)),
        "-c:a", "aac", "-b:a", str(v.get("audio_bitrate", "192k")), "-ac", "2", "-ar", "48000",
        "-shortest", "-movflags", "+faststart", out,
    ]
    run(args, what=f"구간 자르기({Path(src).name} {start:.1f}~{end:.1f}초)")


def concat_clips(clips, out):
    """같은 규격의 클립을 재인코딩 없이 이어 붙인다."""
    if not clips:
        raise ShortsError("이어 붙일 클립이 없습니다.")
    list_path = Path(out).with_suffix(".txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for c in clips:
            p = str(Path(c).resolve()).replace("\\", "/").replace("'", "'\\''")
            f.write(f"file '{p}'\n")
    run(["-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", "-movflags", "+faststart", out],
        what="클립 이어붙이기")
    return out


def build_timeline(segments, videos, cfg):
    """구간 목록을 영상 길이와 대조하고, 배속 적용 후 출력 타임라인(시작·끝 초)을 계산한다.

    반환: [{segment, src, out_start, out_end, out_duration, has_audio}], 전체 길이
    """
    speed = float(cfg["video"].get("speed", 1.0))
    infos = {k: probe(p) for k, p in videos.items()}
    timeline = []
    t = 0.0
    for s in segments:
        info = infos[s.video]
        if s.end > info["duration"] + 0.05:
            raise ShortsError(
                f"candidates.md {s.line_no}줄: {s.video} 길이({info['duration']:.1f}초)보다 끝 시간({s.end:.1f}초)이 깁니다."
            )
        d = s.duration / speed
        timeline.append({
            "segment": s, "src": videos[s.video], "has_audio": info["has_audio"],
            "out_start": t, "out_end": t + d, "out_duration": d,
        })
        t += d
    return timeline, t, infos
