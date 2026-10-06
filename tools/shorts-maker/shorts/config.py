"""config.yaml 읽기와 경로 상수."""

from pathlib import Path

import yaml

from . import ShortsError

ROOT = Path(__file__).resolve().parent.parent  # shorts-maker/
DEFAULT_CONFIG = ROOT / "config.yaml"


def load_config(path=None):
    """config.yaml을 읽어 dict로 돌려준다. 없거나 깨졌으면 한글 오류."""
    p = Path(path) if path else DEFAULT_CONFIG
    if not p.exists():
        raise ShortsError(f"설정 파일이 없습니다: {p}")
    try:
        with open(p, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        raise ShortsError(f"설정 파일(config.yaml) 형식이 잘못됐습니다: {e}")
    for key in ("canvas", "capcut", "fonts", "texts", "video"):
        if key not in cfg:
            raise ShortsError(f"config.yaml에 '{key}' 항목이 없습니다.")
    cfg["_root"] = ROOT
    cfg["_path"] = p
    return cfg
