"""가사 텍스트 파싱."""

import re

_SECTION_RE = re.compile(r"^\s*[\[\(（【].*[\]\)）】]\s*$")


def parse_lyrics(text):
    """가사 문자열을 줄 단위의 단어 리스트로 변환한다.

    - 빈 줄, `[Verse 1]`·`(Chorus)` 같은 구간 표시 줄은 건너뛴다.
    - 각 줄은 공백 기준으로 단어(어절)를 나눈다.
    반환: [[단어, 단어, ...], ...]
    """
    lines = []
    for raw in text.replace("﻿", "").splitlines():
        line = raw.strip()
        if not line or _SECTION_RE.match(line):
            continue
        words = [w for w in re.split(r"\s+", line) if w]
        if words:
            lines.append(words)
    return lines


def normalize_char(ch):
    """정렬 비교용 문자 정규화. 비교에 쓸 수 없는 문자(구두점·공백)는 빈 문자열."""
    if ch.isalnum():
        return ch.lower()
    return ""


def normalized_chars(text):
    return [normalize_char(c) for c in text if normalize_char(c)]
