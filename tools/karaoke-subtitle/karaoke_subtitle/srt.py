"""SRT 자막 파일 출력."""


def format_srt_time(t):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(lines, tail=0.3, duration=None):
    """줄 단위 SRT 텍스트. 각 줄은 첫 단어 시작 ~ 마지막 단어 끝(+tail, 다음 줄 시작 전까지)."""
    chunks = []
    for i, ln in enumerate(lines):
        start = ln.start
        end = ln.end + tail
        if i + 1 < len(lines):
            end = min(end, lines[i + 1].start)
        if duration is not None:
            end = min(end, duration)
        end = max(end, start + 0.1)
        chunks.append(f"{i + 1}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{ln.text}\n")
    return "\n".join(chunks) + ("\n" if chunks else "")


def write_srt(lines, path, tail=0.3, duration=None):
    with open(path, "w", encoding="utf-8") as f:
        f.write(build_srt(lines, tail=tail, duration=duration))
    return path
