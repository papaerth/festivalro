"""편집 스타일 값(레퍼런스 채널에서 학습하거나 기본값). 렌더러와 편집 AI 가 함께 쓴다."""
from __future__ import annotations

import re

DEFAULT_STYLE: dict = {
    "summary": "기본 스타일: 흐린 배경 + 원본 화면 가운데, 노란 상단 제목, 흰 하단 자막",
    "layout": {"mode": "blur_bg", "bg_color": "#101010", "fg_zoom": 1.0, "fg_position": "center"},
    "title": {"enabled": True, "size": "medium", "color": "#FFF000", "second_line_color": "", "outline_color": "#000000",
              "box": False, "box_color": "#000000", "tone": "궁금증을 일으키는 짧은 문장", "patterns": [], "keyword_color": ""},
    "caption": {"enabled": True, "position": "below_video", "size": "medium", "color": "#FFFFFF", "outline_color": "#000000",
                "box": False, "box_color": "#000000", "tone": "사실 설명형 한 줄", "max_chars": 18, "emoji": False, "highlight_color": "", "bounce": False, "bounce_mode": "line"},
    "hook": {"seconds": 3.0, "pattern": "상품이 처음 드러나거나 반응이 큰 순간을 먼저 보여 준다", "zoom_punch": False, "caption_color": "#FFFFFF"},
    "pacing": {"total_seconds": 26.0, "segments": 2, "max_clip_seconds": 14.0, "note": ""},
    "credit": {"enabled": True},
    "footer": {"text": "", "color": "#FFFFFF"},
    "narration": {"enabled": False, "rate": 1.12, "pattern": "첫 장면에 얹는 한 문장: 누가·무엇을 궁금하게 소개", "mid_count": 0},
    "stickers": {"enabled": False},
    "pip": {"enabled": False},
    "sfx": {"enabled": False},
    "bgm": {"mode": "none", "volume": 0.1, "track": ""},
    "popup": {"position": "top_right", "size": "medium", "motion": True},
    "end_question": False,
    "kick": [],
}
SIZES = {"title": {"small": 76, "medium": 92, "large": 108}, "caption": {"small": 56, "medium": 68, "large": 80}}
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")


def hex_ok(v, default: str) -> str:
    m = _HEX.match(str(v or "").strip())
    return f"#{m.group(1).upper()}" if m else default


def ass_color(hex_color: str, alpha: str = "00") -> str:
    """#RRGGBB → ASS &HAABBGGRR"""
    h = hex_ok(hex_color, "#FFFFFF")[1:]
    return f"&H{alpha}{h[4:6]}{h[2:4]}{h[0:2]}"


