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
STICKER_TYPES = ("exclaim", "question", "heart", "star", "sparkle", "fire")
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
    # 중간 내레이션(최대 3)·스티커(최대 4): 컷 번호(segment) 또는 완성 영상 기준 시각(start)로 적는다
    mids = []
    for m in (edl.get("mid_narrations") or [])[:6]:
        txt = " ".join(str((m or {}).get("text") or "").split())[:60] if isinstance(m, dict) else ""
        if txt:
            item = {"text": txt}
            for k in ("segment", "start"):
                try:
                    if m.get(k) is not None:
                        item[k] = max(0, int(m[k])) if k == "segment" else max(0.0, round(float(m[k]), 1))
                except (TypeError, ValueError):
                    pass
            if "segment" in item or "start" in item:
                mids.append(item)
    out["mid_narrations"] = mids[:3]
    stk = []
    for m in (edl.get("stickers") or [])[:8]:
        if isinstance(m, dict) and m.get("type") in STICKER_TYPES:
            item = {"type": m["type"]}
            for k in ("segment", "start", "duration"):
                try:
                    if m.get(k) is not None:
                        item[k] = max(0, int(m[k])) if k == "segment" else max(0.0, round(float(m[k]), 1))
                except (TypeError, ValueError):
                    pass
            if "segment" in item or "start" in item:
                stk.append(item)
    out["stickers"] = stk[:4]
    # 원형 작은 화면(최대 2): 뜰 컷(segment) 또는 시각(start), 원 안에 보여 줄 원본 시각(src_start), 얼굴 위치(focus)
    pips = []
    for m in (edl.get("pips") or [])[:6]:
        try:
            item = {"src_start": round(max(0.0, min(float(m["src_start"]), max(0.0, duration - 1.5))), 1),
                    "focus": m.get("focus") if m.get("focus") in ("left", "center", "right") else "center"}
            if m.get("start") is not None:
                item["start"] = max(0.0, round(float(m["start"]), 1))
            elif m.get("segment") is not None:
                item["segment"] = max(0, int(m["segment"]))
            else:
                continue
            if m.get("duration") is not None:
                item["duration"] = max(1.2, min(6.0, round(float(m["duration"]), 1)))
            pips.append(item)
        except (TypeError, ValueError, KeyError, AttributeError):
            continue
    out["pips"] = pips[:2]
    out["total_seconds"] = round((out["hook"]["end"] - out["hook"]["start"] if out["hook"] else 0) + sum(x["end"] - x["start"] for x in merged), 2)
    return out


def own_title_lines(c) -> list[str]:
    """AI 없이 만들 때의 상단 제목. 참고 쇼츠(타인의 재편집물)의 제목은 가져오지 않고, 확인된 사실(연예인·상품 이름)만으로 만든다.
    둘 다 모르면 비워 두고 사용자가 직접 적게 한다."""
    name = (c.celebrity.name if getattr(c, "celebrity", None) else "") or ""
    prod = (c.product.name if getattr(c, "product", None) else "") or ""
    lines = [x for x in (name.strip()[:20], prod.strip()[:20]) if x]
    return lines if prod else []  # 연예인 이름만으로는 제목이 되지 않는다


def rule_edl(start: float, end: float | None, duration: float, title_lines: list[str] | None = None) -> dict:
    """AI 없이: 알려준 위치에서 25초. 후킹은 구간의 40% 지점 3초(자막 없음)."""
    end = end if end and end > start + 8 else start + 25
    end = min(duration, max(end, start + 20))
    span = min(end - start, 25)
    return {"hook": {"start": start + span * 0.4, "end": start + span * 0.4 + 3, "caption": ""},
            "segments": [{"start": start, "end": start + span, "caption": ""}],
            "title_lines": list(title_lines or []), "reason": "규칙 편집(AI 미사용): 지정 위치에서 25초, 후킹은 구간 40% 지점 3초"}


