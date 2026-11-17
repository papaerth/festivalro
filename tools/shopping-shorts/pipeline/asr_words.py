"""음성 인식으로 실제 문구와 어절별 시작 시각을 얻는다.

자막은 반드시 이 결과로 만든다(원본 화면에 박힌 자막은 실제 말과 다르다).

  python pipeline/asr_words.py 원본.mp4 --a 120 --b 150        # 구간만
  python pipeline/asr_words.py 원본.mp4 --out work/편/words.json  # 전체

출력 JSON
  words  : [{"t": 시작초, "w": "어절"}]         (원본 영상 기준 초)
  speech : [[시작, 끝], ...]                    말소리 구간(무음 감지)
  lines  : [{"a": 시작, "b": 끝, "text": "문장"}]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402

ASR_SR = 16000
_rec = None


def recognizer(model_dir=None):
    global _rec
    if _rec is None:
        import sherpa_onnx as so
        d = util.model_path("asr", model_dir)

        def pick(stem):
            for suffix in (".int8.onnx", ".onnx"):
                c = sorted(d.glob(f"{stem}*{suffix}"))
                if c:
                    return str(c[0])
            util.die(f"음성 인식 모델 파일이 없습니다: {d}/{stem}*.onnx")

        _rec = so.OfflineRecognizer.from_transducer(
            encoder=pick("encoder"), decoder=str(sorted(d.glob("decoder*.onnx"))[-1]), joiner=pick("joiner"),
            tokens=str(d / "tokens.txt"), num_threads=4, sample_rate=ASR_SR, feature_dim=80,
            decoding_method="greedy_search")
    return _rec


def detect_speech(x: np.ndarray, min_silence: float = 0.3, vad_model=None) -> list[list[float]]:
    """말소리 구간 [[a,b],...]. x는 16kHz 모노."""
    import sherpa_onnx as so
    cfg = so.VadModelConfig(
        silero_vad=so.SileroVadModelConfig(model=str(util.model_path("vad", vad_model)), threshold=0.5,
                                           min_silence_duration=min_silence, min_speech_duration=0.15,
                                           max_speech_duration=14.0),
        sample_rate=ASR_SR)
    vad = so.VoiceActivityDetector(cfg, buffer_size_in_seconds=120)
    win = cfg.silero_vad.window_size
    out = []

    def drain():
        while not vad.empty():
            seg = vad.front
            out.append([seg.start / ASR_SR, (seg.start + len(seg.samples)) / ASR_SR])
            vad.pop()

    for i in range(0, len(x) - win + 1, win):
        vad.accept_waveform(x[i:i + win])
        drain()
    vad.flush()
    drain()
    return out


def _tokens_to_words(tokens, times, offset):
    """BPE 토큰(앞 공백 = 어절 시작)을 어절로 묶는다."""
    words = []
    for tok, t in zip(tokens, times):
        starts = tok.startswith(" ") or tok.startswith("▁")
        body = tok.strip(" ▁")
        if starts or not words:
            if body or not words:
                words.append({"t": round(offset + t, 2), "w": body})
            else:
                words.append({"t": None, "w": ""})  # 공백만 온 토큰: 다음 토큰이 채운다
        else:
            if words[-1]["t"] is None:
                words[-1]["t"] = round(offset + t, 2)
            words[-1]["w"] += body
    return [w for w in words if w["w"] and w["t"] is not None]


def transcribe(x: np.ndarray, offset: float = 0.0, model_dir=None, vad_model=None, min_silence: float = 0.3) -> dict:
    """x: 16kHz 모노 float32. offset: x[0]의 원본 시각(초)."""
    rec = recognizer(model_dir)
    speech = detect_speech(x, min_silence, vad_model)
    words, lines = [], []
    pad = int(0.15 * ASR_SR)
    for a, b in speech:
        i0, i1 = max(0, int(a * ASR_SR) - pad), min(len(x), int(b * ASR_SR) + pad)
        st = rec.create_stream()
        st.accept_waveform(ASR_SR, x[i0:i1])
        rec.decode_stream(st)
        r = st.result
        ws = _tokens_to_words(list(r.tokens), list(r.timestamps), offset + i0 / ASR_SR)
        if ws:
            words += ws
            lines.append({"a": round(offset + a, 2), "b": round(offset + b, 2),
                          "text": " ".join(w["w"] for w in ws)})
    return {"words": words, "speech": [[round(offset + a, 2), round(offset + b, 2)] for a, b in speech],
            "lines": lines}


def transcribe_file(path, a=None, b=None, **kw) -> dict:
    x = util.read_audio(path, sr=ASR_SR, ch=1, a=a, b=b)[:, 0]
    return transcribe(x, offset=float(a or 0.0), **kw)


def fmt_time(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def as_text(res: dict, words: bool = False) -> str:
    """사람·모델이 읽기 쉬운 대본. words=True면 어절마다 시각을 붙인다."""
    if not words:
        return "\n".join(f"[{fmt_time(l['a'])}~{fmt_time(l['b'])}] {l['text']}" for l in res["lines"])
    out, ws = [], res["words"]
    for l in res["lines"]:
        seg = [w for w in ws if l["a"] - 0.2 <= w["t"] <= l["b"] + 0.2]
        out.append(f"({l['a']:.2f}~{l['b']:.2f}) " + " ".join(f"{w['w']}@{w['t']:.2f}" for w in seg))
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="음성 인식으로 어절별 시작 시각을 얻는다")
    ap.add_argument("src")
    ap.add_argument("--a", type=float, help="시작(초)")
    ap.add_argument("--b", type=float, help="끝(초)")
    ap.add_argument("--out", help="JSON 저장 경로(없으면 화면에 대본만 출력)")
    ap.add_argument("--model-dir", help="음성 인식 모델 폴더")
    args = ap.parse_args()
    res = transcribe_file(args.src, args.a, args.b, model_dir=args.model_dir)
    if args.out:
        util.write_json(args.out, res)
    print(as_text(res, words=True))


if __name__ == "__main__":
    main()
