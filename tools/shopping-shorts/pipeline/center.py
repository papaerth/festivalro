"""인물이 화면 가로 정중앙에 오도록 컷마다 크롭 위치(x0)를 맞춘다.

  python pipeline/center.py --plan work/<편>/plan.json --src input/<편>/원본.mp4 [--write]

컷에서 몇 장면을 뽑아 얼굴을 찾고, 가장 큰 얼굴(비슷한 크기의 두 사람이면 그 사이)의 가운데가 1:1 크롭의 가운데가 되게 한다.
얼굴이 안 보이는 컷(제품 클로즈업 등)은 설계 값 그대로 둔다. 크롭이 들어가도 되는 범위(crop.x_min~x_max)는 넘지 않는다.

얼굴 찾기에 onnxruntime 을 쓰는데, 음성 인식 부품(sherpa-onnx)과 같은 프로세스에서 함께 불러오면 충돌할 수 있어
shorts.py 는 이 파일을 따로 실행한다.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402

MODEL_URL = ("https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/"
             "master/models/onnx/version-RFB-320.onnx")
_sess = None


def session():
    global _sess
    if _sess is None:
        import onnxruntime as ort
        path = util.MODELS / "ultraface-RFB-320.onnx"
        if not path.exists() or path.stat().st_size < 500_000:
            path.parent.mkdir(parents=True, exist_ok=True)
            util.log("[모델] 얼굴 찾기 모델 내려받는 중(1MB)…")
            with urllib.request.urlopen(MODEL_URL, timeout=60) as r:
                path.write_bytes(r.read())
        opt = ort.SessionOptions()
        opt.log_severity_level = 3
        _sess = ort.InferenceSession(str(path), sess_options=opt, providers=["CPUExecutionProvider"])
    return _sess


def detect(im, thr: float = 0.75) -> list[tuple[float, float, float, float, float]]:
    """PIL 이미지에서 얼굴들 [(점수, x1, y1, x2, y2)] (이미지 픽셀 좌표)."""
    W, H = im.size
    x = np.asarray(im.convert("RGB").resize((320, 240)), dtype=np.float32)
    x = ((x - 127.0) / 128.0).transpose(2, 0, 1)[None]
    s = session()
    scores, boxes = s.run(None, {s.get_inputs()[0].name: x})
    sc = scores[0][:, 1]
    keep = sc > thr
    b, sc = boxes[0][keep], sc[keep]
    order, out = np.argsort(-sc), []
    while len(order):
        i = order[0]
        out.append((float(sc[i]), float(b[i, 0] * W), float(b[i, 1] * H), float(b[i, 2] * W), float(b[i, 3] * H)))
        r = order[1:]
        if not len(r):
            break
        iw = np.clip(np.minimum(b[i, 2], b[r, 2]) - np.maximum(b[i, 0], b[r, 0]), 0, None)
        ih = np.clip(np.minimum(b[i, 3], b[r, 3]) - np.maximum(b[i, 1], b[r, 1]), 0, None)
        inter = iw * ih
        iou = inter / ((b[i, 2] - b[i, 0]) * (b[i, 3] - b[i, 1]) + (b[r, 2] - b[r, 0]) * (b[r, 3] - b[r, 1]) - inter)
        order = r[iou < 0.3]
    return out


def subject_x(faces: list, size: int, y0: int) -> float | None:
    """한 장면에서 인물의 가로 가운데(원본 픽셀). 크롭 세로 범위 안의 얼굴만 본다."""
    faces = [f for f in faces if y0 <= (f[2] + f[4]) / 2 <= y0 + size]
    if not faces:
        return None
    faces.sort(key=lambda f: -(f[3] - f[1]) * (f[4] - f[2]))
    a = faces[0]
    ca = (a[1] + a[3]) / 2
    if len(faces) > 1:
        b = faces[1]
        cb = (b[1] + b[3]) / 2
        area = lambda f: (f[3] - f[1]) * (f[4] - f[2])  # noqa: E731
        if area(b) > 0.6 * area(a) and abs(ca - cb) < size * 0.6:   # 비슷한 크기의 두 사람이 함께 잡히는 장면
            return (ca + cb) / 2
    return ca


def center_x(src, times: list[float], meta: dict, size: int, y0: int) -> float | None:
    """여러 시각의 장면에서 인물 가운데 x 의 중앙값. 절반 넘게 얼굴을 못 찾으면 None."""
    xs = []
    for t in times:
        try:
            im = util.grab_frame(src, t, "scale=640:-2")
        except Exception:
            continue
        k = meta["width"] / im.width
        faces = [(sc, x1 * k, y1 * k, x2 * k, y2 * k) for sc, x1, y1, x2, y2 in detect(im)]
        cx = subject_x(faces, size, y0)
        if cx is not None:
            xs.append(cx)
    if not xs or len(xs) * 2 < len(times):
        return None
    return float(np.median(xs))


def center_plan(plan: dict, src) -> list[str]:
    """plan 의 컷·정지 화면·썸네일 x0 를 인물 가운데로 고친다(plan 을 직접 바꾼다). 한 일을 글로 돌려준다."""
    from pipeline.build import apply_defaults, crop_of
    import copy
    if plan.get("center") is False:
        return []
    meta = util.probe(src)
    size, y0 = crop_of(apply_defaults(copy.deepcopy(plan), {}), meta)
    c = plan.get("crop") or {}
    lo = max(0, int(c.get("x_min", 0) or 0))
    hi = min(meta["width"], int(c.get("x_max", 0) or meta["width"])) - size
    if hi < lo:
        return []
    notes = []

    def fix(obj: dict, times: list[float], label: str):
        if obj.get("center") is False:
            return
        cx = center_x(src, times, meta, size, y0)
        if cx is None:
            return
        new = int(round(max(lo, min(hi, cx - size / 2))))
        old = int(obj.get("x0", 0))
        if abs(new - old) >= 12:
            obj["x0"] = new
            notes.append(f"{label}: x0 {old} → {new} (인물 가운데 x={cx:.0f})")

    for i, s in enumerate(plan.get("timeline") or []):
        if s.get("type") == "cut":
            a, b = float(s["a"]), float(s["b"])
            n = max(2, min(5, int((b - a) / 0.7) + 1))
            fix(s, [a + (b - a) * (k + 0.5) / n for k in range(n)], f"{i + 1}번 장면")
        elif s.get("type") == "tts" and not s.get("image") and s.get("still_t") is not None:
            fix(s, [float(s["still_t"])], f"{i + 1}번 장면(정지 화면)")
    th = plan.get("thumbnail")
    if isinstance(th, dict) and th.get("t") is not None:
        fix(th, [float(th["t"])], "썸네일")
    return notes


def main():
    ap = argparse.ArgumentParser(description="인물이 화면 가운데 오도록 x0 맞추기")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--src", required=True)
    ap.add_argument("--write", action="store_true", help="고친 plan 을 같은 파일에 쓴다")
    a = ap.parse_args()
    plan = json.loads(Path(a.plan).read_text(encoding="utf-8"))
    try:
        notes = center_plan(plan, a.src)
    except ImportError:
        print("[가운데 맞춤] 얼굴 찾기 부품(onnxruntime)이 없어 건너뜁니다. pip install onnxruntime")
        return
    except Exception as e:
        print(f"[가운데 맞춤] 건너뜁니다: {str(e).splitlines()[0][:160]}")
        return
    for n in notes:
        print(f"[가운데 맞춤] {n}")
    if not notes:
        print("[가운데 맞춤] 고칠 곳이 없습니다(이미 가운데이거나 얼굴이 보이지 않습니다).")
    if a.write and notes:
        util.write_json(a.plan, plan)


if __name__ == "__main__":
    main()
