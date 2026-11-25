"""원본 mp4 → 20~30초 세로 쇼츠 자동 제작(ffmpeg).

흐름(버튼 한 번):
 1) 영상 정보 확인 → 2) 장면 찾기(사용자 힌트/저장된 장면/자막 → 없으면 AI 가 장면 모음 이미지를 훑어 찾음)
 3) 편집안(EDL) 결정: 초반 2~3초 후킹 컷 + 본편 18~27초, 자막 문구(화면에 실제로 보인 말·설명만, 발언을 지어내지 않음)
 4) 컷 경계를 말 사이 무음에 맞춤 → 5) 1080x1920 렌더링(흐린 배경 + 원본 화면 + 상단 제목 + 하단 자막 + 출처 표기)

원칙: 프로그램은 유튜브 영상을 내려받지 않는다(사용자가 준비한 파일만 사용). 출처 표기를 항상 넣는다.
AI 는 이 단계에서만 쓴다(선택과 집중). AI 키가 없으면 '대략 위치'가 있어야 하며 자막 없이 규칙으로 자른다.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from ..config import get_settings
from ..database import SessionLocal
from ..models import ShortsProject, ShortsRender, SourcingCandidate, utcnow

log = logging.getLogger("shoppulse.shorts")
W, H, FPS = 1080, 1920, 30
HOOK_MIN, HOOK_MAX = 1.5, 3.5
TOTAL_MIN, TOTAL_MAX = 18.0, 32.0
_caps_cache: dict[str, dict] = {}


class ShortsError(RuntimeError):
    pass


# ---------------------------------------------------------------- ffmpeg 찾기·능력
def find_ffmpeg() -> str | None:
    s = get_settings()
    if s.shoppulse_ffmpeg and Path(s.shoppulse_ffmpeg).exists():
        return s.shoppulse_ffmpeg
    w = shutil.which("ffmpeg")
    if w:
        return w
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def capabilities(ff: str | None = None) -> dict:
    ff = ff or find_ffmpeg()
    if not ff:
        return {"available": False, "reason": "ffmpeg 를 찾지 못했습니다. setup.bat 을 다시 실행하거나(내장 ffmpeg 설치) .env 의 SHOPPULSE_FFMPEG 에 경로를 적으세요."}
    if ff in _caps_cache:
        return _caps_cache[ff]
    try:
        filt = subprocess.run([ff, "-hide_banner", "-filters"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace").stdout
        enc = subprocess.run([ff, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace").stdout
        ver = subprocess.run([ff, "-hide_banner", "-version"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace").stdout.splitlines()[0]
    except Exception as e:
        return {"available": False, "reason": f"ffmpeg 실행 실패: {e} (Windows 앱 제어가 막았다면 winget install Gyan.FFmpeg 후 다시 시도)"}
    has = lambda name, text: re.search(rf"\s{name}\s", text) is not None  # noqa: E731
    vcodec = "libx264" if has("libx264", enc) else ("h264_mf" if has("h264_mf", enc) else "mpeg4")
    caps = {"available": True, "path": ff, "version": ver, "ass": has("ass", filt), "drawtext": has("drawtext", filt),
            "tile": has("tile", filt), "vcodec": vcodec, "acodec": "aac"}
    _caps_cache[ff] = caps
    return caps


def _run(args: list[str], cwd: str | None = None, timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")


def probe(ff: str, path: str) -> dict:
    """ffprobe 없이 `ffmpeg -i` 출력에서 길이·해상도·오디오 유무를 읽는다."""
    err = _run([ff, "-hide_banner", "-i", path], timeout=60).stderr
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if not m:
        raise ShortsError("영상 파일을 읽지 못했습니다(지원하지 않는 형식이거나 손상).")
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    v = re.search(r"Stream #.*Video:.*?(\d{3,5})x(\d{3,5})", err)
    if not v:
        raise ShortsError("영상 트랙이 없습니다.")
    rot = re.search(r"rotation of (-?\d+(?:\.\d+)?) degrees|rotate\s*:\s*(\d+)", err)
    w, h = int(v.group(1)), int(v.group(2))
    if rot and abs(int(float(rot.group(1) or rot.group(2)))) in (90, 270):
        w, h = h, w
    return {"duration": round(dur, 2), "width": w, "height": h, "has_audio": bool(re.search(r"Stream #.*Audio:", err)),
            "size": Path(path).stat().st_size}


# ---------------------------------------------------------------- 장면 모음 이미지(AI 입력)
def contact_sheets(ff: str, src: str, start: float, end: float, step: float, cols: int, rows: int, cell_w: int,
                   outdir: Path, tag: str) -> list[dict]:
    """[start,end] 구간을 step 초마다 한 장씩 뽑아 cols×rows 로 붙인 이미지들. 각 칸의 시각을 계산해 함께 돌려준다."""
    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob(f"{tag}_*.jpg"):
        old.unlink()
    dur = max(0.5, end - start)
    r = _run([ff, "-hide_banner", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", src, "-an",
              "-vf", f"fps=1/{step:.3f},scale={cell_w}:-2,tile={cols}x{rows}", "-q:v", "5", str(outdir / f"{tag}_%03d.jpg")], timeout=1200)
    files = sorted(outdir.glob(f"{tag}_*.jpg"))
    if not files:
        raise ShortsError(f"장면 이미지 추출 실패: {r.stderr[-300:]}")
    per = cols * rows
    n_frames = int(dur // step) + 1
    sheets = []
    for i, f in enumerate(files):
        times = [round(start + (i * per + k) * step, 1) for k in range(per) if (i * per + k) < n_frames + 1]
        sheets.append({"path": str(f), "times": times, "cols": cols, "rows": rows})
    return sheets


def detect_silences(ff: str, src: str, start: float, end: float) -> list[tuple[float, float]]:
    r = _run([ff, "-hide_banner", "-ss", f"{max(0, start):.2f}", "-t", f"{max(1, end - start):.2f}", "-i", src, "-vn",
              "-af", "silencedetect=noise=-32dB:d=0.22", "-f", "null", "-"], timeout=600)
    out, cur = [], None
    for line in r.stderr.splitlines():
        m = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", line)
        if m:
            cur = float(m.group(1))
        m = re.search(r"silence_end:\s*(-?\d+(?:\.\d+)?)", line)
        if m and cur is not None:
            out.append((start + max(0.0, cur), start + float(m.group(1))))
            cur = None
    return out


def snap(t: float, silences: list[tuple[float, float]], tol: float = 0.7) -> float:
    best, bd = t, tol
    for a, b in silences:
        mid = (a + b) / 2
        if abs(mid - t) <= bd:
            best, bd = mid, abs(mid - t)
    return round(best, 2)


# ---------------------------------------------------------------- 편집안(EDL)
def clean_title(text: str | None) -> str:
    t = re.sub(r"#\S+", "", text or "")
    return re.sub(r"\s+", " ", t).strip()


def split_title(text: str, max_len: int = 13) -> list[str]:
    """제목을 2줄 이내로(한 줄 13자 안팎)."""
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) <= max_len:
            cur = f"{cur} {w}".strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == 2:
            break
    if cur and len(lines) < 2:
        lines.append(cur)
    return [ln[:max_len + 4] for ln in lines[:2]] or [text[:max_len]]


def normalize_edl(edl: dict, duration: float, total_target: float | None = None) -> dict:
    """AI·사람이 준 편집안을 안전한 범위로 정리: 범위 클램프, 후킹 1.5~3.5초, 본편 시간순·겹침 제거, 총 길이(기본 18~32초, 스타일 목표 ±5초)."""
    tmin, tmax = (TOTAL_MIN, TOTAL_MAX) if not total_target else (max(15.0, total_target - 6), min(65.0, total_target + 5))
    def clampseg(sg):
        a, b = float(sg.get("start", 0)), float(sg.get("end", 0))
        a = max(0.0, min(a, max(0.0, duration - 0.5))); b = max(a + 0.3, min(b, duration))
        return {"start": round(a, 2), "end": round(b, 2), "caption": (sg.get("caption") or "").strip()[:40]}

    segs = sorted([clampseg(x) for x in (edl.get("segments") or []) if x], key=lambda x: x["start"])
    merged: list[dict] = []
    for sg in segs:
        if sg["end"] - sg["start"] < 1.0:
            continue
        if merged and sg["start"] < merged[-1]["end"]:
            sg["start"] = merged[-1]["end"]
            if sg["end"] - sg["start"] < 1.0:
                continue
        merged.append(sg)
    if not merged:
        raise ShortsError("편집안에 쓸 수 있는 본편 구간이 없습니다.")
    hook = clampseg(edl["hook"]) if edl.get("hook") else None
    if hook:
        hl = min(HOOK_MAX, max(HOOK_MIN, hook["end"] - hook["start"]))
        hook["end"] = round(min(duration, hook["start"] + hl), 2)
    hook_len = (hook["end"] - hook["start"]) if hook else 0.0
    # 총 길이 맞추기: 넘치면 뒤에서부터 줄이고, 모자라면 마지막 구간을 늘린다
    total = hook_len + sum(x["end"] - x["start"] for x in merged)
    while total > tmax and merged:
        over = total - tmax
        last = merged[-1]
        ln = last["end"] - last["start"]
        if ln - over >= 2.0:
            last["end"] = round(last["end"] - over, 2)
        else:
            merged.pop()
        total = hook_len + sum(x["end"] - x["start"] for x in merged)
    if total < tmin and merged:
        need = tmin - total
        merged[-1]["end"] = round(min(duration, merged[-1]["end"] + need), 2)
    out = {"hook": hook, "segments": merged,
           "title_lines": [str(x).strip()[:20] for x in (edl.get("title_lines") or []) if str(x).strip()][:2],
           "credit": (edl.get("credit") or "").strip()[:60], "end_caption": (edl.get("end_caption") or "").strip()[:24],
           "narration": " ".join(str(edl.get("narration") or "").split())[:60],
           "reason": edl.get("reason"), "quote_seen": edl.get("quote_seen"),
           "cautions": edl.get("cautions") or []}
    for k in ("overlays", "product_popup_segment", "audio"):
        if edl.get(k) is not None:
            out[k] = edl[k]
    out["total_seconds"] = round((out["hook"]["end"] - out["hook"]["start"] if out["hook"] else 0) + sum(x["end"] - x["start"] for x in merged), 2)
    return out


def rule_edl(start: float, end: float | None, duration: float, title: str) -> dict:
    """AI 없이: 알려준 위치에서 25초. 후킹은 구간의 40% 지점 3초(자막 없음)."""
    end = end if end and end > start + 8 else start + 25
    end = min(duration, max(end, start + 20))
    span = min(end - start, 25)
    return {"hook": {"start": start + span * 0.4, "end": start + span * 0.4 + 3, "caption": ""},
            "segments": [{"start": start, "end": start + span, "caption": ""}],
            "title_lines": split_title(clean_title(title)), "reason": "규칙 편집(AI 미사용): 지정 위치에서 25초, 후킹은 구간 40% 지점 3초"}


EDL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["hook", "segments", "title_lines", "end_caption", "narration", "product_popup_segment", "quote_seen", "reason", "cautions"],
    "properties": {
        "hook": {"type": "object", "additionalProperties": False, "required": ["start", "end", "caption"],
                 "properties": {"start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"}}},
        "segments": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["start", "end", "caption"],
                                               "properties": {"start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"}}}},
        "title_lines": {"type": "array", "items": {"type": "string"}},
        "end_caption": {"type": "string"},
        "narration": {"type": "string"}, "product_popup_segment": {"type": "integer"},
        "quote_seen": {"type": "string"}, "reason": {"type": "string"},
        "cautions": {"type": "array", "items": {"type": "string"}},
    },
}
LOCATE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["found", "start", "end", "confidence", "reason"],
    "properties": {"found": {"type": "boolean"}, "start": {"type": "number"}, "end": {"type": "number"},
                   "confidence": {"type": "string", "enum": ["high", "medium", "low"]}, "reason": {"type": "string"}},
}


def _img_block(path: str) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(Path(path).read_bytes()).decode()}}


def _sheet_content(sheets: list[dict]) -> list[dict]:
    content: list[dict] = []
    for i, sh in enumerate(sheets, 1):
        content.append({"type": "text", "text": f"[장면 모음 {i}] {sh['cols']}열×{sh['rows']}행, 왼쪽 위부터 오른쪽으로 순서대로. 각 칸의 시각(초): {sh['times']}"})
        content.append(_img_block(sh["path"]))
    return content


def ai_locate(ff: str, src: str, info: dict, ctx: dict, workdir: Path) -> dict:
    """영상 전체를 듬성듬성 훑어 '참고 쇼츠가 쓴 장면'이 있는 구간(최대 150초)을 찾는다."""
    from .claude_client import create_json
    dur = info["duration"]
    step = max(6.0, dur / 150)
    sheets = contact_sheets(ff, src, 0, dur, step, 3, 3, 520, workdir, "coarse")[:18]
    content = _sheet_content(sheets)
    content.append({"type": "text", "text": json.dumps({"task": "아래 정보의 재편집 쇼츠가 잘라 쓴 장면이 원본 어디쯤인지 찾아라.", **ctx}, ensure_ascii=False)})
    system = ("유튜브 원본 영상의 장면 모음 이미지를 보고, 참고 쇼츠(제목·상품·썸네일 설명)가 다룬 장면이 나오는 구간을 초 단위로 찾는 편집 보조다. 한국어. "
              "해당 상품·소품·화면 자막이 보이는 칸들의 시각을 근거로 start/end(최대 150초 폭)를 준다. 못 찾으면 found=false. 추측이면 confidence=low.")
    return create_json(system=system, max_tokens=700, output_schema=LOCATE_SCHEMA, messages=[{"role": "user", "content": content}], timeout=240.0)


def ai_edit(ff: str, src: str, info: dict, ctx: dict, rng: tuple[float, float], workdir: Path, transcript: list[dict] | None,
            guide: dict | None = None) -> dict:
    """찾은 구간을 촘촘히(약 2초 간격) 보고 후킹 컷·본편 컷·자막 문구를 정한다."""
    from .claude_client import create_json
    a, b = max(0.0, rng[0] - 8), min(info["duration"], rng[1] + 8)
    if b - a > 170:
        b = a + 170
    step = max(1.5, (b - a) / 80)
    sheets = contact_sheets(ff, src, a, b, step, 2, 2, 780, workdir, "fine")[:20]
    content = _sheet_content(sheets)
    payload = {"task": "이 구간에서 20~30초 쇼츠 편집안을 만든다.", "range": [round(a, 1), round(b, 1)], **ctx}
    fast = bool(guide and guide.get("target_segments", 0) > 4)  # 레퍼런스가 빠른 컷이면 짧은 컷을 여러 개 허용
    seg_rule = (f"segments 는 시간순 {max(3, guide['target_segments'] - 2)}~{guide['target_segments']}개, 한 컷 1.5~{guide['max_clip_seconds']}초로 짧게 끊되 "
                f"말이 중간에 잘리지 않는 지점에서 자른다(합계는 target_total_seconds 에 맞춘다). 같은 장면을 길게 두지 말고 반응·상품 클로즈업·사용 장면을 번갈아 고른다. "
                if fast else "segments 는 시간순 1~4개, 합계 18~27초, 말이 끊기지 않게 한 구간은 3초 이상. ")
    hi_rule = (" caption 안에서 가장 중요한 단어 하나를 *별표*로 감싼다(예: *3천원대* 립밤). 그 단어는 강조색으로 표시된다." if guide and guide.get("highlight_keyword") else "")
    if guide:
        payload["style_guide"] = guide
    if transcript:
        payload["transcript_excerpt"] = [{"t": s["start"], "text": s["text"]} for s in transcript if a - 5 <= s["start"] <= b + 5][:120]
    content.append({"type": "text", "text": json.dumps(payload, ensure_ascii=False)})
    system = (
        "쇼핑 쇼츠 편집자. 한국어. 원본 영상 구간의 장면 모음 이미지(각 칸 시각 제공)와 자막 발췌(있으면)를 보고 편집안을 만든다.\n"
        "규칙: 1) hook 은 가장 궁금증을 일으키는 2~3초(상품이 처음 드러나거나 반응이 큰 순간). 본편과 겹쳐도 된다. "
        "2) " + seg_rule + "상품이 화면에 보이는 장면을 반드시 포함. "
        "3) caption 은 각 구간 하단 자막 한 줄(18자 이내). 화면 자막·자막 발췌에 실제로 나온 말이나 사실 설명만 쓴다. 연예인 발언을 지어내지 않는다. "
        "'추천'은 실제로 추천한 경우에만. hook.caption 은 12자 이내의 궁금증 문구." + hi_rule + " "
        "4) title_lines 는 상단 제목 2줄(각 12자 이내, 과장·허위 금지). 5) quote_seen 에는 화면 자막 등에서 실제로 읽은 핵심 문장을 그대로(없으면 빈 문자열). "
        "6) 확인이 필요한 점(상품 불명확, 광고·협찬 표시가 보임 등)은 cautions 에 적는다. 시각은 반드시 제공된 칸의 시각 범위 안에서 고른다.\n"
        "7) style_guide 가 있으면 그 편집 스타일을 따른다: 후킹 길이·방식, 구간 수와 한 컷 최대 길이, 총 길이 목표, 제목·자막의 말투와 글자 수. "
        "스타일은 '방식'만 참고하고 다른 채널의 문구를 그대로 쓰지 않는다. own_twist(우리만의 차별점)를 반영해 한 가지 이상 다르게 구성한다. "
        "end_question 이 true 면 end_caption 에 시청자에게 던지는 짧은 질문(14자 이내)을 쓰고, 아니면 빈 문자열. 위 1~6의 사실 규칙이 항상 우선한다.\n"
        "8) narration: style_guide.narration 이 true 면 첫 장면에 AI 음성으로 읽을 한 문장(24자 이내, 3초 안에 읽히게)을 쓴다. narration_pattern 의 방식을 따르되 "
        "화면·자막에서 확인된 사실만으로 궁금증을 만든다(예: '[인물]이 [기간]째 쓴다는 [상품 종류]가 있다는데'). 인물이 하지 않은 말·효능·가격을 지어내지 않는다. false 면 빈 문자열. "
        "9) product_popup_segment: 상품이 화면에 가장 또렷하게 보이거나 처음 소개되는 segments 의 번호(0부터). 상품 사진을 그때 띄운다. 모르면 0.")
    return create_json(system=system, max_tokens=2500 if fast else 1500, output_schema=EDL_SCHEMA, messages=[{"role": "user", "content": content}], timeout=300.0)


# ---------------------------------------------------------------- 자막(ASS)·렌더링
def _ass_time(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def _ass_text(s: str) -> str:
    return (s or "").replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ").strip()


_STAR = re.compile(r"\*([^*]{1,20})\*")


def _ass_caption(s: str, highlight: str = "") -> str:
    """자막 한 줄. *단어* 는 강조색으로(강조색이 없는 스타일이면 별표만 지운다)."""
    from .style_profile import ass_color
    t = _ass_text(s)
    if not highlight:
        return _STAR.sub(r"\1", t)
    c = ass_color(highlight)
    return _STAR.sub(lambda m: "{\\c&H" + c[4:] + "&}" + m.group(1) + "{\\r}", t)


def default_font() -> str:
    if sys.platform.startswith("win"):
        return "Malgun Gothic"
    try:
        out = subprocess.run(["fc-match", "-f", "%{family}", ":lang=ko"], capture_output=True, text=True, timeout=10).stdout
        return out.split(",")[0].strip() or "sans-serif"
    except Exception:
        return "sans-serif"


def build_ass(edl: dict, font: str, fg_top: int, fg_bottom: int, style: dict | None = None) -> str:
    """출력 타임라인 기준 자막. 제목(상단, 전 구간) · 후킹 문구 · 구간 자막 · 끝 질문 · 출처(최하단, 전 구간). 색·크기·위치는 스타일을 따른다."""
    from .style_profile import DEFAULT_STYLE, SIZES, ass_color
    st = style or DEFAULT_STYLE
    ti, ca, ho = st["title"], st["caption"], st["hook"]
    total = edl["total_seconds"]
    full = fg_top <= 0 and fg_bottom >= H  # 화면을 꽉 채운 배치
    tsize, csize = SIZES["title"][ti["size"]], SIZES["caption"][ca["size"]]
    title_margin = 170 if full else max(90, fg_top - int(tsize * 2.6) - 60)
    if ca["position"] == "bottom" or full:
        cap_align, cap_margin = 2, 300
    elif ca["position"] == "over_video":
        cap_align, cap_margin = 2, max(120, H - fg_bottom + 30)
    else:  # below_video: 영상 바로 아래에서 시작(위쪽 기준 정렬)
        cap_align, cap_margin = 8, min(H - 260, fg_bottom + 40)

    def border(box: bool, outline: str, box_color: str, width: int) -> tuple[int, str, int]:
        return (3, ass_color(box_color), 12) if box else (1, ass_color(outline), width)

    tb, tcol, tw = border(ti["box"], ti["outline_color"], ti["box_color"], 7)
    cb, ccol, cw = border(ca["box"], ca["outline_color"], ca["box_color"], 6)
    # 후킹 자막 테두리: 흰 글씨일 때만 빨강(기본 스타일), 색 글씨면 검정(색끼리 부딪히지 않게)
    hook_outline = "&H001A1AE6" if ho["caption_color"].upper() == "#FFFFFF" else "&H00000000"
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,{font},{tsize},{ass_color(ti["color"])},&H000000FF,{tcol},&H80000000,1,0,0,0,100,100,0,0,{tb},{tw},{0 if ti["box"] else 2},8,50,50,{title_margin},1
Style: Hook,{font},{csize + 32},{ass_color(ho["caption_color"])},&H000000FF,{hook_outline},&H80000000,1,0,0,0,100,100,0,0,1,8,2,{cap_align},50,50,{cap_margin},1
Style: Cap,{font},{csize},{ass_color(ca["color"])},&H000000FF,{ccol},&H80000000,1,0,0,0,100,100,0,0,{cb},{cw},{0 if ca["box"] else 2},{cap_align},60,60,{cap_margin},1
Style: Credit,{font},34,&H00DDDDDD,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,40,40,70,1
Style: Footer,{font},46,{ass_color((st.get("footer") or {}).get("color", "#FFFFFF"))},&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,40,40,125,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    if ti["enabled"] and edl.get("title_lines"):
        lines = [_ass_text(x) for x in edl["title_lines"]]
        if len(lines) > 1 and ti.get("second_line_color"):
            lines[1] = "{\\c" + ass_color(ti["second_line_color"])[:2] + ass_color(ti["second_line_color"])[4:] + "&}" + lines[1]
        ev.append(f"Dialogue: 1,{_ass_time(0)},{_ass_time(total)},Title,,0,0,0,," + "\\N".join(lines))
    t = 0.0
    if edl.get("hook"):
        hl = edl["hook"]["end"] - edl["hook"]["start"]
        if edl["hook"].get("caption"):
            ev.append(f"Dialogue: 2,{_ass_time(0)},{_ass_time(hl)},Hook,,0,0,0,,{_ass_caption(edl['hook']['caption'], ca.get('highlight_color', ''))}")
        t = hl
    end_cap = edl.get("end_caption") or ""
    end_from = total - 1.8 if end_cap else total
    for sg in edl["segments"]:
        ln = sg["end"] - sg["start"]
        if ca["enabled"] and sg.get("caption"):
            a, b = t + 0.05, min(t + ln - 0.05, end_from)
            if b - a > 0.4:
                ev.append(f"Dialogue: 2,{_ass_time(a)},{_ass_time(b)},Cap,,0,0,0,,{_ass_caption(sg['caption'], ca.get('highlight_color', ''))}")
        t += ln
    if end_cap:
        ev.append(f"Dialogue: 3,{_ass_time(end_from)},{_ass_time(total)},Hook,,0,0,0,,{_ass_text(end_cap)}")
    footer = (st.get("footer") or {}).get("text") or ""
    if footer and not full:
        ev.append(f"Dialogue: 0,{_ass_time(0)},{_ass_time(total)},Footer,,0,0,0,,{_ass_text(footer)}")
    if edl.get("credit"):
        ev.append(f"Dialogue: 0,{_ass_time(0)},{_ass_time(total)},Credit,,0,0,0,,{_ass_text(edl['credit'])}")
    return head + "\n".join(ev) + "\n"


POPUP_W = {"product": {"small": 300, "medium": 400, "large": 520}, "logo": {"small": 170, "medium": 230, "large": 300}}


def render(ff: str, caps: dict, src: str, info: dict, edl: dict, out_path: Path, workdir: Path, font: str | None = None,
           style: dict | None = None, extras: dict | None = None) -> dict:
    """extras(선택): {"overlays":[{path,kind,start,end}], "narration":{path,duration}, "sfx":[(이름,시각)], "bgm":{path,volume}}"""
    from .audio_fx import SFX
    from .style_profile import DEFAULT_STYLE
    st = style or DEFAULT_STYLE
    ex = extras or {}
    total = edl["total_seconds"]
    lay = st["layout"]
    clips = ([edl["hook"]] if edl.get("hook") else []) + edl["segments"]
    vertical = info["height"] >= info["width"]
    fill = vertical or lay["mode"] == "crop_fill"
    zoom = 1.0 if fill else lay["fg_zoom"]
    fg_h = H if fill else min(H - 520, int(round(W * info["height"] / info["width"] * zoom / 2) * 2))
    fg_top = 0 if fill else ((H - fg_h) // 2 - 60 if lay["fg_position"] == "center" else max(300, (H - fg_h) // 2 - 220))
    args = [ff, "-hide_banner", "-y"]
    for c in clips:
        args += ["-ss", f"{c['start']:.2f}", "-t", f"{c['end'] - c['start']:.2f}", "-i", src]
    n = len(clips)
    parts = []
    sw, sh = info["width"] // 2 * 2, info["height"] // 2 * 2
    for i in range(n):
        punch = ""
        if i == 0 and edl.get("hook") and st["hook"]["zoom_punch"]:
            # 후킹 컷만 살짝 확대(1.12배)해 시선을 끈다
            punch = f",scale={int(sw * 1.12) // 2 * 2}:{int(sh * 1.12) // 2 * 2},crop={sw}:{sh}"
        # setsar 는 맨 끝에: 확대한 컷도 다른 컷과 화소 비율이 같아야 이어 붙일 수 있다
        parts.append(f"[{i}:v]fps={FPS},setpts=PTS-STARTPTS,scale={sw}:{sh}{punch},setsar=1[v{i}]")
        if info["has_audio"]:
            parts.append(f"[{i}:a]aresample=48000,asetpts=PTS-STARTPTS[a{i}]")
    if info["has_audio"]:
        parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][ca]")
    else:
        parts.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[cv]")
    if fill:
        parts.append(f"[cv]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[base]")
    else:
        parts.append("[cv]split[bg0][fg0]")
        if lay["mode"] == "color_bg":
            parts.append(f"[bg0]scale={W}:{H},setsar=1,drawbox=x=0:y=0:w=iw:h=ih:color=0x{lay['bg_color'][1:]}:t=fill[bg]")
        else:
            parts.append(f"[bg0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=24:2,eq=brightness=-0.28:saturation=0.8,setsar=1[bg]")
        crop = f"crop=trunc(iw/{zoom}/2)*2:ih," if zoom > 1.001 else ""
        parts.append(f"[fg0]{crop}scale={W}:{fg_h},setsar=1[fg]")
        parts.append(f"[bg][fg]overlay=0:{fg_top}[base]")
    notes = []
    nin = n  # 다음 입력 번호
    # 상품 사진·로고 팝업: 살짝 아래에서 올라오며 나타났다가 사라진다(자막보다 아래 층)
    cur = "base"
    pop = st.get("popup") or DEFAULT_STYLE["popup"]
    for i, ov in enumerate(ex.get("overlays") or []):
        a0, b0 = max(0.0, float(ov["start"])), min(total, float(ov["end"]))
        if b0 - a0 < 0.6 or not Path(ov["path"]).exists():
            continue
        kind = "logo" if ov.get("kind") == "logo" else "product"
        w = POPUP_W[kind][pop["size"]]
        top = (330 if fill else fg_top + 36)
        if kind == "logo":
            x, y = "40", str(top)
        elif pop["position"] == "top_left":
            x, y = "40", str(top)
        elif pop["position"] == "center":
            x, y = "(W-w)/2", str((H - w) // 2 if fill else fg_top + max(20, (fg_h - w) // 2))
        else:
            x, y = "W-w-40", str(top)
        args += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(ov["path"])]
        hmax = int((H * 0.36) if fill else max(240, fg_h * (0.42 if kind == "logo" else 0.72))) // 2 * 2  # 세로로 긴 사진이 화면을 덮지 않게
        parts.append(f"[{nin}:v]scale={w}:{hmax}:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st={a0:.2f}:d=0.18:alpha=1,fade=t=out:st={b0 - 0.2:.2f}:d=0.2:alpha=1[ov{i}]")
        parts.append(f"[{cur}][ov{i}]overlay=x={x}:y='{y}+46*(1-min(1,max(0,(t-{a0:.2f})/0.16)))':enable='between(t,{a0:.2f},{b0:.2f})'[pb{i}]")
        cur, nin = f"pb{i}", nin + 1
    if caps.get("ass"):
        (workdir / "subs.ass").write_text(build_ass(edl, font or default_font(), fg_top, fg_top + fg_h, st), encoding="utf-8")
        parts.append(f"[{cur}]ass=subs.ass,setsar=1[vout]")  # 화소 비율 1:1 고정(아니면 플레이어에서 눌려 보인다)
    else:
        parts.append(f"[{cur}]setsar=1[vout]")
        notes.append("이 ffmpeg 에는 자막 굽기(libass)가 없어 제목·자막 없이 렌더링했습니다. winget install Gyan.FFmpeg 로 전체 버전을 설치하면 자막이 들어갑니다.")
    # 필터 그래프는 인자로 직접 넘긴다(-filter_complex_script 는 최신 ffmpeg 에서 제거됨). 경로는 작업 폴더 기준 상대경로라 이스케이프 불필요
    # 소리 섞기: 원본 소리(내레이션 동안은 작게) + AI 음성 + 효과음 + 배경음악
    narr, bgm, sfx = ex.get("narration"), ex.get("bgm"), [x for x in (ex.get("sfx") or []) if x[0] in SFX and 0 <= x[1] < total]
    amap = "[ca]" if info["has_audio"] else None
    if narr or bgm or sfx:
        fmt = "aformat=sample_rates=48000:channel_layouts=stereo"
        if info["has_audio"]:
            duck = f",volume=volume=0.22:enable='between(t,0,{narr['duration'] + 0.45:.2f})'" if narr else ""
            parts.append(f"[ca]{fmt}{duck}[a_base]")
        else:
            parts.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={total:.2f}[a_base]")
        mix = ["[a_base]"]
        if narr:
            args += ["-i", str(narr["path"])]
            parts.append(f"[{nin}:a]aresample=48000,{fmt},volume=1.7,adelay=150:all=1[a_narr]")
            mix.append("[a_narr]"); nin += 1
        for j, (name, at) in enumerate(sfx):
            args += ["-f", "lavfi", "-t", str(SFX[name]["dur"]), "-i", SFX[name]["src"]]
            parts.append(f"[{nin}:a]{fmt},volume={SFX[name]['vol']},adelay={int(at * 1000)}:all=1[a_fx{j}]")
            mix.append(f"[a_fx{j}]"); nin += 1
        if bgm:
            args += ["-stream_loop", "-1", "-i", str(bgm["path"])]
            fo = max(0.0, total - 1.4)
            parts.append(f"[{nin}:a]aresample=48000,{fmt},volume={bgm['volume']},atrim=duration={total:.2f},afade=t=in:d=0.6,afade=t=out:st={fo:.2f}:d=1.4[a_bgm]")
            mix.append("[a_bgm]"); nin += 1
        parts.append("".join(mix) + f"amix=inputs={len(mix)}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]")
        amap = "[aout]"
    args += ["-filter_complex", ";".join(parts), "-map", "[vout]"]
    if amap:
        args += ["-map", amap, "-c:a", caps["acodec"], "-b:a", "160k"]
    if ex:
        args += ["-t", f"{total:.2f}"]  # 반복 입력(사진·배경음악)이 있어도 영상 길이에서 끝낸다
    if caps["vcodec"] == "libx264":
        args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
    elif caps["vcodec"] == "h264_mf":
        args += ["-c:v", "h264_mf", "-b:v", "8M", "-pix_fmt", "yuv420p"]
    else:
        args += ["-c:v", "mpeg4", "-q:v", "4"]
        notes.append("H.264 인코더가 없어 MPEG-4 로 저장했습니다.")
    args += ["-r", str(FPS), "-movflags", "+faststart", str(out_path)]
    r = _run(args, cwd=str(workdir), timeout=1800)
    if r.returncode != 0 or not out_path.exists() or out_path.stat().st_size < 1000:
        raise ShortsError("렌더링 실패: " + r.stderr[-600:])
    o = probe(ff, str(out_path))
    return {"duration": o["duration"], "width": o["width"], "height": o["height"], "size": o["size"], "notes": notes}


def plan_overlays(edl: dict, assets: list[dict]) -> list[dict]:
    """상품 사진·로고가 뜨는 시각(완성 영상 기준). 편집안에 적힌 값이 있으면 그대로, 없으면 기본값:
    로고 = 시작 직후(후킹 동안), 상품 사진 = 상품이 나오는 컷이 시작되고 0.4초 뒤부터 2.8초."""
    total = edl["total_seconds"]
    have = {o.get("asset_id"): o for o in (edl.get("overlays") or []) if isinstance(o, dict)}
    hook_len = (edl["hook"]["end"] - edl["hook"]["start"]) if edl.get("hook") else 0.0
    starts, t = [], hook_len
    for sg in edl["segments"]:
        starts.append(t)
        t += sg["end"] - sg["start"]
    try:
        first = max(0, min(len(starts) - 1, int(edl.get("product_popup_segment") or 0)))
    except (TypeError, ValueError):
        first = 0
    out, nprod = [], 0
    for a in assets:
        o = have.get(a["id"])
        try:
            start, dur = (float(o.get("start", 0)), float(o.get("duration", 2.8))) if o else (None, None)
        except (TypeError, ValueError):
            start, dur = None, None
        if start is None:
            if a.get("kind") == "logo":
                start, dur = 0.3, max(1.5, min(2.6, (hook_len or 2.9) - 0.3))
            else:
                start, dur = starts[min(len(starts) - 1, first + nprod)] + 0.4, 2.8
                nprod += 1
        start = max(0.0, min(start, max(0.0, total - 1.0)))
        dur = max(1.0, min(dur, 8.0, total - start))
        out.append({"asset_id": a["id"], "kind": a.get("kind", "product"), "name": a.get("name"), "start": round(start, 1), "duration": round(dur, 1)})
    return out


def build_extras(edl: dict, assets: list[dict], style: dict | None, ff: str, workdir: Path, seed: int, notes: list[str]) -> dict:
    """렌더러에 넘길 소리·팝업 재료. 실패한 재료는 빼고 사유를 notes 에 적는다(영상은 계속 만든다)."""
    from . import audio_fx
    extras: dict = {}
    by_id = {a["id"]: a for a in assets}
    edl["overlays"] = plan_overlays(edl, assets)
    if edl["overlays"]:
        extras["overlays"] = [{"path": by_id[o["asset_id"]]["cut_path"], "kind": o["kind"], "start": o["start"], "end": o["start"] + o["duration"]}
                              for o in edl["overlays"]]
    audio: dict = {}
    if edl.get("narration"):
        try:
            out = workdir / "narration.wav"
            got = audio_fx.synthesize(edl["narration"], out, (style or {}).get("narration", {}).get("rate", 1.12))
            dur = probe_audio(ff, str(out))
            extras["narration"] = {"path": str(out), "duration": dur}
            audio["narration"] = f"{got['provider']} · {got['voice']} · {dur:.1f}초"
        except Exception as e:  # TTSError 포함: 음성이 없어도 영상은 만든다
            notes.append(f"AI 음성 내레이션을 넣지 못했습니다: {str(e)[:200]}")
            audio["narration"] = None
    if style and style["sfx"]["enabled"]:
        hook_len = (edl["hook"]["end"] - edl["hook"]["start"]) if edl.get("hook") else 0.0
        fx = [("whoosh", max(0.0, hook_len - 0.25))] if hook_len else []
        fx += [("pop", o["start"]) for o in edl["overlays"]]
        if edl.get("end_caption"):
            fx.append(("ding", max(0.0, edl["total_seconds"] - 1.8)))
        extras["sfx"], audio["sfx"] = fx, [x[0] for x in fx]
    if style and style["bgm"]["mode"] == "auto":
        path, desc = audio_fx.pick_bgm(ff, seed, style["bgm"].get("track") or None)
        if path:
            extras["bgm"] = {"path": str(path), "volume": style["bgm"]["volume"]}
            audio["bgm"] = desc
        else:
            notes.append("배경음악을 준비하지 못해 넣지 않았습니다.")
    edl["audio"] = audio
    return extras


def probe_audio(ff: str, path: str) -> float:
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", _run([ff, "-hide_banner", "-i", path], timeout=60).stderr)
    if not m:
        raise ShortsError("음성 파일을 읽지 못했습니다.")
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


# ---------------------------------------------------------------- 작업 실행
def _set(db, r: ShortsRender, step: str, progress: int) -> None:
    r.step, r.progress = step, progress
    db.commit()


def _context(c: SourcingCandidate) -> dict:
    short, orig = c.video, c.video.original
    return {"reference_short_title": short.title, "reference_short_description": (short.description or "")[:300],
            "product": ({"name": c.product.name, "brand": c.product.brand} if c.product else None),
            "celebrity": c.celebrity.name if c.celebrity else None,
            "original_title": orig.title if orig else None,
            "note": "참고 쇼츠는 타인이 만든 재편집물이다. 그 자막을 베끼지 말고 원본 화면에 근거해 새로 구성한다."}


def decide_edl(db, c: SourcingCandidate, proj: ShortsProject, r: ShortsRender, ff: str, info: dict, workdir: Path,
               style: dict | None = None) -> tuple[dict, str, list[str]]:
    notes: list[str] = []
    orig = c.video.original
    transcript = (orig.transcript or {}).get("segments") if (orig and isinstance(orig.transcript, dict)) else None
    rng: tuple[float, float] | None = None
    basis = ""
    if proj.hint_start is not None:
        rng, basis = (float(proj.hint_start), float(proj.hint_end or proj.hint_start + 60)), "manual_range"
    elif c.segment and c.segment.start_seconds is not None:
        rng, basis = (float(c.segment.start_seconds), float(c.segment.end_seconds or c.segment.start_seconds + 60)), "saved_segment"
    if rng is not None and rng[0] >= info["duration"] - 5:
        src_name = "입력한 위치" if basis == "manual_range" else "저장된 장면 위치"
        raise ShortsError(f"{src_name}({int(rng[0])}초)가 올린 영상 길이({int(info['duration'])}초)를 넘습니다. 올린 파일이 원본 전체가 맞는지 확인하거나 '대략 위치'를 다시 적어 주세요.")
    has_ai = bool(get_settings().anthropic_api_key)
    title = c.video.title or ""
    if not has_ai:
        if rng is None:
            raise ShortsError("AI 키가 없으면 '대략 위치(분:초)'를 입력해야 합니다. 원본에서 상품이 나오는 시각을 적고 다시 눌러 주세요.")
        notes.append("AI 키가 없어 규칙으로 잘랐습니다(자막 문구 없음). 아래 편집안에서 시간을 고쳐 다시 렌더링할 수 있습니다.")
        return rule_edl(rng[0], rng[1], info["duration"], title), basis + "+rule", notes
    ctx = _context(c)
    if rng is None:
        if info["duration"] <= 200:
            rng, basis = (0.0, info["duration"]), "whole_video"
        else:
            _set(db, r, "AI 가 영상 전체에서 장면 찾는 중", 20)
            loc = ai_locate(ff, proj.source_path, info, ctx, workdir)
            if not loc.get("found"):
                raise ShortsError(f"AI 가 원본에서 해당 장면을 찾지 못했습니다({loc.get('reason', '')}). '대략 위치(분:초)'를 입력하고 다시 시도하세요.")
            rng, basis = (float(loc["start"]), float(loc["end"])), "ai_locate"
            notes.append(f"AI 장면 탐색({loc.get('confidence')}): {loc.get('reason', '')}")
    _set(db, r, "AI 가 후킹 장면·컷 구성 중", 40)
    from .style_profile import style_guide
    raw = ai_edit(ff, proj.source_path, info, ctx, rng, workdir, transcript, guide=style_guide(style) if style else None)
    raw.pop("_model", None); raw.pop("_transport", None)
    return raw, basis + "+ai_vision", notes


def run_render(render_id: int, reuse_edl: bool = False) -> None:
    with SessionLocal() as db:
        r = db.get(ShortsRender, render_id)
        if not r:
            return
        workdir = get_settings().media_dir / "work" / f"r{render_id}"
        try:
            c = db.get(SourcingCandidate, r.candidate_id)
            proj = db.get(ShortsProject, r.candidate_id)
            if not c or not proj or not proj.source_path or not Path(proj.source_path).exists():
                raise ShortsError("원본 mp4 파일이 없습니다. 먼저 파일을 올려 주세요.")
            ff = find_ffmpeg()
            caps = capabilities(ff)
            if not caps.get("available"):
                raise ShortsError(caps.get("reason", "ffmpeg 없음"))
            r.status = "running"
            workdir.mkdir(parents=True, exist_ok=True)
            _set(db, r, "영상 정보 확인", 5)
            info = probe(ff, proj.source_path)
            proj.source_info = info
            notes: list[str] = []
            from ..models import ReferenceStyle
            from .style_profile import normalize_style
            ref = db.get(ReferenceStyle, r.style_id) if r.style_id else None
            style = normalize_style(ref.profile) if (ref and ref.profile) else None
            target = style["pacing"]["total_seconds"] if style else None
            if ref and not style:
                notes.append(f"스타일 「{ref.name}」이 아직 학습되지 않아 기본 스타일로 만들었습니다.")
            if reuse_edl and r.edl:
                edl, by = r.edl, "edited"
            else:
                edl, by, notes2 = decide_edl(db, c, proj, r, ff, info, workdir, style)
                notes += notes2
                if style and edl.get("hook"):
                    edl["hook"]["end"] = edl["hook"]["start"] + style["hook"]["seconds"]
            if ref and style:
                by += f"+style:{ref.name}"
            orig = c.video.original
            ch = (orig.channel.channel_name if orig and orig.channel else (orig.yt_channel_title if orig else None))
            edl.setdefault("credit", "")
            if not edl.get("credit"):
                edl["credit"] = f"출처: {ch or '원본 채널'} 유튜브" if orig or ch else "출처: 원본 유튜브 영상"
            if not edl.get("title_lines"):
                edl["title_lines"] = split_title(clean_title(c.video.title))
            edl = normalize_edl(edl, info["duration"], target)
            if not reuse_edl and info["has_audio"]:
                _set(db, r, "말 사이 무음에 컷 맞추는 중", 60)
                lo = min(x["start"] for x in ([edl["hook"]] if edl["hook"] else []) + edl["segments"]) - 2
                hi = max(x["end"] for x in ([edl["hook"]] if edl["hook"] else []) + edl["segments"]) + 2
                sil = detect_silences(ff, proj.source_path, max(0, lo), min(info["duration"], hi))
                for sg in edl["segments"]:
                    sg["start"], sg["end"] = snap(sg["start"], sil), snap(sg["end"], sil)
                edl = normalize_edl(edl, info["duration"], target)
            _set(db, r, "AI 음성·효과음·상품 사진 준비 중", 66)
            assets = [x for x in (proj.assets or []) if x.get("cut_path") and Path(x["cut_path"]).exists()]
            extras = build_extras(edl, assets, style, ff, workdir, r.id, notes)
            r.edl, r.decided_by = edl, by
            _set(db, r, "세로 쇼츠 렌더링 중", 70)
            out = get_settings().media_dir / "renders" / f"shorts_c{c.id}_r{r.id}.mp4"
            oi = render(ff, caps, proj.source_path, info, edl, out, workdir, style=style, extras=extras)
            notes += oi.pop("notes", [])
            notes += [f"확인 필요: {x}" for x in (edl.get("cautions") or [])]
            r.output_path, r.output_info, r.notes = str(out), oi, notes
            r.status, r.step, r.progress, r.finished_at = "done", "완료", 100, utcnow()
            db.commit()
        except Exception as e:
            db.rollback()
            log.exception("쇼츠 제작 실패")
            r = db.get(ShortsRender, render_id)
            r.status, r.error, r.finished_at = "failed", str(e)[:800], utcnow()
            db.commit()
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


def start_render(db, candidate_id: int, edl: dict | None = None, style_id: int | None = None) -> ShortsRender:
    running = db.query(ShortsRender).filter(ShortsRender.candidate_id == candidate_id, ShortsRender.status.in_(["queued", "running"])).first()
    if running:
        return running
    r = ShortsRender(candidate_id=candidate_id, status="queued", step="대기", progress=0, edl=edl, style_id=style_id)
    db.add(r)
    db.commit()
    threading.Thread(target=run_render, args=(r.id, edl is not None), daemon=True, name=f"shorts-{r.id}").start()
    return r
