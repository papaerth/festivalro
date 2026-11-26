"""소리 재료: AI 음성 내레이션(TTS) · 효과음(ffmpeg 로 합성) · 배경음악(내 보관함 또는 내장 합성 반주).

- 내레이션: ① ElevenLabs(구독 계정의 API 키, 내 계정의 목소리) ② Google Cloud Text-to-Speech ③ Windows 내장 한국어 음성(키 없이, 무료)
- 효과음: 저작권 걱정이 없도록 파일을 싣지 않고 ffmpeg 로 그 자리에서 합성한다(팝·휙·딩).
- 배경음악: 사용자가 보관함(data/media/bgm)에 넣은 파일을 쓰고, 없으면 단순한 내장 합성 반주를 쓴다. 음악 파일을 내려받지 않는다.
"""
from __future__ import annotations

import base64
import logging
import subprocess
import sys
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("shoppulse.audio")
BGM_EXT = (".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac")
GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
DEFAULT_GOOGLE_VOICE = "ko-KR-Neural2-A"  # 한국어 여성 음성


class TTSError(RuntimeError):
    pass


# ---------------------------------------------------------------- 내레이션(TTS)
_PS_SCRIPT = r"""param([string]$TextFile, [string]$OutFile, [int]$Rate = 2, [string]$VoiceName = "", [switch]$ListOnly)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo }
$v = $null
if ($VoiceName) { $v = $voices | Where-Object { $_.Name -like "*$VoiceName*" } | Select-Object -First 1 }
if (-not $v) { $v = $voices | Where-Object { $_.Culture.Name -eq "ko-KR" -and $_.Gender -eq "Female" } | Select-Object -First 1 }
if (-not $v) { $v = $voices | Where-Object { $_.Culture.Name -eq "ko-KR" } | Select-Object -First 1 }
if (-not $v) { Write-Output "NO_KOREAN_VOICE"; exit 3 }
if ($ListOnly) { Write-Output ("VOICE=" + $v.Name); exit 0 }
$s.SelectVoice($v.Name)
$s.Rate = $Rate
$s.SetOutputToWaveFile($OutFile)
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$s.Speak($text)
$s.Dispose()
Write-Output ("VOICE=" + $v.Name)
"""
_NO_KO_VOICE = ("이 PC 에 한국어 음성이 없습니다. Windows 설정 → 시간 및 언어 → 음성 → 「음성 추가」에서 한국어를 추가하거나, "
                ".env 에 ELEVENLABS_API_KEY 나 GOOGLE_TTS_API_KEY 를 넣어 주세요.")
_win_voice_cache: dict = {}


def _ps_script_path() -> Path:
    p = get_settings().media_dir / "work" / "tts_sapi.ps1"
    if not p.exists() or p.read_text(encoding="utf-8") != _PS_SCRIPT:
        p.write_text(_PS_SCRIPT, encoding="utf-8")
    return p


def _run_ps(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(_ps_script_path()), *args],
                          capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")


def windows_voice() -> dict:
    """Windows 내장 한국어 음성이 있는지(결과는 기억해 둔다)."""
    if "v" in _win_voice_cache:
        return _win_voice_cache["v"]
    if not sys.platform.startswith("win"):
        res = {"available": False, "reason": "Windows 가 아닙니다."}
    else:
        try:
            r = _run_ps(["-ListOnly", "-VoiceName", get_settings().shoppulse_tts_voice or ""], timeout=40)
            out = (r.stdout or "").strip()
            if "VOICE=" in out:
                res = {"available": True, "voice": out.split("VOICE=", 1)[1].strip().splitlines()[0]}
            elif "NO_KOREAN_VOICE" in out:
                res = {"available": False, "reason": _NO_KO_VOICE}
            else:
                res = {"available": False, "reason": f"Windows 음성 확인 실패: {(r.stderr or out)[-200:]}"}
        except Exception as e:  # powershell 없음·시간 초과 등
            res = {"available": False, "reason": f"Windows 음성 확인 실패: {str(e)[:150]}"}
    _win_voice_cache["v"] = res
    return res


def _google_key() -> str:
    s = get_settings()
    return s.google_tts_api_key or s.google_vision_api_key


