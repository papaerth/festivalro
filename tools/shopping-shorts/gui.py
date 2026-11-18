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
    v = d / "vidiq.txt"
    return {"url": info.get("url", ""), "inpock": str(info.get("inpock", "") or ""),
            "product": info.get("product", ""),
            "vidiq": v.read_text(encoding="utf-8", errors="replace").strip() if v.exists() else "",
            "video": str(episode_video(name) or "")}


def python_exe() -> str:
    """창 없는 pythonw 로 열렸어도, 작업은 출력이 나오는 python 으로 돌린다."""
    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe" and exe.with_name("python.exe").exists():
        return str(exe.with_name("python.exe"))
    return str(exe)


def prepare_episode(name: str, video: str, url: str, inpock: str, product: str, vidiq: str,
                    images: list[str], redo: str | None) -> tuple[list[str], list[str]]:
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
    if redo is None and analyzed and old["url"] != url.strip() and url.strip():
        notes.append("유튜브 링크가 바뀌었습니다. 댓글을 새로 가져오려면 '제품 선정부터 다시'가 아니라 편 이름을 새로 지으세요.")
    cmd = [python_exe(), "-X", "utf8", "-u", str(ROOT / "shorts.py"), "auto", name]
    if redo:
        cmd += ["--redo", redo]
    return cmd, notes


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

    root = tk.Tk()
    root.title("쇼핑 쇼츠 만들기")
    root.geometry("860x820")
    root.minsize(720, 640)
    pad = {"padx": 8, "pady": 4}
    v_video, v_url, v_name = tk.StringVar(), tk.StringVar(), tk.StringVar()
    v_inpock, v_product, v_redo = tk.StringVar(), tk.StringVar(), tk.StringVar(value="이어서 하기")
    v_img = [tk.StringVar(), tk.StringVar()]
    v_status = tk.StringVar(value="원본 영상을 고르고 유튜브 링크를 붙여 넣은 뒤 [만들기]를 누르세요.")
    state = {"proc": None, "name": ""}
    q: queue.Queue = queue.Queue()

    frm = ttk.Frame(root, padding=10)
    frm.pack(fill="both", expand=True)
    frm.columnconfigure(1, weight=1)

    def row(r, label, widget, button=None):
        ttk.Label(frm, text=label).grid(row=r, column=0, sticky="w", **pad)
        widget.grid(row=r, column=1, sticky="ew", **pad)
        if button:
            button.grid(row=r, column=2, sticky="ew", **pad)

    def pick_video():
        p = filedialog.askopenfilename(title="원본 영상 고르기",
                                       filetypes=[("영상", "*.mp4 *.mkv *.mov *.webm *.m4v"), ("모든 파일", "*.*")])
        if p:
            set_video(p)

    def set_video(p: str):
        v_video.set(p)
        if not v_name.get().strip():
            v_name.set(episode_from_video(p))

    def on_episode(_=None):
        name = safe_episode(v_name.get())
        if name in existing_episodes():
            ep = load_episode(name)
            v_url.set(ep["url"])
            v_inpock.set(ep["inpock"])
            v_product.set(ep["product"])
            if ep["video"]:
                v_video.set(ep["video"])
            t_vidiq.delete("1.0", "end")
            t_vidiq.insert("1.0", ep["vidiq"])
            v_status.set(f"'{name}' 편을 불러왔습니다. 그대로 [만들기]를 누르면 이어서 합니다.")

    row(0, "원본 영상", ttk.Entry(frm, textvariable=v_video), ttk.Button(frm, text="파일 고르기", command=pick_video))
    row(1, "유튜브 링크", ttk.Entry(frm, textvariable=v_url))
    cb_name = ttk.Combobox(frm, textvariable=v_name, values=existing_episodes())
    cb_name.bind("<<ComboboxSelected>>", on_episode)
    cb_name.bind("<FocusOut>", on_episode)
    row(2, "편 이름", cb_name)
    sub = ttk.Frame(frm)
    sub.columnconfigure(1, weight=1)
    sub.columnconfigure(3, weight=2)
    ttk.Entry(sub, textvariable=v_inpock, width=12).grid(row=0, column=0, sticky="w")
    ttk.Label(sub, text="   제품명(정했을 때만)").grid(row=0, column=2, sticky="e")
    ttk.Entry(sub, textvariable=v_product).grid(row=0, column=3, sticky="ew", padx=(8, 0))
    row(3, "인포크 번호", sub)

    imgs = ttk.Frame(frm)
    for i in range(2):
        def pick(i=i):
            p = filedialog.askopenfilename(title=f"TTS 이미지 {i + 1}",
                                           filetypes=[("이미지", "*.jpg *.jpeg *.png *.webp")])
            if p:
                v_img[i].set(p)
        ttk.Button(imgs, text=f"이미지 {i + 1} 고르기", command=pick).grid(row=0, column=i * 2, padx=(0, 6))
        ttk.Label(imgs, textvariable=v_img[i], width=28).grid(row=0, column=i * 2 + 1, padx=(0, 12))
    row(4, "TTS 이미지(선택)", imgs)

    def copy_question():
        url = v_url.get().strip()
        if not url:
            messagebox.showinfo("vidIQ 질문", "먼저 유튜브 링크를 붙여 넣어 주세요.")
            return
        from pipeline.prompts import vidiq_question  # 가벼운 모듈만 읽는다
        root.clipboard_clear()
        root.clipboard_append(vidiq_question(url))
        v_status.set("vidIQ 질문을 복사했습니다. Claude 앱에 붙여 넣고, 받은 답을 아래 칸에 붙여 넣으세요.")

    head = ttk.Frame(frm)
    ttk.Label(head, text="vidIQ 분석 붙여 넣기(선택) — 제품 선정과 후킹 장면 판단에 함께 씁니다").pack(side="left")
    ttk.Button(head, text="vidIQ 질문 복사", command=copy_question).pack(side="right")
    head.grid(row=5, column=0, columnspan=3, sticky="ew", **pad)
    t_vidiq = tk.Text(frm, height=6, wrap="word", undo=True)
    t_vidiq.grid(row=6, column=0, columnspan=3, sticky="ew", **pad)

    bar = ttk.Frame(frm)
    bar.grid(row=7, column=0, columnspan=3, sticky="ew", **pad)
    ttk.Combobox(bar, textvariable=v_redo, values=list(REDO), state="readonly", width=18).pack(side="left")
    b_run = ttk.Button(bar, text="만들기")
    b_run.pack(side="left", padx=8)
    b_stop = ttk.Button(bar, text="중지", state="disabled")
    b_stop.pack(side="left")
    b_open = ttk.Button(bar, text="결과 폴더 열기", state="disabled")
    b_open.pack(side="left", padx=8)
    ttk.Label(frm, textvariable=v_status, foreground="#1a5fb4", wraplength=820, justify="left").grid(
        row=8, column=0, columnspan=3, sticky="w", **pad)

    logf = ttk.Frame(frm)
    logf.grid(row=9, column=0, columnspan=3, sticky="nsew", **pad)
    frm.rowconfigure(9, weight=1)
    t_log = tk.Text(logf, height=14, wrap="word", state="disabled", background="#111", foreground="#ddd")
    sb = ttk.Scrollbar(logf, command=t_log.yview)
    t_log.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    t_log.pack(side="left", fill="both", expand=True)

    foot = ttk.Frame(frm)
    foot.grid(row=10, column=0, columnspan=3, sticky="ew", **pad)

    def log(msg: str):
        t_log.configure(state="normal")
        t_log.insert("end", msg.rstrip("\n") + "\n")
        t_log.see("end")
        t_log.configure(state="disabled")

    def busy(on: bool):
        b_run.configure(state="disabled" if on else "normal")
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
                    if line.startswith("[") and "]" in line:
                        v_status.set(line)
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

    def out_dir() -> Path:
        return ROOT / "output" / state["name"]

    def run():
        name = safe_episode(v_name.get() or episode_from_video(v_video.get()))
        v_name.set(name)
        try:
            cmd, notes = prepare_episode(name, v_video.get().strip(), v_url.get(), v_inpock.get(), v_product.get(),
                                         t_vidiq.get("1.0", "end"), [v.get() for v in v_img], REDO[v_redo.get()])
        except ValueError as e:
            messagebox.showwarning("확인해 주세요", str(e))
            return
        except OSError as e:
            messagebox.showerror("파일을 준비하지 못했습니다", str(e))
            return
        state["name"] = name
        cb_name.configure(values=existing_episodes())
        if not v_url.get().strip():
            notes.append("유튜브 링크가 없어 댓글 카드 없이 만듭니다.")
        log(f"━━ {name} 시작 ━━")
        for n in notes:
            log(n)
        b_open.configure(state="disabled")

        def after(code):
            v_redo.set("이어서 하기")
            if out_dir().is_dir():
                b_open.configure(state="normal")
            if code == 0:
                messagebox.showinfo("완료", f"'{name}' 편을 만들었습니다.\n[결과 폴더 열기]로 확인하세요.")

        start_process(cmd, f"완료: output/{name}/ 에 완성본이 있습니다.",
                      "중간에 멈췄습니다. 아래 기록의 [오류] 줄을 확인하세요. 고친 뒤 [만들기]를 누르면 이어서 합니다.", after)

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
        d = out_dir() if state["name"] else ROOT / "output"
        if not d.is_dir():
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
    b_stop.configure(command=stop)
    b_open.configure(command=open_out)
    ttk.Button(foot, text="바탕화면 아이콘 만들기", command=shortcut).pack(side="left")
    ttk.Button(foot, text="키 설정(.env)", command=edit_env).pack(side="left", padx=8)
    ttk.Button(foot, text="프로그램 업데이트", command=update).pack(side="left")

    def on_close():
        if state["proc"] and not messagebox.askyesno("닫기", "아직 만드는 중입니다. 중지하고 닫을까요?"):
            return
        stop()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    vids = [a for a in argv if Path(a).suffix.lower() in VIDEO_EXT and Path(a).is_file()]
    if vids:  # 아이콘 위에 영상을 끌어다 놓은 경우
        set_video(vids[0])
    if not (ROOT / ".env").exists():
        v_status.set("처음이면 아래 [키 설정(.env)]에서 Claude와 일레븐랩스 키를 넣어 주세요.")
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
