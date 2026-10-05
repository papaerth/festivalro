"""Demucs로 보컬만 분리해 정렬 정확도를 높인다(선택 기능).

반주가 큰 곡은 원곡 그대로 정렬하면 타이밍이 밀리기 쉽다. 보컬만 남긴 소리로 정렬하면 훨씬 잘 맞는다.
torchaudio의 파일 입출력을 거치지 않도록 ffmpeg로 직접 디코딩해 모델에 넣는다.
"""

import gc
import subprocess

import numpy as np

from .ffmpeg_utils import _no_window_flags, find_ffmpeg

_DEMUCS_HELP = (
    "보컬 분리에 필요한 Demucs를 불러올 수 없습니다. 가상환경에서 다음 명령으로 설치하세요:\n"
    "  pip install demucs\n"
    "(설치가 어렵다면 '보컬 분리'를 끄고 진행해도 됩니다.)"
)


def _load_stereo(path, sr):
    cmd = [find_ffmpeg(), "-nostdin", "-threads", "0", "-i", path,
           "-f", "f32le", "-ac", "2", "-acodec", "pcm_f32le", "-ar", str(sr), "-"]
    proc = subprocess.run(cmd, capture_output=True, **_no_window_flags())
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("오디오 디코딩 실패: " + (err[-1] if err else "알 수 없는 오류"))
    return np.frombuffer(proc.stdout, np.float32).reshape(-1, 2).T.copy()


def separate_vocals(path, device="cpu", model_name="htdemucs", log=print, progress=None):
    """음원에서 보컬만 분리해 float32 16kHz 모노 numpy 배열로 돌려준다(WhisperX 입력 규격)."""
    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError as e:
        raise RuntimeError(f"{_DEMUCS_HELP}\n원인: {e}") from e

    if progress:
        progress(0.0, "보컬 분리 모델 로드")
    model = get_model(model_name)
    model.to(device).eval()
    sr = model.samplerate
    wav = torch.from_numpy(_load_stereo(path, sr))
    log(f"[보컬 분리] {model_name}, 장치={device}, 길이 {wav.shape[-1] / sr:.1f}초 "
        + ("(CPU에서는 곡 길이와 비슷하거나 더 걸릴 수 있습니다)" if device == "cpu" else ""))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    if progress:
        progress(0.1, "보컬 분리 중")
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], device=device, split=True, overlap=0.25,
                          progress=False)[0]
    vocals = (out[model.sources.index("vocals")] * std + mean).mean(0).cpu()
    del out, model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # 16kHz로 변환
    try:
        import julius

        mono = julius.resample_frac(vocals, sr, 16000)
    except ImportError:
        mono = torch.nn.functional.interpolate(vocals[None, None], scale_factor=16000 / sr, mode="linear",
                                               align_corners=False)[0, 0]
    if progress:
        progress(1.0, "보컬 분리 완료")
    return mono.numpy().astype(np.float32)
