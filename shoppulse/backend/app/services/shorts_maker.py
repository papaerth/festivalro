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
HOOK_MIN, HOOK_MAX = 1.5, 3.0  # 후킹은 항상 3초 이내
# 제작 원칙(모든 스타일 위에 항상 적용): 3초 후킹, 20~30초, 순서 2~3번 섞기, 같은 장면 재사용 금지, AI 음성 2문장, 끝이 처음으로 이어지게
RULES = {"total_range": (20.0, 30.0), "shuffles": "2~3", "tts_lines": 2, "tts_max_seconds": (2.9, 3.4)}
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


def _free_piece(a: float, b: float, used: list[tuple[float, float]]) -> tuple[float, float] | None:
    """[a,b] 에서 이미 쓴 구간(used)을 뺀 나머지 중 가장 긴 조각."""
    pieces = [(a, b)]
    for ua, ub in used:
        nxt = []
        for pa, pb in pieces:
            if ub <= pa or ua >= pb:
                nxt.append((pa, pb))
                continue
            if ua > pa:
                nxt.append((pa, ua))
            if ub < pb:
                nxt.append((ub, pb))
        pieces = nxt
    pieces = [x for x in pieces if x[1] - x[0] > 0.05]
    return max(pieces, key=lambda x: x[1] - x[0]) if pieces else None


