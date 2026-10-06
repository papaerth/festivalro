"""편 폴더 구조(SPEC.md 2장)와 brief.txt 읽기."""

from pathlib import Path

from . import ShortsError

VIDEO_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

BRIEF_KEYS = {
    "제품명": "product",
    "연예인": "celeb",
    "출처": "source",
    "핵심": "key",
    "검색어": "keyword",
    "썸네일 윗줄": "thumb_top",      # 5단계 전까지 손으로 적어 확인용
    "썸네일 아랫줄": "thumb_bottom",
}


class Episode:
    def __init__(self, path):
        self.dir = Path(path).resolve()
        if not self.dir.is_dir():
            raise ShortsError(f"편 폴더가 없습니다: {self.dir}")
        self.input = self.dir / "input"
        self.output = self.dir / "output"
        self.candidates_path = self.dir / "candidates.md"
        if not self.input.is_dir():
            raise ShortsError(f"input 폴더가 없습니다: {self.input}")
        self.brief = read_brief(self.input / "brief.txt")

    def find_input(self, stem, exts):
        """input/<stem>.<ext> 중 있는 파일 하나. 없으면 None."""
        for ext in exts:
            for p in (self.input / f"{stem}{ext}", self.input / f"{stem}{ext.upper()}"):
                if p.exists():
                    return p
        return None

    def video(self, n):
        return self.find_input(f"video{n}", VIDEO_EXTS)

    def image(self, n):
        return self.find_input(f"image{n}", IMAGE_EXTS)

    def videos(self):
        """{'video1': Path, 'video2': Path}. 둘 다 있어야 한다."""
        out = {}
        for n in (1, 2):
            p = self.video(n)
            if p is None:
                raise ShortsError(
                    f"input/video{n} 영상이 없습니다 ({', '.join(VIDEO_EXTS)} 중 하나). 폴더: {self.input}"
                )
            out[f"video{n}"] = p
        return out


def read_brief(path):
    """brief.txt → dict. '키: 값' 줄만 읽고, 핵심은 여러 줄 허용."""
    if not Path(path).exists():
        raise ShortsError(f"brief.txt가 없습니다: {path}")
    data = {}
    last = None
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if ":" in line or "：" in line:
            key, _, val = line.replace("：", ":").partition(":")
            key = key.strip()
            if key in BRIEF_KEYS:
                last = BRIEF_KEYS[key]
                data[last] = val.strip()
                continue
        if last == "key":  # 핵심이 여러 줄이면 이어 붙인다
            data[last] = (data[last] + " " + line).strip()
    for k in ("제품명", "연예인", "출처"):
        if not data.get(BRIEF_KEYS[k]):
            raise ShortsError(f"brief.txt에 '{k}:' 항목이 없습니다. 형식은 SPEC.md 2장을 보세요.")
    return data
