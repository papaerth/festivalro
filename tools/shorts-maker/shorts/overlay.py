"""자막·출처·썸네일 문구 ASS 생성 (SPEC.md 5장 규격표).

캡컷 좌표(중앙 0,0, 위가 +)를 config.yaml의 capcut 환산식으로 픽셀로 바꾼다.
여러 줄 글은 줄마다 별도 이벤트로 \\pos 를 찍어 줄간격을 직접 제어한다.
"""

from pathlib import Path

from PIL import ImageFont

from . import ShortsError


# ── 좌표·크기 환산 ─────────────────────────────────────────────
def capcut_to_px(cfg, x, y):
    c, cv = cfg["capcut"], cfg["canvas"]
    px = cv["width"] / 2 + x * c["position_scale"] + c.get("offset_x", 0)
    py = cv["height"] / 2 - y * c["position_scale"] + c.get("offset_y", 0)
    return px, py


def font_px(cfg, size):
    return max(1, round(size * cfg["capcut"]["font_scale"]))


def spacing_px(cfg, v):
    return v * cfg["capcut"].get("line_spacing_scale", 1.0)


def outline_px(cfg, v):
    return v * cfg["capcut"].get("outline_scale", 1.0)


def line_height_px(cfg, size):
    return font_px(cfg, size) * cfg["capcut"].get("line_height_ratio", 1.2)


# ── 폰트 ────────────────────────────────────────────────────────
def resolve_fonts(cfg, warn=print):
    """config의 폰트 키 → (파일 경로, 패밀리명). 파일이 없으면 fallback으로 바꾸고 경고."""
    fdir = cfg["_root"] / cfg["fonts"]["dir"]
    fallback = fdir / cfg["fonts"]["fallback"]
    if not fallback.exists():
        raise ShortsError(f"대체 폰트가 없습니다: {fallback}")
    out = {}
    for key, fname in cfg["fonts"]["files"].items():
        p = fdir / fname
        if not p.exists():
            warn(f"[경고] 폰트 파일이 없어 대체 폰트로 렌더링합니다: {fname} → {fallback.name}  (넣을 곳: {fdir})")
            p = fallback
        out[key] = (p, family_name(p))
    return out, fdir


def family_name(path):
    try:
        return ImageFont.truetype(str(path), 20).getname()[0]
    except Exception:
        raise ShortsError(f"폰트 파일을 열 수 없습니다: {path}")


