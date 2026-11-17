"""plan 규칙 검사와 자동 다듬기.

  python pipeline/checks.py --plan work/편/plan.json --src input/편/원본.mp4 --words work/편/words.json [--fix]

--fix 를 주면 컷 안의 쉼(0.3초 이상)과 앞뒤 무음을 잘라 컷을 나눈 plan을 같은 파일에 다시 쓴다.
"""
from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402
from pipeline.build import crop_of, load_plan, trim_silence  # noqa: E402

MAX_SEC = 20.0
TTS_MAX_CHARS = 18
BANNED_TITLE = ["추천", "필수템", "꿀템", "이것", "이거", "인생템", "강추"]
# 제품명에 들어 있어도 제목에 써도 되는 일반 명사(브랜드·고유 제품명만 막는다)
GENERIC = {"크림", "세럼", "오일", "로션", "토너", "쿠션", "팩", "마스크", "앰플", "에센스", "립", "틴트", "샴푸", "린스",
           "파운데이션", "선크림", "미스트", "밤", "젤", "클렌저", "스킨", "수분크림", "아이크림", "핸드크림", "바디", "헤어",
           "립밤", "립스틱", "마스카라", "섀도우", "블러셔", "컨실러", "프라이머", "파우더", "향수", "가방", "신발"}


def _norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s)


def nchars(s: str) -> int:
    return len(s.replace(" ", ""))


def est_duration(plan: dict, assets: Path | None) -> tuple[float, list[float]]:
    """완성 길이 추정(초)과 TTS 길이들. TTS 파일이 있으면 실제 길이를 쓴다."""
    total, tts = 0.0, []
    for s in plan["timeline"]:
        if s["type"] == "cut":
            total += (float(s["b"]) - float(s["a"])) / float(plan["speed"])
        else:
            p = (assets / s["audio"]) if assets and s.get("audio") else None
            if p and p.exists():
                d = len(trim_silence(util.read_audio(p))) / util.SR + 0.12
            else:
                d = 0.15 * nchars(s.get("text", "")) + 0.3
            tts.append(d)
            total += d
    return total, tts


