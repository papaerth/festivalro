r"""Windows '애플리케이션 제어 정책'(Smart App Control 등)이 서명 없는 .pyd 를 차단해
SQLAlchemy 가 ImportError 로 죽는 문제를 피하기 위해, SQLAlchemy 의 Cython 확장 파일을 제거한다.
제거해도 같은 이름의 순수 Python 모듈(*_cy.py)이 대신 로드되므로 기능은 동일하고 속도만 약간 느리다.

사용: <venv>\Scripts\python scripts\strip_sqlalchemy_ext.py
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys


def main() -> int:
    spec = importlib.util.find_spec("sqlalchemy")
    if not spec or not spec.submodule_search_locations:
        print("[확인] SQLAlchemy 가 설치되어 있지 않습니다.")
        return 0
    root = pathlib.Path(list(spec.submodule_search_locations)[0])
    removed = []
    for ext in ("*.pyd", "*.so"):
        for p in root.rglob(f"*_cy{ext}"):
            try:
                p.unlink()
                removed.append(p.relative_to(root))
            except OSError as e:
                print(f"[경고] 삭제 실패 {p}: {e}")
        for p in root.rglob(f"*_cy.*{ext}"):  # 예: _row_cy.cp314-win_amd64.pyd
            try:
                p.unlink()
                removed.append(p.relative_to(root))
            except OSError as e:
                print(f"[경고] 삭제 실패 {p}: {e}")
    if removed:
        print(f"[확인] SQLAlchemy 컴파일 확장 {len(removed)}개 제거 → 순수 Python 모듈 사용")
    else:
        print("[확인] SQLAlchemy 컴파일 확장 없음(이미 순수 Python)")
    # 검증
    try:
        import sqlalchemy  # noqa: F401
        from sqlalchemy.util._has_cython import HAS_CYEXTENSION

        print(f"[확인] SQLAlchemy {sqlalchemy.__version__} 로드 성공 (cython={HAS_CYEXTENSION})")
    except Exception as e:  # pragma: no cover
        print(f"[오류] SQLAlchemy 로드 실패: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
