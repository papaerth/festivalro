"""공통 도구: 경로, ffmpeg 호출, 오디오 입출력, 폰트·모델 찾기, 편(episode) 폴더 규칙."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MODELS = Path(os.environ.get("SHORTS_MODELS", ROOT / "models"))
SR = 48000  # 완성본 오디오 표본화 주파수
FPS = 30
VIDEO_EXT = (".mp4", ".mkv", ".mov", ".webm", ".m4v")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")

_RELEASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
MODEL_URLS = {
    "asr": f"{_RELEASE}/asr-models/sherpa-onnx-zipformer-korean-2024-06-24.tar.bz2",
    "vad": f"{_RELEASE}/asr-models/silero_vad.onnx",
    "uvr": f"{_RELEASE}/source-separation-models/UVR_MDXNET_9482.onnx",
}
ASR_DIR = "sherpa-onnx-zipformer-korean-2024-06-24"


for _s in (sys.stdout, sys.stderr):  # 윈도우 콘솔·파일 출력에서 한글·기호가 깨지지 않게
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def die(msg: str, code: int = 1):
    log(f"[오류] {msg}")
    raise SystemExit(code)


def load_env():
    """tools/shopping-shorts/.env 의 KEY=VALUE 를 환경변수로 읽는다(이미 있는 값은 덮지 않음)."""
    p = ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def read_json(p, default=None):
    p = Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


# ----------------------------------------------------------------- ffmpeg
def ffmpeg_bin() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        die("ffmpeg가 없습니다. https://ffmpeg.org 에서 설치하고 PATH에 넣어 주세요.")
    return exe


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, **kw)
    if r.returncode != 0:
        tail = r.stderr.decode("utf-8", "replace")[-1500:]
        raise RuntimeError(f"명령 실패: {' '.join(str(c) for c in cmd[:6])} …\n{tail}")
    return r


def probe(path) -> dict:
    """영상의 너비·높이·길이·fps."""
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path])
    info = json.loads(r.stdout)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    out = {"duration": float(info["format"].get("duration", 0.0)),
           "has_audio": any(s["codec_type"] == "audio" for s in info["streams"])}
    if v:
        w, h = int(v["width"]), int(v["height"])
        rot = 0
        for sd in v.get("side_data_list", []) or []:
            rot = int(sd.get("rotation", rot) or rot)
        if abs(rot) in (90, 270):
            w, h = h, w
        num, den = (v.get("avg_frame_rate") or "30/1").split("/")
        out.update(width=w, height=h, fps=(float(num) / float(den) if float(den) else 30.0))
    return out


def read_audio(path, sr=SR, ch=2, a=None, b=None, af=None) -> np.ndarray:
    """오디오를 float32 (표본수, 채널) 배열로 읽는다. a~b(초)를 주면 그 구간만."""
    cmd = [ffmpeg_bin(), "-v", "error"]
    if a is not None:
        cmd += ["-ss", f"{max(0.0, a):.3f}"]
    if b is not None:
        cmd += ["-to", f"{b:.3f}"]
    cmd += ["-i", path, "-vn"]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", ch, "-ar", sr, "-f", "f32le", "-"]
    raw = run(cmd).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    return x.reshape(-1, ch).copy()


def filter_audio(x: np.ndarray, sr_in: int, af: str, sr_out: int = SR) -> np.ndarray:
    """배열에 ffmpeg 오디오 필터를 걸어 다시 배열로 받는다."""
    ch = x.shape[1]
    cmd = [ffmpeg_bin(), "-v", "error", "-f", "f32le", "-ar", sr_in, "-ac", ch, "-i", "-",
           "-af", af, "-ac", ch, "-ar", sr_out, "-f", "f32le", "-"]
    raw = run(cmd, input=np.ascontiguousarray(x, dtype=np.float32).tobytes()).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def write_wav(path, x: np.ndarray, sr: int = SR):
    ch = x.shape[1]
    run([ffmpeg_bin(), "-v", "error", "-y", "-f", "f32le", "-ar", sr, "-ac", ch, "-i", "-",
         "-c:a", "pcm_s16le", path], input=np.clip(x, -1, 1).astype(np.float32).tobytes())


def rms_db(x: np.ndarray) -> float:
    if x.size == 0:
        return -120.0
    return float(20 * np.log10(max(1e-6, float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))))))


def grab_frame(path, t: float, vf: str | None = None):
    """t초의 한 프레임을 PIL 이미지로."""
    from PIL import Image
    import io
    cmd = [ffmpeg_bin(), "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", path, "-frames:v", "1"]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-f", "image2pipe", "-c:v", "png", "-"]
    return Image.open(io.BytesIO(run(cmd).stdout)).convert("RGB")


# ----------------------------------------------------------------- 모델
def _download(url: str, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    log(f"[모델] 내려받는 중: {url}")
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    tmp.replace(dst)


def model_path(kind: str, explicit: str | None = None) -> Path:
    """kind: asr(폴더) | vad | uvr. 없으면 GitHub 릴리스에서 내려받는다."""
    if explicit:
        p = Path(explicit)
        if not p.exists():
            die(f"모델 파일이 없습니다: {p}")
        return p
    url = MODEL_URLS[kind]
    if kind == "asr":
        d = MODELS / ASR_DIR
        if not (d / "tokens.txt").exists():
            arc = MODELS / url.rsplit("/", 1)[1]
            _download(url, arc)
            with tarfile.open(arc) as t:
                t.extractall(MODELS, filter="data")
            arc.unlink()
        return d
    p = MODELS / url.rsplit("/", 1)[1]
    if not p.exists():
        _download(url, p)
    return p


# ----------------------------------------------------------------- 폰트
_BOLD = [
    "fonts/NotoSansKR-Black.otf", "fonts/NotoSansKR-Black.ttf", "fonts/bold.ttf", "fonts/bold.otf",
    "C:/Windows/Fonts/NotoSansKR-Black.otf", "C:/Windows/Fonts/NotoSansKR-Black.ttf",
    "C:/Windows/Fonts/malgunbd.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]
_REGULAR = [
    "fonts/NotoSansKR-Regular.otf", "fonts/NotoSansKR-Regular.ttf", "fonts/regular.ttf", "fonts/regular.otf",
    "C:/Windows/Fonts/NotoSansKR-Regular.otf", "C:/Windows/Fonts/malgun.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]
_font_cache: dict = {}


def settings() -> dict:
    """사용자가 창에서 고른 설정(글자체·글자 크기). tools/shopping-shorts/settings.json"""
    return read_json(ROOT / "settings.json", {}) or {}


def _resolve_font(explicit: str | None, cands: list[str]) -> tuple[str, int]:
    from PIL import ImageFont
    if explicit and "::" in explicit:      # "파일경로::묶음 안 번호" 로 정확히 지정한 글꼴
        path, _, idx = explicit.rpartition("::")
        if os.path.exists(path):
            return path, int(idx or 0)
        explicit = None
    paths = [explicit] if explicit else []
    paths += [str(ROOT / c) if not os.path.isabs(c) and ":" not in c[:3] else c for c in cands]
    for p in paths:
        if not p or not os.path.exists(p):
            continue
        if p.lower().endswith(".ttc"):
            # 묶음 폰트에서 한국어(KR) 글꼴 번호를 찾는다
            for i in range(12):
                try:
                    name = " ".join(ImageFont.truetype(p, 20, index=i).getname())
                except Exception:
                    break
                if "KR" in name or "Gothic Neo" in name or "Korean" in name:
                    return p, i
            return p, 0
        return p, 0
    die("한글 폰트를 찾지 못했습니다. Noto Sans KR(Black, Regular)을 설치하거나 "
        "tools/shopping-shorts/fonts/ 에 bold.ttf, regular.ttf 로 넣어 주세요. "
        "plan의 font_bold / font_regular 로 경로를 직접 줄 수도 있습니다.")


def font(size: int, bold: bool = True, explicit: str | None = None):
    from PIL import ImageFont
    key = (size, bold, explicit)
    if key not in _font_cache:
        path, idx = _resolve_font(explicit, _BOLD if bold else _REGULAR)
        _font_cache[key] = ImageFont.truetype(path, size, index=idx)
    return _font_cache[key]


# ----------------------------------------------------------------- 편 폴더
class Episode:
    """input/<편>, work/<편>, output/<편> 경로 묶음."""

    def __init__(self, name: str, root: Path | None = None):
        self.name = name
        base = Path(root) if root else ROOT
        self.inp = base / "input" / name
        self.work = base / "work" / name
        self.out_root = base / "output" / name
        if not self.inp.is_dir():
            die(f"입력 폴더가 없습니다: {self.inp}\n원본 영상을 넣은 input/{name}/ 폴더를 만들어 주세요.")
        self.work.mkdir(parents=True, exist_ok=True)

    @property
    def out(self) -> Path:
        """지금 만들고 있는 버전의 폴더(output/<편>/02_수정 …). 버전을 쓰지 않으면 output/<편>."""
        v = read_json(self.work / "version.json") or {}
        return self.out_root / v["dir"] if v.get("dir") else self.out_root

    def start_version(self, label: str) -> Path:
        """새 버전 폴더를 만들고 그쪽으로 바꾼다. 이전 버전은 그대로 남는다."""
        nums = [int(p.name[:2]) for p in self.out_root.glob("[0-9][0-9]_*") if p.is_dir()] if self.out_root.is_dir() else []
        n = max(nums, default=0) + 1
        d = self.out_root / f"{n:02d}_{safe_name(label)}"
        d.mkdir(parents=True, exist_ok=True)
        write_json(self.work / "version.json", {"dir": d.name, "n": n, "label": label})
        return d

    @property
    def source(self) -> Path:
        vids = sorted(p for p in self.inp.iterdir() if p.suffix.lower() in VIDEO_EXT)
        if not vids:
            die(f"{self.inp} 에 원본 영상 파일(mp4 등)이 없습니다.")
        return max(vids, key=lambda p: p.stat().st_size)

    @property
    def info(self) -> dict:
        d = read_json(self.inp / "info.json", {}) or {}
        return {"url": d.get("url", ""), "inpock": str(d.get("inpock", "") or ""),
                "product": d.get("product", ""), "channel": d.get("channel", "")}

    @property
    def vidiq(self) -> str:
        """사용자가 넣은 vidIQ 분석 글(input/<편>/vidiq.txt). 없으면 빈 문자열."""
        p = self.inp / "vidiq.txt"
        return p.read_text(encoding="utf-8", errors="replace").strip() if p.exists() else ""

    @property
    def feedback(self) -> str:
        """완성본을 보고 사용자가 적은 수정 요청(input/<편>/feedback.txt). 없으면 빈 문자열."""
        p = self.inp / "feedback.txt"
        return p.read_text(encoding="utf-8", errors="replace").strip() if p.exists() else ""

    def set_info(self, **kw):
        d = read_json(self.inp / "info.json", {}) or {}
        d.update({k: v for k, v in kw.items() if v})
        write_json(self.inp / "info.json", d)

    def images(self) -> list[Path]:
        return sorted(p for p in self.inp.iterdir()
                      if p.suffix.lower() in IMAGE_EXT and p.stem.lower().startswith("img"))

    def w(self, name: str) -> Path:
        return self.work / name


def safe_name(s: str) -> str:
    bad = '<>:"/\\|?*\n\r\t'
    out = "".join("_" if c in bad else c for c in s).strip().replace(" ", "_")
    return out or "쇼츠"
