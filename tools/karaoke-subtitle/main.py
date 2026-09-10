"""실행 진입점. 인자 없이 실행하면 GUI, 인자가 있으면 CLI."""

import sys


def main():
    if len(sys.argv) > 1 and sys.argv[1] not in ("--gui",):
        from karaoke_subtitle.cli import main as cli_main

        sys.exit(cli_main())
    from karaoke_subtitle.gui import main as gui_main

    gui_main()


if __name__ == "__main__":
    main()