# ---- ElevenLabs (공식 API: POST /v1/text-to-speech/{voice_id}, 헤더 xi-api-key, 응답은 mp3 소리 데이터)
ELEVEN_BASE = "https://api.elevenlabs.io"
_eleven_cache: dict = {}


def _eleven_error(r) -> str:
    try:
        d = r.json().get("detail")
        msg = d.get("message") if isinstance(d, dict) else str(d)
        code = d.get("status") if isinstance(d, dict) else ""
    except Exception:
        msg, code = (r.text or "")[:200], ""
    if "permission" in f"{code} {msg}".lower():
        hint = " → API 키에 이 기능 권한이 없습니다. ElevenLabs 에서 키를 만들 때 Text to Speech 와 Voices(읽기) 권한을 켜거나, 권한 제한 없는 키로 바꿔 주세요."
    else:
        hint = {401: " (API 키를 확인하세요)", 402: " (요금제·잔여 글자 수를 확인하세요)", 429: " (요청이 너무 많거나 잔여 글자 수가 부족합니다)"}.get(r.status_code, "")
    return f"ElevenLabs 오류({r.status_code}): {str(msg)[:200]}{hint}"


# 목소리 목록을 못 읽을 때 임시로 쓰는 기본 여성 목소리(ElevenLabs 기본 제공 목소리). 내 목소리를 고르면 그 목소리를 쓴다
FALLBACK_VOICE = {"id": "EXAVITQu4vr4xnSDxMaL", "name": "기본 여성 목소리(임시)", "fallback": True}


def elevenlabs_voices(force: bool = False) -> list[dict]:
    """내 ElevenLabs 계정에서 쓸 수 있는 목소리 목록. 성공은 10분, 실패는 2분 동안 기억한다(화면을 열 때마다 다시 묻지 않게). 실패하면 TTSError."""
    import time
    key = get_settings().elevenlabs_api_key
    if not key:
        return []
    age = time.time() - _eleven_cache.get("at", 0)
    if not force and "voices" in _eleven_cache and age < (600 if _eleven_cache["voices"] else 120):
        if _eleven_cache["voices"]:
            return _eleven_cache["voices"]
        raise TTSError(_eleven_cache.get("error") or "목소리 목록을 가져오지 못했습니다.")
    last = "목소리 목록을 가져오지 못했습니다."
    # v2 가 현재 주소(한 번에 100개까지), 기본 제공 목소리만 따로 묻는 방법, 예전 주소(v1) 순으로 시도
    for path in ("/v2/voices?page_size=100", "/v2/voices?page_size=100&voice_type=default", "/v1/voices"):
        try:
            r = httpx.get(ELEVEN_BASE + path, headers={"xi-api-key": key}, timeout=30.0)
        except httpx.HTTPError as e:
            last = f"ElevenLabs 에 연결하지 못했습니다: {str(e)[:120]}"
            break
        if r.status_code == 200:
            out = []
            for v in (r.json().get("voices") or []):
                lab = v.get("labels") if isinstance(v.get("labels"), dict) else {}
                if v.get("voice_id"):
                    out.append({"id": v["voice_id"], "name": v.get("name") or v["voice_id"], "category": v.get("category"),
                                "gender": lab.get("gender"), "language": lab.get("language"), "accent": lab.get("accent")})
            if out:
                _eleven_cache.update(voices=out, at=time.time(), error=None)
                return out
            last = "ElevenLabs 계정의 목소리 목록이 비어 있습니다."
            continue
        last = _eleven_error(r)
        if r.status_code in (401, 403):
            break
    _eleven_cache.update(voices=[], at=time.time(), error=last)
    raise TTSError(last)


def _stored(key: str):
    """화면에서 저장한 설정값(user_settings)."""
    from ..database import SessionLocal
    from ..models import UserSetting
    try:
        with SessionLocal() as db:
            st = db.get(UserSetting, key)
            return st.value.get("value") if st else None
    except Exception:
        return None


