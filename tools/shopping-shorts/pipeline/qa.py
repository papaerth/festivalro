"""완성본 검수: 길이, 1초 간격 프레임 시트, 음성 재인식으로 자막 싱크 대조, TTS 구간 원본 소리 확인.

  python pipeline/qa.py --out output/<편>

output/<편>/_plan_resolved.json 을 읽고 _검수.json, _검수_01.jpg … 를 만든다.
"""
from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import asr_words, util  # noqa: E402
from pipeline.checks import MAX_SEC, _norm  # noqa: E402
from pipeline.sheets import make_sheets  # noqa: E402

SYNC_OK = 0.25   # 자막과 실제 말의 허용 오차(초)


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    n = min(len(a), len(b))
    if n < 100:
        return 1.0
    a, b = a[:n].mean(axis=1), b[:n].mean(axis=1)
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den > 0 else 1.0


def run_qa(out_dir) -> dict:
    out_dir = Path(out_dir)
    res = util.read_json(out_dir / "_plan_resolved.json")
    if not res:
        util.die(f"{out_dir}/_plan_resolved.json 이 없습니다. 먼저 build.py 로 렌더링하세요.")
    vo, vx = (out_dir / Path(res["outputs"][k]).name for k in ("배경음O", "배경음X"))
    issues, notes = [], []

    # 1) 길이
    dur = util.probe(vo)["duration"]
    if dur > MAX_SEC + 0.05:
        issues.append(f"길이 {dur:.2f}초: {MAX_SEC:.0f}초를 넘습니다.")

    # 2) 1초 간격 프레임 시트(사람·모델이 직접 본다)
    sheets = make_sheets(vo, out_dir / "_검수", step=1.0, cols=5, rows=2, thumb_w=324)

    # 3) 자막 싱크: 배경음X(목소리만)를 다시 인식해 자막 시작 시각과 비교
    asr = asr_words.transcribe_file(vx)
    words = asr["words"]
    sync = []
    for sb in res["subs"]:
        if sb["kind"] != "cut":
            continue
        want = _norm(sb["text"])
        best, best_r = None, 0.0
        for i, w in enumerate(words):
            if abs(w["t"] - sb["start"]) > 0.7:
                continue
            # 자막 한 덩이 전체를, 그 자리에서 이어지는 어절 1~3개와 견준다(첫 어절 오인식에 덜 흔들리게)
            r = max(difflib.SequenceMatcher(None, want, _norm("".join(x["w"] for x in words[i:i + k]))).ratio()
                    for k in (1, 2, 3))
            r -= 1.0 * abs(w["t"] - sb["start"])
            if r > best_r:
                best, best_r = w, r
        if best is None or best_r < 0.35:
            sync.append({"text": sb["text"], "start": sb["start"], "offset": None})
        else:
            sync.append({"text": sb["text"], "start": sb["start"], "heard": best["w"],
                         "offset": round(best["t"] - sb["start"], 2)})
    offs = [abs(s["offset"]) for s in sync if s["offset"] is not None]
    missing = [s for s in sync if s["offset"] is None]
    bad = [s for s in sync if s["offset"] is not None and abs(s["offset"]) > SYNC_OK]
    for s in bad:
        issues.append(f"자막 '{s['text']}' 이 실제 말보다 {abs(s['offset']):.2f}초 "
                      f"{'빠릅니다' if s['offset'] > 0 else '늦습니다'}.")
    if missing:
        notes.append("재인식에서 못 찾은 자막(직접 확인): " + ", ".join(f"'{s['text']}'" for s in missing))
    if sync and len(missing) > len(sync) / 2:
        issues.append("자막의 절반 이상이 재인식 결과와 맞지 않습니다. 자막 문구·시각을 다시 확인하세요.")

    # 4) TTS 구간: 원본 소리(배경음)가 섞였다면 두 버전의 소리가 달라진다
    xo, xx = util.read_audio(vo), util.read_audio(vx)
    tts = []
    for t in res["tts"]:
        a, b = int(t["start"] * util.SR), int(t["end"] * util.SR)
        c = _corr(xo[a:b], xx[a:b])
        tts.append({"text": t["text"], "start": t["start"], "end": t["end"], "same_in_both": round(c, 3),
                    "level_db": round(util.rms_db(xo[a:b]), 1)})
        if c < 0.97:
            issues.append(f"TTS '{t['text']}' 구간에서 두 버전의 소리가 다릅니다(일치도 {c:.2f}). 원본 소리가 섞였을 수 있습니다.")
    if len(res["tts"]) != 2:
        notes.append(f"TTS 구간이 {len(res['tts'])}개입니다.")
    if res.get("dropped_emoji"):
        notes.append("댓글 카드에서 빠진 이모지: " + " ".join(res["dropped_emoji"]))
    if not res.get("bgm_removed"):
        issues.append("배경음 제거를 건너뛰었습니다. 배경음X 파일이 배경음O와 같습니다.")

    out = {
        "ok": not issues, "duration": round(dur, 2), "issues": issues, "notes": notes,
        "sync": {"checked": len(sync), "mean_abs_offset": round(float(np.mean(offs)), 3) if offs else None,
                 "max_abs_offset": round(float(np.max(offs)), 3) if offs else None, "items": sync},
        "tts": tts, "sheets": [str(p) for p in sheets],
        "heard": " / ".join(l["text"] for l in asr["lines"]),
        "human": ["배경음X 버전에서 목소리가 뭉개지지 않았는지 직접 들어 보기",
                  "유튜브 업로드 화면에서 제품 태그 검색이 되는지 확인",
                  "프레임 시트에서 얼굴이 자막·댓글 카드에 가리지 않는지 보기"],
    }
    util.write_json(out_dir / "_검수.json", out)
    return out


def summary(q: dict) -> str:
    s = q["sync"]
    lines = [f"길이 {q['duration']}초 · 자막 {s['checked']}개 대조"
             + (f"(평균 오차 {s['mean_abs_offset']}초, 최대 {s['max_abs_offset']}초)" if s["mean_abs_offset"] is not None else "")]
    lines += [f"  TTS '{t['text']}': 두 버전 일치도 {t['same_in_both']}" for t in q["tts"]]
    lines += [f"[문제] {i}" for i in q["issues"]] + [f"[참고] {n}" for n in q["notes"]]
    lines.append("검수 통과" if q["ok"] else "검수에서 문제가 나왔습니다")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="완성본 검수")
    ap.add_argument("--out", required=True, help="output/<편> 폴더")
    a = ap.parse_args()
    q = run_qa(a.out)
    print(summary(q))
    raise SystemExit(0 if q["ok"] else 1)


if __name__ == "__main__":
    main()