def validate(plan: dict, meta: dict, assets: Path | None = None, asr: dict | None = None) -> dict:
    """규칙 위반은 errors, 권고는 warnings."""
    E, W = [], []
    tl = plan.get("timeline") or []
    cuts = [(i, s) for i, s in enumerate(tl) if s.get("type") == "cut"]
    ttss = [(i, s) for i, s in enumerate(tl) if s.get("type") == "tts"]
    if not cuts:
        return {"errors": ["timeline에 컷이 없습니다."], "warnings": [], "est_duration": 0.0}
    size, _ = crop_of(plan, meta)
    c = plan.get("crop") or {}
    x_min = int(c.get("x_min", 0) or 0)
    x_max = int(c.get("x_max", 0) or meta["width"])

    # 컷 기본
    for i, s in cuts:
        a, b = float(s["a"]), float(s["b"])
        if not (0 <= a < b <= meta["duration"] + 0.05):
            E.append(f"timeline[{i}]: 구간 {a}~{b}초가 잘못됐습니다(원본 길이 {meta['duration']:.1f}초).")
        if b - a < 0.3:
            W.append(f"timeline[{i}]: 컷이 {b - a:.2f}초로 너무 짧습니다.")
    for i, s in cuts + [(i, s) for i, s in ttss if not s.get("image")]:
        x0 = int(s.get("x0", 0))
        if x0 < max(0, x_min) or x0 + size > min(meta["width"], x_max):
            E.append(f"timeline[{i}]: x0={x0} 이면 크롭({size}px)이 허용 범위 x {max(0, x_min)}~"
                     f"{min(meta['width'], x_max)} 를 벗어납니다(라벨·광고 문구가 들어옴). "
                     f"x0는 {max(0, x_min)}~{min(meta['width'], x_max) - size} 사이여야 합니다.")

    # 길이
    total, tts_d = est_duration(plan, assets)
    if total > MAX_SEC:
        E.append(f"완성 길이가 {total:.1f}초로 {MAX_SEC:.0f}초를 넘습니다. 컷을 {total - MAX_SEC + 0.3:.1f}초 이상 줄이세요.")
    elif total < 12:
        W.append(f"완성 길이가 {total:.1f}초로 짧습니다.")

    # 순서
    if tl[0].get("type") != "cut":
        E.append("맨 앞은 가장 후킹되는 컷이어야 합니다(TTS로 시작하지 않는다).")
    starts = [float(s["a"]) for _, s in cuts]
    jumps = sum(1 for x, y in zip(starts, starts[1:]) if y < x)
    need = 2 if len(cuts) >= 4 else 1 if len(cuts) >= 2 else 0
    if jumps < need:
        E.append(f"장면 순서를 2~3번 섞어야 합니다(지금은 시간을 거슬러 가는 전환이 {jumps}번, 최소 {need}번). "
                 f"시간순으로 놓지 않는다.")

    # 같은 소스 구간 두 번 쓰지 않기
    spans = sorted((float(s["a"]), float(s["b"]), i) for i, s in cuts)
    for (a1, b1, i1), (a2, b2, i2) in zip(spans, spans[1:]):
        if a2 < b1 - 0.02:
            E.append(f"timeline[{i1}]과 timeline[{i2}]의 소스 구간이 겹칩니다({a2:.2f}~{min(b1, b2):.2f}초).")
    stills = []
    for i, s in ttss:
        if s.get("image"):
            if assets and not (assets / s["image"]).exists():
                E.append(f"timeline[{i}]: 이미지 파일이 없습니다: {s['image']}")
            continue
        if s.get("still_t") is None:
            E.append(f"timeline[{i}]: TTS 구간에는 image 또는 still_t(정지 화면 시각)가 필요합니다.")
            continue
        t = float(s["still_t"])
        if not 0 <= t <= meta["duration"]:
            E.append(f"timeline[{i}]: still_t={t} 가 원본 길이를 벗어났습니다.")
        for a, b, j in spans:
            if a - 0.05 <= t <= b + 0.05:
                E.append(f"timeline[{i}]: 정지 화면 {t:.2f}초가 timeline[{j}] 컷과 겹칩니다. 다른 시각을 고르세요.")
        if any(abs(t - u) < 0.5 for u in stills):
            E.append(f"timeline[{i}]: 정지 화면 두 장이 같은 장면입니다.")
        stills.append(t)

    # TTS
    if len(ttss) != 2:
        E.append(f"TTS는 2개여야 합니다(지금 {len(ttss)}개).")
    for i, s in ttss:
        n = nchars(s.get("text", ""))
        if n == 0:
            E.append(f"timeline[{i}]: TTS 문구가 비었습니다.")
        elif n > TTS_MAX_CHARS:
            E.append(f"timeline[{i}]: TTS 문구가 {n}자입니다. 공백 빼고 {TTS_MAX_CHARS}자 이내로.")

    # 제목(화면 상단 두 줄 = 썸네일 문구)
    title = plan.get("title") or []
    if len(title) != 2 or not all(str(x).strip() for x in title):
        E.append("title은 두 줄이어야 합니다.")
    else:
        joined = _norm("".join(title))
        names = sorted({w for w in re.split(r"\s+", f"{plan.get('product', '')} {plan.get('brand', '')}")
                        if len(_norm(w)) >= 2 and _norm(w) not in GENERIC})
        for bad in BANNED_TITLE + names:
            if _norm(bad) and _norm(bad) in joined:
                E.append(f"title에 '{bad}' 가 들어 있습니다. 광고처럼 보이는 말·제품명·브랜드명은 쓰지 않는다.")
        for ln in title:
            if nchars(ln) > 9:
                W.append(f"title 한 줄이 {nchars(ln)}자입니다('{ln}'). 줄당 6자 안팎이 좋습니다.")

    # 자막
    words = (asr or {}).get("words") or []
    speech = (asr or {}).get("speech") or []
    for i, s in cuts:
        a, b = float(s["a"]), float(s["b"])
        subs = s.get("subs") or []
        prev = -1.0
        for k, sb in enumerate(subs):
            t = float(sb["t"])
            if not (a - 0.15 <= t < b):
                E.append(f"timeline[{i}].subs[{k}] '{sb['text']}': t={t} 가 컷 {a}~{b} 밖입니다.")
            if t <= prev:
                E.append(f"timeline[{i}].subs[{k}]: 자막 시각이 앞 자막보다 빠릅니다.")
            prev = t
            if len(str(sb["text"]).split()) > 3 or nchars(sb["text"]) > 14:
                W.append(f"timeline[{i}].subs[{k}] '{sb['text']}': 한 덩이가 깁니다. 두 어절씩 묶으세요.")
            if words:
                t_next = float(subs[k + 1]["t"]) if k + 1 < len(subs) else b
                heard = "".join(w["w"] for w in words if t - 0.12 <= w["t"] < t_next - 0.05)
                want = _norm(sb["text"])
                ratio = difflib.SequenceMatcher(None, _norm(heard)[:len(want) + 1], want).ratio()
                if k + 1 == len(subs) and len(_norm(heard)) > len(want) + 5 and ratio >= 0.5:
                    W.append(f"timeline[{i}].subs[{k}] '{sb['text']}' 뒤로 자막 없는 말이 이어집니다: '{heard}'. "
                             f"컷 끝까지 자막을 달거나 컷을 줄이세요.")
                if ratio < 0.5:
                    W.append(f"timeline[{i}].subs[{k}] '{sb['text']}': 그 시각의 음성 인식은 '{heard}' 입니다. "
                             f"자막은 실제 말과 같아야 합니다.")
                if not any(abs(w["t"] - t) <= 0.12 for w in words):
                    W.append(f"timeline[{i}].subs[{k}] '{sb['text']}': t={t} 근처에 시작하는 어절이 없습니다.")
        if words:
            if not subs and any(a <= w["t"] < b for w in words):
                W.append(f"timeline[{i}]: 말이 있는 컷인데 자막이 없습니다.")
            late = [w for w in words if b - 0.2 < w["t"] < b]
            if late:
                W.append(f"timeline[{i}]: 끝({b}초) 직전에 '{late[-1]['w']}' 가 시작합니다. 말이 잘릴 수 있습니다.")
        for ga, gb in _gaps(a, b, speech, words):
            W.append(f"timeline[{i}]: {ga:.2f}~{gb:.2f}초가 말 없는 구간({gb - ga:.2f}초)입니다. 잘라내세요(--fix).")

    # 댓글 카드
    cards = plan.get("cards") or []
    if len(cards) != 2:
        W.append(f"댓글 카드는 2개가 기준입니다(지금 {len(cards)}개).")
    for k, cdd in enumerate(cards):
        if not 0 <= int(cdd.get("seg", -1)) < len(tl):
            E.append(f"cards[{k}].seg 가 timeline 범위를 벗어났습니다.")
        if not str(cdd.get("text", "")).strip() and not cdd.get("image"):
            E.append(f"cards[{k}]: 댓글 원문이 비었습니다.")

    # 마무리(루프), 효과음
    last = tl[-1]
    pname = [w for w in str(plan.get("product", "")).split() if len(_norm(w)) >= 2]
    if last.get("type") != "cut":
        W.append("마지막은 제품명이 나오는 컷으로 끝내면 처음으로 자연스럽게 이어집니다.")
    elif pname and words:
        said = _norm("".join(w["w"] for w in words if float(last["a"]) - 0.2 <= w["t"] < float(last["b"])))
        if not any(_norm(w) in said for w in pname):
            W.append("마지막 컷에서 제품명이 들리지 않습니다(루프 마무리 권고).")
    n_sfx = sum(1 for s in tl if s.get("sfx")) + sum(1 for s in tl for sb in (s.get("subs") or []) if sb.get("sfx"))
    if not 3 <= n_sfx <= 7:
        W.append(f"효과음이 {n_sfx}개입니다. 5개 안팎이 기준입니다.")
    return {"errors": E, "warnings": W, "est_duration": round(total, 2)}