def elevenlabs_voice() -> dict:
    """쓸 목소리: .env 지정 → 화면에서 고른 것 → 계정 목록에서 한국어·여성 우선 → (목록을 못 읽으면) 임시 기본 여성 목소리."""
    vid = get_settings().elevenlabs_voice_id or _stored("elevenlabs_voice_id")
    err = None
    try:
        voices = elevenlabs_voices()
    except TTSError as e:
        voices, err = [], str(e)
    if vid:
        return next((v for v in voices if v["id"] == vid), {"id": vid, "name": f"직접 넣은 목소리({vid[:6]}…)"})
    if not voices:
        return dict(FALLBACK_VOICE, error=err)
    score = lambda v: (str(v.get("language") or "").lower() in ("ko", "korean"), str(v.get("gender") or "").lower() == "female")  # noqa: E731
    return max(voices, key=score)


def _elevenlabs_tts(text: str, out: Path, rate: float, voice_id: str | None = None) -> dict:
    s = get_settings()
    v = {"id": voice_id, "name": voice_id} if voice_id else elevenlabs_voice()
    try:
        r = httpx.post(f"{ELEVEN_BASE}/v1/text-to-speech/{v['id']}", params={"output_format": "mp3_44100_128"},
                       headers={"xi-api-key": s.elevenlabs_api_key}, json={"text": text, "model_id": s.elevenlabs_model or "eleven_multilingual_v2"}, timeout=60.0)
    except httpx.HTTPError as e:
        raise TTSError(f"ElevenLabs 에 연결하지 못했습니다: {str(e)[:120]}")
    if r.status_code != 200 or len(r.content) < 800:
        msg = _eleven_error(r) if r.status_code != 200 else "ElevenLabs 응답에 소리가 없습니다."
        if v.get("fallback"):
            msg += " (내 계정의 목소리 목록을 읽지 못해 임시 기본 목소리로 시도했습니다. 「편집 스타일 → 소리 재료」에 내 목소리의 Voice ID 를 넣어 주세요.)"
        raise TTSError(msg)
    path = out.with_suffix(".mp3")
    path.write_bytes(r.content)
    # 말 빠르기는 API 값에 의존하지 않고 우리 쪽에서 맞춘다(tempo: 렌더링 때 그만큼 빠르게 재생)
    return {"provider": "elevenlabs", "voice": v.get("name") or v["id"], "path": str(path), "tempo": round(max(1.0, min(1.25, rate)), 2)}


def tts_status() -> dict:
    """지금 쓸 수 있는 내레이션 음성. provider: elevenlabs | google | windows | None"""
    s = get_settings()
    pref = (s.shoppulse_tts_provider or "auto").lower()
    if pref == "off":
        return {"available": False, "provider": None, "note": "내레이션이 꺼져 있습니다(.env 의 SHOPPULSE_TTS_PROVIDER=off)."}
    if pref in ("auto", "elevenlabs") and s.elevenlabs_api_key:
        v = elevenlabs_voice()
        note = "ElevenLabs 음성(내 구독 계정). 문장은 ElevenLabs 로 전송되고 계정의 글자 수가 차감됩니다."
        if v.get("fallback"):
            note = (f"내 계정의 목소리 목록을 읽지 못해 임시 기본 여성 목소리를 씁니다. 사유: {v.get('error') or '알 수 없음'} "
                    "— 「편집 스타일 → 소리 재료」에서 내 목소리의 Voice ID 를 직접 넣을 수 있습니다.")
        return {"available": True, "provider": "elevenlabs", "voice": v["name"], "voice_id": v["id"], "fallback": bool(v.get("fallback")), "note": note}
    if pref == "elevenlabs":
        return {"available": False, "provider": None, "note": "ELEVENLABS_API_KEY 가 없습니다. .env 에 넣고 다시 실행하세요."}
    if pref in ("auto", "google") and _google_key():
        return {"available": True, "provider": "google", "voice": s.shoppulse_tts_voice or DEFAULT_GOOGLE_VOICE,
                "note": "Google Cloud 음성(자연스러운 한국어 여성 음성). 문장은 Google 로 전송됩니다."}
    if pref == "google":
        return {"available": False, "provider": None, "note": "GOOGLE_TTS_API_KEY 가 없습니다."}
    w = windows_voice()
    if w.get("available"):
        return {"available": True, "provider": "windows", "voice": w["voice"],
                "note": "Windows 내장 한국어 음성(무료·오프라인). 더 자연스러운 목소리는 .env 에 ELEVENLABS_API_KEY(구독 중이면) 또는 GOOGLE_TTS_API_KEY 를 넣으세요."}
    return {"available": False, "provider": None,
            "note": w.get("reason") if sys.platform.startswith("win") else "내레이션 음성이 없습니다. .env 에 ELEVENLABS_API_KEY 또는 GOOGLE_TTS_API_KEY 를 넣거나, Windows 에서는 내장 한국어 음성을 사용합니다."}


