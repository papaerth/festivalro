import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
_tmp = Path(os.environ.get("PYTEST_TMP", "/tmp")) / "shoppulse-test"
_tmp.mkdir(parents=True, exist_ok=True)
_db = _tmp / "test.db"
for p in _tmp.glob("test.db*"):
    p.unlink()
os.environ["SHOPPULSE_DATABASE_URL"] = f"sqlite:///{_db.as_posix()}"
os.environ["SHOPPULSE_DATA_DIR"] = str(_tmp)
os.environ["YOUTUBE_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["SHOPPULSE_AI_PROVIDER"] = "template"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, init_db  # noqa: E402


@pytest.fixture(scope="session")
def client():
    init_db()
    with TestClient(app) as c:
        yield c
