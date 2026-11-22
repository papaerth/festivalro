"""미리보기 창: 썸네일 문구·자막 글자체를 골라 보고, 앱(쇼츠·틱톡·릴스) 안에서 어떻게 보일지 확인한다.

gui.py 가 버튼을 누를 때 불러온다. 실제 렌더링과 같은 그리기 코드(pipeline/build.py)를 쓴다.
"""
from __future__ import annotations

import base64
import copy
import io
import json
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SETTINGS = ROOT / "settings.json"
DEFAULT_NAME = "기본 글자체"
SAMPLE_PLAN = {
    "title": ["화장 다 떴을 때", "덧바르지 마세요"],
    "source_text": "출처 : 유튜브 '채널 이름'",
    "timeline": [{"type": "cut", "a": 0, "b": 3, "x0": 0,
                  "subs": [{"t": 0, "text": "그 건조한 부분을"}, {"t": 1, "text": "없어요!", "em": True}]}],
    "cards": [{"seg": 0, "text": "와 이거 진짜 저만 몰랐나요 ㅋㅋㅋ 바로 따라 해봄", "likes": "1.2천", "heart": True, "pos": "top"}],
}


def read_settings() -> dict:
    try:
        return json.loads(SETTINGS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_settings(st: dict):
    SETTINGS.write_text(json.dumps({k: v for k, v in st.items() if v}, ensure_ascii=False, indent=2), encoding="utf-8")


def scenes_of(plan: dict) -> list[tuple[str, dict]]:
    """고를 수 있는 장면 목록 [(보일 이름, scene)]."""
    out = [("썸네일", {"thumb": True})]
    for i, seg in enumerate(plan.get("timeline") or []):
        if seg.get("type") == "cut":
            for k, sb in enumerate(seg.get("subs") or []):
                out.append((f"{i + 1}. {sb.get('text', '')}" + ("  (강조)" if sb.get("em") else ""), {"seg": i, "sub": k}))
        else:
            out.append((f"{i + 1}. [나레이션] {seg.get('text', '')}", {"seg": i, "sub": 0}))
    return out


def render(raw_plan: dict, src, base_dir, scene: dict, st: dict, platform: str, show_card: bool,
           meta=None, cache=None, channel: str = "내 채널"):
    """미리보기 한 장(1080×1920 PIL 이미지)."""
    from pipeline import build, platforms
    plan = build.apply_defaults(copy.deepcopy(raw_plan), st)
    for key in ("font_title", "font_sub"):
        plan[key] = st.get(key) or None
    frame = build.preview_frame(plan, src, base_dir, scene, show_card, meta, cache)
    return platforms.overlay(frame, platform, channel)


def open_window(root, episode: str, fam: str, on_rerender=None):
    import tkinter as tk
    from tkinter import messagebox, ttk
    try:
        from PIL import Image
        from pipeline import fonts, platforms, util
    except Exception as e:  # 그림 부품을 불러오지 못하면 창을 열 수 없다
        messagebox.showerror("미리보기", f"미리보기에 필요한 부품을 불러오지 못했습니다.\n{e}")
        return None

    work, inp = ROOT / "work" / episode, ROOT / "input" / episode
    raw = None
    if episode and (work / "plan.json").exists():
        try:
            raw = json.loads((work / "plan.json").read_text(encoding="utf-8"))
        except ValueError:
            raw = None
    src = None
    if raw and inp.is_dir():
        if any(p.suffix.lower() in util.VIDEO_EXT for p in inp.iterdir()):
            src = util.Episode(episode).sources      # 하나, 또는 두 영상을 섞는 편이면 둘
    has_episode = bool(raw and src)
    if not has_episode:
        raw, src = copy.deepcopy(SAMPLE_PLAN), None
    meta = [util.probe(p) for p in src] if src else None
    cache: dict = {}
    scenes = scenes_of(raw)
    st0 = read_settings()

    win = tk.Toplevel(root)
    win.title("미리보기 · 글자체" + (f" — {episode}" if has_episode else " — 예시 화면"))
    sh = win.winfo_screenheight()
    disp_h = max(480, min(880, sh - 170))
    disp_w = int(disp_h * 9 / 16)
    win.geometry(f"{disp_w + 480}x{max(disp_h + 40, min(sh - 90, 800))}")
    win.transient(root)
    try:      # 본 창과 같은 모양(색·둥근 버튼). 따로 열렸을 때는 여기서 입힌다
        import ui_theme
        if not getattr(root, "_shorts_theme", None):
            root._shorts_theme = ui_theme.apply(root, fam)
        ui_theme.style_toplevel(win)
        UI = ui_theme.C
    except Exception:
        ui_theme, UI = None, {"accent": "#0b57d0", "sub": "#5f6368", "ink": "#1c1c1c", "warn": "#a85a00"}

    left = ttk.Frame(win, padding=(14, 14, 8, 14))
    left.pack(side="left", fill="y")
    canvas = tk.Label(left, background="#16181D", width=disp_w, height=disp_h, borderwidth=0)
    canvas.pack()
    right = ttk.Frame(win, padding=(8, 8, 16, 12))
    right.pack(side="left", fill="both", expand=True)

    v_title_font, v_sub_font = tk.StringVar(value=DEFAULT_NAME), tk.StringVar(value=DEFAULT_NAME)
    v_title_size = tk.IntVar(value=int(st0.get("title_size") or 112))
    v_sub_size = tk.IntVar(value=int(st0.get("sub_size") or 66))
    v_title_bold = tk.BooleanVar(value=bool(st0.get("title_bold")))
    v_sub_bold = tk.BooleanVar(value=bool(st0.get("sub_bold")))
    v_music = tk.StringVar(value=str(st0.get("music_file") or ""))
    v_music_label = tk.StringVar()
    v_volume = tk.IntVar(value=int(round(float(st0.get("music_volume") or 0.15) * 100)))
    v_platform, v_card = tk.StringVar(value=""), tk.BooleanVar(value=False)
    v_note = tk.StringVar(value="글자체 목록을 읽는 중입니다…")
    refs = {DEFAULT_NAME: None}
    job = {"id": None, "img": None}

    bar = ttk.Frame(right)
    bar.pack(side="bottom", fill="x", pady=(6, 0))

    def section(text):
        ttk.Label(right, text=text, font=(fam, 12, "bold"), foreground=UI["accent"]).pack(anchor="w", pady=(10, 3))

    section("볼 장면")
    box = ttk.Frame(right)
    box.pack(fill="x")
    lb = tk.Listbox(box, height=5, exportselection=False, font=(fam, 11), activestyle="none")
    if ui_theme:
        ui_theme.style_listbox(lb)
    sb_ = ttk.Scrollbar(box, command=lb.yview)
    lb.configure(yscrollcommand=sb_.set)
    sb_.pack(side="right", fill="y")
    lb.pack(side="left", fill="x", expand=True)
    for label, _ in scenes:
        lb.insert("end", label)
    lb.selection_set(1 if len(scenes) > 1 else 0)
    ttk.Checkbutton(right, text="댓글 카드도 함께 보기", variable=v_card, command=lambda: schedule()).pack(anchor="w", pady=(4, 0))

    def font_row(title, var_font, var_size, lo, hi, var_bold):
        section(title)
        cb = ttk.Combobox(right, textvariable=var_font, state="readonly", values=[DEFAULT_NAME], height=18)
        cb.pack(fill="x")
        cb.bind("<<ComboboxSelected>>", lambda e: schedule())
        r = ttk.Frame(right)
        r.pack(fill="x", pady=(4, 0))
        ttk.Label(r, text="크기").pack(side="left")
        sp = ttk.Spinbox(r, from_=lo, to=hi, increment=2, textvariable=var_size, width=6, command=lambda: schedule())
        sp.pack(side="left", padx=6)
        sp.bind("<KeyRelease>", lambda e: schedule(400))
        ttk.Checkbutton(r, text="굵게", variable=var_bold, command=lambda: schedule()).pack(side="left", padx=14)
        return cb

    cb_title = font_row("썸네일 문구(화면 상단 제목) 글자체", v_title_font, v_title_size, 60, 150, v_title_bold)
    cb_sub = font_row("자막 글자체", v_sub_font, v_sub_size, 40, 100, v_sub_bold)

    section("앱에서 보이는 모습")
    for key, label in [("", "없음 (완성본 그대로)")] + list(platforms.PLATFORMS.items()):
        ttk.Radiobutton(right, text=label, value=key, variable=v_platform, command=lambda: schedule()).pack(anchor="w")
    ttk.Label(right, text="버튼과 글자가 놓이는 자리를 비슷하게 흉내 낸 것입니다.\n기기와 앱 버전에 따라 조금 다릅니다.",
              foreground=UI["sub"]).pack(anchor="w", pady=(2, 0))

    section("배경 음악")
    ttk.Label(right, text="목소리만 있는 버전 밑에 깔아 '_음악.mp4' 파일을 하나 더 만듭니다.",
              foreground=UI["sub"]).pack(anchor="w")

    def music_label():
        p = v_music.get()
        v_music_label.set(Path(p).name if p else "음악 없음")

    def pick_music():
        from tkinter import filedialog
        p = filedialog.askopenfilename(parent=win, title="음악 파일 고르기",
                                       filetypes=[("음악", "*.mp3 *.wav *.m4a *.aac *.flac *.ogg"), ("모든 파일", "*.*")])
        if p:
            v_music.set(p)
            music_label()

    def no_music():
        v_music.set("")
        music_label()

    def open_library():
        import webbrowser
        webbrowser.open("https://www.youtube.com/audiolibrary")

    def listen():
        p = v_music.get()
        if not p or not Path(p).exists():
            messagebox.showinfo("음악", "먼저 음악 파일을 골라 주세요.", parent=win)
            return
        try:
            import os
            os.startfile(p) if os.name == "nt" else __import__("subprocess").Popen(["xdg-open", p])  # noqa: S606
        except OSError as e:
            messagebox.showerror("음악", str(e), parent=win)

    ttk.Label(right, textvariable=v_music_label, foreground=UI["ink"]).pack(anchor="w")
    m1 = ttk.Frame(right)
    m1.pack(fill="x", pady=(2, 0))
    ttk.Button(m1, text="음악 파일 고르기", command=pick_music).pack(side="left")
    ttk.Button(m1, text="들어 보기", command=listen).pack(side="left", padx=4)
    ttk.Button(m1, text="음악 없음", command=no_music).pack(side="left")
    m2 = ttk.Frame(right)
    m2.pack(fill="x", pady=(4, 0))
    ttk.Label(m2, text="음악 크기").pack(side="left")
    ttk.Scale(m2, from_=3, to=60, variable=v_volume, orient="horizontal", length=150,
              command=lambda v: v_vol_text.set(f"{int(float(v))}%")).pack(side="left", padx=6)
    v_vol_text = tk.StringVar(value=f"{v_volume.get()}%")
    ttk.Label(m2, textvariable=v_vol_text, width=5).pack(side="left")
    ttk.Button(m2, text="유튜브 오디오 보관함 열기", command=open_library).pack(side="right")
    music_label()

    ttk.Label(right, textvariable=v_note, foreground=UI["warn"], wraplength=420, justify="left").pack(anchor="w", pady=(6, 2))

    def current() -> dict:
        def num(v, default):
            try:
                return int(v.get())
            except (tk.TclError, ValueError):
                return default
        return {"font_title": refs.get(v_title_font.get()), "font_title_name": v_title_font.get(),
                "font_sub": refs.get(v_sub_font.get()), "font_sub_name": v_sub_font.get(),
                "title_size": max(40, min(170, num(v_title_size, 112))), "sub_size": max(30, min(120, num(v_sub_size, 66))),
                "title_bold": bool(v_title_bold.get()), "sub_bold": bool(v_sub_bold.get()),
                "music_file": v_music.get().strip(), "music_volume": max(3, min(60, num(v_volume, 15))) / 100}

    def draw():
        job["id"] = None
        sel = lb.curselection()
        scene = scenes[sel[0]][1] if sel else {"thumb": True}
        try:
            frame = render(raw, src, inp, scene, current(), v_platform.get(), v_card.get(), meta, cache,
                           raw.get("channel") or "내 채널")
        except Exception as e:
            v_note.set(f"그리지 못했습니다: {e}")
            return
        buf = io.BytesIO()
        frame.resize((disp_w, disp_h), Image.LANCZOS).save(buf, "PNG")
        job["img"] = tk.PhotoImage(data=base64.b64encode(buf.getvalue()))
        canvas.configure(image=job["img"], width=disp_w, height=disp_h)
        if v_note.get().startswith(("그리지", "그리는")):
            v_note.set("")

    def schedule(delay: int = 120):
        if job["id"]:
            win.after_cancel(job["id"])
        job["id"] = win.after(delay, draw)

    lb.bind("<<ListboxSelect>>", lambda e: schedule())

    def fonts_ready(items):
        if not win.winfo_exists():
            return
        for e in items:
            refs[e["name"]] = e["ref"]
        names = [DEFAULT_NAME] + [e["name"] for e in items]
        cb_title.configure(values=names)
        cb_sub.configure(values=names)
        by_ref = {e["ref"]: e["name"] for e in items}
        v_title_font.set(by_ref.get(st0.get("font_title"), DEFAULT_NAME))
        v_sub_font.set(by_ref.get(st0.get("font_sub"), DEFAULT_NAME))
        v_note.set(f"한글이 되는 글자체 {len(items)}개를 찾았습니다." if has_episode else
                   f"한글이 되는 글자체 {len(items)}개를 찾았습니다. 편을 만든 뒤 열면 실제 장면으로 보입니다.")
        schedule(10)

    found: dict = {}

    def load_fonts():   # 다른 스레드에서는 창을 건드리지 않고 결과만 남긴다
        try:
            found["items"] = fonts.scan()
        except Exception:
            found["items"] = []

    def wait_fonts():
        if not win.winfo_exists():
            return
        if "items" in found:
            fonts_ready(found["items"])
        else:
            win.after(150, wait_fonts)

    def save(then_render: bool):
        st = current()
        keep = dict(read_settings())
        keep.update(st)
        for k in ("font_title", "font_sub"):
            if not st[k]:
                keep.pop(k, None)
                keep.pop(k + "_name", None)
        if not st["music_file"]:
            keep.pop("music_volume", None)
        try:
            write_settings(keep)
        except OSError as e:
            messagebox.showerror("저장하지 못했습니다", str(e), parent=win)
            return
        if then_render and on_rerender:
            win.destroy()
            on_rerender()
        else:
            v_note.set("저장했습니다. 다음에 만드는 영상부터 이 글자체" + ("와 음악으로" if st["music_file"] else "로") + " 나옵니다.")

    def reset():
        v_title_font.set(DEFAULT_NAME)
        v_sub_font.set(DEFAULT_NAME)
        v_title_size.set(112)
        v_sub_size.set(66)
        v_title_bold.set(False)
        v_sub_bold.set(False)
        schedule()

    if has_episode and on_rerender:
        ttk.Button(bar, text="저장하고 이 편을 다시 렌더링", style="Go.TButton",
                   command=lambda: save(True)).pack(fill="x", pady=2)
    ttk.Button(bar, text="저장 (다음에 만드는 영상부터 적용)", command=lambda: save(False)).pack(fill="x", pady=2)
    r2 = ttk.Frame(bar)
    r2.pack(fill="x", pady=2)
    ttk.Button(r2, text="기본값으로", command=reset).pack(side="left")
    ttk.Button(r2, text="닫기", command=win.destroy).pack(side="right")

    schedule(10)
    threading.Thread(target=load_fonts, daemon=True).start()
    wait_fonts()
    return win
