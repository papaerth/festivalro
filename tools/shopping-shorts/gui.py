#!/usr/bin/env python3
"""쇼핑 쇼츠 만들기 — 바탕화면 아이콘으로 여는 창.

원본 영상을 고르고 유튜브 링크를 붙여 넣은 뒤 [만들기]를 누르면
영상을 편 폴더에 넣고 `shorts.py auto` 를 끝까지 돌린다.

  pythonw gui.py                 # 창 열기 (쇼츠만들기.bat 더블클릭)
  python gui.py --shortcut       # 바탕화면에 아이콘 만들기
  python gui.py --update         # 최신 프로그램 받기 + 패키지 확인 + 바탕화면 아이콘
"""
from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

VIDEO_EXT = (".mp4", ".mkv", ".mov", ".webm", ".m4v")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")
REDO = {"이어서 하기": None, "제품 선정부터 다시": "analyze", "컷 설계부터 다시": "design", "렌더링만 다시": "render"}
UPDATE_ZIPS = [
    "https://github.com/papaerth/festivalro/archive/refs/heads/claude/modest-johnson-nd1668.zip",
    "https://github.com/papaerth/festivalro/archive/refs/heads/main.zip",
]
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
# 창의 진행 단계 표시. 진행 기록 줄의 머리말로 지금 어느 단계인지 안다.
STEPS = ["대사 읽기", "제품 선정", "컷 설계", "음성 · 댓글", "영상 만들기", "검수 · 문구"]
STEP_MARKS = [("[준비]", 0), ("[분석]", 1), ("[설계]", 2), ("[다듬음]", 2), ("[가운데 맞춤]", 3), ("[TTS]", 3), ("[캡처]", 3),
              ("[배경음 제거]", 4), ("[영상]", 4), ("[완료]", 4), ("[검수 반영]", 4), ("길이 ", 5), ("검수 통과", 5), ("■ 만든 것", 5)]
REDO_STEP = {"analyze": 1, "design": 2, "tts": 3, "render": 4}


def step_of(line: str) -> int | None:
    """진행 기록 한 줄이 알려 주는 단계 순번(모르면 None)."""
    for mark, k in STEP_MARKS:
        if line.startswith(mark):
            return k
    return None


# ------------------------------------------------------------------ 창 없이도 쓰는 기능
def read_json(p: Path, default=None):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def safe_episode(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*\s]+', "_", name.strip()).strip("._")
    return name[:60]


def episode_from_video(path: str) -> str:
    return safe_episode(Path(path).stem)


def existing_episodes() -> list[str]:
    d = ROOT / "input"
    if not d.is_dir():
        return []
    return sorted((p.name for p in d.iterdir() if p.is_dir()), key=lambda n: -(d / n).stat().st_mtime)


def episode_videos(name: str) -> list[Path]:
    """편에 들어 있는 원본 영상(하나, 또는 두 영상을 섞는 편이면 둘). pipeline/util.py 의 Episode.sources 와 같은 규칙."""
    d = ROOT / "input" / name
    vids = sorted(p for p in d.iterdir() if p.suffix.lower() in VIDEO_EXT) if d.is_dir() else []
    if not vids:
        return []
    info = read_json(d / "info.json", {}) or {}
    named = [d / n for n in info.get("videos") or [] if (d / n).is_file()]
    if len(named) >= 2:
        return named[:2]
    if info.get("url2") and len(vids) >= 2:
        first = named[0] if named else vids[0]
        return [first, next(p for p in vids if p != first)]
    return [named[0] if named else max(vids, key=lambda p: p.stat().st_size)]


def episode_video(name: str) -> Path | None:
    vids = episode_videos(name)
    return vids[0] if vids else None


def same_video(a: Path, b: Path) -> bool:
    """같은 영상 파일인지(같은 경로이거나, 크기와 확장자가 같으면 같은 것으로 본다)."""
    try:
        return a.resolve() == b.resolve() or (a.stat().st_size == b.stat().st_size and a.suffix.lower() == b.suffix.lower())
    except OSError:
        return False


def inputs_match(name: str, video: str, video2: str, exact: bool = False) -> bool:
    """창에 넣은 영상이 그 편에 이미 든 영상과 같은지.
    exact=False: 넣은 칸만 견준다(칸을 비워 두었거나 두 번째 영상을 새로 더하는 것은 같은 편으로 본다).
    exact=True: 영상 개수까지 같아야 한다(새 작업이 이전 작업과 똑같은 입력인지 볼 때)."""
    have = episode_videos(name)
    picked = [Path(v.strip()) if v.strip() else None for v in (video, video2)]
    if exact and len([p for p in picked if p]) != len(have):
        return False
    return all(same_video(p, have[i]) for i, p in enumerate(picked) if p and i < len(have)) and bool(have)


def unique_episode(name: str) -> str:
    """이미 있는 편과 겹치지 않는 이름(같은 이름이 있으면 _2, _3 … 을 붙인다)."""
    taken = {p.name for d in ("input", "work", "output") if (ROOT / d).is_dir() for p in (ROOT / d).iterdir() if p.is_dir()}
    if name not in taken:
        return name
    k = 2
    while f"{name}_{k}" in taken:
        k += 1
    return f"{name}_{k}"


def load_episode(name: str) -> dict:
    d = ROOT / "input" / name
    info = read_json(d / "info.json", {}) or {}
    def text(fn):
        f = d / fn
        return f.read_text(encoding="utf-8", errors="replace").strip() if f.exists() else ""

    vids = episode_videos(name)
    return {"url": info.get("url", ""), "inpock": str(info.get("inpock", "") or ""),
            "product": info.get("product", ""), "vidiq": text("vidiq.txt"), "feedback": text("feedback.txt"),
            "video": str(vids[0]) if vids else "",
            "video2": str(vids[1]) if len(vids) > 1 else "", "url2": info.get("url2", "") if len(vids) > 1 else ""}


def python_exe() -> str:
    """창 없는 pythonw 로 열렸어도, 작업은 출력이 나오는 python 으로 돌린다."""
    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe" and exe.with_name("python.exe").exists():
        return str(exe.with_name("python.exe"))
    return str(exe)