def _speech_spans(a, b, speech, words, margin=0.07):
    """컷 a~b 안에서 말이 있는 구간들(여유 margin 포함, 0.3초 미만 틈은 이어 붙임)."""
    iv = [[max(a, s), min(b, e)] for s, e in speech if e > a and s < b]
    iv += [[max(a, w["t"] - 0.03), min(b, w["t"] + 0.18)] for w in words if a <= w["t"] < b]
    if not iv:
        return []
    iv.sort()
    merged = [iv[0][:]]
    for s, e in iv[1:]:
        if s - merged[-1][1] < 0.3 + 2 * margin:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [[max(a, s - margin), min(b, e + margin)] for s, e in merged]


def _gaps(a, b, speech, words, min_gap=0.3):
    if not speech and not words:
        return []
    sp = _speech_spans(a, b, speech, words)
    if not sp:
        return []
    edges = [a] + [v for s in sp for v in s] + [b]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2) if edges[i + 1] - edges[i] >= min_gap]


def tighten(plan: dict, asr: dict) -> tuple[dict, list[str]]:
    """컷 안의 쉼과 앞뒤 무음을 잘라낸다. 쉼이 있으면 컷을 둘로 나눈다. (바뀐 plan, 한 일 목록)"""
    speech, words = asr.get("speech") or [], asr.get("words") or []
    new_tl, remap, notes = [], {}, []
    for i, s in enumerate(plan["timeline"]):
        remap[i] = len(new_tl)
        if s.get("type") != "cut":
            new_tl.append(s)
            continue
        a, b = float(s["a"]), float(s["b"])
        sp = _speech_spans(a, b, speech, words)
        sp = [p for p in sp if p[1] - p[0] >= 0.2]
        if not sp or not _gaps(a, b, speech, words):
            new_tl.append(s)
            continue
        subs = sorted(s.get("subs") or [], key=lambda x: float(x["t"]))
        for k, (pa, pb) in enumerate(sp):
            piece = {kk: v for kk, v in s.items() if kk not in ("subs", "sfx")}
            piece.update(a=round(pa, 2), b=round(pb, 2), subs=[])
            if k == 0 and s.get("sfx"):
                piece["sfx"] = s["sfx"]
            new_tl.append(piece)
        pieces = new_tl[-len(sp):]
        for sb in subs:
            t = float(sb["t"])
            tgt = next((p for p in pieces if t < p["b"]), pieces[-1])
            sb = dict(sb)
            sb["t"] = round(min(max(t, tgt["a"]), tgt["b"] - 0.05), 2)
            tgt["subs"].append(sb)
        notes.append(f"timeline[{i}] {a:.2f}~{b:.2f}초 → " + ", ".join(f"{p['a']:.2f}~{p['b']:.2f}" for p in pieces))
    out = dict(plan)
    out["timeline"] = new_tl
    out["cards"] = [{**c, "seg": remap.get(int(c.get("seg", 0)), 0)} for c in plan.get("cards") or []]
    return out, notes


