"""이전 작업 기록과 마지막 설정을 사용자 설정 폴더에 저장한다(프로그램을 껐다 켜도 유지)."""

import json
import os
import sys
import time

MAX_ENTRIES = 100


def config_dir():
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    d = os.path.join(base, "karaoke-subtitle")
    os.makedirs(d, exist_ok=True)
    return d


def history_path():
    return os.path.join(config_dir(), "history.json")


def settings_path():
    return os.path.join(config_dir(), "settings.json")


def _read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


# ---------------------------------------------------------------- 작업 기록

def load_history():
    """최신 항목이 앞에 오는 리스트."""
    data = _read_json(history_path(), [])
    return data if isinstance(data, list) else []


def add_entry(result, opts):
    """완료된 작업을 기록에 추가하고 전체 목록을 돌려준다."""
    entry = {
        "time": time.strftime("%Y-%m-%d %H:%M"),
        "audio": opts.audio_path,
        "aspect": opts.aspect,
        "resolution": opts.resolution,
        "clip_start": opts.clip_start if opts.aspect == "9:16" else None,
        "clip_end": opts.clip_end if opts.aspect == "9:16" else None,
        "mov": result.get("mov"),
        "srt": result.get("srt"),
        "json": result.get("json"),
        "preview": result.get("preview"),
        "out_dir": result.get("out_dir"),
    }
    hist = [h for h in load_history() if h.get("mov") != entry["mov"]]
    hist.insert(0, entry)
    hist = hist[:MAX_ENTRIES]
    _write_json(history_path(), hist)
    return hist


def clear_history():
    _write_json(history_path(), [])
    return []


def entry_label(entry):
    name = os.path.basename(entry.get("audio") or entry.get("mov") or "")
    span = ""
    if entry.get("aspect") == "9:16" and entry.get("clip_start") is not None:
        s = entry["clip_start"] or 0.0
        e = entry.get("clip_end")
        span = f"  {int(s // 60)}:{s % 60:04.1f}~" + (f"{int(e // 60)}:{e % 60:04.1f}" if e else "끝")
    return f"{entry.get('time', '')}  {name}  {entry.get('aspect', '')} {entry.get('resolution', '')}{span}"


# ---------------------------------------------------------------- 설정

def load_settings():
    data = _read_json(settings_path(), {})
    return data if isinstance(data, dict) else {}


def save_settings(data):
    try:
        _write_json(settings_path(), data)
    except Exception:
        pass