def _google_tts(text: str, out: Path, rate: float) -> dict:
    s = get_settings()
    voice = s.shoppulse_tts_voice or DEFAULT_GOOGLE_VOICE
    lang = "-".join(voice.split("-")[:2]) if voice.count("-") >= 2 else "ko-KR"
    try:
        r = httpx.post(GOOGLE_TTS_URL, headers={"X-Goog-Api-Key": _google_key()}, timeout=40.0,
                       json={"input": {"text": text}, "voice": {"languageCode": lang, "name": voice},
                             "audioConfig": {"audioEncoding": "LINEAR16", "speakingRate": round(rate, 2), "sampleRateHertz": 48000}})
    except httpx.HTTPError as e:
        raise TTSError(f"Google 음성 서버에 연결하지 못했습니다: {str(e)[:120]}")
    if r.status_code != 200:
        try:
            msg = r.json().get("error", {}).get("message", "")
        except Exception:
            msg = r.text[:200]
        hint = " (Google Cloud 콘솔에서 Cloud Text-to-Speech API 를 '사용'으로 켜야 합니다)" if r.status_code in (400, 403) else ""
        raise TTSError(f"Google 음성 생성 실패({r.status_code}): {msg[:200]}{hint}")
    data = r.json().get("audioContent")
    if not data:
        raise TTSError("Google 음성 응답에 소리가 없습니다.")
    out.write_bytes(base64.b64decode(data))
    return {"provider": "google", "voice": voice}


def _windows_tts(text: str, out: Path, rate: float) -> dict:
    txt = out.with_suffix(".txt")
    txt.write_text(text, encoding="utf-8")
    sapi_rate = max(-3, min(6, int(round((rate - 1.0) * 14))))  # 1.0→0, 1.15→2, 1.3→4
    try:
        r = _run_ps(["-TextFile", str(txt), "-OutFile", str(out), "-Rate", str(sapi_rate), "-VoiceName", get_settings().shoppulse_tts_voice or ""])
    except Exception as e:
        raise TTSError(f"Windows 음성 실행 실패: {str(e)[:150]}")
    finally:
        txt.unlink(missing_ok=True)
    if "NO_KOREAN_VOICE" in (r.stdout or ""):
        raise TTSError(_NO_KO_VOICE)
    if r.returncode != 0 or not out.exists() or out.stat().st_size < 2000:
        raise TTSError(f"Windows 음성 생성 실패: {(r.stderr or r.stdout or '')[-200:]}")
    return {"provider": "windows", "voice": (r.stdout or "").split("VOICE=", 1)[-1].strip().splitlines()[0] if "VOICE=" in (r.stdout or "") else "Windows"}


def synthesize(text: str, out: Path, rate: float = 1.12, voice_id: str | None = None) -> dict:
    """문장을 음성 파일로(결과의 path 가 있으면 그 파일, 없으면 out). 실패하면 TTSError(사유 포함) — 호출하는 쪽은 내레이션 없이 계속 만든다."""
    text = " ".join((text or "").replace("*", "").split())[:120]
    if not text:
        raise TTSError("내레이션 문장이 비어 있습니다.")
    st = tts_status()
    if not st["available"]:
        raise TTSError(st["note"])
    out.parent.mkdir(parents=True, exist_ok=True)
    if st["provider"] == "elevenlabs":
        return _elevenlabs_tts(text, out, rate, voice_id)
    return _google_tts(text, out, rate) if st["provider"] == "google" else _windows_tts(text, out, rate)


