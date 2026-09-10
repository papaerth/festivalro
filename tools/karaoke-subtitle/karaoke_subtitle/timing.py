"""단어 타이밍 자료구조와 순수 파이썬 타이밍 보정 로직(WhisperX 비의존)."""

from dataclasses import dataclass, field
from difflib import SequenceMatcher

from .lyrics import normalize_char


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Line:
    words: list = field(default_factory=list)

    @property
    def text(self):
        return " ".join(w.text for w in self.words)

    @property
    def start(self):
        return self.words[0].start

    @property
    def end(self):
        return self.words[-1].end


# ---------------------------------------------------------------------------
# 직렬화
# ---------------------------------------------------------------------------

def lines_to_dict(lines, language=None):
    return {
        "language": language,
        "lines": [
            {"text": ln.text, "words": [{"text": w.text, "start": round(w.start, 3), "end": round(w.end, 3)} for w in ln.words]}
            for ln in lines
        ],
    }


def lines_from_dict(data):
    lines = []
    for ln in data.get("lines", []):
        words = [Word(w["text"], float(w["start"]), float(w["end"])) for w in ln.get("words", [])]
        if words:
            lines.append(Line(words))
    return lines


# ---------------------------------------------------------------------------
# 1단계: 인식 결과(transcript)와 가사를 문자 단위로 대조해 줄별 시간 창을 추정
# ---------------------------------------------------------------------------

def _char_times(words):
    """단어 리스트 -> [(정규화 문자, 시각)] (문자 시각은 단어 안에서 선형 보간)."""
    out = []
    for w in words:
        chars = [normalize_char(c) for c in w.text]
        chars = [c for c in chars if c]
        n = len(chars)
        for k, c in enumerate(chars):
            t = w.start + (w.end - w.start) * (k + 0.5) / max(n, 1)
            out.append((c, t))
    return out


def _largest_cluster(times, max_gap=4.0):
    """정렬된 시각 리스트에서 인접 간격이 max_gap 이하인 가장 큰 덩어리를 반환."""
    if not times:
        return []
    times = sorted(times)
    best, cur = [], [times[0]]
    for t in times[1:]:
        if t - cur[-1] <= max_gap:
            cur.append(t)
        else:
            if len(cur) > len(best):
                best = cur
            cur = [t]
    if len(cur) > len(best):
        best = cur
    return best


def estimate_line_windows(lyric_lines, transcript_words, duration, min_block=2, pad=0.4):
    """가사 줄마다 (start, end) 시간 창을 추정한다.

    lyric_lines: [[단어, ...], ...]
    transcript_words: 인식된 Word 리스트(시각 포함)
    """
    n_lines = len(lyric_lines)
    if n_lines == 0:
        return []

    # 가사 문자열 시퀀스(문자, 줄 번호)
    lyric_seq, lyric_line_of = [], []
    for li, words in enumerate(lyric_lines):
        for w in words:
            for c in w:
                nc = normalize_char(c)
                if nc:
                    lyric_seq.append(nc)
                    lyric_line_of.append(li)

    trans = _char_times(transcript_words)
    trans_seq = [c for c, _ in trans]

    matched = [[] for _ in range(n_lines)]
    if lyric_seq and trans_seq:
        sm = SequenceMatcher(None, lyric_seq, trans_seq, autojunk=False)
        for a, b, size in sm.get_matching_blocks():
            if size < min_block:
                continue
            for k in range(size):
                matched[lyric_line_of[a + k]].append(trans[b + k][1])

    raw = [None] * n_lines
    for li in range(n_lines):
        cl = _largest_cluster(matched[li])
        if len(cl) >= 2:
            raw[li] = (cl[0], cl[-1])

    # 순서가 뒤바뀐(앞 줄보다 먼저 끝나는) 창은 신뢰하지 않음
    prev_end = -1.0
    for li in range(n_lines):
        if raw[li] is None:
            continue
        s, e = raw[li]
        if s < prev_end - 0.5 or e < s:
            raw[li] = None
        else:
            prev_end = e

    return _fill_windows(raw, lyric_lines, duration, pad)