def normalize_edl(edl: dict, duration: float, total_target: float | None = None, durations: dict | None = None,
                  limits: tuple[float, float] | None = None) -> dict:
    """AI·사람이 준 편집안을 안전한 범위로 정리.
    - segments 는 **재생 순서 그대로** 둔다(시간순으로 다시 정렬하지 않는다 — 순서를 섞는 편집을 위해)
    - 같은 장면을 두 번 쓰지 않는다: 후킹·본편의 원본 구간이 겹치면 뒤에 나온 컷에서 겹친 부분을 잘라 낸다
    - 원본이 여러 개면 컷마다 src(원본 번호, 0부터). durations={원본 번호: 길이}
    - 후킹 1.5~3초, 총 길이는 limits(제작 원칙 20~30초) 또는 기본 18~32초/스타일 목표 ±5초"""
    durs = {int(k): float(v) for k, v in (durations or {0: duration}).items()}
    if limits:
        tmin, tmax = limits
    else:
        tmin, tmax = (TOTAL_MIN, TOTAL_MAX) if not total_target else (max(15.0, total_target - 6), min(65.0, total_target + 5))

    def clampseg(sg):
        try:
            src = int(sg.get("src") or 0)
        except (TypeError, ValueError):
            src = 0
        if src not in durs:
            return None  # 올리지 않은 원본을 가리키는 컷은 뺀다
        d = durs[src]
        a, b = float(sg.get("start", 0)), float(sg.get("end", 0))
        a = max(0.0, min(a, max(0.0, d - 0.5))); b = max(a + 0.3, min(b, d))
        out_ = {"src": src, "start": round(a, 2), "end": round(b, 2), "caption": (sg.get("caption") or "").strip()[:40]}
        if sg.get("focus") in ("left", "right"):  # 가운데는 기본값이라 적지 않는다
            out_["focus"] = sg["focus"]
        return out_

    used: dict[int, list[tuple[float, float]]] = {k: [] for k in durs}
    hook = clampseg(edl["hook"]) if edl.get("hook") else None
    if hook:
        hl = min(HOOK_MAX, max(HOOK_MIN, hook["end"] - hook["start"]))
        hook["end"] = round(min(durs[hook["src"]], hook["start"] + hl), 2)
        used[hook["src"]].append((hook["start"], hook["end"]))
    merged: list[dict] = []
    dropped = 0
    for raw in (edl.get("segments") or []):
        sg = clampseg(raw) if raw else None
        if not sg or sg["end"] - sg["start"] < 1.0:
            continue
        piece = _free_piece(sg["start"], sg["end"], used[sg["src"]])
        if not piece or piece[1] - piece[0] < 1.0:
            dropped += 1
            continue
        sg["start"], sg["end"] = round(piece[0], 2), round(piece[1], 2)
        used[sg["src"]].append(piece)
        merged.append(sg)
    if not merged:
        raise ShortsError("편집안에 쓸 수 있는 본편 구간이 없습니다.")
    hook_len = (hook["end"] - hook["start"]) if hook else 0.0
    # 총 길이 맞추기: 넘치면 마지막 컷부터 줄이고, 모자라면 다른 컷과 겹치지 않는 범위에서 뒤쪽 컷부터 늘린다
    total = hook_len + sum(x["end"] - x["start"] for x in merged)
    while total > tmax and merged:
        over = total - tmax
        last = merged[-1]
        ln = last["end"] - last["start"]
        if ln - over >= 1.5 or len(merged) == 1:
            last["end"] = round(last["end"] - min(over, ln - 1.0), 2)
            if len(merged) == 1:
                break
        else:
            merged.pop()
        total = hook_len + sum(x["end"] - x["start"] for x in merged)
    total = hook_len + sum(x["end"] - x["start"] for x in merged)
    if total < tmin:
        need = tmin - total
        for sg in reversed(merged):
            if need <= 0.01:
                break
            others = [u for u in used[sg["src"]] if not (abs(u[0] - sg["start"]) < 0.02 and abs(u[1] - sg["end"]) < 0.02)]
            if hook and hook["src"] == sg["src"]:
                others = others + [(hook["start"], hook["end"])]
            cap_end = min([u[0] for u in others if u[0] >= sg["end"] - 0.01] + [durs[sg["src"]]])
            add = max(0.0, min(need, cap_end - sg["end"]))
            sg["end"] = round(sg["end"] + add, 2); need -= add
            if need > 0.01:
                cap_start = max([u[1] for u in others if u[1] <= sg["start"] + 0.01] + [0.0])
                add = max(0.0, min(need, sg["start"] - cap_start))
                sg["start"] = round(sg["start"] - add, 2); need -= add
    seq = ([hook] if hook else []) + merged
    shuffles = sum(1 for x, y in zip(seq, seq[1:]) if y["src"] != x["src"] or y["start"] < x["start"])  # 시간을 거슬러 가거나 원본이 바뀌는 횟수
    out = {"hook": hook, "segments": merged,
           "title_lines": [str(x).strip()[:24] for x in (edl.get("title_lines") or []) if str(x).strip()][:2],
           "credit": (edl.get("credit") or "").strip()[:60], "end_caption": (edl.get("end_caption") or "").strip()[:24],
           "narration": " ".join(str(edl.get("narration") or "").split())[:60],
           "reason": edl.get("reason"), "quote_seen": edl.get("quote_seen"),
           "cautions": list(edl.get("cautions") or []), "shuffles": shuffles}
    if dropped:
        out["dropped_overlaps"] = dropped
    for k in ("overlays", "product_popup_segment", "audio", "product_shot", "brand_text", "loop_note"):
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
            psrc = int(m.get("src") or 0) if str(m.get("src") or 0).lstrip("-").isdigit() else 0
            psrc = psrc if psrc in durs else min(durs)
            item = {"src": psrc, "src_start": round(max(0.0, min(float(m["src_start"]), max(0.0, durs[psrc] - 1.5))), 1),
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


def rule_edl(start: float, end: float | None, duration: float, title_lines: list[str] | None = None,
             extras: list[tuple[int, float, float]] | None = None) -> dict:
    """AI 없이: 알려준 위치 주변 20~27초. 후킹(3초)은 구간 가운데에서 가져오고, 본편은 처음 → 후킹 뒤 순서로 잇는다(같은 장면 재사용 없음).
    extras: 다른 원본들 [(원본 번호, 지정 위치, 그 원본 길이)] — 각 6초씩 본편 사이에 끼워 넣는다."""
    extras = [x for x in (extras or []) if x[2] - x[1] > 3][:2]
    budget = 26.0 - 6.0 * len(extras)
    end = end if end and end > start + 8 else start + budget
    end = min(duration, max(end, start + 14))
    span = min(end - start, budget)
    h0 = start + span * 0.45
    hook = {"src": 0, "start": h0, "end": min(h0 + 3, start + span), "caption": ""}
    p1 = {"src": 0, "start": start, "end": h0, "caption": ""}
    p2 = {"src": 0, "start": hook["end"], "end": start + span, "caption": ""}
    segs = [p1]
    for k, (src, pos, dur) in enumerate(extras):
        segs.append({"src": src, "start": pos, "end": min(dur, pos + 6), "caption": ""})
        if k == 0:
            segs.append(p2)
    if not extras:
        segs.append(p2)
    return {"hook": hook, "segments": [x for x in segs if x["end"] - x["start"] >= 1.0], "title_lines": list(title_lines or []),
            "reason": "규칙 편집(AI 미사용): 지정 위치 주변을 사용. 후킹은 구간 가운데 3초를 맨 앞으로, 나머지는 처음 → 후킹 뒤 순서"
                      + (f", 다른 원본 {len(extras)}개를 6초씩 끼워 넣음" if extras else "")}


EDL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["hook", "segments", "title_lines", "end_caption", "narration", "mid_narrations", "stickers", "pips", "product_popup_segment", "product_shot", "brand_text", "loop_note", "quote_seen", "reason", "cautions"],
    "properties": {
        "hook": {"type": "object", "additionalProperties": False, "required": ["src", "start", "end", "caption", "focus"],
                 "properties": {"src": {"type": "integer"}, "start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"},
                                "focus": {"type": "string", "enum": ["left", "center", "right"]}}},
        "segments": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["src", "start", "end", "caption", "focus"],
                                               "properties": {"src": {"type": "integer"}, "start": {"type": "number"}, "end": {"type": "number"}, "caption": {"type": "string"},
                                                              "focus": {"type": "string", "enum": ["left", "center", "right"]}}}},
        "product_shot": {"type": "object", "additionalProperties": False, "required": ["found", "src", "time", "x", "y", "w", "h"],
                         "properties": {"found": {"type": "boolean"}, "src": {"type": "integer"}, "time": {"type": "number"},
                                        "x": {"type": "number"}, "y": {"type": "number"}, "w": {"type": "number"}, "h": {"type": "number"}}},
        "brand_text": {"type": "string"}, "loop_note": {"type": "string"},
        "title_lines": {"type": "array", "items": {"type": "string"}},
        "end_caption": {"type": "string"},
        "narration": {"type": "string"}, "product_popup_segment": {"type": "integer"},
        "mid_narrations": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["segment", "text"],
                                                     "properties": {"segment": {"type": "integer"}, "text": {"type": "string"}}}},
        "pips": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["segment", "src", "src_start", "focus"],
                                           "properties": {"segment": {"type": "integer"}, "src": {"type": "integer"}, "src_start": {"type": "number"},
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


def ai_edit(ff: str, items: list[dict], ctx: dict, workdir: Path, transcript: list[dict] | None, guide: dict | None = None) -> dict:
    """원본(1~3개)에서 찾은 구간을 촘촘히 보고 후킹·컷 순서·자막·내레이션을 정한다.
    items: [{"src": 원본 번호, "path", "info", "rng": (시작, 끝), "name"}]"""
    from .claude_client import create_json
    guide = guide or {}
    per = max(6, 20 // max(1, len(items)))  # 원본마다 볼 장면 모음 장수(전체 20장 안팎으로 비용을 묶는다)
    content: list[dict] = []
    ranges = []
    for it in items:
        a, b = max(0.0, it["rng"][0] - 8), min(it["info"]["duration"], it["rng"][1] + 8)
        if b - a > (170 if len(items) == 1 else 110):
            b = a + (170 if len(items) == 1 else 110)
        step = max(1.5, (b - a) / (per * 4))
        sheets = contact_sheets(ff, it["path"], a, b, step, 2, 2, 780, workdir, f"fine{it['src']}")[:per]
        content.append({"type": "text", "text": f"===== 원본 {it['src']} (src={it['src']}) : {it.get('name') or ''} · 전체 {it['info']['duration']:.0f}초 · 아래는 {a:.0f}~{b:.0f}초 구간 ====="})
        content += _sheet_content(sheets)
        ranges.append({"src": it["src"], "range": [round(a, 1), round(b, 1)]})
    nseg = int(guide.get("target_segments") or 6)
    nseg = max(5, min(12, nseg))
    maxclip = float(guide.get("max_clip_seconds") or 5)
    payload = {"task": "원본 화면만으로 새 쇼핑 쇼츠 편집안을 만든다.", "sources": ranges, **ctx, "style_guide": guide}
    if transcript:
        a0, b0 = ranges[0]["range"]
        payload["transcript_excerpt_of_source_0"] = [{"t": x["start"], "text": x["text"]} for x in transcript if a0 - 5 <= x["start"] <= b0 + 5][:120]
    content.append({"type": "text", "text": json.dumps(payload, ensure_ascii=False)})
    lo, hi = guide.get("total_range") or (20, 30)
    hi_rule = (" caption 안에서 가장 중요한 단어 하나를 *별표*로 감싼다(예: *3천원대* 립밤). 그 단어는 강조색으로 표시된다." if guide.get("highlight_keyword") else "")
    system = (
        "쇼핑 쇼츠 편집자. 한국어. 원본 영상(1~3개)의 장면 모음 이미지(각 칸의 시각 제공)와 자막 발췌(있으면)를 보고, 원본 화면만으로 새 쇼츠 편집안을 만든다.\n"
        "[목표] 처음 3초 안에 붙잡고, 끝까지 보게 하고, 끝이 처음으로 자연스럽게 이어져 한 번 더 보게 만든다.\n"
        "[구성] ① 후킹(0~3초): 가장 강한 순간(큰 반응·결과·상품이 드러나는 순간)을 설명 없이 맨 앞에. ② 맥락: 누가·무엇인지 짧게. ③ 상품이 나오고 쓰는 장면. "
        "④ 재후킹(전체의 50~70% 지점): 새 정보·반전·가격 같은 것으로 다시 궁금하게. ⑤ 끝: 결론을 다 말해 버리지 말고 후킹 장면 바로 앞 상황에서 끊어, 반복 재생될 때 첫 장면으로 이어지게 한다"
        "(인사·정리 멘트·'구독' 같은 컷은 넣지 않는다).\n"
        "규칙: 1) hook 은 2~3초(3초를 넘기지 않는다). "
        f"2) segments 는 '재생 순서'대로 적는다(시간순이 아니다). 시간 순서를 {RULES['shuffles']}번 뒤섞는다(예: 결과 → 그 전 상황 → 상품 → 반응). "
        "뒤섞더라도 말과 상황이 이어져 이해되게 하고, 문장 중간에서 자르지 않는다. "
        f"본편은 {max(4, nseg - 2)}~{nseg}컷, 한 컷 1.5~{maxclip:g}초, 후킹을 포함한 전체 길이는 {lo:g}~{hi:g}초(target_total_seconds 에 가깝게). 상품이 화면에 보이는 장면을 반드시 포함. "
        "3) 같은 장면을 두 번 쓰지 않는다: hook·segments·pips 가 가리키는 원본 구간이 서로 겹치면 안 된다. "
        "4) 각 컷에 src(원본 번호)를 적는다. 원본이 여러 개면 가능한 한 모든 원본을 한 번 이상 쓰고, 원본을 오갈 때는 같은 상품·같은 화제로 이어지게 한다. 시각은 그 원본에 제공된 칸의 시각 범위 안에서 고른다. "
        "5) caption 은 각 컷의 자막 한 줄(caption_max_chars 이내). 화면 자막·자막 발췌에 실제로 나온 말이나 사실 설명만 쓴다. 연예인 발언을 지어내지 않는다. "
        "'추천'은 실제로 추천한 경우에만. hook.caption 은 12자 이내의 궁금증 문구." + hi_rule + " "
        "각 컷의 focus: 가로 화면의 좌우를 잘라 정사각형에 가깝게 보여 주므로, 그 컷에서 말하는 사람이나 상품이 화면의 left/center/right 중 어디에 있는지 적는다(가운데면 center). "
        "6) title_lines 는 상단 제목 2줄(각 12자 이내, 과장·허위 금지). 둘째 줄에서 가장 중요한 단어 하나(상품 종류나 핵심 표현)를 *별표*로 감싸면 강조색으로 표시된다. 제목·자막·내레이션은 원본 화면에서 확인한 내용으로 새로 쓴다: "
        "reference_short_* 는 어떤 상품·장면인지 찾는 단서일 뿐이므로 그 제목·문구·표현을 그대로 옮기거나 살짝만 바꿔 쓰지 않는다. "
        "7) quote_seen 에는 화면 자막 등에서 실제로 읽은 핵심 문장을 그대로(없으면 빈 문자열). 확인이 필요한 점(상품 불명확, 광고·협찬 표시가 보임 등)은 cautions 에. "
        "8) style_guide 의 말투·글자 수·후킹 방식·own_twist(우리만의 차별점)를 따른다. 스타일은 '방식'만 참고한다. "
        "end_question 이 true 면 end_caption 에 시청자에게 던지는 짧은 질문(14자 이내), 아니면 빈 문자열.\n"
        "9) AI 음성: style_guide.narration 이 true 면 정확히 2문장을 쓴다. narration = 첫 장면에서 읽을 문장(18자 이내, 약 2.5초 분량: narration_pattern 방식의 궁금증). "
        "mid_narrations = 1개: 재후킹 지점의 컷 번호(segment, 0부터)와 문장(20자 이내, 약 3초 분량: 새 정보로 다시 궁금하게. 예: '그런데 가격을 보고 더 놀랐다는데'). "
        "그 컷은 원본 말소리가 작아지므로 꼭 들어야 하는 대사 컷이 아니라 상품 클로즈업·사용 장면에 둔다. 첫 컷과 마지막 컷은 피한다. "
        "화면에서 확인된 사실만으로 쓰고 발언·효능·가격을 지어내지 않는다. narration 이 false 면 narration 은 빈 문자열, mid_narrations 는 빈 배열. "
        "10) product_popup_segment: 상품 사진을 띄울 컷 번호(상품 이야기를 하는데 상품이 작게 보이거나 안 보이는 컷이 좋다). "
        "product_shot: 상품이 가장 크고 또렷하게 보이는 한 장면 — src, time(초), 그 화면에서 상품이 차지하는 영역 x,y,w,h(왼쪽 위 기준 0~1 비율). 프로그램이 그 장면에서 상품을 잘라 카드로 띄운다. 마땅한 장면이 없으면 found=false. "
        "11) brand_text: 상품 포장이나 화면 자막에서 실제로 읽은 브랜드 이름(10자 이내). 읽지 못했으면 빈 문자열(추측 금지). "
        "12) stickers: style_guide.stickers 가 true 면 최대 3개, 어울리는 컷에만: exclaim=크게 놀라는 반응, question=궁금해하는 장면, heart=마음에 들어 하는 장면, "
        "star=추천·1위·칭찬, sparkle=상품이 또렷이 드러나는 장면, fire=인기·품절 언급. false 면 빈 배열. "
        "13) pips: style_guide.pip 가 true 면 최대 2개. 상품을 보여 주는 컷 위에 다른 순간의 반응 얼굴을 원형 작은 화면으로: segment=원이 뜰 컷 번호, src·src_start=반응 장면의 원본과 시각, "
        "focus=얼굴이 화면의 left/center/right 중 어디인지. 그 장면은 다른 컷에서 쓰지 않은 구간이어야 한다. 뚜렷한 반응이 없으면 빈 배열. false 면 빈 배열. "
        "14) loop_note: 끝 장면이 첫 장면으로 어떻게 이어지는지 한 줄. reason: 왜 이 순서로 섞었는지 한 줄.")
    return create_json(system=system, max_tokens=20000, output_schema=EDL_SCHEMA, messages=[{"role": "user", "content": content}], timeout=360.0)


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
        # 제목 안의 *핵심 단어* 는 keyword_color 로(레퍼런스들의 '둘째 줄 끝 단어만 다른 색' 방식). 줄 색은 1줄 color, 2줄 second_line_color
        line_cols = [ti["color"], ti.get("second_line_color") or ti["color"]]
        lines = [_ass_caption(x, ti.get("keyword_color") or "", line_cols[min(k, 1)]) for k, x in enumerate(edl["title_lines"])]
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
           style: dict | None = None, extras: dict | None = None, sources: dict | None = None) -> dict:
    """extras(선택): {"overlays":[{path,kind,start,end}], "narrations":[{path,start,duration}], "sfx":[(이름,시각)], "bgm":{path,volume}}
    sources(선택): 원본이 여러 개일 때 {원본 번호: {"path", "info"}}. 화면 크기는 첫 원본(src, info)에 맞춘다."""
    srcs = dict(sources or {})
    srcs.setdefault(0, {"path": src, "info": info})
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
    csrc = [srcs.get(int(c.get("src") or 0)) or srcs[0] for c in clips]
    for c, sc in zip(clips, csrc):
        args += ["-ss", f"{c['start']:.2f}", "-t", f"{c['end'] - c['start']:.2f}", "-i", sc["path"]]
    n = len(clips)
    parts = []
    sw, sh = info["width"] // 2 * 2, info["height"] // 2 * 2
    cw = (int(sw / zoom) // 2 * 2) if (not fill and zoom > 1.001) else sw  # 확대하면 화면에 남는 가로 폭
    any_audio = any(sc["info"].get("has_audio") for sc in csrc)
    afmt = "aformat=sample_rates=48000:channel_layouts=stereo"
    for i in range(n):
        punch = ""
        if i == 0 and edl.get("hook") and st["hook"]["zoom_punch"]:
            # 후킹 컷만 살짝 확대(1.12배)해 시선을 끈다
            punch = f",scale={int(sw * 1.12) // 2 * 2}:{int(sh * 1.12) // 2 * 2},crop={sw}:{sh}"
        ci = csrc[i]["info"]
        same = (ci["width"] // 2 * 2, ci["height"] // 2 * 2) == (sw, sh)
        # 크기·비율이 다른 원본은 첫 원본 화면에 꽉 차게 맞춰 자른다
        fit = f"scale={sw}:{sh}" if same else f"scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh}"
        # setsar 는 맨 끝에: 확대한 컷도 다른 컷과 화소 비율이 같아야 이어 붙일 수 있다
        if cw < sw:  # 확대 스타일: 컷마다 초점(왼쪽·가운데·오른쪽)에 맞춰 좌우를 잘라 낸다
            fx = {"left": 0.12, "right": 0.88}.get(clips[i].get("focus"), 0.5)
            punch += f",crop={cw}:{sh}:{int((sw - cw) * fx) // 2 * 2}:0"
        parts.append(f"[{i}:v]fps={FPS},setpts=PTS-STARTPTS,{fit}{punch},setsar=1[v{i}]")
        if any_audio:
            if ci.get("has_audio"):
                parts.append(f"[{i}:a]aresample=48000,{afmt},asetpts=PTS-STARTPTS[a{i}]")
            else:  # 소리 없는 원본의 컷은 그 길이만큼 무음
                parts.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={clips[i]['end'] - clips[i]['start']:.2f}[a{i}]")
    if any_audio:
        parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][ca]")
    else:
        parts.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[cv]")
    info = dict(info, has_audio=any_audio)
    if fill:
        parts.append(f"[cv]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[base]")
    else:
        parts.append("[cv]split[bg0][fg0]")
        if lay["mode"] == "color_bg":
            parts.append(f"[bg0]scale={W}:{H},setsar=1,drawbox=x=0:y=0:w=iw:h=ih:color=0x{lay['bg_color'][1:]}:t=fill[bg]")
        else:
            parts.append(f"[bg0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=24:2,eq=brightness=-0.28:saturation=0.8,setsar=1[bg]")
        parts.append(f"[fg0]scale={W}:{fg_h},setsar=1[fg]")  # 좌우는 컷마다 이미 잘라 냈다
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
            psrc = srcs.get(int(ov.get("src") or 0)) or srcs[0]
            pw_, ph_ = psrc["info"]["width"] // 2 * 2, psrc["info"]["height"] // 2 * 2
            side = int(min(pw_, ph_) * 0.62) // 2 * 2
            fxr = {"left": 0.27, "right": 0.73}.get(ov.get("focus"), 0.5)
            px = max(0, min(pw_ - side, int(pw_ * fxr - side / 2)))
            py = max(0, min(ph_ - side, int(ph_ * 0.42 - side / 2)))
            mask, ring = pip_parts(workdir, dia)
            args += ["-ss", f"{float(ov['src_start']):.2f}", "-t", f"{b0 - a0 + 0.2:.2f}", "-i", psrc["path"],
                     "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(mask),
                     "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.2f}", "-i", str(ring)]
            w = h = dia + 16
            parts.append(f"[{nin}:v]fps={FPS},setpts=PTS-STARTPTS,scale={pw_}:{ph_},setsar=1,crop={side}:{side}:{px}:{py},scale={dia}:{dia},format=rgba,"
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
            res = render(ff, caps, src, info, edl, out_path, workdir, font=font, style=style, extras=dict(ex, motion=False), sources=sources)
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


def auto_assets(edl: dict, assets: list[dict], sources: dict[int, dict], ff: str, workdir: Path, notes: list[str]) -> list[dict]:
    """사용자가 사진을 올리지 않아도 원본만으로 팝업을 만든다: 원본 화면에서 상품을 잘라 낸 카드, 브랜드 이름 배지."""
    from . import overlay_assets
    out = list(assets)
    shot = edl.get("product_shot") if isinstance(edl.get("product_shot"), dict) else None
    if shot and shot.get("found") and not any(a.get("kind") == "product" for a in out):
        try:
            sc = sources.get(int(shot.get("src") or 0)) or sources[0]
            t = max(0.0, min(float(shot.get("time") or 0), sc["info"]["duration"] - 0.2))
            frame, card = workdir / "product_frame.png", workdir / "auto_product.png"
            _run([ff, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", sc["path"], "-frames:v", "1", str(frame)], timeout=120)
            if frame.exists():
                overlay_assets.card_from_frame(frame, shot, card)
                out.append({"id": "auto_product", "kind": "product", "name": "원본 화면에서 잘라 낸 상품", "cut_path": str(card), "auto": True})
        except Exception as e:
            notes.append(f"상품 장면을 자동으로 잘라 내지 못했습니다: {str(e)[:100]}")
    brand = " ".join(str(edl.get("brand_text") or "").split())[:16]
    if brand and not any(a.get("kind") == "logo" for a in out):
        try:
            badge = overlay_assets.brand_badge(brand, workdir / "auto_brand.png")
            if badge:
                out.append({"id": "auto_brand", "kind": "logo", "name": f"브랜드 이름: {brand}", "cut_path": str(badge), "auto": True})
        except Exception as e:
            notes.append(f"브랜드 이름 배지를 만들지 못했습니다: {str(e)[:100]}")
    return out


def build_extras(edl: dict, assets: list[dict], style: dict | None, ff: str, workdir: Path, seed: int, notes: list[str],
                 sources: dict[int, dict] | None = None) -> dict:
    """렌더러에 넘길 소리·팝업 재료. 실패한 재료는 빼고 사유를 notes 에 적는다(영상은 계속 만든다)."""
    from . import audio_fx, overlay_assets
    extras: dict = {}
    if sources:
        assets = auto_assets(edl, assets, sources, ff, workdir, notes)
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
        pips.append({"src": m.get("src", 0), "src_start": m["src_start"], "focus": m["focus"], "start": round(start, 1), "duration": dur})
        ovs.append({"kind": "pip", "path": "", "start": start, "end": start + dur, "src": m.get("src", 0), "src_start": m["src_start"], "focus": m["focus"]})
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
            raw = probe_audio(ff, path)
            # 길이·속도 맞춤: 첫 장면 문장은 약 2.9초, 중간 문장은 약 3.4초 안에 들어오게 최대 1.3배까지만 빠르게(그 이상은 알아듣기 어렵다)
            fit = RULES["tts_max_seconds"][0 if ln["where"] == "첫 장면" else 1]
            if raw / tempo > fit:
                tempo = round(min(1.3, raw / fit), 2)
            dur = raw / tempo
            audio.setdefault("lines", []).append({"where": ln["where"], "text": ln["text"], "seconds": round(dur, 1), "speed": tempo})
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


def project_sources(proj: ShortsProject) -> dict[int, dict]:
    """올려 둔 원본 파일들. {원본 번호(0=첫 원본, 1·2=섞어 쓸 원본): {path,name,info,hint_start,hint_end,url,title,channel}}"""
    out: dict[int, dict] = {}
    if proj.source_path and Path(proj.source_path).exists():
        out[0] = {"path": proj.source_path, "name": proj.source_name, "info": proj.source_info or {},
                  "hint_start": proj.hint_start, "hint_end": proj.hint_end}
    for x in (proj.extra_sources or []):
        k = int(x.get("slot") or 0) - 1
        if k in (1, 2) and x.get("path") and Path(x["path"]).exists():
            out[k] = {"path": x["path"], "name": x.get("name"), "info": x.get("info") or {}, "hint_start": x.get("hint_start"), "hint_end": None,
                      "url": x.get("url"), "title": x.get("title"), "channel": x.get("channel")}
    return out


def decide_edl(db, c: SourcingCandidate, proj: ShortsProject, r: ShortsRender, ff: str, sources: dict[int, dict], workdir: Path,
               guide: dict | None = None) -> tuple[dict, str, list[str]]:
    notes: list[str] = []
    orig = c.video.original
    transcript = (orig.transcript or {}).get("segments") if (orig and isinstance(orig.transcript, dict)) else None
    ranges: dict[int, tuple[tuple[float, float] | None, str]] = {}
    for k, sc in sources.items():
        info, rng, basis = sc["info"], None, ""
        if sc.get("hint_start") is not None:
            rng, basis = (float(sc["hint_start"]), float(sc.get("hint_end") or sc["hint_start"] + 60)), "manual_range"
        elif k == 0 and c.segment and c.segment.start_seconds is not None:
            rng, basis = (float(c.segment.start_seconds), float(c.segment.end_seconds or c.segment.start_seconds + 60)), "saved_segment"
        if rng is not None and rng[0] >= info["duration"] - 5:
            src_name = "입력한 위치" if basis == "manual_range" else "저장된 장면 위치"
            msg = f"{src_name}({int(rng[0])}초)가 올린 영상 길이({int(info['duration'])}초)를 넘습니다."
            if k == 0:
                raise ShortsError(msg + " 올린 파일이 원본 전체가 맞는지 확인하거나 '대략 위치'를 다시 적어 주세요.")
            notes.append(f"원본 {k + 1}: {msg} 위치를 무시했습니다.")
            rng, basis = None, ""
        ranges[k] = (rng, basis)
    has_ai = bool(get_settings().anthropic_api_key)
    rng, basis = ranges[0]
    if not has_ai:
        if rng is None:
            raise ShortsError("AI 키가 없으면 '대략 위치(분:초)'를 입력해야 합니다. 원본에서 상품이 나오는 시각을 적고 다시 눌러 주세요.")
        notes.append("AI 키가 없어 규칙으로 잘랐습니다(자막 문구 없음). 아래 편집안에서 시간을 고쳐 다시 렌더링할 수 있습니다.")
        own = own_title_lines(c)
        if not own:
            notes.append("상단 제목은 비워 두었습니다(참고 쇼츠의 제목은 가져오지 않습니다). 편집안에서 직접 적어 주세요.")
        extras = [(k, ranges[k][0][0], sources[k]["info"]["duration"]) for k in sorted(sources) if k and ranges[k][0]]
        for k in sorted(sources):
            if k and not ranges[k][0]:
                notes.append(f"원본 {k + 1}은 상품이 나오는 위치를 몰라 쓰지 않았습니다. 그 원본의 '대략 위치'를 적으면 섞어 넣습니다(AI 키가 있으면 자동으로 찾습니다).")
        return rule_edl(rng[0], rng[1], sources[0]["info"]["duration"], own, extras), basis + "+rule" + (f"+mix{len(extras) + 1}" if extras else ""), notes
    ctx = _context(c)
    items = []
    for k in sorted(sources):
        sc = sources[k]
        info = sc["info"]
        krng, kbasis = ranges[k]
        if krng is None:
            if info["duration"] <= 200:
                krng, kbasis = (0.0, info["duration"]), "whole_video"
            else:
                _set(db, r, f"AI 가 원본 {k + 1} 전체에서 장면 찾는 중", 15 + 8 * k)
                loc = ai_locate(ff, sc["path"], info, ctx, workdir)
                if not loc.get("found"):
                    if k == 0:
                        raise ShortsError(f"AI 가 원본에서 해당 장면을 찾지 못했습니다({loc.get('reason', '')}). '대략 위치(분:초)'를 입력하고 다시 시도하세요.")
                    notes.append(f"원본 {k + 1}에서는 관련 장면을 찾지 못해 쓰지 않았습니다({loc.get('reason', '')}).")
                    continue
                krng, kbasis = (float(loc["start"]), float(loc["end"])), "ai_locate"
                notes.append(f"원본 {k + 1} 장면 탐색({loc.get('confidence')}): {loc.get('reason', '')}")
        if k == 0:
            basis = kbasis
        items.append({"src": k, "path": sc["path"], "info": info, "rng": krng, "name": sc.get("title") or sc.get("name")})
    _set(db, r, "AI 가 후킹 장면·컷 순서·내레이션 구성 중", 40)
    raw = ai_edit(ff, items, ctx, workdir, transcript, guide=guide)
    raw.pop("_model", None); raw.pop("_transport", None)
    return raw, basis + "+ai_vision" + (f"+mix{len(items)}" if len(items) > 1 else ""), notes


def production_limits(db) -> tuple[float, float]:
    """쇼츠 총 길이 범위(제작 원칙, 기본 20~30초). 설정 shorts_total_range 로 바꿀 수 있다."""
    from ..models import UserSetting
    st = db.get(UserSetting, "shorts_total_range")
    try:
        lo, hi = (float(x) for x in st.value["value"]) if st else RULES["total_range"]
        return (max(12.0, min(lo, hi)), min(60.0, max(lo, hi)))
    except Exception:
        return RULES["total_range"]


def run_render(render_id: int, reuse_edl: bool = False) -> None:
    with SessionLocal() as db:
        r = db.get(ShortsRender, render_id)
        if not r:
            return
        workdir = get_settings().media_dir / "work" / f"r{render_id}"
        try:
            c = db.get(SourcingCandidate, r.candidate_id)
            proj = db.get(ShortsProject, r.candidate_id)
            sources = project_sources(proj) if (c and proj) else {}
            if 0 not in sources:
                raise ShortsError("원본 mp4 파일이 없습니다. 먼저 파일을 올려 주세요.")
            ff = find_ffmpeg()
            caps = capabilities(ff)
            if not caps.get("available"):
                raise ShortsError(caps.get("reason", "ffmpeg 없음"))
            r.status = "running"
            workdir.mkdir(parents=True, exist_ok=True)
            _set(db, r, "영상 정보 확인", 5)
            for sc in sources.values():
                sc["info"] = probe(ff, sc["path"])
            info = sources[0]["info"]
            proj.source_info = info
            durations = {k: sc["info"]["duration"] for k, sc in sources.items()}
            notes: list[str] = []
            from ..models import ReferenceStyle
            from . import audio_fx
            from .style_profile import normalize_style, style_guide
            ref = db.get(ReferenceStyle, r.style_id) if r.style_id else None
            style = normalize_style(ref.profile) if (ref and ref.profile) else None
            if ref and not style:
                notes.append(f"스타일 「{ref.name}」이 아직 학습되지 않아 기본 스타일로 만들었습니다.")
            # 제작 원칙을 스타일 위에 덮는다: 총 길이 20~30초, 후킹 3초 이내, AI 음성 2문장(쓸 수 있는 음성이 있을 때)
            limits = production_limits(db)
            base = style or normalize_style(None)
            target = max(limits[0] + 2, min(limits[1] - 2, base["pacing"]["total_seconds"]))
            guide = style_guide(base)
            narr_on = bool(base["narration"]["enabled"] or audio_fx.tts_status()["available"])
            guide.update(target_total_seconds=target, total_range=list(limits), hook_seconds=min(HOOK_MAX, base["hook"]["seconds"]),
                         narration=narr_on, mid_narrations=1 if narr_on else 0)
            if reuse_edl and r.edl:
                edl, by = r.edl, "edited"
            else:
                edl, by, notes2 = decide_edl(db, c, proj, r, ff, sources, workdir, guide)
                notes += notes2
                if style and edl.get("hook"):
                    edl["hook"]["end"] = edl["hook"]["start"] + min(HOOK_MAX, style["hook"]["seconds"])
                if not edl.get("brand_text") and c.product and c.product.brand:
                    edl["brand_text"] = c.product.brand
            from .house_style import default_style_id
            if ref and style and ref.id != default_style_id(db):  # 기본(내 채널) 스타일은 따로 적지 않는다
                by += f"+style:{ref.name}"
            orig = c.video.original
            ch = (orig.channel.channel_name if orig and orig.channel else (orig.yt_channel_title if orig else None))
            edl.setdefault("credit", "")
            if not edl.get("credit"):
                names = [ch] + [sources[k].get("channel") or sources[k].get("title") for k in sorted(sources) if k]
                names = list(dict.fromkeys(x for x in names if x))
                edl["credit"] = (f"출처: {' · '.join(names)[:48]}" + (" 유튜브" if len(names) == 1 else "")) if names else "출처: 원본 유튜브 영상"
            if not edl.get("title_lines") and not reuse_edl:
                edl["title_lines"] = own_title_lines(c)
            edl = normalize_edl(edl, info["duration"], target, durations, limits)
            if not reuse_edl:
                _set(db, r, "말 사이 무음에 컷 맞추는 중", 60)
                for sg in edl["segments"]:  # 컷마다 그 주변의 무음을 찾아 말이 끊기지 않는 지점으로 맞춘다
                    sc = sources[sg["src"]]
                    if not sc["info"].get("has_audio"):
                        continue
                    sil = detect_silences(ff, sc["path"], max(0, sg["start"] - 1.5), min(sc["info"]["duration"], sg["end"] + 1.5))
                    sg["start"], sg["end"] = snap(sg["start"], sil), snap(sg["end"], sil)
                edl = normalize_edl(edl, info["duration"], target, durations, limits)
            if edl.get("dropped_overlaps"):
                notes.append(f"같은 장면을 두 번 쓰지 않도록, 겹치는 컷 {edl.pop('dropped_overlaps')}개를 뺐습니다.")
            _set(db, r, "AI 음성·효과음·상품 사진 준비 중", 66)
            assets = [x for x in (proj.assets or []) if x.get("cut_path") and Path(x["cut_path"]).exists()]
            extras = build_extras(edl, assets, style, ff, workdir, r.id, notes, sources=sources)
            r.edl, r.decided_by = edl, by
            _set(db, r, "세로 쇼츠 렌더링 중", 70)
            out = get_settings().media_dir / "renders" / f"shorts_c{c.id}_r{r.id}.mp4"
            oi = render(ff, caps, proj.source_path, info, edl, out, workdir, style=style, extras=extras, sources=sources)
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
    if style_id is None:  # 스타일을 고르지 않으면 내 채널 기본 스타일로
        from .house_style import default_style_id
        style_id = default_style_id(db)
    r = ShortsRender(candidate_id=candidate_id, status="queued", step="대기", progress=0, edl=edl, style_id=style_id)
    db.add(r)
    db.commit()
    threading.Thread(target=run_render, args=(r.id, edl is not None), daemon=True, name=f"shorts-{r.id}").start()
    return r