def _num(v, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


def _enum(v, allowed: tuple, default: str) -> str:
    return v if v in allowed else default


def normalize_style(raw: dict | None) -> dict:
    """AI·사람이 준 스타일을 렌더러가 안전하게 쓸 수 있는 범위로 정리(없는 값은 기본값)."""
    raw = raw or {}
    d = DEFAULT_STYLE
    lay, ti, ca, ho, pa, fo, na, sf, bg, po, sk, pi = (raw.get(k) or {} for k in (
        "layout", "title", "caption", "hook", "pacing", "footer", "narration", "sfx", "bgm", "popup", "stickers", "pip"))
    return {
        "summary": str(raw.get("summary") or d["summary"])[:400],
        "layout": {"mode": _enum(lay.get("mode"), ("blur_bg", "crop_fill", "color_bg"), "blur_bg"),
                   "bg_color": hex_ok(lay.get("bg_color"), d["layout"]["bg_color"]),
                   "fg_zoom": round(_num(lay.get("fg_zoom"), 1.0, 1.8, 1.0), 2),
                   "fg_position": _enum(lay.get("fg_position"), ("center", "upper"), "center")},
        "title": {"enabled": bool(ti.get("enabled", True)), "size": _enum(ti.get("size"), ("small", "medium", "large"), "medium"),
                  "color": hex_ok(ti.get("color"), d["title"]["color"]),
                  "second_line_color": hex_ok(ti.get("second_line_color"), "") if ti.get("second_line_color") else "",
                  "outline_color": hex_ok(ti.get("outline_color"), "#000000"), "box": bool(ti.get("box", False)),
                  "box_color": hex_ok(ti.get("box_color"), "#000000"), "tone": str(ti.get("tone") or d["title"]["tone"])[:200],
                  "patterns": [str(x)[:80] for x in (ti.get("patterns") or [])][:5],
                  "keyword_color": hex_ok(ti.get("keyword_color"), "") if ti.get("keyword_color") else ""},  # 제목의 *핵심 단어* 색
        "caption": {"enabled": bool(ca.get("enabled", True)),
                    "position": _enum(ca.get("position"), ("below_video", "bottom", "over_video"), "below_video"),
                    "size": _enum(ca.get("size"), ("small", "medium", "large"), "medium"),
                    "color": hex_ok(ca.get("color"), "#FFFFFF"), "outline_color": hex_ok(ca.get("outline_color"), "#000000"),
                    "box": bool(ca.get("box", False)), "box_color": hex_ok(ca.get("box_color"), "#000000"),
                    "tone": str(ca.get("tone") or d["caption"]["tone"])[:200],
                    "max_chars": int(_num(ca.get("max_chars"), 8, 28, 18)), "emoji": bool(ca.get("emoji", False)),
                    "highlight_color": hex_ok(ca.get("highlight_color"), "") if ca.get("highlight_color") else "",
                    "bounce": bool(ca.get("bounce", False)),  # 자막이 나타날 때 통통 튀는 효과
                    "bounce_mode": _enum(ca.get("bounce_mode"), ("line", "char"), "line")},  # line=한 줄이 함께 / char=글자가 하나씩 차례로
        "hook": {"seconds": round(_num(ho.get("seconds"), 1.5, 3.5, 3.0), 1), "pattern": str(ho.get("pattern") or d["hook"]["pattern"])[:200],
                 "zoom_punch": bool(ho.get("zoom_punch", False)), "caption_color": hex_ok(ho.get("caption_color"), "#FFFFFF")},
        "pacing": {"total_seconds": round(_num(pa.get("total_seconds"), 18, 60, 26), 1), "segments": int(_num(pa.get("segments"), 1, 12, 2)),
                   "max_clip_seconds": round(_num(pa.get("max_clip_seconds"), 2, 25, 14), 1), "note": str(pa.get("note") or "")[:200]},
        "credit": {"enabled": True},  # 출처 표기는 스타일과 무관하게 항상 넣는다
        # 하단 고정 문구(채널명·링크 안내 등 내 채널 문구). 비우면 표시하지 않는다
        "footer": {"text": str(fo.get("text") or "").replace("\n", " ").strip()[:40], "color": hex_ok(fo.get("color"), "#FFFFFF")},
        # 소리·팝업: AI 음성 한 문장, 합성 효과음, 배경음악(auto=내 보관함→내장 반주), 상품 사진·로고가 뜨는 자리
        "narration": {"enabled": bool(na.get("enabled", False)), "rate": round(_num(na.get("rate"), 0.9, 1.4, 1.12), 2),
                      "pattern": str(na.get("pattern") or d["narration"]["pattern"])[:200],
                      "mid_count": int(_num(na.get("mid_count"), 0, 2, 0))},  # 영상 중간에 넣는 내레이션 문장 수
        "stickers": {"enabled": bool(sk.get("enabled", False))},  # 반응·상품 장면에 움직이는 스티커
        "pip": {"enabled": bool(pi.get("enabled", False))},  # 원형 작은 화면(다른 순간의 반응 얼굴을 함께)
        "sfx": {"enabled": bool(sf.get("enabled", False))},
        "bgm": {"mode": _enum(bg.get("mode"), ("none", "auto"), "none"), "volume": round(_num(bg.get("volume"), 0.03, 0.35, 0.1), 2),
                "track": str(bg.get("track") or "")[:200]},
        "popup": {"position": _enum(po.get("position"), ("top_right", "top_left", "center"), "top_right"),
                  "size": _enum(po.get("size"), ("small", "medium", "large"), "medium"), "motion": bool(po.get("motion", True))},
        "end_question": bool(raw.get("end_question", False)),
        "kick": [str(x)[:120] for x in (raw.get("kick") or [])][:5],
    }


def style_guide(style: dict) -> dict:
    """편집 AI 에 넘기는 요약(문구 톤·후킹 방식·컷 속도)."""
    return {"title_tone": style["title"]["tone"], "title_patterns_abstract": style["title"]["patterns"],
            "caption_tone": style["caption"]["tone"], "caption_max_chars": style["caption"]["max_chars"], "emoji_ok": style["caption"]["emoji"],
            "hook_seconds": style["hook"]["seconds"], "hook_pattern": style["hook"]["pattern"],
            "target_total_seconds": style["pacing"]["total_seconds"], "target_segments": style["pacing"]["segments"],
            "max_clip_seconds": style["pacing"]["max_clip_seconds"], "pacing_note": style["pacing"]["note"],
            "own_twist": style["kick"], "end_question": style["end_question"],
            "highlight_keyword": bool(style["caption"]["highlight_color"]),
            "narration": style["narration"]["enabled"], "narration_pattern": style["narration"]["pattern"],
            "mid_narrations": style["narration"]["mid_count"] if style["narration"]["enabled"] else 0, "stickers": style["stickers"]["enabled"], "pip": style["pip"]["enabled"]}