def _line_chars(words):
    return max(1, sum(len(w) for w in words))


def _fill_windows(raw, lyric_lines, duration, pad):
    n = len(raw)
    known = [i for i in range(n) if raw[i] is not None]
    windows = list(raw)

    if not known:
        # 아무것도 못 맞췄으면 전체 길이를 글자 수 비율로 나눈다
        total = sum(_line_chars(w) for w in lyric_lines)
        t = 0.0
        for i, words in enumerate(lyric_lines):
            d = duration * _line_chars(words) / total
            windows[i] = (t, t + d)
            t += d
        return [(max(0.0, s - pad), min(duration, e + pad)) for s, e in windows]

    # 알려진 줄들의 평균 글자 속도(초/글자)
    known_chars = sum(_line_chars(lyric_lines[i]) for i in known)
    known_time = sum(raw[i][1] - raw[i][0] for i in known)
    sec_per_char = max(0.08, known_time / max(known_chars, 1)) if known_time > 0 else 0.25

    def spread(idxs, t0, t1):
        total = sum(_line_chars(lyric_lines[i]) for i in idxs)
        t = t0
        for i in idxs:
            d = (t1 - t0) * _line_chars(lyric_lines[i]) / total
            windows[i] = (t, t + d)
            t += d

    # 첫 알려진 줄 이전
    first = known[0]
    if first > 0:
        idxs = list(range(0, first))
        est = sum(_line_chars(lyric_lines[i]) for i in idxs) * sec_per_char
        s = raw[first][0]
        spread(idxs, max(0.0, s - est), s)

    # 알려진 줄 사이
    for a, b in zip(known, known[1:]):
        if b - a > 1:
            idxs = list(range(a + 1, b))
            t0, t1 = raw[a][1], raw[b][0]
            if t1 - t0 < 0.2:
                # 공간이 없으면 0.2초 안에 압축
                t1 = t0 + 0.2
            spread(idxs, t0, t1)

    # 마지막 알려진 줄 이후
    last = known[-1]
    if last < n - 1:
        idxs = list(range(last + 1, n))
        est = sum(_line_chars(lyric_lines[i]) for i in idxs) * sec_per_char
        e = raw[last][1]
        spread(idxs, e, min(duration, e + est))

    return [(max(0.0, s - pad), min(duration, max(e + pad, s + 0.3))) for s, e in windows]


# ---------------------------------------------------------------------------
# 2단계: 정렬 결과를 가사 단어에 되돌려 붙이기
# ---------------------------------------------------------------------------

def assign_times_by_chars(lyric_words, aligned_words):
    """정렬기가 돌려준 토큰(단어/문자 단위, 일부는 시간 없음)을 가사 단어에 문자 소비 방식으로 대응시킨다.

    lyric_words: [str, ...]
    aligned_words: [{"text": str, "start": float|None, "end": float|None}, ...]
    반환: [(start|None, end|None), ...] (가사 단어 순서)
    """
    # 가사 단어의 정규화 문자 -> 단어 인덱스
    owner = []
    for wi, w in enumerate(lyric_words):
        for c in w:
            if normalize_char(c):
                owner.append(wi)

    starts = [None] * len(lyric_words)
    ends = [None] * len(lyric_words)
    pos = 0
    for tok in aligned_words:
        chars = [c for c in tok.get("text", "") if normalize_char(c)]
        if not chars:
            continue
        n = len(chars)
        span = range(pos, min(pos + n, len(owner)))
        pos += n
        s, e = tok.get("start"), tok.get("end")
        if s is None or e is None:
            continue
        for k in span:
            wi = owner[k]
            starts[wi] = s if starts[wi] is None else min(starts[wi], s)
            ends[wi] = e if ends[wi] is None else max(ends[wi], e)
    return list(zip(starts, ends))


