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


def episode_video(name: str) -> Path | None:
    d = ROOT / "input" / name
    vids = [p for p in d.iterdir() if p.suffix.lower() in VIDEO_EXT] if d.is_dir() else []
    return max(vids, key=lambda p: p.stat().st_size) if vids else None


def load_episode(name: str) -> dict:
    d = ROOT / "input" / name
    info = read_json(d / "info.json", {}) or {}
    def text(fn):
        f = d / fn
        return f.read_text(encoding="utf-8", errors="replace").strip() if f.exists() else ""

    return {"url": info.get("url", ""), "inpock": str(info.get("inpock", "") or ""),
            "product": info.get("product", ""), "vidiq": text("vidiq.txt"), "feedback": text("feedback.txt"),
            "video": str(episode_video(name) or "")}


def python_exe() -> str:
    """창 없는 pythonw 로 열렸어도, 작업은 출력이 나오는 python 으로 돌린다."""
    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe" and exe.with_name("python.exe").exists():
        return str(exe.with_name("python.exe"))
    return str(exe)


def prepare_episode(name: str, video: str, url: str, inpock: str, product: str, vidiq: str,
                    images: list[str], redo: str | None, feedback: str = "") -> tuple[list[str], list[str]]:
    """편 폴더를 채우고 실행할 명령을 돌려준다. 잘못된 입력은 ValueError(사용자에게 보일 말)."""
    name = safe_episode(name)
    if not name:
        raise ValueError("편 이름을 적어 주세요.")
    d = ROOT / "input" / name
    notes = []
    have = episode_video(name)
    if video:
        src = Path(video)
        if not src.is_file():
            raise ValueError(f"원본 영상 파일을 찾을 수 없습니다:\n{src}")
        if src.suffix.lower() not in VIDEO_EXT:
            raise ValueError("원본 영상은 mp4, mkv, mov, webm 파일이어야 합니다.")
        d.mkdir(parents=True, exist_ok=True)
        if have and have.resolve() != src.resolve():
            if have.stat().st_size != src.stat().st_size:
                raise ValueError(f"'{name}' 편에는 이미 다른 영상({have.name})이 들어 있습니다.\n"
                                 "다른 편 이름을 쓰거나, 그 폴더의 영상을 지운 뒤 다시 하세요.")
        elif not have:
            notes.append(f"원본 영상을 input/{name}/ 에 복사합니다: {src.name}")
            shutil.copy2(src, d / src.name)
    elif not have:
        raise ValueError("원본 영상을 골라 주세요.")
    d.mkdir(parents=True, exist_ok=True)

    old = load_episode(name)
    info = read_json(d / "info.json", {}) or {}
    info.update(url=url.strip(), inpock=inpock.strip(), product=product.strip())
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
    if redo is None and analyzed and (old["product"] != product.strip() or old["vidiq"] != vidiq):
        redo = "analyze"
        notes.append("제품명이나 vidIQ 분석이 바뀌어 제품 선정부터 다시 합니다.")
    designed = (ROOT / "work" / name / "plan.json").exists()
    if redo is None and designed and old["feedback"] != feedback:
        redo = "design"
        notes.append("수정 요청이 바뀌어 컷 설계부터 다시 합니다." if feedback else "수정 요청을 지워 컷 설계부터 다시 합니다.")
    if redo is None and analyzed and old["url"] != url.strip() and url.strip():
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
    root.geometry(f"{min(1000, sw - 40)}x{min(920, sh - 90)}+20+10")
    root.minsize(760, 560)

    # 글꼴: 한글이 또렷한 맑은 고딕을 조금 크게
    fam = "맑은 고딕" if "맑은 고딕" in tkfont.families() else tkfont.nametofont("TkDefaultFont").actual("family")
    for nm in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont"):
        tkfont.nametofont(nm).configure(family=fam, size=11)
    F_BODY, F_HEAD, F_TITLE = (fam, 12), (fam, 13, "bold"), (fam, 16, "bold")
    INK, BLUE, RED, AMBER, GRAY = "#1c1c1c", "#0b57d0", "#c5221f", "#a85a00", "#5f6368"
    ttk.Style().configure("Go.TButton", font=(fam, 12, "bold"))

    pad = {"padx": 8, "pady": 3}
    v_video, v_url, v_name = tk.StringVar(), tk.StringVar(), tk.StringVar()
    v_inpock, v_product, v_redo = tk.StringVar(), tk.StringVar(), tk.StringVar(value="이어서 하기")
    v_img = [tk.StringVar(), tk.StringVar()]
    v_status = tk.StringVar(value="원본 영상을 고르고 유튜브 링크를 붙여 넣은 뒤 [만들기]를 누르세요.")
    state = {"proc": None, "name": ""}
    q: queue.Queue = queue.Queue()

    frm = ttk.Frame(root, padding=10)
    frm.pack(fill="both", expand=True)
    frm.columnconfigure(1, weight=1)

    optional = []   # 완료 뒤 접어 두는 선택 입력 줄(인포크·제품명, TTS 이미지, vidIQ)

    def row(r, label, widget, button=None, fold=False):
        lb = ttk.Label(frm, text=label)
        lb.grid(row=r, column=0, sticky="w", **pad)
        widget.grid(row=r, column=1, sticky="ew", **pad)
        if button:
            button.grid(row=r, column=2, sticky="ew", **pad)
        if fold:
            optional.extend([lb, widget])

    def fold(hide: bool):
        for w in optional:
            w.grid_remove() if hide else w.grid()
        b_fold.configure(text="입력 칸 모두 보기 ▼" if hide else "입력 칸 줄이기 ▲")
        state["folded"] = hide

    def pick_video():
        p = filedialog.askopenfilename(title="원본 영상 고르기",
                                       filetypes=[("영상", "*.mp4 *.mkv *.mov *.webm *.m4v"), ("모든 파일", "*.*")])
        if p:
            set_video(p)

    def set_video(p: str):
        v_video.set(p)
        if not v_name.get().strip():
            v_name.set(episode_from_video(p))

    def set_text(widget, text: str):
        widget.delete("1.0", "end")
        widget.insert("1.0", text)

    def open_episode(name: str):
        """편 하나를 창에 불러온다: 입력 내용, 결과, 업로드 문구, 진행 기록."""
        ep = load_episode(name)
        v_name.set(name)
        v_url.set(ep["url"])
        v_inpock.set(ep["inpock"])
        v_product.set(ep["product"])
        v_video.set(ep["video"])
        set_text(t_vidiq, ep["vidiq"])
        set_text(t_feedback, ep["feedback"])
        state["name"] = name
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
        fold(done)
        nb.select(tab_res if done else tab_log)
        v_status.set(f"'{name}' 편을 불러왔습니다. " + ("결과와 업로드 문구를 아래에서 볼 수 있습니다."
                                                 if done else "[만들기]를 누르면 멈춘 곳부터 이어서 합니다."))
        save_state(last=name)

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
        win.geometry(f"760x{min(520, 150 + 30 * len(items))}")
        win.transient(root)
        ttk.Label(win, text="다시 볼 작업을 두 번 누르거나, 고른 뒤 [열기]를 누르세요.", padding=8).pack(anchor="w")
        cols = ("name", "product", "status", "when")
        tree = ttk.Treeview(win, columns=cols, show="headings", selectmode="browse")
        for c, title, w in zip(cols, ("편 이름", "제품", "상태", "마지막 작업"), (170, 270, 180, 110)):
            tree.heading(c, text=title)
            tree.column(c, width=w, anchor="w")
        for e in items:
            tree.insert("", "end", iid=e["name"], values=(e["name"], e["product"], e["status"], e["when"]))
        tree.pack(fill="both", expand=True, padx=8)
        tree.selection_set(items[0]["name"])

        def choose(_=None):
            sel = tree.selection()
            if sel:
                win.destroy()
                if state["proc"]:
                    messagebox.showinfo("이전 작업", "지금 만드는 중입니다. 끝난 뒤에 열어 주세요.")
                else:
                    open_episode(sel[0])

        tree.bind("<Double-1>", choose)
        tree.bind("<Return>", choose)
        bar2 = ttk.Frame(win, padding=8)
        bar2.pack(fill="x")
        ttk.Button(bar2, text="열기", style="Go.TButton", command=choose).pack(side="right")
        ttk.Button(bar2, text="닫기", command=win.destroy).pack(side="right", padx=8)
        state["prev_win"] = win

    row(0, "원본 영상", ttk.Entry(frm, textvariable=v_video), ttk.Button(frm, text="파일 고르기", command=pick_video))
    row(1, "유튜브 링크", ttk.Entry(frm, textvariable=v_url))
    cb_name = ttk.Combobox(frm, textvariable=v_name, values=existing_episodes())
    cb_name.bind("<<ComboboxSelected>>", on_episode)
    cb_name.bind("<FocusOut>", on_episode)
    row(2, "편 이름", cb_name, ttk.Button(frm, text="이전 작업 보기", command=pick_previous))
    sub = ttk.Frame(frm)
    sub.columnconfigure(3, weight=1)
    ttk.Entry(sub, textvariable=v_inpock, width=12).grid(row=0, column=0, sticky="w")
    ttk.Label(sub, text="    제품명(정했을 때만)").grid(row=0, column=2, sticky="e")
    ttk.Entry(sub, textvariable=v_product).grid(row=0, column=3, sticky="ew", padx=(8, 0))
    row(3, "인포크 번호", sub, fold=True)

    imgs = ttk.Frame(frm)
    for i in range(2):
        def pick(i=i):
            p = filedialog.askopenfilename(title=f"TTS 이미지 {i + 1}",
                                           filetypes=[("이미지", "*.jpg *.jpeg *.png *.webp")])
            if p:
                v_img[i].set(p)
        ttk.Button(imgs, text=f"이미지 {i + 1} 고르기", command=pick).grid(row=0, column=i * 2, padx=(0, 6))
        ttk.Label(imgs, textvariable=v_img[i], width=26, foreground=GRAY).grid(row=0, column=i * 2 + 1, padx=(0, 12))
    row(4, "TTS 이미지(선택)", imgs, fold=True)

    def copy_question():
        url = v_url.get().strip()
        if not url:
            messagebox.showinfo("vidIQ 질문", "먼저 유튜브 링크를 붙여 넣어 주세요.")
            return
        from pipeline.prompts import vidiq_question  # 가벼운 모듈만 읽는다
        root.clipboard_clear()
        root.clipboard_append(vidiq_question(url))
        v_status.set("vidIQ 질문을 복사했습니다. Claude 앱에 붙여 넣고, 받은 답을 vidIQ 칸에 붙여 넣으세요.")

    head = ttk.Frame(frm)
    ttk.Label(head, text="vidIQ 분석 붙여 넣기(선택) — 제품 선정과 후킹 장면 판단에 함께 씁니다").pack(side="left")
    ttk.Button(head, text="vidIQ 질문 복사", command=copy_question).pack(side="right")
    head.grid(row=5, column=0, columnspan=3, sticky="ew", **pad)
    t_vidiq = tk.Text(frm, height=3, wrap="word", undo=True, font=(fam, 11), foreground=INK, background="white")
    t_vidiq.grid(row=6, column=0, columnspan=3, sticky="ew", **pad)
    optional.extend([head, t_vidiq])

    bar = ttk.Frame(frm)
    bar.grid(row=7, column=0, columnspan=3, sticky="ew", **pad)
    ttk.Combobox(bar, textvariable=v_redo, values=list(REDO), state="readonly", width=18).pack(side="left")
    b_run = ttk.Button(bar, text="만들기", style="Go.TButton")
    b_run.pack(side="left", padx=8)
    b_stop = ttk.Button(bar, text="중지", state="disabled")
    b_stop.pack(side="left")
    b_open = ttk.Button(bar, text="결과 폴더 열기")
    b_open.pack(side="left", padx=8)
    b_fold = ttk.Button(bar, text="입력 칸 줄이기 ▲", command=lambda: fold(not state.get("folded")))
    b_fold.pack(side="right")

    def open_preview():
        """글자체를 고르고 앱(쇼츠·틱톡·릴스)에서 보일 모습을 확인하는 창."""
        try:
            import preview_gui
        except Exception as e:
            messagebox.showerror("미리보기", f"미리보기 창을 열지 못했습니다.\n{e}\n\n[프로그램 업데이트]를 한 번 눌러 보세요.")
            return
        name = state["name"] or safe_episode(v_name.get())
        state["preview_win"] = preview_gui.open_window(root, name, fam, lambda: run("render"))

    ttk.Button(bar, text="미리보기 · 글자체", command=open_preview).pack(side="right", padx=8)
    ttk.Label(frm, textvariable=v_status, foreground=BLUE, font=(fam, 12, "bold"), wraplength=940,
              justify="left").grid(row=8, column=0, columnspan=3, sticky="w", **pad)

    # ---- 아래쪽: [결과] 와 [진행 기록] 두 장
    ver_bar = ttk.Frame(frm)
    ver_bar.grid(row=9, column=0, columnspan=3, sticky="ew", **pad)
    ttk.Label(ver_bar, text="버전").pack(side="left")
    v_ver = tk.StringVar()
    cb_ver = ttk.Combobox(ver_bar, textvariable=v_ver, state="readonly", width=44)
    cb_ver.pack(side="left", padx=8)
    b_ver = ttk.Button(ver_bar, text="이 버전 폴더 열기")
    b_ver.pack(side="left")
    ttk.Label(ver_bar, text="   다시 만들 때마다 새 버전으로 남습니다", foreground=GRAY).pack(side="left")
    nb = ttk.Notebook(frm)
    nb.grid(row=10, column=0, columnspan=3, sticky="nsew", **pad)
    frm.rowconfigure(10, weight=1)

    def text_pane(parent, **kw):
        box = ttk.Frame(parent)
        t = tk.Text(box, wrap="word", state="disabled", background="white", foreground=INK, font=F_BODY,
                    padx=14, pady=10, spacing1=2, spacing3=4, relief="flat", **kw)
        sb = ttk.Scrollbar(box, command=t.yview)
        t.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        t.pack(side="left", fill="both", expand=True)
        return box, t

    tab_res = ttk.Frame(nb)
    tab_res.rowconfigure(1, weight=1)
    tab_res.columnconfigure(0, weight=1)
    box_res, t_res = text_pane(tab_res, height=10)
    box_res.grid(row=1, column=0, sticky="nsew")
    t_res.tag_configure("title", font=F_TITLE, foreground=INK, spacing3=8)
    t_res.tag_configure("h", font=F_HEAD, foreground=BLUE, spacing1=10, spacing3=4)
    t_res.tag_configure("item", lmargin1=18, lmargin2=34)
    t_res.tag_configure("warn", lmargin1=18, lmargin2=34, foreground=RED)
    t_res.tag_configure("soft", lmargin1=18, lmargin2=34, foreground=AMBER)
    t_res.tag_configure("dim", lmargin1=18, lmargin2=34, foreground=GRAY)

    alt_box = ttk.LabelFrame(tab_res, text="차순위 후보로 다시 만들기 (제품 태그 검색이 안 될 때)", padding=6)
    alt_box.grid(row=2, column=0, sticky="ew", pady=(6, 0))
    fb_box = ttk.LabelFrame(tab_res, text="수정 요청 — 고칠 점을 적고 버튼(또는 Ctrl+Enter)을 누르면 수정본을 새 버전으로 만듭니다",
                            padding=6)
    fb_box.grid(row=3, column=0, sticky="ew", pady=(6, 0))
    fb_box.columnconfigure(0, weight=1)
    t_feedback = tk.Text(fb_box, height=2, wrap="word", undo=True, font=(fam, 11), foreground=INK, background="white")
    t_feedback.grid(row=0, column=0, sticky="ew")
    b_fb = ttk.Button(fb_box, text="수정 요청 반영해서\n다시 만들기")
    b_fb.grid(row=0, column=1, sticky="ns", padx=(8, 0))

    tab_up = ttk.Frame(nb)
    box_up, t_up = text_pane(tab_up, height=10)
    box_up.pack(fill="both", expand=True)
    t_up.tag_configure("h", font=F_HEAD, foreground=BLUE, spacing1=10, spacing3=4)
    t_up.tag_configure("copy", lmargin1=8, lmargin2=8, spacing1=8)
    t_up.tag_configure("quote", lmargin1=84, lmargin2=84, foreground=INK, background="#f3f6fc")
    t_up.tag_configure("dim", lmargin1=84, lmargin2=84, foreground=GRAY)

    tab_log = ttk.Frame(nb)
    box_log, t_log = text_pane(tab_log, height=10)
    box_log.pack(fill="both", expand=True)
    t_log.configure(font=(fam, 11), spacing1=0, spacing3=1)
    t_log.tag_configure("err", foreground=RED, font=(fam, 11, "bold"))
    t_log.tag_configure("warn", foreground=AMBER)
    t_log.tag_configure("stage", foreground=BLUE)
    t_log.tag_configure("head", font=(fam, 12, "bold"), spacing1=8)
    t_log.tag_configure("dim", foreground=GRAY)
    nb.add(tab_res, text="  결과  ")
    nb.add(tab_up, text="  업로드 문구 복사  ")
    nb.add(tab_log, text="  진행 기록  ")

    foot = ttk.Frame(frm)
    foot.grid(row=11, column=0, columnspan=3, sticky="ew", **pad)

    def log(msg: str, save: bool = True):
        line = msg.rstrip("\n")
        if save and state["name"]:
            try:
                p = log_file(state["name"])
                p.parent.mkdir(parents=True, exist_ok=True)
                with open(p, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except OSError:
                pass
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
            ttk.Label(alt_box, text="결과가 나오면 후보가 여기에 표시됩니다.", foreground=GRAY).pack(anchor="w")
        elif "plain" in data:
            put(data["plain"], "")
            up("이 버전은 예전 방식으로 만들어 복사 버튼이 없습니다. 한 번 더 [만들기] 하면 생깁니다.")
            ttk.Label(alt_box, text="이 편을 한 번 더 [만들기] 하면 후보 버튼이 표시됩니다.", foreground=GRAY).pack(anchor="w")
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
            put("차순위 제품 후보", "h")
            alts = data.get("alternates", [])
            for i, a in enumerate(alts, 1):
                put(f"{i}.  {a.get('brand', '')} {a.get('name', '')}".rstrip())
                if a.get("reason"):
                    put(f"     {a['reason']}", "dim")
            put("제목·설명·핀 댓글은 위의 [업로드 문구 복사] 장에서 버튼으로 복사합니다.", "dim")

            def copy_row(label, text, what, show=None):
                t_up.insert("end", " ", "copy")
                t_up.window_create("end", window=ttk.Button(t_up, text="복사", width=6,
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
                ttk.Label(alt_box, text="후보가 없습니다.", foreground=GRAY).pack(anchor="w")
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
                      foreground=GRAY).pack(anchor="w")
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

    def busy(on: bool):
        for b in (b_run, b_fb):
            b.configure(state="disabled" if on else "normal")
        for w in alt_box.winfo_children():
            if isinstance(w, ttk.Button):
                w.configure(state="disabled" if on else "normal")
        b_stop.configure(state="normal" if on else "disabled")

    def start_process(cmd: list[str], done_msg: str, fail_msg: str, after=None):
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        try:
            proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, env=env, creationflags=NO_WINDOW)
        except OSError as e:
            messagebox.showerror("실행 실패", str(e))
            return
        state["proc"] = proc
        busy(True)

        def pump():
            for raw in proc.stdout:
                q.put(("line", raw.decode("utf-8", "replace")))
            q.put(("done", (proc.wait(), done_msg, fail_msg, after)))

        threading.Thread(target=pump, daemon=True).start()

    def poll():
        try:
            while True:
                kind, val = q.get_nowait()
                if kind == "line":
                    log(val)
                    line = val.strip()
                    if line.startswith("[") and "]" in line and not line.startswith("[Claude]"):
                        v_status.set(line[:150])
                elif kind == "done":
                    code, done_msg, fail_msg, after = val
                    state["proc"] = None
                    busy(False)
                    v_status.set(done_msg if code == 0 else fail_msg)
                    if after:
                        after(code)
        except queue.Empty:
            pass
        root.after(120, poll)

    def run(force_redo: str | None = None):
        if state["proc"]:
            return
        name = safe_episode(v_name.get() or episode_from_video(v_video.get()))
        v_name.set(name)
        try:
            cmd, notes = prepare_episode(name, v_video.get().strip(), v_url.get(), v_inpock.get(), v_product.get(),
                                         t_vidiq.get("1.0", "end"), [v.get() for v in v_img],
                                         force_redo or REDO[v_redo.get()], t_feedback.get("1.0", "end"))
        except ValueError as e:
            messagebox.showwarning("확인해 주세요", str(e))
            return
        except OSError as e:
            messagebox.showerror("파일을 준비하지 못했습니다", str(e))
            return
        state["name"] = name
        save_state(last=name)
        cb_name.configure(values=existing_episodes())
        if not v_url.get().strip():
            notes.append("유튜브 링크가 없어 댓글 카드 없이 만듭니다.")
        import time
        log(f"━━ {name} 시작 ({time.strftime('%Y-%m-%d %H:%M')}) ━━")
        for n in notes:
            log(n)
        nb.select(tab_log)

        revised = "--redo" in cmd

        def after(code):
            v_redo.set("이어서 하기")
            if code == 0:
                show_result(name)
                nb.select(tab_res)
                fold(True)
                d = state.get("shown")
                what = f"수정본을 만들었습니다 ({d.name})" if revised and d else f"'{name}' 편을 만들었습니다"
                if notify("완료", f"{what}.\n\n지금 폴더를 열어 영상을 볼까요?\n"
                          "제목·설명·핀 댓글은 [결과]에서 [복사]로 가져갈 수 있습니다.", ask=True):
                    open_out()
            else:
                notify("멈췄습니다", f"'{name}' 편을 만들다가 멈췄습니다.\n[진행 기록]의 빨간 줄을 확인하세요.")

        start_process(cmd, f"완료: '{name}' 편을 만들었습니다. 아래 [결과]를 확인하세요.",
                      "중간에 멈췄습니다. [진행 기록]의 빨간 줄을 확인하세요. 고친 뒤 [만들기]를 누르면 이어서 합니다.", after)

    def run_feedback():
        if not t_feedback.get("1.0", "end").strip():
            messagebox.showinfo("수정 요청", "고치고 싶은 점을 먼저 적어 주세요.")
            return
        run("design")

    def stop():
        proc = state["proc"]
        if proc and proc.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True,
                               creationflags=NO_WINDOW)
            else:
                proc.terminate()
            log("사용자가 중지했습니다.")

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
        if state["proc"]:
            return
        if not messagebox.askyesno("프로그램 업데이트", "최신 프로그램 파일을 받아 덮어씁니다.\n"
                                   "키(.env)와 만든 편(input, work, output)은 그대로 둡니다. 계속할까요?"):
            return
        busy(True)
        nb.select(tab_log)

        def work():
            try:
                update_program(lambda m: q.put(("line", m)))
                q.put(("line", "필요한 패키지를 확인합니다…"))
                r = subprocess.run([python_exe(), "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")],
                                   capture_output=True, creationflags=NO_WINDOW)
                if r.returncode != 0:
                    q.put(("line", r.stderr.decode("utf-8", "replace")[-800:]))
                q.put(("done", (0, "업데이트했습니다. 이 창을 닫고 다시 열어 주세요.", "", None)))
            except (RuntimeError, OSError, zipfile.BadZipFile) as e:
                q.put(("line", f"[오류] {e}"))
                q.put(("done", (1, "", "업데이트하지 못했습니다.", None)))

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
    b_ver.configure(command=open_out)
    cb_ver.bind("<<ComboboxSelected>>", on_version)
    t_feedback.bind("<Control-Return>", lambda e: (run_feedback(), "break")[1])
    ttk.Button(foot, text="바탕화면 아이콘 만들기", command=shortcut).pack(side="left")
    ttk.Button(foot, text="키 설정(.env)", command=edit_env).pack(side="left", padx=8)
    ttk.Button(foot, text="프로그램 업데이트", command=update).pack(side="left")

    def remember():
        name = state["name"]
        draft = {} if name else {"video": v_video.get(), "url": v_url.get(), "name": v_name.get(),
                                 "inpock": v_inpock.get(), "product": v_product.get(),
                                 "vidiq": t_vidiq.get("1.0", "end").strip()}
        save_state(last=name, draft=draft, geometry=root.geometry())

    def on_close():
        if state["proc"] and not messagebox.askyesno("닫기", "아직 만드는 중입니다. 중지하고 닫을까요?\n"
                                                    "(다시 열어 [만들기]를 누르면 멈춘 곳부터 이어서 합니다)"):
            return
        stop()
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
    elif saved.get("last") in existing_episodes():  # 마지막에 하던 작업을 그대로 다시 연다
        open_episode(saved["last"])
    elif existing_episodes() and not saved.get("draft"):
        open_episode(episode_summaries()[0]["name"])
    elif saved.get("draft"):  # 만들기 전에 닫은 입력 내용
        d = saved["draft"]
        v_video.set(d.get("video", ""))
        v_url.set(d.get("url", ""))
        v_name.set(d.get("name", ""))
        v_inpock.set(d.get("inpock", ""))
        v_product.set(d.get("product", ""))
        set_text(t_vidiq, d.get("vidiq", ""))
    if not (ROOT / ".env").exists():
        v_status.set("처음이면 아래 [키 설정(.env)]에서 Claude와 일레븐랩스 키를 넣어 주세요.")

    def new_work():
        """입력 칸을 비워 새 영상으로 시작한다(이전 작업은 [이전 작업 보기]에 남는다)."""
        if state["proc"]:
            return
        state["name"] = ""
        for v in (v_video, v_url, v_name, v_inpock, v_product, v_img[0], v_img[1]):
            v.set("")
        set_text(t_vidiq, "")
        set_text(t_feedback, "")
        t_log.configure(state="normal")
        t_log.delete("1.0", "end")
        t_log.configure(state="disabled")
        show_result("")
        fold(False)
        v_status.set("새 작업: 원본 영상을 고르고 유튜브 링크를 붙여 넣은 뒤 [만들기]를 누르세요.")

    ttk.Button(foot, text="새 작업", command=new_work).pack(side="right")
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