# ---------------------------------------------------------------- 효과음(합성)
SFX = {
    # 사진·로고가 튀어나올 때: 음이 빠르게 내려가는 짧은 '팝'
    "pop": {"src": "aevalsrc=0.55*sin(2*PI*(950-2600*t)*t)*exp(-22*t):s=48000:d=0.16", "dur": 0.16, "vol": 0.9},
    # 후킹에서 본편으로 넘어갈 때: 바람 소리 같은 '휙'
    "whoosh": {"src": "anoisesrc=d=0.5:c=pink:r=48000:a=0.6,highpass=f=600,lowpass=f=6000,afade=t=in:d=0.28,afade=t=out:st=0.28:d=0.22", "dur": 0.5, "vol": 0.55},
    # 끝 질문 자막이 뜰 때: 맑은 '딩'
    "ding": {"src": "aevalsrc=0.4*sin(2*PI*1318.5*t)*exp(-5*t)+0.18*sin(2*PI*2637*t)*exp(-8*t):s=48000:d=0.9", "dur": 0.9, "vol": 0.6},
}

# ---------------------------------------------------------------- 배경음악
# 내장 합성 반주: C–G–Am–F 4마디(8초) 반복, 분당 120박. 잔잔한 패드 + 통통 튀는 음 + 약한 킥·하이햇.
_BGM_EXPR = (
    "st(0,mod(t,8));st(1,mod(t,1));st(5,mod(t,0.25));st(6,floor(mod(t,1)/0.25));"
    "st(2,if(lt(ld(0),2),261.63,if(lt(ld(0),4),196.00,if(lt(ld(0),6),220.00,174.61))));"
    "st(3,if(lt(ld(0),2),329.63,if(lt(ld(0),4),246.94,if(lt(ld(0),6),261.63,220.00))));"
    "st(4,if(lt(ld(0),2),392.00,if(lt(ld(0),4),293.66,if(lt(ld(0),6),329.63,261.63))));"
    "st(7,min(1,mod(t,2)/0.06)*min(1,(2-mod(t,2))/0.06));"
    "st(8,if(eq(ld(6),0),ld(2),if(eq(ld(6),1),ld(3),if(eq(ld(6),2),ld(4),ld(3)))));"
    "0.085*ld(7)*(sin(2*PI*ld(2)*t)+sin(2*PI*ld(3)*t)+sin(2*PI*ld(4)*t))*(0.8+0.2*sin(2*PI*0.5*t))"
    "+0.13*ld(7)*sin(2*PI*ld(2)/2*t)"
    "+0.11*sin(2*PI*2*ld(8)*ld(5))*exp(-11*ld(5))"
    "+0.30*sin(2*PI*(46+70*exp(-28*ld(1)))*ld(1))*exp(-7*ld(1))"
    "+0.035*(random(1)*2-1)*exp(-60*mod(t+0.25,0.5))"
)


def bgm_dir() -> Path:
    p = get_settings().media_dir / "bgm"
    p.mkdir(parents=True, exist_ok=True)
    return p


def bgm_library() -> list[dict]:
    """사용자가 넣어 둔 배경음악 파일 목록(내장 반주 파일은 제외)."""
    return [{"name": f.name, "size": f.stat().st_size} for f in sorted(bgm_dir().iterdir())
            if f.is_file() and f.suffix.lower() in BGM_EXT and not f.name.startswith("_builtin")]


def builtin_bgm(ff: str) -> Path | None:
    """내장 합성 반주(32초). 처음 한 번만 만들고 다시 쓴다."""
    out = bgm_dir() / "_builtin_soft.wav"
    if out.exists() and out.stat().st_size > 100_000:
        return out
    r = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-t", "32",
                        "-i", f"aevalsrc='{_BGM_EXPR}':s=48000", "-af", "lowpass=f=7000,volume=0.9", str(out)],
                       capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not out.exists():
        log.warning("내장 배경음악 생성 실패: %s", (r.stderr or "")[-300:])
        return None
    return out


def pick_bgm(ff: str, seed: int = 0, track: str | None = None) -> tuple[Path | None, str]:
    """쓸 배경음악: 지정한 곡 → 보관함(돌아가며) → 내장 반주. (경로, 설명)"""
    lib = bgm_library()
    if track and any(x["name"] == track for x in lib):
        return bgm_dir() / track, f"내 보관함: {track}"
    if lib:
        name = lib[seed % len(lib)]["name"]
        return bgm_dir() / name, f"내 보관함: {name}"
    p = builtin_bgm(ff)
    return p, "내장 합성 반주(보관함에 곡을 넣으면 그 곡을 씁니다)"