EDL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["hook", "segments", "title_lines", "end_caption", "narration", "mid_narrations", "stickers", "pips", "product_popup_segment", "quote_seen", "reason", "cautions"],
    "properties": {
        "hook": {"type": "object", "additionalProperties": False, "required": ["start", "end", "caption"],
                 "properties": {"start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"}}},
        "segments": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["start", "end", "caption"],
                                               "properties": {"start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"}}}},
        "title_lines": {"type": "array", "items": {"type": "string"}},
        "end_caption": {"type": "string"},
        "narration": {"type": "string"}, "product_popup_segment": {"type": "integer"},
        "mid_narrations": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["segment", "text"],
                                                     "properties": {"segment": {"type": "integer"}, "text": {"type": "string"}}}},
        "pips": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["segment", "src_start", "focus"],
                                           "properties": {"segment": {"type": "integer"}, "src_start": {"type": "number"},
                                                          "focus": {"type": "string", "enum": ["left", "center", "right"]}}}},
        "stickers": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["segment", "type"],
                                               "properties": {"segment": {"type": "integer"}, "type": {"type": "string", "enum": ["exclaim", "question", "heart", "star", "sparkle", "fire"]}}}},
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
        "4) title_lines 는 상단 제목 2줄(각 12자 이내, 과장·허위 금지). 제목·자막·내레이션은 원본 화면에서 확인한 내용으로 새로 쓴다: "
        "reference_short_* 는 어떤 상품·장면인지 찾는 단서일 뿐이므로 그 제목·문구·표현을 그대로 옮기거나 살짝만 바꿔 쓰지 않는다. 5) quote_seen 에는 화면 자막 등에서 실제로 읽은 핵심 문장을 그대로(없으면 빈 문자열). "
        "6) 확인이 필요한 점(상품 불명확, 광고·협찬 표시가 보임 등)은 cautions 에 적는다. 시각은 반드시 제공된 칸의 시각 범위 안에서 고른다.\n"
        "7) style_guide 가 있으면 그 편집 스타일을 따른다: 후킹 길이·방식, 구간 수와 한 컷 최대 길이, 총 길이 목표, 제목·자막의 말투와 글자 수. "
        "스타일은 '방식'만 참고하고 다른 채널의 문구를 그대로 쓰지 않는다. own_twist(우리만의 차별점)를 반영해 한 가지 이상 다르게 구성한다. "
        "end_question 이 true 면 end_caption 에 시청자에게 던지는 짧은 질문(14자 이내)을 쓰고, 아니면 빈 문자열. 위 1~6의 사실 규칙이 항상 우선한다.\n"
        "8) narration: style_guide.narration 이 true 면 첫 장면에 AI 음성으로 읽을 한 문장(24자 이내, 3초 안에 읽히게)을 쓴다. narration_pattern 의 방식을 따르되 "
        "화면·자막에서 확인된 사실만으로 궁금증을 만든다(예: '[인물]이 [기간]째 쓴다는 [상품 종류]가 있다는데'). 인물이 하지 않은 말·효능·가격을 지어내지 않는다. false 면 빈 문자열. "
        "9) product_popup_segment: 상품이 화면에 가장 또렷하게 보이거나 처음 소개되는 segments 의 번호(0부터). 상품 사진을 그때 띄운다. 모르면 0.\n"
        "10) mid_narrations: style_guide.mid_narrations 가 1 이상이면 그 수만큼까지, 영상 중간에 AI 음성으로 읽을 문장(각 22자 이내)과 넣을 컷 번호(segment, 0부터)를 준다. "
        "그 컷의 원본 말소리는 작아지므로, 꼭 들어야 하는 대사 컷이 아니라 상품 클로즈업·사용 장면·자료 화면처럼 말이 중요하지 않은 컷에 넣는다. "
        "내용은 화면에서 확인된 사실을 짚거나 다음 장면을 소개하는 말(예: '그런데 가격을 보고 더 놀랐다는데'). 첫 컷(0)과 마지막 컷은 피한다. 넣을 곳이 마땅치 않으면 빈 배열. 0 이면 빈 배열. "
        "11) stickers: style_guide.stickers 가 true 면 최대 3개, 어울리는 컷에만 움직이는 스티커를 붙인다. type: exclaim=크게 놀라는 반응, question=궁금해하는 장면, "
        "heart=마음에 들어 하는 장면, star=추천·1위·칭찬, sparkle=상품이 또렷이 드러나는 장면, fire=인기·품절 언급. 반응이나 상품이 실제로 보이는 컷에만 쓰고, 남발하지 않는다. false 면 빈 배열.\n"
        "12) pips: style_guide.pip 가 true 면 최대 2개. 상품(음식)을 보여 주는 컷 위에, 다른 순간의 인물 반응(놀라거나 감탄하는 얼굴)을 원형 작은 화면으로 함께 보여 준다. "
        "segment=원이 뜰 컷 번호, src_start=원 안에 보여 줄 반응 장면의 원본 시각(초, 제공된 칸의 시각 범위 안), focus=그 장면에서 얼굴이 화면의 left/center/right 중 어디에 있는지. "
        "그 컷 자체에 이미 같은 얼굴이 크게 나오면 넣지 않는다. 반응 장면이 뚜렷하지 않으면 빈 배열. false 면 빈 배열.")
    return create_json(system=system, max_tokens=2500 if fast else 1500, output_schema=EDL_SCHEMA, messages=[{"role": "user", "content": content}], timeout=300.0)


