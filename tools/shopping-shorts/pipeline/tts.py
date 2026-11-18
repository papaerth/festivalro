"""일레븐랩스로 TTS 음성을 만든다(기본 목소리: kanna - Calm & Friendly).

  python pipeline/tts.py "덧바르면 더 뜨는 이유" input/<편>/tts1.mp3

환경변수(.env): ELEVENLABS_API_KEY (필수), ELEVENLABS_VOICE_ID 또는 ELEVENLABS_VOICE_NAME(기본 kanna),
ELEVENLABS_MODEL(기본 eleven_multilingual_v2)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402

API = "https://api.elevenlabs.io/v1"
_voice_id = None


def available() -> bool:
    return bool(os.environ.get("ELEVENLABS_API_KEY"))


def _req(url, data=None, accept="application/json"):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        util.die("ELEVENLABS_API_KEY 가 없습니다. tools/shopping-shorts/.env 에 넣거나, "
                 "TTS 파일(tts1.mp3, tts2.mp3)을 input/<편>/ 에 직접 넣어 주세요.")
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        util.die(f"일레븐랩스 요청 실패({e.code}): {body}")
    except urllib.error.URLError as e:
        util.die(f"일레븐랩스에 연결하지 못했습니다: {e.reason}")


def voice_id() -> str:
    global _voice_id
    if _voice_id:
        return _voice_id
    if os.environ.get("ELEVENLABS_VOICE_ID"):
        _voice_id = os.environ["ELEVENLABS_VOICE_ID"]
        return _voice_id
    want = os.environ.get("ELEVENLABS_VOICE_NAME", "kanna").lower()
    voices = json.loads(_req(f"{API}/voices")).get("voices", [])
    hit = [v for v in voices if want in v.get("name", "").lower()]
    if not hit:
        names = ", ".join(v.get("name", "") for v in voices[:15])
        util.die(f"일레븐랩스 계정에서 '{want}' 목소리를 찾지 못했습니다. 내 목소리 목록에 추가하거나 "
                 f"ELEVENLABS_VOICE_ID 를 지정하세요. (보이는 목소리: {names})")
    _voice_id = hit[0]["voice_id"]
    return _voice_id


def synth(text: str, out_path) -> Path:
    out_path = Path(out_path)
    audio = _req(f"{API}/text-to-speech/{voice_id()}?output_format=mp3_44100_128",
                 {"text": text, "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}, accept="audio/mpeg")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(audio)
    return out_path


def says(path: Path, text: str) -> bool:
    """음성 파일이 실제로 그 문구를 말하는지 음성 인식으로 확인한다(다른 문구의 옛 음성을 걸러낸다)."""
    import difflib
    import re
    from pipeline import asr_words
    try:
        heard = "".join(w["w"] for w in asr_words.transcribe_file(path)["words"])
    except Exception:   # 확인할 수 없으면 있는 파일을 그대로 쓴다
        return True
    norm = lambda x: re.sub(r"[^0-9A-Za-z가-힣]", "", x)  # noqa: E731
    return difflib.SequenceMatcher(None, norm(heard), norm(text)).ratio() >= 0.45


def ensure(plan: dict, inp_dir: Path, work_dir: Path) -> list[str]:
    """plan의 TTS 구간마다 음성 파일을 준비한다. 문구가 그대로면 다시 만들지 않는다."""
    memo_p = work_dir / "tts.json"
    memo = util.read_json(memo_p, {}) or {}
    made = []
    for s in plan["timeline"]:
        if s.get("type") != "tts":
            continue
        dst = inp_dir / s["audio"]
        if dst.exists() and memo.get(s["audio"]) == s["text"]:
            continue  # 같은 문구로 이미 만든 파일
        if dst.exists() and s["audio"] not in memo:
            # 기록에 없는 파일: 사용자가 직접 넣었거나, 이전 설계 때의 음성이 남은 것.
            # 키가 없으면 그대로 쓰고, 있으면 문구와 맞는지 들어 보고 다를 때만 새로 만든다.
            if not available() or says(dst, s["text"]):
                continue
            util.log(f"[TTS] {s['audio']} 의 음성이 문구와 달라 새로 만듭니다.")
        util.log(f"[TTS] {s['audio']}: {s['text']}")
        synth(s["text"], dst)
        memo[s["audio"]] = s["text"]
        made.append(s["audio"])
    util.write_json(memo_p, memo)
    return made


if __name__ == "__main__":
    util.load_env()
    if len(sys.argv) != 3:
        util.die('사용법: python pipeline/tts.py "문구" 출력.mp3')
    print(synth(sys.argv[1], sys.argv[2]))
