"""명령행 도구: python -m app.cli [doctor|backup|restore <file>|seed|run-sourcing]"""
from __future__ import annotations

import json
import sys

from .config import FRONTEND_DIST, get_settings
from .database import Base, SessionLocal, engine
from .main import init_db


def doctor():
    s = get_settings()
    print("SHOPPULSE 3.0 상태 점검")
    print(f"- 데이터 폴더: {s.data_dir}")
    print(f"- DB: {s.database_url}")
    print(f"- YouTube API 키: {'설정됨' if s.youtube_api_key else '미설정(수동 등록·가져오기만 가능)'}")
    print(f"- AI 기획안: {s.shoppulse_ai_provider if s.anthropic_api_key else 'template(키 없음)'}")
    print(f"- 프런트엔드 빌드: {'있음' if FRONTEND_DIST.exists() else '없음 → frontend 에서 npm run build'}")
    init_db()
    from .models import Video, YoutubeChannel, SourcingCandidate
    with SessionLocal() as db:
        print(f"- 채널 {db.query(YoutubeChannel).count()}개 / 영상 {db.query(Video).count()}개 / 후보 {db.query(SourcingCandidate).count()}개")
    print("정상")


def main(argv: list[str]):
    cmd = argv[0] if argv else "doctor"
    if cmd == "doctor":
        doctor()
    elif cmd == "backup":
        from .services.backup import write_backup_file
        init_db()
        with SessionLocal() as db:
            p = write_backup_file(db, "cli")
        print(f"백업 완료: {p}")
    elif cmd == "restore":
        if len(argv) < 2:
            print("사용법: python -m app.cli restore <백업파일.json> [replace|merge]")
            sys.exit(2)
        from .services.backup import restore_all, write_backup_file
        init_db()
        mode = argv[2] if len(argv) > 2 else "replace"
        with SessionLocal() as db:
            pre = write_backup_file(db, "pre-restore")
            with open(argv[1], encoding="utf-8-sig") as f:
                counts = restore_all(db, json.load(f), mode=mode)
        print(f"복원 완료(사전 백업 {pre.name}): {counts}")
    elif cmd == "run-sourcing":
        from .services.daily_sourcing import run_daily_sourcing
        init_db()
        with SessionLocal() as db:
            r = run_daily_sourcing(db, trigger="manual")
        print(json.dumps(r.summary, ensure_ascii=False, indent=1))
    else:
        print(f"알 수 없는 명령: {cmd}")
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