def prepare_episode(name: str, video: str, url: str, inpock: str, product: str, vidiq: str,
                    images: list[str], redo: str | None, feedback: str = "",
                    video2: str = "", url2: str = "") -> tuple[list[str], list[str]]:
    """편 폴더를 채우고 실행할 명령을 돌려준다. 잘못된 입력은 ValueError(사용자에게 보일 말).
    video2(와 url2)를 주면 같은 제품의 두 영상을 섞는 편이 된다."""
    name = safe_episode(name)
    if not name:
        raise ValueError("편 이름을 적어 주세요.")
    d = ROOT / "input" / name
    notes = []
    have = episode_videos(name)
    was_two = len(have) > 1
    picked = []
    for i, v in enumerate([video.strip(), video2.strip()]):
        which = "원본 영상" if i == 0 else "두 번째 영상"
        if not v:
            picked.append(None)
            continue
        src = Path(v)
        if not src.is_file():
            raise ValueError(f"{which} 파일을 찾을 수 없습니다:\n{src}")
        if src.suffix.lower() not in VIDEO_EXT:
            raise ValueError(f"{which}은 mp4, mkv, mov, webm 파일이어야 합니다.")
        picked.append(src)
    if not picked[0] and not have:
        raise ValueError("원본 영상을 골라 주세요.")
    if picked[0] and picked[1] and picked[0].resolve() == picked[1].resolve():
        raise ValueError("두 번째 영상이 첫 영상과 같은 파일입니다.\n같은 제품을 다룬 다른 영상을 고르거나, 두 번째 칸을 비워 주세요.")
    d.mkdir(parents=True, exist_ok=True)
    names = [p.name for p in have]
    for i, src in enumerate(picked):
        if not src:
            continue
        if i < len(have):
            if have[i].resolve() != src.resolve() and have[i].stat().st_size != src.stat().st_size:
                raise ValueError(f"'{name}' 편에는 이미 다른 {'영상' if i == 0 else '두 번째 영상'}({have[i].name})이 들어 있습니다.\n"
                                 "다른 편 이름을 쓰거나, 그 폴더의 영상을 지운 뒤 다시 하세요.")
            continue
        dest = d / src.name
        if src.parent.resolve() == d.resolve():
            dest = src
        else:
            if dest.exists() or dest.name in names:      # 다른 폴더의 같은 이름 파일이 첫 영상을 덮어쓰지 않게
                dest = d / f"{src.stem}_2{src.suffix}"
            notes.append(f"{'원본 영상' if i == 0 else '두 번째 영상'}을 input/{name}/ 에 복사합니다: {dest.name}")
            shutil.copy2(src, dest)
        names.append(dest.name)
    two = len(names) > 1
    d.mkdir(parents=True, exist_ok=True)

    old = load_episode(name)
    info = read_json(d / "info.json", {}) or {}
    info.update(url=url.strip(), inpock=inpock.strip(), product=product.strip())
    if two:
        info.update(url2=url2.strip(), videos=names[:2])
    info.setdefault("channel", "")
    (d / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    vidiq = vidiq.strip()
    if vidiq:
        (d / "vidiq.txt").write_text(vidiq + "\n", encoding="utf-8")
    else:
        (d / "vidiq.txt").unlink(missing_ok=True)
    feedback = feedback.strip()
    if feedback:
        (d / "feedback.txt").write_text(feedback + "\n", encoding="utf-8")
    else:
        (d / "feedback.txt").unlink(missing_ok=True)
    for i, img in enumerate([x for x in images if x][:2], 1):
        src = Path(img)
        if not src.is_file() or src.suffix.lower() not in IMAGE_EXT:
            raise ValueError(f"이미지 파일을 쓸 수 없습니다:\n{src}")
        for stale in d.glob(f"img{i}.*"):
            if stale.resolve() != src.resolve():
                stale.unlink()
        if src.parent.resolve() != d.resolve():
            shutil.copy2(src, d / f"img{i}{src.suffix.lower()}")

    analyzed = (ROOT / "work" / name / "analysis.json").exists()
    if two:
        notes.append(f"두 영상을 섞어 만듭니다: A={names[0]}, B={names[1]}")
    if two and not was_two and analyzed and redo != "analyze":
        redo = "analyze"
        notes.append("두 번째 영상이 더해져 제품 선정부터 다시 합니다.")
    if redo is None and analyzed and (old["product"] != product.strip() or old["vidiq"] != vidiq):
        redo = "analyze"
        notes.append("제품명이나 vidIQ 분석이 바뀌어 제품 선정부터 다시 합니다.")
    designed = (ROOT / "work" / name / "plan.json").exists()
    if redo is None and designed and old["feedback"] != feedback:
        redo = "design"
        notes.append("수정 요청이 바뀌어 컷 설계부터 다시 합니다." if feedback else "수정 요청을 지워 컷 설계부터 다시 합니다.")
    if redo is None and analyzed and ((old["url"] != url.strip() and url.strip())
                                      or (two and was_two and old["url2"] != url2.strip() and url2.strip())):
        notes.append("유튜브 링크가 바뀌었습니다. 댓글을 새로 가져오려면 '제품 선정부터 다시'가 아니라 편 이름을 새로 지으세요.")
    cmd = [python_exe(), "-X", "utf8", "-u", str(ROOT / "shorts.py"), "auto", name]
    if redo:
        cmd += ["--redo", redo]
    return cmd, notes


def _result_in(d: Path) -> dict | None:
    data = read_json(d / "_보고.json")
    if data:
        return data
    txts = sorted(d.glob("*_보고.txt"), key=lambda p: -p.stat().st_mtime) if d.is_dir() else []
    return {"plain": txts[0].read_text(encoding="utf-8", errors="replace")} if txts else None


def list_versions(name: str) -> list[dict]:
    """만든 버전들(최신이 먼저). [{"dir": 폴더, "label": 목록에 보일 이름, "data": 보고}]"""
    root = ROOT / "output" / name
    if not name or not root.is_dir():
        return []
    out = []
    for d in sorted((p for p in root.glob("[0-9][0-9]_*") if p.is_dir()), reverse=True):
        data = _result_in(d)
        if data:
            out.append({"dir": d, "label": f"{d.name.replace('_', ' ', 1)}  ·  {data.get('product', '')}".rstrip(" ·"),
                        "data": data})
    legacy = _result_in(root)
    if legacy:   # 버전 폴더가 없던 때 만든 것
        out.append({"dir": root, "label": f"처음  ·  {legacy.get('product', '')}".rstrip(" ·"), "data": legacy})
    if out:
        out[0]["label"] += "   (최신)"
    return out


def load_result(name: str) -> dict | None:
    v = list_versions(name)
    return v[0]["data"] if v else None


STATE_FILE = ROOT / "work" / "gui_state.json"


def load_state() -> dict:
    return read_json(STATE_FILE, {}) or {}


def save_state(**kw):
    """마지막에 보던 편과 입력 내용을 남겨, 창을 다시 열 때 이어서 보이게 한다."""
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(kw, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def log_file(name: str) -> Path:
    return ROOT / "work" / name / "gui_log.txt"


def read_log_tail(name: str, lines: int = 400) -> list[str]:
    p = log_file(name)
    if not name or not p.exists():
        return []
    return p.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]


def episode_summaries() -> list[dict]:
    """이전 작업 목록(최근 작업이 먼저): 편 이름, 제품, 버전 수, 마지막 작업 시각, 상태."""
    import time
    out = []
    for name in existing_episodes():
        vers = list_versions(name)
        work = ROOT / "work" / name
        times = [p.stat().st_mtime for d in (ROOT / "input" / name, work) if d.is_dir() for p in d.iterdir()]
        times += [v["dir"].stat().st_mtime for v in vers]
        last = max(times, default=0)
        if vers:
            status = f"완성 (버전 {len(vers)}개)"
        elif (work / "plan.json").exists():
            status = "렌더링 전에 멈춤"
        elif (work / "analysis.json").exists():
            status = "컷 설계 전에 멈춤"
        elif work.is_dir() and any(work.iterdir()):
            status = "분석 전에 멈춤"
        else:
            status = "영상만 넣음"
        out.append({"name": name, "product": (vers[0]["data"].get("product", "") if vers else ""),
                    "status": status, "last": last,
                    "when": time.strftime("%m-%d %H:%M", time.localtime(last)) if last else ""})
    return sorted(out, key=lambda e: -e["last"])


def desktop_dir() -> Path:
    if os.name == "nt":
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 0x10, None, 0, buf) == 0 and buf.value:  # 바탕화면
            return Path(buf.value)
    return Path.home() / "Desktop"


def launcher_text() -> str:
    exe = Path(sys.executable)
    pyw = exe.with_name("pythonw.exe")
    return ("@echo off\r\n"
            "rem 쇼핑 쇼츠 만들기 창을 연다. 영상 파일을 이 아이콘 위에 끌어다 놓아도 된다.\r\n"
            f'cd /d "{ROOT}"\r\n'
            f'start "" "{pyw if pyw.exists() else "pythonw"}" "{ROOT / "gui.py"}" %*\r\n')


def make_shortcut() -> Path:
    """바탕화면에 '쇼츠 만들기.bat' 을 만든다(더블클릭하거나 영상을 끌어다 놓는다)."""
    dst = desktop_dir() / "쇼츠 만들기.bat"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(launcher_text(), encoding="mbcs" if os.name == "nt" else "utf-8", newline="")
    return dst


def update_program(log=print) -> int:
    """GitHub에서 최신 프로그램 파일을 받아 덮어쓴다(.env, input, work, output 은 건드리지 않는다)."""
    urls = [os.environ["SHORTS_UPDATE_ZIP"]] if os.environ.get("SHORTS_UPDATE_ZIP") else UPDATE_ZIPS
    data, err = None, None
    for url in urls:
        try:
            log(f"내려받는 중: {url}")
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
            break
        except OSError as e:
            err = e
    if data is None:
        raise RuntimeError(f"프로그램을 내려받지 못했습니다: {err}")
    mark, n = "/tools/shopping-shorts/", 0
    with zipfile.ZipFile(BytesIO(data)) as z:
        for m in z.infolist():
            if m.is_dir() or mark not in m.filename:
                continue
            rel = Path(m.filename.split(mark, 1)[1])
            if rel.is_absolute() or ".." in rel.parts:
                continue
            dst = ROOT / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(z.read(m))
            n += 1
    if n == 0:
        raise RuntimeError("받은 파일 안에 프로그램이 없습니다.")
    log(f"파일 {n}개를 새로 받았습니다.")
    return n


