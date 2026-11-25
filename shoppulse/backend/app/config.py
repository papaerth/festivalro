"""환경설정. .env (shoppulse/.env) 를 읽는다. 키가 없어도 동작해야 한다."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
CONFIG_DIR = PROJECT_DIR / "config"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    shoppulse_port: int = 8787
    shoppulse_data_dir: str = ""
    youtube_api_key: str = ""
    shoppulse_ai_provider: str = "template"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"
    shoppulse_default_region: str = "서울"
    naver_client_id: str = ""
    naver_client_secret: str = ""
    coupang_access_key: str = ""
    coupang_secret_key: str = ""
    shoppulse_auto_sourcing: bool = False
    shoppulse_timezone: str = "Asia/Seoul"
    # 테스트에서 메모리 DB 등으로 바꿀 때 사용
    shoppulse_database_url: str = ""

    @property
    def data_dir(self) -> Path:
        p = Path(self.shoppulse_data_dir) if self.shoppulse_data_dir else PROJECT_DIR / "data"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def backup_dir(self) -> Path:
        p = PROJECT_DIR / "backups"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def database_url(self) -> str:
        if self.shoppulse_database_url:
            return self.shoppulse_database_url
        return f"sqlite:///{(self.data_dir / 'shoppulse.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_config_json(name: str) -> dict:
    """config/*.json 파일을 읽는다. 없으면 빈 dict."""
    path = CONFIG_DIR / name
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_config_json(name: str, data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    path = CONFIG_DIR / name
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
