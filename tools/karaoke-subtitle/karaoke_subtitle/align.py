"""WhisperX를 이용한 가사 단어 타이밍 정렬.

절차
1. WhisperX로 음원을 인식(transcribe)하고 단어 시각을 얻는다.
2. 인식 결과와 사용자가 준 가사를 문자 단위로 대조해 가사 줄별 시간 창을 추정한다.
3. 각 줄의 '진짜 가사' 텍스트를 해당 창에서 WhisperX(wav2vec2) 강제 정렬해 단어 시각을 얻는다.
4. 시각이 비는 단어는 이웃으로부터 보간한다.
"""

import gc

from .timing import (
    Line,
    Word,
    assign_times_by_chars,
    estimate_line_windows,
    fill_missing_word_times,
)

_WHISPERX_HELP = (
    "WhisperX를 불러올 수 없습니다. 다음 명령으로 설치하세요:\n"
    "  pip install torch torchaudio   (GPU가 있으면 CUDA 빌드 권장)\n"
    "  pip install whisperx"
)


def _import_whisperx():
    try:
        import whisperx  # noqa: F401
        import torch  # noqa: F401
    except ImportError as e:
        raise RuntimeError(f"{_WHISPERX_HELP}\n원인: {e}") from e
    import torch
    import whisperx

    return whisperx, torch


def resolve_device(device):
    _, torch = _import_whisperx()
    if device in (None, "", "auto"):
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device


def _segments_to_words(segments):
    words = []
    for seg in segments:
        for w in seg.get("words", []):
            if w.get("start") is None or w.get("end") is None:
                continue
            words.append(Word(w.get("word", w.get("text", "")).strip(), float(w["start"]), float(w["end"])))
    return words


def align_lyrics(audio, lyric_lines, language=None, model_name="small", device="auto",
                 log=print, progress=None, direct_max_seconds=60.0):
    """가사 줄별 Word 타이밍을 계산한다.

    audio: float32 16kHz 모노 numpy 배열
    lyric_lines: [[단어, ...], ...]
    반환: (list[Line], 감지된 언어 코드)
    """
    whisperx, torch = _import_whisperx()
    device = resolve_device(device)
    compute_type = "float16" if device == "cuda" else "int8"
    duration = len(audio) / 16000.0
    lang = language if language and language != "auto" else None

    def prog(frac, msg):
        if progress:
            progress(frac, msg)

    # 1) 인식
    prog(0.05, "음성 인식 모델 로드")
    log(f"[정렬] 장치={device}, 모델={model_name}, compute_type={compute_type}")
    model = whisperx.load_model(model_name, device, compute_type=compute_type, language=lang)
    prog(0.15, "음성 인식 중")
    result = model.transcribe(audio, batch_size=8 if device == "cuda" else 4)
    lang = result.get("language") or lang or "ko"
    log(f"[정렬] 감지 언어: {lang}, 인식 구간 {len(result.get('segments', []))}개")
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # 2) 정렬 모델
    prog(0.4, "정렬 모델 로드")
    align_model, meta = whisperx.load_align_model(language_code=lang, device=device)

    transcript_words = []
    if result.get("segments"):
        prog(0.45, "인식 결과 단어 정렬")
        try:
            aligned = whisperx.align(result["segments"], align_model, meta, audio, device,
                                     return_char_alignments=False)
            transcript_words = _segments_to_words(aligned.get("segments", []))
        except Exception as e:  # 인식 결과 정렬 실패는 치명적이지 않음
            log(f"[정렬] 인식 결과 정렬 실패, 가사 직접 정렬로 진행: {e}")
    log(f"[정렬] 인식 단어 {len(transcript_words)}개")

    # 3) 가사 줄별 시간 창 추정 → 진짜 가사로 강제 정렬
    if transcript_words:
        windows = estimate_line_windows(lyric_lines, transcript_words, duration)
    elif duration <= direct_max_seconds:
        windows = [(0.0, duration)] * len(lyric_lines)
    else:
        log("[정렬] 인식 단어가 없어 전체 길이를 글자 수 비율로 나눕니다(정확도 낮음)")
        windows = estimate_line_windows(lyric_lines, [], duration)

    segments = [
        {"start": s, "end": e, "text": " ".join(words)}
        for (s, e), words in zip(windows, lyric_lines)
    ]
    prog(0.6, "가사 단어 정렬")
    try:
        aligned = whisperx.align(segments, align_model, meta, audio, device, return_char_alignments=False)
        aligned_segments = aligned.get("segments", [])
    except Exception as e:
        log(f"[정렬] 가사 강제 정렬 실패, 창 안에서 보간합니다: {e}")
        aligned_segments = []

    # whisperx는 정렬 불가 구간을 빼고 돌려줄 수 있으므로 텍스트로 대응시킨다
    by_text = {}
    for seg in aligned_segments:
        by_text.setdefault(seg.get("text", "").strip(), []).append(seg)

    lines = []
    aligned_line_count = 0
    for i, (words, (ws, we)) in enumerate(zip(lyric_lines, windows)):
        text = " ".join(words)
        seg = None
        cands = by_text.get(text)
        if cands:
            seg = cands.pop(0)
        tokens = []
        if seg:
            for w in seg.get("words", []):
                tokens.append({"text": w.get("word", ""), "start": w.get("start"), "end": w.get("end")})
        times = assign_times_by_chars(words, tokens) if tokens else [(None, None)] * len(words)
        if any(t[0] is not None for t in times):
            aligned_line_count += 1
        lines.append(Line(fill_missing_word_times(words, times, (ws, we))))

    if aligned_line_count == 0:
        raise RuntimeError(
            "가사 정렬에 실패했습니다: 어떤 줄도 음성과 맞춰지지 않았습니다.\n"
            "- 음원에 노래(보컬)가 들어 있는지, 가사가 이 곡의 것인지 확인하세요.\n"
            "- 언어를 '자동 감지' 대신 직접 지정해 보세요.\n"
            "- 반주가 크면 보컬 분리 음원을 쓰거나 모델을 medium 이상으로 올려 보세요."
        )
    if aligned_line_count < len(lines) * 0.5:
        log(f"[경고] {len(lines)}줄 중 {aligned_line_count}줄만 정렬되었습니다. 나머지는 추정값이라 타이밍이 어긋날 수 있습니다.")

    # 줄 경계가 겹치면 앞 줄의 마지막 단어 끝을 다음 줄 시작에 맞춘다(시작 시각을 더 신뢰)
    for prev, cur in zip(lines, lines[1:]):
        last = prev.words[-1]
        if cur.start < last.end:
            last.end = max(last.start + 0.05, cur.start)
    # 단조 증가 보장
    prev_end = 0.0
    for ln in lines:
        for w in ln.words:
            if w.start < prev_end:
                w.start = prev_end
            if w.end < w.start + 0.05:
                w.end = w.start + 0.05
            prev_end = w.end

    del align_model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    prog(0.75, "정렬 완료")
    return lines, lang