# ------------------------------------------------------------------ 창
def run_gui(argv: list[str]):
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from tkinter import font as tkfont

    root = tk.Tk()
    root.title("쇼핑 쇼츠 만들기")
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{min(1040, sw - 40)}x{min(940, sh - 90)}+20+10")
    root.minsize(880, 600)

    # 글꼴과 모양(색·둥근 버튼·카드는 ui_theme.py)
    import ui_theme
    fams = set(tkfont.families())
    fam = next((f for f in ("Pretendard", "맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR")
                if f in fams), tkfont.nametofont("TkDefaultFont").actual("family"))
    for nm in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont"):
        tkfont.nametofont(nm).configure(family=fam, size=11)
    T = ui_theme.apply(root, fam)
    root._shorts_theme = T      # 딸린 창(미리보기)이 같은 모양을 다시 입히지 않게
    C = T.C
    F_BODY, F_HEAD, F_TITLE = (fam, 12), (fam, 12, "bold"), (fam, 18, "bold")
    INK, BLUE, RED, AMBER, GRAY = C["ink"], C["accent"], C["err"], C["warn"], C["sub"]

    v_video, v_url, v_name = tk.StringVar(), tk.StringVar(), tk.StringVar()
    v_video2, v_url2 = tk.StringVar(), tk.StringVar()      # 같은 제품의 두 번째 영상(섞어 만들 때만)
    v_inpock, v_product, v_redo = tk.StringVar(), tk.StringVar(), tk.StringVar(value="이어서 하기")
    v_img = [tk.StringVar(), tk.StringVar()]
    v_status = tk.StringVar(value="원본 영상을 고르고 유튜브 링크를 붙여 넣은 뒤 [만들기]를 누르세요.")
    v_summary = tk.StringVar()
    state = {"name": ""}
    q: queue.Queue = queue.Queue()

    app = ttk.Frame(root, style="Bg.TFrame", padding=(18, 14, 18, 10))
    app.pack(fill="both", expand=True)

    # ---- 맨 위: 이름과 자주 쓰는 버튼
    top = ttk.Frame(app, style="Bg.TFrame")
    top.pack(fill="x")
    ttl = ttk.Frame(top, style="Bg.TFrame")
    ttl.pack(side="left")
    ttk.Label(ttl, text="쇼츠 만들기", style="BgTitle.TLabel").pack(anchor="w")
    ttk.Label(ttl, text="영상과 링크만 넣으면 영상 2종 · 썸네일 · 업로드 문구까지 한 번에",
              style="BgSub.TLabel").pack(anchor="w")
    ttk.Button(top, text="이전 작업 보기", style="Bg.TButton", command=lambda: pick_previous()).pack(side="right")
    ttk.Button(top, text="미리보기 · 글자체", style="Bg.TButton", command=lambda: open_preview()).pack(side="right", padx=8)
    ttk.Button(top, text="모두 지우기 (새 영상)", style="Bg.Ghost.TButton", command=lambda: new_work()).pack(side="right")

    # ---- ① 영상 넣기
    card_in = ttk.Frame(app, style="Card.TFrame", padding=(20, 12, 20, 14))
    card_in.pack(fill="x", pady=(12, 0))
    in_head = ttk.Frame(card_in)
    in_head.pack(fill="x")
    ttk.Label(in_head, text="①  영상 넣기", style="H.TLabel").pack(side="left")
    ttk.Label(in_head, textvariable=v_summary, style="Sub.TLabel").pack(side="left", padx=14)
    b_fold = ttk.Button(in_head, text="입력 칸 접기 ▲", style="Ghost.TButton", command=lambda: fold(not state.get("folded")))
    b_fold.pack(side="right")
    body = ttk.Frame(card_in)
    body.pack(fill="x", pady=(6, 0))
    body.columnconfigure(1, weight=1)

    def field(r, label, widget, button=None):
        """입력 한 줄: 이름표, 칸, (버튼). 만든 위젯들을 돌려준다(접었다 펼 때 쓴다)."""
        lb = ttk.Label(body, text=label, style="Field.TLabel")
        lb.grid(row=r, column=0, sticky="w", padx=(0, 16), pady=4)
        widget.grid(row=r, column=1, sticky="ew", pady=4)
        if button:
            button.grid(row=r, column=2, sticky="ew", padx=(8, 0), pady=4)
        return [lb, widget] + ([button] if button else [])

    def refresh_summary(*_):
        """입력 칸을 접었을 때 머리줄에 무엇을 넣었는지 한 줄로 보여 준다."""
        if not state.get("folded"):
            v_summary.set("")
            return
        vids = " + ".join(Path(v).name for v in (v_video.get(), v_video2.get()) if v.strip())
        v_summary.set("   ·   ".join(x for x in (state["name"] or v_name.get().strip(), vids) if x)[:90])

    def fold(hide: bool):
        state["folded"] = hide
        if hide:
            body.pack_forget()
        else:
            body.pack(fill="x", pady=(6, 0))
        b_fold.configure(text="입력 칸 펼치기 ▼" if hide else "입력 칸 접기 ▲")
        refresh_summary()

    def pick_video():
        p = filedialog.askopenfilename(title="원본 영상 고르기",
                                       filetypes=[("영상", "*.mp4 *.mkv *.mov *.webm *.m4v"), ("모든 파일", "*.*")])
        if p:
            set_video(p)

    def pick_video2():
        p = filedialog.askopenfilename(title="두 번째 영상 고르기 (같은 제품의 다른 영상)",
                                       filetypes=[("영상", "*.mp4 *.mkv *.mov *.webm *.m4v"), ("모든 파일", "*.*")])
        if p:
            v_video2.set(p)

    def set_video(p: str):
        v_video.set(p)
        if state["name"]:        # 이미 연 편에서는 편 이름을 건드리지 않는다
            return
        auto = episode_from_video(p)
        if not v_name.get().strip() or v_name.get().strip() == state.get("auto_name"):
            v_name.set(auto)     # 새 작업의 편 이름은 고른 영상의 파일 이름을 따라간다
            state["auto_name"] = auto

    def paste_into(var):
        """복사해 둔 링크를 칸에 넣는다."""
        try:
            text = root.clipboard_get().strip()
        except tk.TclError:
            text = ""
        if text:
            var.set(text.splitlines()[0].strip())
        else:
            v_status.set("복사해 둔 링크가 없습니다. 유튜브에서 링크를 복사한 뒤 눌러 주세요.")

    def set_text(widget, text: str):
        widget.delete("1.0", "end")
        widget.insert("1.0", text)

    def show_mix(on: bool):
        """두 번째 영상 칸(같은 제품의 영상 둘을 섞을 때)을 보이거나 감춘다."""
        state["mix"] = on
        for w in mix_rows:
            w.grid() if on else w.grid_remove()
        b_mix.configure(text="두 번째 영상 빼기  ✕" if on else "＋  같은 제품의 영상 하나 더 섞기",
                        style="Ghost.TButton" if on else "Soft.TButton")

    def toggle_mix():
        if not state.get("mix"):
            show_mix(True)
            return
        if len(episode_videos(state["name"])) > 1:
            messagebox.showinfo("두 번째 영상", "이미 두 영상으로 만든 편입니다.\n영상 하나로 만들려면 [모두 지우기 (새 영상)] 뒤 새로 시작하세요.")
            return
        v_video2.set("")
        v_url2.set("")
        show_mix(False)

    def show_opt(on: bool):
        state["opt"] = on
        opt.grid() if on else opt.grid_remove()
        b_opt.configure(text="추가 설정 접기 ▲" if on else "추가 설정 ▾   편 이름 · TTS 이미지 · vidIQ 분석")

    def open_episode(name: str):
        """편 하나를 창에 불러온다: 입력 내용, 결과, 업로드 문구, 진행 기록."""
        ep = load_episode(name)
        v_name.set(name)
        v_url.set(ep["url"])
        v_inpock.set(ep["inpock"])
        v_product.set(ep["product"])
        v_video.set(ep["video"])
        v_video2.set(ep["video2"])
        v_url2.set(ep["url2"])
        show_mix(bool(ep["video2"]))
        set_text(t_vidiq, ep["vidiq"])
        set_text(t_feedback, ep["feedback"])
        state["name"] = name
        state["cleared"] = False
        t_log.configure(state="normal")
        t_log.delete("1.0", "end")
        t_log.configure(state="disabled")
        old_lines = read_log_tail(name)
        for ln in old_lines:
            log(ln, save=False)
        if old_lines:
            log("──────── 여기까지 이전 기록 ────────", save=False)
        show_result(name)
        done = bool(load_result(name))
        making = is_active(name)
        fold(done or making)
        nb.select(tab_log if making else tab_res if done else tab_log)
        v_status.set(f"'{name}' 편을 불러왔습니다. " + (
            "지금 만드는 중입니다. 진행 상황은 [진행 기록]에 나옵니다." if making else
            "결과와 업로드 문구를 아래에서 볼 수 있습니다." if done else "[만들기]를 누르면 멈춘 곳부터 이어서 합니다."))
        save_state(last=name)
        sync_buttons()

    def on_episode(_=None):
        name = safe_episode(v_name.get())
        if name and name != state["name"] and name in existing_episodes():
            open_episode(name)

    def pick_previous():
        """이전 작업 보기: 만든 편 목록에서 골라 다시 연다."""
        items = episode_summaries()
        if not items:
            messagebox.showinfo("이전 작업", "아직 만든 작업이 없습니다.")
            return
        win = tk.Toplevel(root)
        win.title("이전 작업 보기")
        win.geometry(f"780x{min(560, 190 + 36 * len(items))}")
        win.transient(root)
        ui_theme.style_toplevel(win)
        ttk.Label(win, text="다시 볼 작업을 두 번 누르거나, 고른 뒤 [열기]를 누르세요.", padding=(12, 10), style="Sub.TLabel").pack(anchor="w")
        cols = ("name", "product", "status", "when")
        tree = ttk.Treeview(win, columns=cols, show="headings", selectmode="browse")
        for c, title, w in zip(cols, ("편 이름", "제품", "상태", "마지막 작업"), (170, 270, 180, 110)):
            tree.heading(c, text=title, anchor="w")
            tree.column(c, width=w, anchor="w")
        for e in items:
            tree.insert("", "end", iid=e["name"], values=(e["name"], e["product"], e["status"], e["when"]))
        bar2 = ttk.Frame(win, padding=12)
        bar2.pack(side="bottom", fill="x")      # 버튼 줄을 먼저 붙여 창이 작아도 잘리지 않게
        tree.pack(fill="both", expand=True, padx=12)
        tree.selection_set(items[0]["name"])

        def choose(_=None):
            sel = tree.selection()
            if sel:
                win.destroy()
                open_episode(sel[0])

        tree.bind("<Double-1>", choose)
        tree.bind("<Return>", choose)
        ttk.Button(bar2, text="열기", style="Go.TButton", command=choose).pack(side="right")
        ttk.Button(bar2, text="닫기", command=win.destroy).pack(side="right", padx=8)
        state["prev_win"] = win

    field(0, "원본 영상", ttk.Entry(body, textvariable=v_video), ttk.Button(body, text="파일 고르기", command=pick_video))
    field(1, "유튜브 링크", ttk.Entry(body, textvariable=v_url),
          ttk.Button(body, text="붙여넣기", command=lambda: paste_into(v_url)))
    mix_rows = field(2, "영상 2", ttk.Entry(body, textvariable=v_video2),
                     ttk.Button(body, text="두 번째 영상 고르기", command=pick_video2))
    mix_rows += field(3, "영상 2 링크", ttk.Entry(body, textvariable=v_url2),
                      ttk.Button(body, text="붙여넣기", command=lambda: paste_into(v_url2)))
    sub = ttk.Frame(body)
    sub.columnconfigure(3, weight=1)
    ttk.Entry(sub, textvariable=v_inpock, width=12).grid(row=0, column=0, sticky="w")
    ttk.Label(sub, text="제품명", style="Field.TLabel").grid(row=0, column=2, sticky="e", padx=(24, 12))
    ttk.Entry(sub, textvariable=v_product).grid(row=0, column=3, sticky="ew")
    ttk.Label(sub, text="정했을 때만 적어요", style="Faint.TLabel").grid(row=0, column=4, padx=(10, 0))
    field(4, "인포크 번호", sub)
    toggles = ttk.Frame(body)
    toggles.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(8, 0))
    b_mix = ttk.Button(toggles, style="Soft.TButton", command=toggle_mix)
    b_mix.pack(side="left")
    b_opt = ttk.Button(toggles, style="Ghost.TButton", command=lambda: show_opt(not state.get("opt")))
    b_opt.pack(side="left", padx=8)

    # 추가 설정(접어 둔다): 편 이름, TTS 이미지, vidIQ
    opt = ttk.Frame(body)
    opt.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(8, 0))
    opt.columnconfigure(1, weight=1)
    ttk.Label(opt, text="편 이름", style="Field.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 16), pady=4)
    cb_name = ttk.Combobox(opt, textvariable=v_name, values=existing_episodes())
    cb_name.bind("<<ComboboxSelected>>", on_episode)
    cb_name.bind("<FocusOut>", on_episode)
    cb_name.grid(row=0, column=1, sticky="ew", pady=4)
    ttk.Label(opt, text="비워 두면 영상 파일 이름으로 정해요", style="Faint.TLabel").grid(row=0, column=2, padx=(10, 0))
    ttk.Label(opt, text="TTS 이미지", style="Field.TLabel").grid(row=1, column=0, sticky="w", padx=(0, 16), pady=4)
    imgs = ttk.Frame(opt)
    for i in range(2):
        def pick(i=i):
            p = filedialog.askopenfilename(title=f"TTS 이미지 {i + 1}",
                                           filetypes=[("이미지", "*.jpg *.jpeg *.png *.webp")])
            if p:
                v_img[i].set(p)
        ttk.Button(imgs, text=f"이미지 {i + 1} 고르기", command=pick).grid(row=0, column=i * 2, padx=(0, 8))
        ttk.Label(imgs, textvariable=v_img[i], width=24, style="Sub.TLabel").grid(row=0, column=i * 2 + 1, padx=(0, 12))
    imgs.grid(row=1, column=1, columnspan=2, sticky="w", pady=4)

    def copy_question():
        url = v_url.get().strip()
        if not url:
            messagebox.showinfo("vidIQ 질문", "먼저 유튜브 링크를 붙여 넣어 주세요.")
            return
        from pipeline.prompts import vidiq_question  # 가벼운 모듈만 읽는다
        root.clipboard_clear()
        root.clipboard_append(vidiq_question(url, v_url2.get().strip() if v_video2.get().strip() else ""))
        v_status.set("vidIQ 질문을 복사했습니다. Claude 앱에 붙여 넣고, 받은 답을 vidIQ 칸에 붙여 넣으세요.")

    ttk.Label(opt, text="vidIQ 분석", style="Field.TLabel").grid(row=2, column=0, sticky="nw", padx=(0, 16), pady=(8, 4))
    t_vidiq = tk.Text(opt, height=3, wrap="word", undo=True, font=(fam, 11), padx=8, pady=6)
    ui_theme.style_text(t_vidiq, T)
    t_vidiq.grid(row=2, column=1, sticky="ew", pady=4)
    vq = ttk.Frame(opt)
    vq.grid(row=2, column=2, sticky="n", padx=(8, 0), pady=4)
    ttk.Button(vq, text="vidIQ 질문 복사", command=copy_question).pack(anchor="e")
    ttk.Label(vq, text="받은 답을 붙여 넣으면\n제품 선정에 함께 써요", style="Faint.TLabel", justify="right").pack(anchor="e", pady=(4, 0))
    show_mix(False)
    show_opt(False)
    v_video2.trace_add("write", lambda *_: v_video2.get().strip() and not state.get("mix") and show_mix(True))
    for v in (v_video, v_video2, v_name):
        v.trace_add("write", refresh_summary)

    def open_preview():
        """글자체를 고르고 앱(쇼츠·틱톡·릴스)에서 보일 모습을 확인하는 창."""
        try:
            import preview_gui
        except Exception as e:
            messagebox.showerror("미리보기", f"미리보기 창을 열지 못했습니다.\n{e}\n\n[프로그램 업데이트]를 한 번 눌러 보세요.")
            return
        name = state["name"] or safe_episode(v_name.get())
        state["preview_win"] = preview_gui.open_window(root, name, fam, lambda: run("render"))

    # ---- ② 만들기: 큰 버튼, 진행 단계, 지금 상태
    card_go = ttk.Frame(app, style="Card.TFrame", padding=(20, 12, 20, 12))
    card_go.pack(fill="x", pady=(10, 0))
    bar = ttk.Frame(card_go)
    bar.pack(fill="x")
    ttk.Label(bar, text="②  만들기", style="H.TLabel").pack(side="left", padx=(0, 18))
    b_run = ttk.Button(bar, text="▶  만들기", style="Primary.TButton")
    b_run.pack(side="left")
    b_stop = ttk.Button(bar, text="중지", style="Stop.TButton", state="disabled")
    b_stop.pack(side="left", padx=8)
    ttk.Combobox(bar, textvariable=v_redo, values=list(REDO), state="readonly", width=17).pack(side="right")
    ttk.Label(bar, text="다시 만들 때", style="Sub.TLabel").pack(side="right", padx=(0, 8))
    stepper = ui_theme.Stepper(card_go, T, STEPS)
    stepper.cv.pack(fill="x", pady=(12, 0))
    l_status = ttk.Label(card_go, textvariable=v_status, style="Status.TLabel", justify="left")
    l_status.pack(fill="x", pady=(2, 0))
    l_status.bind("<Configure>", lambda e: l_status.configure(wraplength=max(240, e.width - 6)))

    def status_color(*_):
        s_ = v_status.get()
        l_status.configure(foreground=C["ok"] if s_.startswith("완료") else
                           C["err"] if ("멈췄" in s_ or "못했습니다" in s_ or s_.startswith("[오류]")) else C["accent"])

    v_status.trace_add("write", status_color)

    # ---- 맨 아래: 가끔 쓰는 것
    foot = ttk.Frame(app, style="Bg.TFrame")
    foot.pack(side="bottom", fill="x", pady=(8, 0))

    # ---- ③ 결과: 알약 탭 네 장
    card_res = ttk.Frame(app, style="Card.TFrame", padding=(20, 12, 20, 16))
    card_res.pack(fill="both", expand=True, pady=(10, 0))
    res_head = ttk.Frame(card_res)
    res_head.pack(fill="x")
    ttk.Label(res_head, text="③  결과", style="H.TLabel").pack(side="left", padx=(0, 18))
    tab_bar = ttk.Frame(res_head)
    tab_bar.pack(side="left")
    b_open = ttk.Button(res_head, text="결과 폴더 열기")
    b_open.pack(side="right")
    v_ver = tk.StringVar()
    cb_ver = ttk.Combobox(res_head, textvariable=v_ver, state="readonly", width=28)
    cb_ver.pack(side="right", padx=8)
    ttk.Label(res_head, text="버전", style="Sub.TLabel").pack(side="right")
    stack = ttk.Frame(card_res)
    stack.pack(fill="both", expand=True, pady=(10, 0))
    nb = ui_theme.Tabs(tab_bar, stack)

    def text_pane(parent, **kw):
        box = ttk.Frame(parent)
        t = tk.Text(box, wrap="word", state="disabled", font=F_BODY, padx=6, pady=8, spacing1=2, spacing3=4, **kw)
        ui_theme.style_text(t, T, boxed=False)
        sb = ttk.Scrollbar(box, command=t.yview)
        t.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        t.pack(side="left", fill="both", expand=True)
        return box, t

    tab_res = ttk.Frame(stack)
    tab_res.rowconfigure(1, weight=1)
    tab_res.columnconfigure(0, weight=1)
    box_res, t_res = text_pane(tab_res, height=5)
    box_res.grid(row=1, column=0, sticky="nsew")
    t_res.tag_configure("title", font=F_TITLE, foreground=INK, spacing3=6)
    t_res.tag_configure("h", font=F_HEAD, foreground=BLUE, spacing1=14, spacing3=5)
    t_res.tag_configure("item", lmargin1=14, lmargin2=34)
    t_res.tag_configure("warn", lmargin1=14, lmargin2=34, foreground=RED)
    t_res.tag_configure("soft", lmargin1=14, lmargin2=34, foreground=AMBER)
    t_res.tag_configure("dim", lmargin1=14, lmargin2=34, foreground=GRAY)

    ui_theme.hline(tab_res).grid(row=2, column=0, sticky="ew", pady=(6, 10))
    alt_wrap = ttk.Frame(tab_res)
    alt_wrap.grid(row=3, column=0, sticky="ew")
    ttk.Label(alt_wrap, text="제품 태그 검색이 안 되면", style="Field.TLabel").pack(side="left", padx=(0, 12))
    alt_box = ttk.Frame(alt_wrap)
    alt_box.pack(side="left", fill="x", expand=True)
    fb_box = ttk.Frame(tab_res)
    fb_box.grid(row=4, column=0, sticky="ew", pady=(10, 0))
    fb_box.columnconfigure(1, weight=1)
    fb_l = ttk.Frame(fb_box)
    fb_l.grid(row=0, column=0, sticky="nw", padx=(0, 12))
    ttk.Label(fb_l, text="수정 요청", style="Field.TLabel").pack(anchor="w")
    ttk.Label(fb_l, text="고칠 점을 적으면\n수정본을 새 버전으로", style="Faint.TLabel").pack(anchor="w")
    t_feedback = tk.Text(fb_box, height=2, wrap="word", undo=True, font=(fam, 11), padx=8, pady=6)
    ui_theme.style_text(t_feedback, T)
    t_feedback.grid(row=0, column=1, sticky="ew")
    b_fb = ttk.Button(fb_box, text="수정본 만들기", style="Soft.TButton")
    b_fb.grid(row=0, column=2, sticky="ns", padx=(8, 0))

    tab_up = ttk.Frame(stack)
    box_up, t_up = text_pane(tab_up, height=5)
    box_up.pack(fill="both", expand=True)
    t_up.tag_configure("h", font=F_HEAD, foreground=BLUE, spacing1=14, spacing3=5)
    t_up.tag_configure("copy", lmargin1=8, lmargin2=8, spacing1=8)
    t_up.tag_configure("quote", lmargin1=92, lmargin2=92, rmargin=12, foreground=INK, background=C["quote"], spacing1=3)
    t_up.tag_configure("dim", lmargin1=92, lmargin2=92, foreground=GRAY)

    tab_log = ttk.Frame(stack)
    box_log, t_log = text_pane(tab_log, height=5)
    box_log.pack(fill="both", expand=True)
    t_log.configure(font=(fam, 11), spacing1=0, spacing3=1)
    t_log.tag_configure("err", foreground=RED, font=(fam, 11, "bold"))
    t_log.tag_configure("warn", foreground=AMBER)
    t_log.tag_configure("stage", foreground=BLUE)
    t_log.tag_configure("head", font=(fam, 12, "bold"), spacing1=8)
    t_log.tag_configure("dim", foreground=GRAY)
    tab_jobs = ttk.Frame(stack)
    jtop = ttk.Frame(tab_jobs, padding=(0, 4, 0, 8))
    jtop.pack(fill="x")
    v_par = tk.IntVar(value=max(1, min(4, int(load_state().get("parallel") or 2))))
    ttk.Label(jtop, text="동시에 만들 개수", style="Field.TLabel").pack(side="left")
    ttk.Spinbox(jtop, from_=1, to=4, textvariable=v_par, width=4, state="readonly",
                command=lambda: pump_queue()).pack(side="left", padx=8)
    ttk.Label(jtop, text="[만들기]를 누른 뒤 [모두 지우기]로 다음 영상을 넣고 또 [만들기]를 누르면 함께 진행돼요. "
                         "줄을 두 번 누르면 그 작업이 열립니다.", style="Faint.TLabel").pack(side="left", padx=8)
    tree_jobs = ttk.Treeview(tab_jobs, columns=("name", "status", "stage", "when"), show="headings", selectmode="browse")
    for c, title, w in zip(("name", "status", "stage", "when"), ("편 이름", "상태", "지금 하는 일", "시작"), (190, 80, 520, 90)):
        tree_jobs.heading(c, text=title, anchor="w")
        tree_jobs.column(c, width=w, anchor="w")
    tree_jobs.pack(fill="both", expand=True)
    tree_jobs.bind("<Double-1>", lambda e: tree_jobs.selection() and open_episode(tree_jobs.selection()[0]))

    nb.add(tab_res, text="결과")
    nb.add(tab_up, text="업로드 문구")
    nb.add(tab_log, text="진행 기록")
    nb.add(tab_jobs, text="작업 목록")

    def log(msg: str, save: bool = True):
        log_to(state["name"], msg, save)

    def log_to(name: str, msg: str, save: bool = True):
        """편 name 의 기록에 한 줄을 남긴다. 화면에는 지금 보고 있는 편(또는 편과 무관한 안내)만 보인다."""
        line = msg.rstrip("\n")
        if save and name:
            try:
                p = log_file(name)
                p.parent.mkdir(parents=True, exist_ok=True)
                with open(p, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except OSError:
                pass
        if name and name != state["name"]:
            return
        st = line.strip()
        tag = ("err" if st.startswith(("[오류]", "Traceback")) or "Error" in st[:40] else
               "warn" if st.startswith(("[주의]", "[문제]", "[권고]", "- [검수]", "- [권고]")) else
               "head" if st.startswith(("■", "━━")) else
               "stage" if st.startswith("[") else
               "dim" if st.startswith(("[영상]", "[Claude]")) else "")
        if st.startswith(("[영상]", "[Claude]", "[모델]")):
            tag = "dim"
        t_log.configure(state="normal")
        t_log.insert("end", line + "\n", tag)
        t_log.see("end")
        t_log.configure(state="disabled")

    def copy_text(text: str, what: str):
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update_idletasks()
        v_status.set(f"복사했습니다: {what}  (유튜브 업로드 화면에 Ctrl+V)")

    def show_result(name: str, pick: int = 0):
        """결과 장을 다시 그린다: 확인할 것, 수정 요청 반영, 업로드 문구(복사), 차순위 후보."""
        vers = list_versions(name)
        state["versions"] = vers
        cb_ver.configure(values=[v["label"] for v in vers])
        pick = min(pick, len(vers) - 1) if vers else 0
        v_ver.set(vers[pick]["label"] if vers else "")
        state["shown"] = vers[pick]["dir"] if vers else None
        data = vers[pick]["data"] if vers else None
        latest = pick == 0
        for w in alt_box.winfo_children():
            w.destroy()
        for t in (t_res, t_up):
            for w in t.winfo_children():
                w.destroy()
            t.configure(state="normal")
            t.delete("1.0", "end")

        def put(text, tag="item"):
            t_res.insert("end", text + "\n", tag)

        def up(text, tag="dim"):
            t_up.insert("end", text + "\n", tag)

        if not data:
            up("결과가 나오면 제목·설명·핀 댓글을 여기서 [복사]로 가져갈 수 있습니다.")
            put("아직 만든 결과가 없습니다.", "dim")
            put("[만들기]를 누르면 진행 상황은 '진행 기록'에, 끝난 뒤 결과는 여기에 나옵니다.", "dim")
            ttk.Label(alt_box, text="결과가 나오면 차순위 후보 버튼이 여기에 나와요.", style="Sub.TLabel").pack(anchor="w")
        elif "plain" in data:
            put(data["plain"], "")
            up("이 버전은 예전 방식으로 만들어 복사 버튼이 없습니다. 한 번 더 [만들기] 하면 생깁니다.")
            ttk.Label(alt_box, text="이 편을 한 번 더 [만들기] 하면 후보 버튼이 표시됩니다.", style="Sub.TLabel").pack(anchor="w")
        else:
            dur = f"  ·  {data['duration']}초" if data.get("duration") else ""
            put(f"{data.get('product', name)}{dur}", "title")
            if data.get("pick_reason"):
                put(f"고른 이유: {data['pick_reason']}", "dim")
            put("사람이 확인할 것", "h")
            for c in data.get("checks", []):
                tag = "warn" if c.startswith("[검수]") else "soft" if c.startswith("[권고]") else "item"
                put(f"☐  {c}", tag)
            if data.get("feedback"):
                put("수정 요청 반영", "h")
                for ln in data["feedback"].splitlines():
                    if ln.strip():
                        put(f"요청:  {ln.strip()}", "dim")
                for ln in data.get("revision") or ["(반영 내용 설명이 없습니다. 영상으로 확인해 주세요.)"]:
                    put(f"→  {ln}")
            if data.get("cuts"):
                put("장면 구성 — 원본 영상의 어느 장면을 썼는지", "h")
                for i, c in enumerate(data["cuts"], 1):
                    put(f"{i}.  [{c.get('kind', '')}  {c.get('at', '')}]  {c.get('note', '')}")
                put("제품과 무관한 장면이 있으면 아래 수정 요청에 번호로 적어 주세요(예: 3번 장면 빼줘).", "dim")
            put("차순위 제품 후보", "h")
            alts = data.get("alternates", [])
            for i, a in enumerate(alts, 1):
                put(f"{i}.  {a.get('brand', '')} {a.get('name', '')}".rstrip())
                if a.get("reason"):
                    put(f"     {a['reason']}", "dim")
            put("제목·설명·핀 댓글은 위의 [업로드 문구] 탭에서 버튼으로 복사합니다.", "dim")

            def copy_row(label, text, what, show=None):
                t_up.insert("end", " ", "copy")
                t_up.window_create("end", window=ttk.Button(t_up, text="복사", width=5, style="Small.Soft.TButton",
                                                            command=lambda: copy_text(text, what)))
                t_up.insert("end", f"  {label}\n", "copy")
                if show:
                    t_up.insert("end", show.rstrip() + "\n", "quote")

            up("제목 — 후킹 순서대로 3개", "h")
            for i, c in enumerate(data.get("combos", [])):
                rank = "1순위" if i == 0 else f"대안 {i}"
                copy_row(f"{rank}   {c.get('title', '')}", c.get("title", ""), f"제목 {rank}")
                up(f"화면 상단·썸네일 문구:  {' / '.join(c.get('top', []))}")
            if data.get("description"):
                up("설명", "h")
                copy_row("설명 전체", data["description"], "설명", data["description"])
                up("핀 댓글", "h")
                copy_row("핀 댓글 전체", data.get("pin_comment", ""), "핀 댓글", data.get("pin_comment", ""))
            else:
                up("이 버전은 예전 방식으로 만들어 설명·핀 댓글 복사가 없습니다. 한 번 더 [만들기] 하면 생깁니다.")
            put("만든 파일", "h")
            put("  ·  ".join(data.get("files", [])), "dim")
            if not alts:
                put("(후보가 없습니다)", "dim")
                ttk.Label(alt_box, text="후보가 없습니다.", style="Sub.TLabel").pack(anchor="w")
            for a in alts if latest else []:
                pname = f"{a.get('brand', '')} {a.get('name', '')}".strip()

                def remake(pname=pname):
                    if messagebox.askyesno("다시 만들기", f"'{pname}' 로 제품 선정부터 다시 만듭니다.\n"
                                           "지금 결과 파일은 그대로 남습니다. 계속할까요?"):
                        v_product.set(pname)
                        run()
                ttk.Button(alt_box, text=f"{pname} (으)로 다시 만들기", command=remake).pack(side="left", padx=(0, 8))
        if data and "plain" not in data and not latest:
            ttk.Label(alt_box, text="이전 버전을 보고 있습니다. 다시 만들기는 최신 버전에서 합니다.",
                      style="Sub.TLabel").pack(anchor="w")
        for t in (t_res, t_up):
            t.configure(state="disabled")
            t.yview_moveto(0)

    def on_version(_=None):
        labels = [v["label"] for v in state.get("versions", [])]
        if v_ver.get() in labels:
            show_result(state["name"] or safe_episode(v_name.get()), labels.index(v_ver.get()))

    def notify(title: str, msg: str, ask: bool = False) -> bool:
        """창을 앞으로 가져오고 소리와 함께 알림을 띄운다."""
        try:
            root.deiconify()
            root.lift()
            root.attributes("-topmost", True)
            root.bell()
            if os.name == "nt":
                import ctypes
                import winsound
                winsound.MessageBeep(winsound.MB_ICONASTERISK)
                ctypes.windll.user32.FlashWindow(ctypes.windll.user32.GetParent(root.winfo_id()), True)
        except Exception:
            pass
        try:
            return bool(messagebox.askyesno(title, msg) if ask else messagebox.showinfo(title, msg))
        finally:
            try:
                root.attributes("-topmost", False)
            except Exception:
                pass

    # ---- 여러 편을 동시에 만들기: 편마다 작업 하나, 정한 개수만큼 같이 돌리고 나머지는 차례를 기다린다
    jobs: dict = {}      # 편 이름 → {"proc", "status"(대기·진행·완료·멈춤·중지), "cmd", "revised", "stage", "when"}
    waiting: list = []   # 차례를 기다리는 편 이름

    def is_active(name: str) -> bool:
        return jobs.get(name, {}).get("status") in ("대기", "진행")

    def any_active() -> bool:
        return any(j["status"] in ("대기", "진행") for j in jobs.values())

    def sync_buttons():
        """지금 보고 있는 편이 만드는 중이면 만들기를 잠그고 중지를 연다."""
        on = is_active(state["name"]) or bool(state.get("updating"))
        for b in (b_run, b_fb):
            b.configure(state="disabled" if on else "normal")
        for w in alt_box.winfo_children():
            if isinstance(w, ttk.Button):
                w.configure(state="disabled" if on else "normal")
        b_stop.configure(state="normal" if is_active(state["name"]) else "disabled")
        refresh_jobs()
        refresh_stepper()

    def refresh_stepper():
        """지금 보고 있는 편이 어느 단계인지 그린다."""
        name = state["name"]
        j = jobs.get(name)
        if j and j["status"] in ("대기", "진행"):
            stepper.set(j.get("step", 0), "run")
        elif j and j["status"] == "멈춤":
            stepper.set(j.get("step", 0), "fail")
        elif j and j["status"] == "중지":
            stepper.set(j.get("step", 0), "idle")
        elif name and load_result(name):
            stepper.set(len(STEPS), "done")
        else:
            stepper.set(-1, "idle")

    def refresh_jobs():
        order = {"진행": 0, "대기": 1}
        rows = sorted(jobs.items(), key=lambda kv: (order.get(kv[1]["status"], 2), kv[1]["when"]))
        tree_jobs.delete(*tree_jobs.get_children())
        for name, j in rows:
            tree_jobs.insert("", "end", iid=name, values=(name, j["status"], j["stage"], j["when"]))
        n = sum(1 for j in jobs.values() if j["status"] in ("대기", "진행"))
        nb.tab(tab_jobs, text=f"작업 목록 · {n}개 진행" if n else "작업 목록")

    def start_job(name: str):
        j = jobs[name]
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        try:
            proc = subprocess.Popen(j["cmd"], cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, env=env, creationflags=NO_WINDOW)
        except OSError as e:
            j.update(status="멈춤", stage="실행하지 못함")
            log_to(name, f"[오류] 실행하지 못했습니다: {e}")
            return
        j.update(proc=proc, status="진행", stage="시작")

        def pump():
            for raw in proc.stdout:
                q.put(("line", name, raw.decode("utf-8", "replace")))
            q.put(("done", name, proc.wait()))

        threading.Thread(target=pump, daemon=True).start()

    def pump_queue():
        try:
            limit = max(1, min(4, int(v_par.get())))
        except (tk.TclError, ValueError):
            limit = 2
        while waiting and sum(1 for j in jobs.values() if j["status"] == "진행") < limit:
            start_job(waiting.pop(0))
        sync_buttons()

    def submit(name: str, cmd: list[str], notes: list[str], revised: bool):
        import time
        jobs[name] = {"proc": None, "status": "대기", "cmd": cmd, "revised": revised, "stage": "차례를 기다리는 중",
                      "when": time.strftime("%H:%M:%S"),
                      "step": REDO_STEP.get(cmd[cmd.index("--redo") + 1], 0) if "--redo" in cmd else 0}
        waiting.append(name)
        log_to(name, f"━━ {name} 시작 ({time.strftime('%Y-%m-%d %H:%M')}) ━━")
        for n in notes:
            log_to(name, n)
        pump_queue()
        if jobs[name]["status"] == "대기":
            log_to(name, "앞선 작업이 끝나면 자동으로 시작합니다. (동시에 만드는 개수는 [작업 목록]에서 바꿉니다)")
            v_status.set(f"'{name}' 편은 차례를 기다리는 중입니다. 앞선 작업이 끝나면 자동으로 시작합니다.")
        else:
            v_status.set(f"'{name}' 편을 만들기 시작했습니다. [모두 지우기]를 누르고 다음 영상을 넣어도 됩니다.")

    def finish_job(name: str, code: int):
        j = jobs.get(name)
        if not j:
            return
        stopped = bool(j.get("stopped"))
        j.update(proc=None, status="완료" if code == 0 else "중지" if stopped else "멈춤",
                 stage="완성" if code == 0 else "사용자가 중지" if stopped else j["stage"])
        pump_queue()     # 기다리던 다음 작업을 시작한다
        viewing = name == state["name"]
        if code == 0:
            vers = list_versions(name)
            d = vers[0]["dir"] if vers else None
            what = f"'{name}' 편의 수정본을 만들었습니다 ({d.name})" if j["revised"] and d else f"'{name}' 편을 만들었습니다"
            if viewing:
                v_redo.set("이어서 하기")
                show_result(name)
                nb.select(tab_res)
                fold(True)
                v_status.set(f"완료: '{name}' 편을 만들었습니다. 아래 [결과]를 확인하세요.")
                if notify("완료", f"{what}.\n\n지금 폴더를 열어 영상을 볼까요?\n"
                          "제목·설명·핀 댓글은 [업로드 문구] 탭에서 복사할 수 있습니다.", ask=True):
                    open_out()
            elif notify("완료", f"{what}.\n\n지금 이 작업을 열어 볼까요?", ask=True):
                open_episode(name)
        elif not stopped:
            if viewing:
                v_status.set("중간에 멈췄습니다. [진행 기록]의 빨간 줄을 확인하세요. 고친 뒤 [만들기]를 누르면 이어서 합니다.")
            notify("멈췄습니다", f"'{name}' 편을 만들다가 멈췄습니다.\n그 편의 [진행 기록]에서 빨간 줄을 확인하세요.")
        elif viewing:
            v_status.set(f"'{name}' 편을 중지했습니다. [만들기]를 누르면 멈춘 곳부터 이어서 합니다.")
        sync_buttons()

    def poll():
        dirty = False
        try:
            while True:
                kind, name, val = q.get_nowait()
                if kind == "line":
                    log_to(name, val)
                    line = val.strip()
                    k = step_of(line)
                    if k is not None and name in jobs and jobs[name].get("step") != k:
                        jobs[name]["step"] = k
                        if name == state["name"]:
                            refresh_stepper()
                    if line.startswith("[") and "]" in line and not line.startswith(("[Claude]", "[영상]")):
                        if name in jobs:
                            jobs[name]["stage"] = line[:70]
                            dirty = True
                        if name == state["name"] or not name:
                            v_status.set(line[:150])
                elif kind == "done":
                    finish_job(name, val)
                elif kind == "sysdone":      # 프로그램 업데이트처럼 편과 무관한 일
                    state["updating"] = False
                    v_status.set(val)
                    sync_buttons()
        except queue.Empty:
            pass
        if dirty:
            refresh_jobs()
        root.after(120, poll)

    def run(force_redo: str | None = None):
        video, video2 = v_video.get().strip(), v_video2.get().strip()
        fresh_notes = []
        opened = state["name"]
        if not opened and not video:
            messagebox.showwarning("확인해 주세요", "원본 영상을 골라 주세요.")
            return
        if opened and (ROOT / "input" / opened).is_dir() and video and not inputs_match(opened, video, video2):
            # 연 편에 다른 영상을 넣었다 → 이전 편에 섞지 않고 새 작업으로
            if not messagebox.askyesno("다른 영상입니다", f"지금 넣은 영상은 '{opened}' 편의 영상과 다릅니다.\n\n"
                                       "새 작업으로 만들까요?\n(이전 작업은 [이전 작업 보기]에 그대로 남습니다)"):
                return
            opened = ""
            v_name.set("")
            for w in (t_feedback,):
                set_text(w, "")
            v_redo.set("이어서 하기")
            force_redo = None
        name = safe_episode(v_name.get() or episode_from_video(video))
        if not opened and name and (name in existing_episodes() or unique_episode(name) != name):
            # 새 작업인데 같은 이름의 이전 작업이 있다 → 이전 작업의 분석·설계·영상을 물려받지 않게 새 이름으로
            resume = False
            if not state.get("cleared") and inputs_match(name, video, video2, exact=True):
                ans = messagebox.askyesnocancel(
                    "같은 영상의 이전 작업이 있습니다",
                    f"'{name}' 이라는 이전 작업이 있고, 넣은 영상도 같습니다.\n\n"
                    "[예] 새로 만들기 — 처음부터 다시(새 이름으로)\n[아니요] 이전 작업을 이어서 하기")
                if ans is None:
                    return
                resume = ans is False
            if not resume:
                new = unique_episode(name)
                fresh_notes.append(f"'{name}' 이라는 이전 작업이 있어 새 작업 '{new}' 로 만듭니다. 이전 작업의 내용은 물려받지 않습니다.")
                name = new
        v_name.set(name)
        if is_active(name):
            messagebox.showinfo("만들기", f"'{name}' 편은 이미 만드는 중입니다.")
            return
        try:
            cmd, notes = prepare_episode(name, v_video.get().strip(), v_url.get(), v_inpock.get(), v_product.get(),
                                         t_vidiq.get("1.0", "end"), [v.get() for v in v_img],
                                         force_redo or REDO[v_redo.get()], t_feedback.get("1.0", "end"),
                                         v_video2.get(), v_url2.get())
        except ValueError as e:
            messagebox.showwarning("확인해 주세요", str(e))
            return
        except OSError as e:
            messagebox.showerror("파일을 준비하지 못했습니다", str(e))
            return
        state["name"] = name
        state["cleared"] = False
        notes[:0] = fresh_notes
        ep_now = load_episode(name)       # 편 폴더에 복사된 영상으로 칸을 맞춘다
        v_video.set(ep_now["video"])
        if ep_now["video2"]:
            v_video2.set(ep_now["video2"])
        save_state(last=name)
        cb_name.configure(values=existing_episodes())
        two = bool(v_video2.get().strip())
        if not v_url.get().strip() and not (two and v_url2.get().strip()):
            notes.append("유튜브 링크가 없어 댓글 카드 없이 만듭니다.")
        elif two and not (v_url.get().strip() and v_url2.get().strip()):
            notes.append(f"{'첫' if not v_url.get().strip() else '두 번째'} 영상의 링크가 없어 그 영상의 댓글은 쓰지 않습니다.")
        t_log.configure(state="normal")       # 이 편의 기록 화면으로 바꾼다
        t_log.delete("1.0", "end")
        t_log.configure(state="disabled")
        for ln in read_log_tail(name, 60):
            log_to(name, ln, save=False)
        nb.select(tab_log)
        fold(True)       # 만드는 동안은 입력 칸을 접어 진행 기록을 넓게 보여 준다
        submit(name, cmd, notes, "--redo" in cmd)

    def run_feedback():
        if not t_feedback.get("1.0", "end").strip():
            messagebox.showinfo("수정 요청", "고치고 싶은 점을 먼저 적어 주세요.")
            return
        run("design")

    def kill(name: str):
        j = jobs.get(name)
        if not j or j["status"] not in ("대기", "진행"):
            return
        j["stopped"] = True
        if j["status"] == "대기":
            if name in waiting:
                waiting.remove(name)
            j.update(status="중지", stage="시작 전에 취소")
            log_to(name, "사용자가 취소했습니다.")
            sync_buttons()
            return
        proc = j.get("proc")
        if proc and proc.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True,
                               creationflags=NO_WINDOW)
            else:
                proc.terminate()
            log_to(name, "사용자가 중지했습니다.")

    def stop():
        kill(state["name"])

    def stop_all():
        waiting.clear()
        for name in list(jobs):
            kill(name)

    def open_out():
        name = state["name"] or safe_episode(v_name.get())
        d = state.get("shown")
        if not d or not Path(d).is_dir():
            d = ROOT / "output" / name if name and (ROOT / "output" / name).is_dir() else ROOT / "output"
        if not d.is_dir():
            messagebox.showinfo("결과 폴더", "아직 만든 결과가 없습니다.")
            return
        if os.name == "nt":
            os.startfile(d)  # noqa: S606
        else:
            subprocess.Popen(["xdg-open", str(d)])

    def shortcut():
        try:
            p = make_shortcut()
        except OSError as e:
            messagebox.showerror("아이콘을 만들지 못했습니다", str(e))
            return
        messagebox.showinfo("바탕화면 아이콘", f"만들었습니다:\n{p}\n\n더블클릭하면 이 창이 열립니다. 영상 파일을 아이콘 위에 끌어다 놓아도 됩니다.")

    def update():
        if any_active():
            messagebox.showinfo("프로그램 업데이트", "만드는 중에는 업데이트할 수 없습니다. 작업이 끝난 뒤에 눌러 주세요.")
            return
        if state.get("updating"):
            return
        if not messagebox.askyesno("프로그램 업데이트", "최신 프로그램 파일을 받아 덮어씁니다.\n"
                                   "키(.env)와 만든 편(input, work, output)은 그대로 둡니다. 계속할까요?"):
            return
        state["updating"] = True
        sync_buttons()
        nb.select(tab_log)

        def work():
            try:
                update_program(lambda m: q.put(("line", "", m)))
                q.put(("line", "", "필요한 패키지를 확인합니다…"))
                r = subprocess.run([python_exe(), "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")],
                                   capture_output=True, creationflags=NO_WINDOW)
                if r.returncode != 0:
                    q.put(("line", "", r.stderr.decode("utf-8", "replace")[-800:]))
                q.put(("sysdone", "", "업데이트했습니다. 이 창을 닫고 다시 열어 주세요."))
            except (RuntimeError, OSError, zipfile.BadZipFile) as e:
                q.put(("line", "", f"[오류] {e}"))
                q.put(("sysdone", "", "업데이트하지 못했습니다."))

        threading.Thread(target=work, daemon=True).start()

    def edit_env():
        env = ROOT / ".env"
        if not env.exists() and (ROOT / "env.example").exists():
            shutil.copy2(ROOT / "env.example", env)
        if os.name == "nt":
            subprocess.Popen(["notepad", str(env)])
        else:
            messagebox.showinfo("키 설정", f"이 파일을 편집하세요:\n{env}")

    b_run.configure(command=run)
    b_fb.configure(command=run_feedback)
    b_stop.configure(command=stop)
    b_open.configure(command=open_out)
    cb_ver.bind("<<ComboboxSelected>>", on_version)
    t_feedback.bind("<Control-Return>", lambda e: (run_feedback(), "break")[1])
    for text_, cmd_ in (("프로그램 업데이트", update), ("키 설정(.env)", edit_env), ("바탕화면 아이콘 만들기", shortcut)):
        ttk.Button(foot, text=text_, style="Bg.Ghost.TButton", command=cmd_).pack(side="left", padx=(0, 4))
    ttk.Label(foot, text="막히면 [진행 기록] 탭의 빨간 줄을 확인하세요", style="BgSub.TLabel", font=T.f_small).pack(side="right")

    def remember():
        name = state["name"]
        draft = {} if name else {"cleared": bool(state.get("cleared")),
                                 "video": v_video.get(), "url": v_url.get(), "name": v_name.get(),
                                 "video2": v_video2.get(), "url2": v_url2.get(),
                                 "inpock": v_inpock.get(), "product": v_product.get(),
                                 "vidiq": t_vidiq.get("1.0", "end").strip()}
        try:
            par = int(v_par.get())
        except (tk.TclError, ValueError):
            par = 2
        save_state(last=name, draft=draft, geometry=root.geometry(), parallel=par)

    def on_close():
        n = sum(1 for j in jobs.values() if j["status"] in ("대기", "진행"))
        if n and not messagebox.askyesno("닫기", f"아직 {n}개를 만드는 중입니다. 모두 중지하고 닫을까요?\n"
                                         "(다시 열어 [만들기]를 누르면 멈춘 곳부터 이어서 합니다)"):
            return
        stop_all()
        remember()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    show_result("")
    saved = load_state()
    geo = str(saved.get("geometry") or "")
    m = re.match(r"(\d+)x(\d+)", geo)
    if m and int(m.group(1)) <= sw and int(m.group(2)) <= sh:
        root.geometry(f"{m.group(1)}x{m.group(2)}")
    vids = [a for a in argv if Path(a).suffix.lower() in VIDEO_EXT and Path(a).is_file()]
    if vids:  # 아이콘 위에 영상을 끌어다 놓은 경우: 새 작업으로 시작
        set_video(vids[0])
        if len(vids) > 1:   # 영상 둘을 함께 끌어다 놓으면 두 영상을 섞는 편으로
            v_video2.set(vids[1])
    elif saved.get("last") in existing_episodes():  # 마지막에 하던 작업을 그대로 다시 연다
        open_episode(saved["last"])
    elif existing_episodes() and not saved.get("draft"):
        open_episode(episode_summaries()[0]["name"])
    elif saved.get("draft"):  # 만들기 전에 닫은 입력 내용
        d = saved["draft"]
        state["cleared"] = bool(d.get("cleared"))
        v_video.set(d.get("video", ""))
        v_url.set(d.get("url", ""))
        v_video2.set(d.get("video2", ""))
        v_url2.set(d.get("url2", ""))
        v_name.set(d.get("name", ""))
        v_inpock.set(d.get("inpock", ""))
        v_product.set(d.get("product", ""))
        set_text(t_vidiq, d.get("vidiq", ""))
    if not (ROOT / ".env").exists():
        v_status.set("처음이면 아래 [키 설정(.env)]에서 Claude와 일레븐랩스 키를 넣어 주세요.")

    def new_work():
        """모두 지우기: 창의 모든 칸과 결과·기록 화면을 비워 새 영상을 바로 넣을 수 있게 한다.
        만든 파일은 지우지 않는다(이전 작업은 [이전 작업 보기]에 남는다)."""
        state["name"] = ""
        state["shown"] = None
        state["cleared"] = True       # 이 뒤에 넣는 영상은 늘 새 작업이다(같은 이름의 이전 작업을 이어받지 않는다)
        state["auto_name"] = ""
        for v in (v_video, v_url, v_video2, v_url2, v_name, v_inpock, v_product, v_img[0], v_img[1]):
            v.set("")
        v_redo.set("이어서 하기")
        set_text(t_vidiq, "")
        set_text(t_feedback, "")
        t_log.configure(state="normal")
        t_log.delete("1.0", "end")
        t_log.configure(state="disabled")
        show_result("")
        show_mix(False)
        fold(False)
        nb.select(tab_res)
        cb_name.configure(values=existing_episodes())
        save_state(last="", draft={"cleared": True}, geometry=root.geometry())
        sync_buttons()
        making = sum(1 for j in jobs.values() if j["status"] in ("대기", "진행"))
        v_status.set("모두 지웠습니다. 이제 넣는 영상은 새 작업으로 처음부터 만듭니다. 원본 영상과 링크를 넣고 [만들기]를 누르세요. "
                     + (f"만들고 있던 {making}개는 뒤에서 계속 진행됩니다([작업 목록])." if making
                        else "이전 작업은 [이전 작업 보기]에 그대로 있습니다."))

    poll()
    root.mainloop()


def main():
    if "--update" in sys.argv:
        update_program()
        print("필요한 패키지를 확인합니다…")
        subprocess.run([python_exe(), "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")])
        print(f"바탕화면에 아이콘을 만들었습니다: {make_shortcut()}")
        print("이제 바탕화면의 '쇼츠 만들기'를 더블클릭하세요.")
        return
    if "--shortcut" in sys.argv:
        print(f"바탕화면에 아이콘을 만들었습니다: {make_shortcut()}")
        return
    try:
        run_gui(sys.argv[1:])
    except Exception:  # 창 없는 pythonw 로 열면 오류가 보이지 않으므로 파일과 알림으로 남긴다
        import traceback
        msg = traceback.format_exc()
        (ROOT / "gui_crash.log").write_text(msg, encoding="utf-8")
        try:
            from tkinter import messagebox
            messagebox.showerror("쇼핑 쇼츠 만들기", "창을 여는 중 오류가 났습니다.\n" + msg[-600:])
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
