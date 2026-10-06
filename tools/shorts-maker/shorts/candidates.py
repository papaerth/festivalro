"""candidates.md 읽기/쓰기 (SPEC.md 3장 '구간 선택').

형식:
  - [x] 1 | video1 | 00:12.4 - 00:16.8 | (대사)
  - [ ] 2 | video2 | 00:03.0 - 00:07.5 | (대사) | (추천 이유: analyze가 붙임)
체크된 것만 쓰고, 앞 숫자가 순서(1이 맨 앞 후킹 구간)다.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from . import ShortsError

_LINE = re.compile(
    r"^\s*[-*]\s*\[(?P<check>[ xX])\]\s*(?P<order>\d+)?\s*\|\s*(?P<video>[^|]+?)\s*\|"
    r"\s*(?P<start>[\d:.]+)\s*[-~–]\s*(?P<end>[\d:.]+)\s*\|\s*(?P<text>[^|]*)(?:\|(?P<reason>.*))?$"
)


@dataclass
class Segment:
    order: int
    video: str      # 'video1' | 'video2'
    start: float    # 초
    end: float
    text: str
    reason: str = ""
    line_no: int = 0

    @property
    def duration(self):
        return self.end - self.start


def parse_time(s, line_no=0):
    """'12.4' | '00:12.4' | '1:02:03.5' → 초."""
    parts = s.strip().split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        raise ShortsError(f"candidates.md {line_no}줄: 시간 형식이 잘못됐습니다: '{s}' (예: 00:12.4)")
    if len(nums) > 3:
        raise ShortsError(f"candidates.md {line_no}줄: 시간 형식이 잘못됐습니다: '{s}'")
    total = 0.0
    for n in nums:
        total = total * 60 + n
    return total


def format_time(sec):
    m, s = divmod(max(0.0, sec), 60)
    return f"{int(m):02d}:{s:04.1f}"


def read_candidates(path):
    """체크된 구간을 순서대로 돌려준다. 형식 오류는 줄 번호와 함께 한글로 알린다."""
    path = Path(path)
    if not path.exists():
        raise ShortsError(
            f"candidates.md가 없습니다: {path}\n"
            "analyze를 먼저 실행하거나, 아래 형식으로 직접 적으세요:\n"
            "  - [x] 1 | video1 | 00:12.4 - 00:16.8 | (대사)"
        )
    segments = []
    found_any = False
    for i, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip().startswith(("-", "*")) or "[" not in raw:
            continue
        m = _LINE.match(raw)
        if not m:
            raise ShortsError(
                f"candidates.md {i}줄 형식을 읽을 수 없습니다:\n  {raw.strip()}\n"
                "  예: - [x] 1 | video1 | 00:12.4 - 00:16.8 | (대사)"
            )
        found_any = True
        if m.group("check") == " ":
            continue
        if not m.group("order"):
            raise ShortsError(f"candidates.md {i}줄: 체크한 구간에는 순서 번호를 적어야 합니다 (예: - [x] 1 | ...)")
        video = m.group("video").strip().lower()
        if video not in ("video1", "video2"):
            raise ShortsError(f"candidates.md {i}줄: 영상은 video1 또는 video2여야 합니다: '{video}'")
        start, end = parse_time(m.group("start"), i), parse_time(m.group("end"), i)
        if end <= start:
            raise ShortsError(f"candidates.md {i}줄: 끝 시간이 시작 시간보다 빠릅니다 ({m.group('start')} - {m.group('end')})")
        segments.append(Segment(int(m.group("order")), video, start, end,
                                m.group("text").strip(), (m.group("reason") or "").strip(), i))
    if not found_any:
        raise ShortsError(f"candidates.md에 구간 줄이 하나도 없습니다: {path}")
    if not segments:
        raise ShortsError("candidates.md에 체크된([x]) 구간이 없습니다. 쓸 구간에 체크하고 순서 번호를 적으세요.")
    orders = [s.order for s in segments]
    dup = {o for o in orders if orders.count(o) > 1}
    if dup:
        raise ShortsError(f"candidates.md: 순서 번호가 겹칩니다: {sorted(dup)}")
    segments.sort(key=lambda s: s.order)
    used = {s.video for s in segments}
    if used != {"video1", "video2"}:
        missing = "video2" if "video1" in used else "video1"
        raise ShortsError(f"두 영상의 구간이 최소 1개씩은 들어가야 합니다. {missing} 구간을 하나 이상 체크하세요.")
    return segments


def write_candidates(path, items, header=""):
    """analyze(2단계)가 후보를 쓸 때 사용. items: Segment 목록(order는 무시, 체크 해제)."""
    lines = [header.rstrip(), ""] if header else []
    lines.append("<!-- 쓸 구간에 [x] 체크하고 앞에 순서 번호(1이 맨 앞 후킹)를 적으세요. 시간은 직접 고쳐도 됩니다. -->")
    for n, s in enumerate(items, 1):
        reason = f" | {s.reason}" if s.reason else ""
        lines.append(f"- [ ] {n} | {s.video} | {format_time(s.start)} - {format_time(s.end)} | {s.text}{reason}")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