# ── ASS 문법 ───────────────────────────────────────────────────
def ass_color(hex_color, alpha=0):
    c = hex_color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    r, g, b = c[0:2], c[2:4], c[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_time(sec):
    sec = max(0.0, sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def ass_escape(text):
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def style_line(name, family, spec, cfg):
    bold = -1 if spec.get("bold") else 0
    return (
        f"Style: {name},{family},{font_px(cfg, spec['size'])},"
        f"{ass_color(spec.get('color', '#FFFFFF'))},{ass_color(spec.get('color', '#FFFFFF'))},"
        f"{ass_color(spec.get('outline_color', '#000000'))},{ass_color('#000000', 0x80)},"
        f"{bold},0,0,0,100,100,0,0,1,{outline_px(cfg, spec.get('outline', 0)):.1f},0,5,0,0,0,1"
    )


def dialogue(style, start, end, x, y, text, layer=0):
    return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{{\\an5\\pos({x:.0f},{y:.0f})}}{ass_escape(text)}"


# ── 요소 배치 ──────────────────────────────────────────────────
def thumbnail_events(cfg, top_text, bottom_text, total):
    """썸네일 2줄. 아랫줄은 윗줄 바로 아래(줄 높이 + 줄간격)."""
    t_top, t_bot = cfg["texts"]["thumbnail_top"], cfg["texts"]["thumbnail_bottom"]
    x, y = capcut_to_px(cfg, t_top["x"], t_top["y"])
    events = []
    if top_text:
        events.append(dialogue("ThumbTop", 0, total, x, y, top_text, layer=5))
    if bottom_text:
        bx, _ = capcut_to_px(cfg, t_bot.get("x", t_top["x"]), 0)
        by = y + line_height_px(cfg, t_top["size"]) / 2 + spacing_px(cfg, t_top.get("line_spacing", 0)) \
            + line_height_px(cfg, t_bot["size"]) / 2
        events.append(dialogue("ThumbBottom", 0, total, bx, by, bottom_text, layer=5))
    return events


def source_events(cfg, source, total):
    spec = cfg["texts"]["source"]
    if not source:
        return []
    x, y = capcut_to_px(cfg, spec["x"], spec["y"])
    text = spec.get("format", "출처 : {source}").format(source=source)
    return [dialogue("Source", 0, total, x, y, text, layer=5)]


def subtitle_events(cfg, words):
    """words: [{'text', 'start', 'end'}] (출력 타임라인 기준 초).

    '즉시 나타나기': 단어 시작 시각에 바로 뜬다. 구절(max_chars)을 넘으면 새 구절로.
    mode=cumulative 면 구절 안에서 단어가 쌓이고, single 이면 한 번에 한 단어만.
    """
    spec = cfg["texts"]["subtitle"]
    x, y = capcut_to_px(cfg, spec["x"], spec["y"])
    max_chars = int(spec.get("max_chars", 14))
    mode = spec.get("mode", "cumulative")
    # 구절 나누기
    phrases, cur = [], []
    for w in words:
        if w.get("phrase_break") and cur:
            phrases.append(cur)
            cur = []
        cand = " ".join(x["text"] for x in cur + [w])
        if cur and len(cand) > max_chars:
            phrases.append(cur)
            cur = []
        cur.append(w)
    if cur:
        phrases.append(cur)
    events = []
    for ph in phrases:
        phrase_end = ph[-1]["end"]
        for i, w in enumerate(ph):
            start = w["start"]
            end = ph[i + 1]["start"] if i + 1 < len(ph) else phrase_end
            if end <= start:
                continue
            text = " ".join(v["text"] for v in ph[: i + 1]) if mode == "cumulative" else w["text"]
            events.append(dialogue("Subtitle", start, end, x, y, text))
    return events


def build_ass(cfg, fonts, total, thumb_top="", thumb_bottom="", source="", words=None):
    """전체 ASS 문자열. words가 None이면 자막 없이 썸네일·출처만."""
    cv = cfg["canvas"]
    t = cfg["texts"]
    header = [
        "[Script Info]",
        "; 연템저장소 쇼츠 제작기 생성. 좌표는 config.yaml capcut 환산식 결과(픽셀).",
        "ScriptType: v4.00+",
        f"PlayResX: {cv['width']}",
        f"PlayResY: {cv['height']}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        style_line("ThumbTop", fonts[t["thumbnail_top"]["font"]][1], t["thumbnail_top"], cfg),
        style_line("ThumbBottom", fonts[t["thumbnail_bottom"]["font"]][1], t["thumbnail_bottom"], cfg),
        style_line("Source", fonts[t["source"]["font"]][1], t["source"], cfg),
        style_line("Subtitle", fonts[t["subtitle"]["font"]][1], t["subtitle"], cfg),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    events = thumbnail_events(cfg, thumb_top, thumb_bottom, total)
    events += source_events(cfg, source, total)
    if words:
        events += subtitle_events(cfg, words)
    return "\n".join(header + events) + "\n"


def placeholder_words(timeline):
    """1단계용 임시 단어 시간: 구간 대사를 띄어쓰기로 나눠 구간 길이에 고르게 배치.
    2단계부터 Whisper 단어 시간으로 바꾼다."""
    words = []
    for item in timeline:
        text = item["segment"].text.strip()
        toks = text.split() if text else []
        if not toks:
            continue
        step = item["out_duration"] / len(toks)
        for i, tok in enumerate(toks):
            words.append({
                "text": tok,
                "start": item["out_start"] + i * step,
                "end": item["out_start"] + (i + 1) * step,
                "phrase_break": i == 0,  # 구간이 바뀌면 새 구절
            })
    return words


def layout_report(cfg, fonts):
    """환산 결과를 표로 돌려준다(좌표 확인용 출력)."""
    rows = []
    for name, key in (("썸네일 윗줄", "thumbnail_top"), ("썸네일 아랫줄", "thumbnail_bottom"),
                      ("출처", "source"), ("자막", "subtitle")):
        spec = cfg["texts"][key]
        if "y" in spec:
            x, y = capcut_to_px(cfg, spec["x"], spec["y"])
            pos = f"({spec['x']}, {spec['y']}) → ({x:.0f}px, {y:.0f}px)"
        else:
            pos = "윗줄 아래 자동"
        path, fam = fonts[spec["font"]]
        rows.append(f"  {name:<7} 크기 {spec['size']:>2} → {font_px(cfg, spec['size']):>3}px  위치 {pos}  폰트 {fam} ({Path(path).name})")
    return "\n".join(rows)