# ---------------------------------------------------------------- 자막(ASS)·렌더링
def _ass_time(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def _ass_text(s: str) -> str:
    return (s or "").replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ").strip()


_STAR = re.compile(r"\*([^*]{1,20})\*")


BOUNCE = "{\\fscx62\\fscy62\\t(0,110,\\fscx112\\fscy112)\\t(110,210,\\fscx100\\fscy100)}"  # 작게 → 살짝 크게 → 제자리(0.2초)


def _ass_caption(s: str, highlight: str = "", base: str = "", bounce: bool | str = False) -> str:
    """자막 한 줄. *단어* 는 강조색으로(강조색이 없는 스타일이면 별표만 지운다).
    bounce: False=없음 / True·"line"=한 줄이 통통 / "char"=글자가 하나씩 차례로 튀어 오름.
    강조가 끝나면 원래 글자색(base)으로 되돌린다 — \\r 로 초기화하면 튀는 움직임까지 지워지기 때문."""
    from .style_profile import ass_color
    t = _ass_text(s)
    if not t:
        return t
    hi = ("\\c&H" + ass_color(highlight)[4:] + "&") if highlight else ""
    back = ("\\c&H" + ass_color(base)[4:] + "&") if base else ""
    if bounce == "char":
        # 글자마다 자기 차례가 될 때까지 숨겼다가, 납작한 상태에서 위로 튀어 올랐다 제자리로(세로로만 늘려 옆 글자가 밀리지 않게)
        chars: list[tuple[str, bool]] = []
        pos = 0
        for m in _STAR.finditer(t):
            chars += [(ch, False) for ch in t[pos:m.start()]] + [(ch, bool(hi)) for ch in m.group(1)]
            pos = m.end()
        chars += [(ch, False) for ch in t[pos:]]
        n = sum(1 for ch, _ in chars if not ch.isspace())
        step = min(55, 620 // max(1, n))  # 글자 사이 간격(ms). 긴 자막도 0.6초 안에 다 나온다
        out, k = [], 0
        for ch, is_hi in chars:
            if ch.isspace():
                out.append(ch)
                continue
            t0 = k * step
            out.append("{" + (hi if is_hi else back) + f"\\alpha&HFF&\\fscy35\\t({t0},{t0 + 1},\\alpha&H00&)"
                       f"\\t({t0},{t0 + 90},\\fscy128)\\t({t0 + 90},{t0 + 190},\\fscy100)" + "}" + ch)
            k += 1
        return "".join(out)
    if not highlight:
        t = _STAR.sub(r"\1", t)
    else:
        t = _STAR.sub(lambda m: "{" + hi + "}" + m.group(1) + ("{" + back + "}" if back else "{\\r}"), t)
    return (BOUNCE + t) if bounce else t


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
    hi = ca.get("highlight_color", "")
    bounce = (ca.get("bounce_mode") or "line") if ca.get("bounce") else False
    if ti["enabled"] and edl.get("title_lines"):
        lines = [_ass_text(x) for x in edl["title_lines"]]
        if len(lines) > 1 and ti.get("second_line_color"):
            lines[1] = "{\\c" + ass_color(ti["second_line_color"])[:2] + ass_color(ti["second_line_color"])[4:] + "&}" + lines[1]
        ev.append(f"Dialogue: 1,{_ass_time(0)},{_ass_time(total)},Title,,0,0,0,," + "\\N".join(lines))
    t = 0.0
    if edl.get("hook"):
        hl = edl["hook"]["end"] - edl["hook"]["start"]
        if edl["hook"].get("caption"):
            ev.append(f"Dialogue: 2,{_ass_time(0)},{_ass_time(hl)},Hook,,0,0,0,,{_ass_caption(edl['hook']['caption'], hi, ho['caption_color'], bounce)}")
        t = hl
    end_cap = edl.get("end_caption") or ""
    end_from = total - 1.8 if end_cap else total
    for sg in edl["segments"]:
        ln = sg["end"] - sg["start"]
        if ca["enabled"] and sg.get("caption"):
            a, b = t + 0.05, min(t + ln - 0.05, end_from)
            if b - a > 0.4:
                ev.append(f"Dialogue: 2,{_ass_time(a)},{_ass_time(b)},Cap,,0,0,0,,{_ass_caption(sg['caption'], hi, ca['color'], bounce)}")
        t += ln
    if end_cap:
        ev.append(f"Dialogue: 3,{_ass_time(end_from)},{_ass_time(total)},Hook,,0,0,0,,{_ass_caption(end_cap, hi, ho['caption_color'], bounce)}")
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
    # 상품 사진·로고·스티커: 통통 튀어나오며(크기 반동) 살짝 흔들린다. motion=False 면 아래에서 올라오는 단순 등장(자막보다 아래 층)
    cur = "base"
    pop = st.get("popup") or DEFAULT_STYLE["popup"]
    motion = bool(ex.get("motion", pop.get("motion", True)))
    slot = 0
    for i, ov in enumerate(ex.get("overlays") or []):
        a0, b0 = max(0.0, float(ov["start"])), min(total, float(ov["end"]))
        kind = ov.get("kind") if ov.get("kind") in ("logo", "sticker", "pip") else "product"
        if b0 - a0 < 0.6 or (kind != "pip" and not Path(ov["path"]).exists()):
            continue
        top = (330 if fill else fg_top + 36)
        box_h = H * 0.5 if fill else fg_h
        used = 1
        if kind == "pip":
            # 원형 작은 화면: 원본의 다른 순간(반응 얼굴 등)을 정사각형으로 잘라 원 안에, 흰 테두리와 함께
            from .overlay_assets import pip_parts
            dia = {"small": 250, "medium": 310, "large": 370}[pop["size"]]
            side = int(min(sw, sh) * 0.62) // 2 * 2
            fxr = {"left": 0.27, "right": 0.73}.get(ov.get("focus"), 0.5)
            px = max(0, min(sw - side, int(sw * fxr - side / 2)))
            py = max(0, min(sh - side, int(sh * 0.42 - side / 2)))
            mask, ring = pip_parts(workdir, dia)
            args += ["-ss", f"{float(ov['src_start']):.2f}", "-t", f"{b0 - a0 + 0.2:.2f}", "-i", src,
                     "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(mask),
                     "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(ring)]
            w = h = dia + 16
            parts.append(f"[{nin}:v]fps={FPS},setpts=PTS-STARTPTS,scale={sw}:{sh},setsar=1,crop={side}:{side}:{px}:{py},scale={dia}:{dia},format=rgba,"
                         f"tpad=start_duration={a0:.2f}:stop_mode=clone:stop_duration=1[pv{i}]")
            parts.append(f"[{nin + 1}:v]format=gray,scale={dia}:{dia}[pm{i}]")
            parts.append(f"[pv{i}][pm{i}]alphamerge,pad={w}:{h}:8:8:color=black@0[pa{i}]")
            parts.append(f"[{nin + 2}:v]format=rgba,scale={w}:{h}[pr{i}]")
            parts.append(f"[pa{i}][pr{i}]overlay=0:0:format=auto[pc{i}]")
            srcl, base_chain, used = f"[pc{i}]", "format=rgba", 3
            cx, cy = 40 + w // 2, top + h // 2  # 화면 왼쪽 위(자막·상품 사진과 겹치지 않는 자리)
        else:
            wmax = {"sticker": {"small": 150, "medium": 190, "large": 240}}.get(kind, POPUP_W.get(kind, POPUP_W["product"]))[pop["size"]]
            hmax = int(box_h * {"logo": 0.42, "sticker": 0.36}.get(kind, 0.72))
            try:
                from PIL import Image
                with Image.open(ov["path"]) as im:
                    iw, ih = im.size
            except Exception:
                iw, ih = wmax, wmax
            k = min(wmax / iw, hmax / ih)
            w, h = max(2, int(iw * k) // 2 * 2), max(2, int(ih * k) // 2 * 2)
            if kind == "sticker":  # 자막(아래)·상품 사진(오른쪽 위)을 피해 왼쪽 가운데 → 오른쪽 가운데 → 왼쪽 위 순으로 돌아가며
                fx, fy = [(0.17, 0.42), (0.83, 0.5), (0.2, 0.2)][slot % 3]
                slot += 1
                cx, cy = int(W * fx), int((top - 36) + box_h * fy)
            elif kind == "logo" or pop["position"] == "top_left":
                cx, cy = 40 + w // 2, top + h // 2
            elif pop["position"] == "center":
                cx, cy = W // 2, int((top - 36) + box_h / 2)
            else:
                cx, cy = W - 40 - w // 2, top + h // 2
            args += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(ov["path"])]
            srcl, base_chain = f"[{nin}:v]", f"format=rgba,scale={w}:{h}"
        out_fade = f"fade=t=out:st={b0 - 0.2:.2f}:d=0.2:alpha=1"
        if motion:
            amp = {"logo": 0.0, "pip": 0.0, "sticker": 0.13}.get(kind, 0.045)  # 흔들림(라디안)
            chain = srcl + base_chain
            if amp:
                dd = int(-(-((w * w + h * h) ** 0.5) // 2) * 2)
                chain += f",pad=w={dd}:h={dd}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0,rotate=a='{amp}*sin(2*PI*0.9*(t-{a0:.2f}))':c=none"
            tt = f"max(0,t-{a0:.2f})"
            chain += f",scale=w='iw*max(0.04,1-exp(-9*{tt})*cos(14*{tt}))':h=-1:eval=frame,{out_fade}[ov{i}]"
            parts.append(chain)
            parts.append(f"[{cur}][ov{i}]overlay=x='{cx}-w/2':y='{cy}-h/2':eval=frame:enable='between(t,{a0:.2f},{b0:.2f})'[pb{i}]")
        else:
            parts.append(f"{srcl}{base_chain},fade=t=in:st={a0:.2f}:d=0.18:alpha=1,{out_fade}[ov{i}]")
            parts.append(f"[{cur}][ov{i}]overlay=x={cx - w // 2}:y='{cy - h // 2}+46*(1-min(1,max(0,(t-{a0:.2f})/0.16)))':enable='between(t,{a0:.2f},{b0:.2f})'[pb{i}]")
        cur, nin = f"pb{i}", nin + used
    if caps.get("ass"):
        (workdir / "subs.ass").write_text(build_ass(edl, font or default_font(), fg_top, fg_top + fg_h, st), encoding="utf-8")
        parts.append(f"[{cur}]ass=subs.ass,setsar=1[vout]")  # 화소 비율 1:1 고정(아니면 플레이어에서 눌려 보인다)
    else:
        parts.append(f"[{cur}]setsar=1[vout]")
        notes.append("이 ffmpeg 에는 자막 굽기(libass)가 없어 제목·자막 없이 렌더링했습니다. winget install Gyan.FFmpeg 로 전체 버전을 설치하면 자막이 들어갑니다.")
    # 필터 그래프는 인자로 직접 넘긴다(-filter_complex_script 는 최신 ffmpeg 에서 제거됨). 경로는 작업 폴더 기준 상대경로라 이스케이프 불필요
    # 소리 섞기: 원본 소리(내레이션 동안은 작게) + AI 음성 + 효과음 + 배경음악
    narr = [x for x in (ex.get("narrations") or []) if 0 <= x["start"] < total - 0.5]
    bgm, sfx = ex.get("bgm"), [x for x in (ex.get("sfx") or []) if x[0] in SFX and 0 <= x[1] < total]
    amap = "[ca]" if info["has_audio"] else None
    if narr or bgm or sfx:
        fmt = "aformat=sample_rates=48000:channel_layouts=stereo"
        if info["has_audio"]:
            win = "+".join(f"between(t,{max(0.0, x['start'] - 0.15):.2f},{x['start'] + x['duration'] + 0.3:.2f})" for x in narr)
            duck = f",volume=volume=0.22:enable='{win}'" if narr else ""  # 내레이션이 나오는 동안만 원본 소리를 작게
            parts.append(f"[ca]{fmt}{duck}[a_base]")
        else:
            parts.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={total:.2f}[a_base]")
        mix = ["[a_base]"]
        for j, x in enumerate(narr):
            args += ["-i", str(x["path"])]
            tempo = f"atempo={x['tempo']}," if x.get("tempo") and abs(x["tempo"] - 1) > 0.01 else ""
            parts.append(f"[{nin}:a]{tempo}aresample=48000,{fmt},volume=1.7,adelay={int(x['start'] * 1000)}:all=1[a_narr{j}]")
            mix.append(f"[a_narr{j}]"); nin += 1
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
        if motion and (ex.get("overlays")):  # 오래된 ffmpeg 는 움직이는 스티커를 못 그릴 수 있다 → 움직임 없이 다시
            res = render(ff, caps, src, info, edl, out_path, workdir, font=font, style=style, extras=dict(ex, motion=False))
            res["notes"].append("이 PC 의 ffmpeg 가 움직이는 스티커를 지원하지 않아 사진·스티커를 움직임 없이 넣었습니다.")
            return res
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
    out, nprod, nstk = [], 0, 0
    for a in assets:
        o = have.get(a["id"])
        try:
            start, dur = (float(o.get("start", 0)), float(o.get("duration", 2.8))) if o else (None, None)
        except (TypeError, ValueError):
            start, dur = None, None
        if start is None:
            if a.get("kind") == "logo":
                start, dur = 0.3, max(1.5, min(2.6, (hook_len or 2.9) - 0.3))
            elif a.get("kind") == "sticker":  # 내가 올린 스티커: 2컷마다 하나씩
                start, dur = starts[min(len(starts) - 1, 1 + nstk * 2)] + 0.3, 1.8
                nstk += 1
            else:
                start, dur = starts[min(len(starts) - 1, first + nprod)] + 0.4, 2.8
                nprod += 1
        start = max(0.0, min(start, max(0.0, total - 1.0)))
        dur = max(1.0, min(dur, 8.0, total - start))
        out.append({"asset_id": a["id"], "kind": a.get("kind", "product"), "name": a.get("name"), "start": round(start, 1), "duration": round(dur, 1)})
    return out


def build_extras(edl: dict, assets: list[dict], style: dict | None, ff: str, workdir: Path, seed: int, notes: list[str]) -> dict:
    """렌더러에 넘길 소리·팝업 재료. 실패한 재료는 빼고 사유를 notes 에 적는다(영상은 계속 만든다)."""
    from . import audio_fx, overlay_assets
    extras: dict = {}
    total = edl["total_seconds"]
    hook_len = (edl["hook"]["end"] - edl["hook"]["start"]) if edl.get("hook") else 0.0
    starts, t = [], hook_len  # 각 컷이 완성 영상에서 시작하는 시각
    for sg in edl["segments"]:
        starts.append(t)
        t += sg["end"] - sg["start"]
    seg_at = lambda i: starts[max(0, min(len(starts) - 1, int(i)))]  # noqa: E731
    by_id = {a["id"]: a for a in assets}
    edl["overlays"] = plan_overlays(edl, assets)
    ovs = [{"path": by_id[o["asset_id"]]["cut_path"], "kind": o["kind"], "start": o["start"], "end": o["start"] + o["duration"]} for o in edl["overlays"]]
    # 내장 스티커: 편집안에 적힌 것만(스타일에서 켜면 편집 AI 가 고른다). 사진과 같은 순간에 겹치지 않게 0.3초 뒤로
    stk = []
    for m in (edl.get("stickers") or []):
        start = m["start"] if "start" in m else seg_at(m.get("segment", 0)) + 0.3
        dur = max(1.0, min(4.0, float(m.get("duration") or 1.8)))
        if start > total - 1.0:
            continue
        try:
            path = overlay_assets.draw_sticker(m["type"], get_settings().media_dir / "work" / "stickers" / f"{m['type']}.png")
        except Exception as e:
            notes.append(f"스티커를 그리지 못했습니다: {str(e)[:100]}")
            continue
        stk.append({"type": m["type"], "start": round(start, 1), "duration": round(min(dur, total - start), 1)})
        ovs.append({"path": str(path), "kind": "sticker", "start": start, "end": min(total, start + dur)})
    edl["stickers"] = stk
    pips = []
    for m in (edl.get("pips") or []):
        start = m["start"] if "start" in m else seg_at(m.get("segment", 0)) + 0.3
        dur = float(m.get("duration") or 3.0)
        if start > total - 1.5:
            continue
        dur = round(min(dur, total - start), 1)
        pips.append({"src_start": m["src_start"], "focus": m["focus"], "start": round(start, 1), "duration": dur})
        ovs.append({"kind": "pip", "path": "", "start": start, "end": start + dur, "src_start": m["src_start"], "focus": m["focus"]})
    edl["pips"] = pips
    if ovs:
        extras["overlays"] = sorted(ovs, key=lambda o: o["start"])
    # 내레이션: 첫 장면 한 문장 + 영상 중간 문장들. 서로 겹치지 않게 뒤로 밀고, 끝을 넘으면 뺀다
    audio: dict = {}
    lines = ([{"text": edl["narration"], "start": 0.15, "where": "첫 장면"}] if edl.get("narration") else [])
    for m in (edl.get("mid_narrations") or []):
        lines.append({"text": m["text"], "start": (m["start"] if "start" in m else seg_at(m.get("segment", 0)) + 0.15), "where": "중간", "ref": m})
    lines.sort(key=lambda x: x["start"])
    narrs, failed, cursor = [], None, 0.0
    rate = (style or {}).get("narration", {}).get("rate", 1.12)
    for k, ln in enumerate(lines):
        start = max(ln["start"], cursor)
        if start > total - 1.2:
            notes.append(f"내레이션 「{ln['text'][:14]}…」은 넣을 자리가 없어 뺐습니다(영상 끝을 넘음).")
            continue
        try:
            out = workdir / f"narration_{k}.wav"
            got = audio_fx.synthesize(ln["text"], out, rate)
            path = got.get("path") or str(out)
            tempo = float(got.get("tempo") or 1.0)
            dur = probe_audio(ff, path) / tempo
        except Exception as e:  # TTSError 포함: 음성이 없어도 영상은 만든다
            failed = str(e)[:200]
            break
        narrs.append({"path": path, "start": round(start, 2), "duration": round(dur, 2), "tempo": tempo})
        cursor = start + dur + 0.4
        if ln.get("ref") is not None:
            ln["ref"]["start"] = round(start, 1)
        audio["voice"] = f"{got['provider']} · {got['voice']}"
    if failed:
        notes.append(f"AI 음성 내레이션을 넣지 못했습니다: {failed}")
        narrs = []
    if lines:
        audio["narration"] = (f"{audio.get('voice')} · {narrs[0]['duration']:.1f}초" if narrs and narrs[0]["start"] < 1 else None) if not failed else None
        audio["narration_count"] = len(narrs)
    if narrs:
        extras["narrations"] = narrs
    if style and style["sfx"]["enabled"]:
        fx = [("whoosh", max(0.0, hook_len - 0.25))] if hook_len else []
        fx += [("pop", o["start"]) for o in (extras.get("overlays") or [])][:6]
        if edl.get("end_caption"):
            fx.append(("ding", max(0.0, total - 1.8)))
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
            "note": "참고 쇼츠는 타인이 만든 재편집물이다. 어떤 상품·장면인지 찾는 단서로만 쓰고, 그 제목·자막·구성을 따라 하지 말고 원본 화면에 근거해 새로 구성한다."}


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
    if not has_ai:
        if rng is None:
            raise ShortsError("AI 키가 없으면 '대략 위치(분:초)'를 입력해야 합니다. 원본에서 상품이 나오는 시각을 적고 다시 눌러 주세요.")
        notes.append("AI 키가 없어 규칙으로 잘랐습니다(자막 문구 없음). 아래 편집안에서 시간을 고쳐 다시 렌더링할 수 있습니다.")
        own = own_title_lines(c)
        if not own:
            notes.append("상단 제목은 비워 두었습니다(참고 쇼츠의 제목은 가져오지 않습니다). 편집안에서 직접 적어 주세요.")
        return rule_edl(rng[0], rng[1], info["duration"], own), basis + "+rule", notes
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
            if not edl.get("title_lines") and not reuse_edl:
                edl["title_lines"] = own_title_lines(c)
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