def fill_missing_word_times(lyric_words, times, window, min_dur=0.05):
    """시간이 비어 있는 단어를 이웃 단어로부터 글자 수 비례로 보간하고 단조 증가를 보장한다.

    반환: [Word, ...]
    """
    n = len(lyric_words)
    w0, w1 = window
    if w1 <= w0:
        w1 = w0 + max(0.3, 0.15 * n)
    starts = [t[0] for t in times]
    ends = [t[1] for t in times]

    # 시작·끝 중 하나만 있는 경우 보완
    for i in range(n):
        if starts[i] is not None and ends[i] is None:
            ends[i] = starts[i] + min_dur * max(1, len(lyric_words[i]))
        if ends[i] is not None and starts[i] is None:
            starts[i] = ends[i] - min_dur * max(1, len(lyric_words[i]))

    known = [i for i in range(n) if starts[i] is not None]
    if not known:
        # 창 전체에 글자 수 비례로 배치
        total = max(1, sum(len(w) for w in lyric_words))
        t = w0
        out = []
        for w in lyric_words:
            d = (w1 - w0) * len(w) / total
            out.append(Word(w, t, t + d))
            t += d
        return out

    def spread(idxs, t0, t1):
        total = max(1, sum(len(lyric_words[i]) for i in idxs))
        t = t0
        for i in idxs:
            d = (t1 - t0) * len(lyric_words[i]) / total
            starts[i], ends[i] = t, t + d
            t += d

    first, last = known[0], known[-1]
    if first > 0:
        idxs = list(range(0, first))
        est = sum(len(lyric_words[i]) for i in idxs) * 0.2
        spread(idxs, max(w0, starts[first] - est), starts[first])
    for a, b in zip(known, known[1:]):
        if b - a > 1:
            spread(list(range(a + 1, b)), ends[a], starts[b])
    if last < n - 1:
        idxs = list(range(last + 1, n))
        est = sum(len(lyric_words[i]) for i in idxs) * 0.2
        spread(idxs, ends[last], min(w1, ends[last] + est) if w1 > ends[last] else ends[last] + est)

    # 단조 증가 + 최소 길이 보장
    out = []
    prev_end = -1e9
    for i, w in enumerate(lyric_words):
        s = max(starts[i], prev_end)
        e = max(ends[i], s + min_dur)
        out.append(Word(w, s, e))
        prev_end = e
    return out


# ---------------------------------------------------------------------------
# 3단계: 표시 구간·구간 자르기
# ---------------------------------------------------------------------------

def compute_display_times(lines, lead_in=0.6, tail=1.0, duration=None):
    """각 줄이 화면에 보이는 (show_start, show_end)를 계산한다."""
    shows = []
    for i, ln in enumerate(lines):
        s = ln.start - lead_in
        if i > 0:
            s = max(s, lines[i - 1].end + 0.02)
        s = max(0.0, s)
        shows.append([s, ln.end + tail])
    for i in range(len(shows) - 1):
        shows[i][1] = min(shows[i][1], shows[i + 1][0])
        shows[i][1] = max(shows[i][1], lines[i].end)
    if duration is not None and shows:
        shows[-1][1] = min(shows[-1][1], duration)
    return [tuple(s) for s in shows]


def clip_lines(lines, clip_start, clip_end):
    """[clip_start, clip_end] 구간에 걸치는 줄만 남기고, 시각을 clip_start 기준으로 옮긴다.

    구간에 걸친 단어는 경계로 잘라낸다(0초 이전·구간 길이 이후로 넘어가지 않게).
    """
    length = clip_end - clip_start
    out = []
    for ln in lines:
        if ln.end <= clip_start or ln.start >= clip_end:
            continue
        words = []
        for w in ln.words:
            s = min(max(w.start - clip_start, 0.0), length)
            e = min(max(w.end - clip_start, 0.0), length)
            words.append(Word(w.text, s, max(e, s)))
        out.append(Line(words))
    return out