def validate_tight(plan: dict, meta: dict, assets, asr: dict | None) -> dict:
    """쉼을 잘라낸 뒤의 길이로 20초 규칙을 본다. 나머지 규칙은 원래 plan 기준(구간 번호가 바뀌지 않게)."""
    res = validate(plan, meta, assets, asr)
    if asr:
        tight, _ = tighten(plan, asr)
        t2 = validate({**plan, "timeline": tight["timeline"], "cards": tight["cards"]}, meta, assets, asr)
        is_len = lambda e: e.startswith("완성 길이")  # noqa: E731
        res["errors"] = [e for e in res["errors"] if not is_len(e)] + [e for e in t2["errors"] if is_len(e)]
        res["est_duration"] = t2["est_duration"]
    return res


def report(res: dict) -> str:
    lines = [f"예상 길이 {res['est_duration']}초"]
    lines += [f"[오류] {e}" for e in res["errors"]] + [f"[권고] {w}" for w in res["warnings"]]
    if not res["errors"]:
        lines.append("규칙 검사 통과" + (" (권고 사항 있음)" if res["warnings"] else ""))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="plan 규칙 검사")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--src", required=True)
    ap.add_argument("--words", help="asr_words.py 로 만든 JSON(자막·쉼 검사에 쓴다)")
    ap.add_argument("--assets", help="tts·이미지 폴더(기본: 원본 영상 폴더)")
    ap.add_argument("--fix", action="store_true", help="쉼·무음을 잘라 plan을 고쳐 쓴다")
    a = ap.parse_args()
    plan = load_plan(a.plan)
    asr = util.read_json(a.words) if a.words else None
    meta = util.probe(a.src)
    if a.fix and asr:
        raw = util.read_json(a.plan)
        fixed, notes = tighten({**raw, "timeline": raw["timeline"], "cards": raw.get("cards", [])}, asr)
        if notes:
            util.write_json(a.plan, fixed)
            print("\n".join("[다듬음] " + n for n in notes))
            plan = load_plan(a.plan)
    res = validate(plan, meta, Path(a.assets) if a.assets else Path(a.src).parent, asr)
    print(report(res))
    raise SystemExit(1 if res["errors"] else 0)


if __name__ == "__main__":
    main()
