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


def guess_language(text):
    """가사 글자로 언어 코드를 추정한다(음악에서는 Whisper 자동 감지가 자주 틀리므로 가사를 우선).

    한글 → ko, 가나 → ja, 한자만 → zh, 그 외(라틴 문자) → en. 판단 불가면 None.
    """
    counts = {"ko": 0, "ja": 0, "zh": 0, "en": 0}
    for ch in text:
        o = ord(ch)
        if 0xAC00 <= o <= 0xD7A3 or 0x1100 <= o <= 0x11FF or 0x3130 <= o <= 0x318F:
            counts["ko"] += 1
        elif 0x3040 <= o <= 0x30FF:
            counts["ja"] += 1
        elif 0x4E00 <= o <= 0x9FFF:
            counts["zh"] += 1
        elif ch.isascii() and ch.isalpha():
            counts["en"] += 1
    if counts["ko"]:
        return "ko"
    if counts["ja"]:
        return "ja"
    if counts["zh"]:
        return "zh"
    if counts["en"]:
        return "en"
    return None
