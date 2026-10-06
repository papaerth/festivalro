"""실행 진입점. 인자 없이 실행하면 GUI, 인자가 있으면 CLI."""

import os
import sys
import traceback


def _show_fatal(message):
    """GUI 시작 자체가 실패했을 때(모듈 누락 등) 콘솔이 없어도 알 수 있도록 알림 상자와 로그 파일로 남긴다."""
    log_path = None
    try:
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        log_dir = os.path.join(base, "karaoke-subtitle")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "crash.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(message + "\n" + "-" * 60 + "\n")
    except Exception:
        pass
    print(message, file=sys.stderr)
    if sys.platform == "win32":
        try:
            import ctypes

            text = message
            if log_path:
                text += f"\n\n(자세한 내용: {log_path})"
            ctypes.windll.user32.MessageBoxW(None, text, "노래방 자막 생성기 - 실행 오류", 0x10)
        except Exception:
            pass


def main():
    if len(sys.argv) > 1 and sys.argv[1] not in ("--gui",):
        from karaoke_subtitle.cli import main as cli_main

        sys.exit(cli_main())
    try:
        from karaoke_subtitle.gui import main as gui_main
    except ImportError as e:
        _show_fatal(
            f"필요한 패키지를 불러올 수 없습니다: {e}\n\n"
            "가상환경(.venv)에 패키지가 설치되어 있는지 확인하세요.\n"
            "  .venv\\Scripts\\activate\n"
            "  pip install -r requirements.txt"
        )
        sys.exit(1)
    try:
        gui_main()
    except Exception:
        _show_fatal("프로그램 실행 중 오류가 발생했습니다.\n\n" + traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
