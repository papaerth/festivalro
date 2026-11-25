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
    "title_keys": ["다 떴을 때", "덧바르지"],
    "source_text": "출처 : 유튜브 '채널 이름'",
    "timeline": [{"type": "cut", "a": 0, "b": 3, "x0": 0,
                  "subs": [{"t": 0, "text": "그 건조한 부분을", "key": "건조한"}, {"t": 1, "text": "없어요!", "em": True},
                           {"t": 2, "text": "10년을 썼어요", "key": "10년"}]}],
    "cards": [{"seg": 0, "text": "와 이거 진짜 저만 몰랐나요 ㅋㅋㅋ 바로 따라 해봄", "likes": "1.2천", "heart": True, "pos": "top"}],
}


def read_settings() -> dict:
    try:
        return json.loads(SETTINGS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_settings(st: dict):
    keep = {k: v for k, v in st.items() if v or (v is False and k in ("sub_vary", "sub_sticker"))}     # 끈 것(False)도 남겨야 하는 값
    SETTINGS.write_text(json.dumps(keep, ensure_ascii=False, indent=2), encoding="utf-8")


def scenes_of(plan: dict) -> list[tuple[str, dict]]:
    """고를 수 있는 장면 목록 [(보일 이름, scene)]."""
    out = [("썸네일", {"thumb": True})]
    for i, seg in enumerate(plan.get("timeline") or []):
        if seg.get("type") == "cut":
            for k, sb in enumerate(seg.get("subs") or []):
                mark = "  (강조)" if sb.get("em") else f"  (강조: {sb['key']})" if sb.get("key") else ""
                out.append((f"{i + 1}. {sb.get('text', '')}{mark}", {"seg": i, "sub": k}))
        else:
            out.append((f"{i + 1}. [나레이션] {seg.get('text', '')}", {"seg": i, "sub": 0}))
    return out


def render(raw_plan: dict, src, base_dir, scene: dict, st: dict, platform: str, show_card: bool,
           meta=None, cache=None, channel: str = "내 채널"):
    """미리보기 한 장(1080×1920 PIL 이미지)."""
    from pipeline import build, platforms
    plan = build.apply_defaults(copy.deepcopy(raw_plan), st)
    for key in ("font_title", "font_sub", "font_em"):
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
    win.geometry(f"{disp_w + 520}x{max(disp_h + 40, min(sh - 90, 800))}")
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
    v_em_font = tk.StringVar(value=DEFAULT_NAME)                         # 강조 낱말·강조 자막의 글자체
    v_em_scale = tk.IntVar(value=int(st0.get("em_scale") or 125))        # 강조 글자 크기(%)
    v_vary = tk.BooleanVar(value=st0.get("sub_vary", True) is not False)
    v_colors = tk.StringVar(value=str(st0.get("sub_colors") or "cycle"))
    v_anim = tk.StringVar(value=str(st0.get("sub_anim") or "pop"))
    v_sticker = tk.BooleanVar(value=st0.get("sub_sticker", True) is not False)       # 강조 자막의 포인트 스티커
    v_tts_bg = tk.StringVar(value=str(st0.get("tts_bg") or "stills"))                 # TTS 구간의 화면
    v_title_style = tk.StringVar(value=str(st0.get("title_style") or "plain"))      # 상단 제목 모양
    v_src_format = tk.StringVar(value=str(st0.get("source_format") or "plain"))     # 출처 문구 모양
    v_src_size = tk.IntVar(value=int(st0.get("source_size") or 30))
    v_src_y = tk.IntVar(value=int(st0.get("source_y") or 1700))
    v_src_alpha = tk.IntVar(value=int(st0.get("source_alpha") or 84))
    v_note = tk.StringVar(value="글자체 목록을 읽는 중입니다…")
    refs = {DEFAULT_NAME: None}
    job = {"id": None, "img": None}

    bar = ttk.Frame(right)
    bar.pack(side="bottom", fill="x", pady=(6, 0))

    def section(parent, text):
        ttk.Label(parent, text=text, font=(fam, 12, "bold"), foreground=UI["accent"]).pack(anchor="w", pady=(10, 3))

    section(right, "볼 장면")
    box = ttk.Frame(right)
    box.pack(fill="x")
    lb = tk.Listbox(box, height=4, exportselection=False, font=(fam, 11), activestyle="none")
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

    # 설정은 네 묶음으로 나눠 탭으로 보여 준다
    tab_bar = ttk.Frame(right)
    tab_bar.pack(fill="x", pady=(12, 0))
    stack = ttk.Frame(right)
    stack.pack(fill="both", expand=True)
    pg_font, pg_vary, pg_title, pg_app, pg_music = (ttk.Frame(stack) for _ in range(5))
    if ui_theme:
        tabs = ui_theme.Tabs(tab_bar, stack)
    else:
        tabs = ttk.Notebook(stack)
        tabs.pack(fill="both", expand=True)
    for pg, name in ((pg_font, "글자체"), (pg_vary, "자막 변화"), (pg_title, "화면 구성"), (pg_app, "앱 화면"), (pg_music, "음악")):
        tabs.add(pg, text=name)

    def font_row(parent, title, var_font, var_size, lo, hi, var_bold, unit="크기", step=2):
        section(parent, title)
        cb = ttk.Combobox(parent, textvariable=var_font, state="readonly", values=[DEFAULT_NAME], height=18)
        cb.pack(fill="x")
        cb.bind("<<ComboboxSelected>>", lambda e: schedule())
        r = ttk.Frame(parent)
        r.pack(fill="x", pady=(4, 0))
        ttk.Label(r, text=unit).pack(side="left")
        sp = ttk.Spinbox(r, from_=lo, to=hi, increment=step, textvariable=var_size, width=6, command=lambda: schedule())
        sp.pack(side="left", padx=6)
        sp.bind("<KeyRelease>", lambda e: schedule(400))
        if var_bold is not None:
            ttk.Checkbutton(r, text="굵게", variable=var_bold, command=lambda: schedule()).pack(side="left", padx=14)
        return cb

    cb_title = font_row(pg_font, "썸네일 문구(화면 상단 제목) 글자체", v_title_font, v_title_size, 60, 150, v_title_bold)
    cb_sub = font_row(pg_font, "자막 글자체", v_sub_font, v_sub_size, 40, 100, v_sub_bold)

    # ---- 글자체 늘리기
    section(pg_font, "글자체 더 넣기")
    ttk.Label(pg_font, text="글자체 파일(.ttf .otf)을 글자체 폴더에 넣거나 윈도우에 설치한 뒤\n[목록 새로 고침]을 누르면 위 목록에 나옵니다.",
              foreground=UI["sub"], justify="left").pack(anchor="w")
    fr = ttk.Frame(pg_font)
    fr.pack(fill="x", pady=(6, 0))

    def open_font_dir():
        import os
        d = fonts.user_font_dir()
        try:
            os.startfile(d) if os.name == "nt" else __import__("subprocess").Popen(["xdg-open", str(d)])  # noqa: S606
        except OSError as e:
            messagebox.showerror("글자체 폴더", f"{d}\n{e}", parent=win)

    def rescan(note: str = ""):
        v_note.set(note or "글자체 목록을 다시 읽는 중입니다…")
        found.clear()
        threading.Thread(target=lambda: load_fonts(True), daemon=True).start()
        wait_fonts()

    def get_recommended():
        if busy.get("dl"):
            return
        names = "\n".join(f"  · {n}" for n, _ in fonts.RECOMMENDED)
        if not messagebox.askyesno("추천 무료 글자체", "구글 폰트의 무료 한글 글자체 12종(약 20MB)을 글자체 폴더에 받습니다.\n"
                                   f"상업적으로 써도 되는 글자체입니다.\n\n{names}\n\n받을까요?", parent=win):
            return
        busy["dl"] = True
        v_note.set("추천 글자체를 받는 중입니다… (1~2분)")
        got: dict = {}

        def work():
            msgs = []
            got["n"] = fonts.download_recommended(msgs.append)
            got["fail"] = [m for m in msgs if m.startswith("받지 못했습니다")]

        def wait():
            if not win.winfo_exists():
                return
            if "n" not in got:
                win.after(300, wait)
                return
            busy["dl"] = False
            fail = f" ({len(got['fail'])}개는 받지 못했습니다. 인터넷 연결을 확인하세요.)" if got["fail"] else ""
            rescan(f"글자체 {got['n']}개를 새로 받았습니다{fail}. 목록을 다시 읽는 중입니다…")

        threading.Thread(target=work, daemon=True).start()
        wait()

    busy: dict = {}
    ttk.Button(fr, text="추천 무료 글자체 받기", style="Soft.TButton" if ui_theme else "TButton",
               command=get_recommended).pack(side="left")
    ttk.Button(fr, text="글자체 폴더 열기", command=open_font_dir).pack(side="left", padx=6)
    ttk.Button(fr, text="목록 새로 고침", command=lambda: rescan()).pack(side="left")
    ttk.Label(pg_font, text="무료 글자체는 눈누(noonnu.cc)에서 많이 받을 수 있습니다. 사용 범위(영상·상업용)를 꼭 확인하세요.",
              foreground=UI["sub"], wraplength=440, justify="left").pack(anchor="w", pady=(6, 0))

    # ---- 자막 변화: 강조 낱말의 크기·색·글자체, 등장 움직임
    ttk.Checkbutton(pg_vary, text="강조할 말을 크게 · 다른 색 · 다른 글자체로", variable=v_vary,
                    command=lambda: schedule()).pack(anchor="w", pady=(8, 0))
    ttk.Label(pg_vary, text="강조할 낱말은 AI가 고릅니다(힘준 말, 효과, 숫자, 제품명).", foreground=UI["sub"]).pack(anchor="w")
    ttk.Checkbutton(pg_vary, text="포인트 스티커 (강조 자막에 반짝이, 다른 사람 말에 강조선)", variable=v_sticker,
                    command=lambda: schedule()).pack(anchor="w", pady=(4, 0))
    cb_em = font_row(pg_vary, "강조 글자체", v_em_font, v_em_scale, 100, 170, None, unit="크기(%)", step=5)
    section(pg_vary, "강조 색")
    row_c = ttk.Frame(pg_vary)
    row_c.pack(anchor="w")
    for key, label in (("cycle", "번갈아 (노랑 · 민트 · 분홍)"), ("yellow", "노랑만")):
        ttk.Radiobutton(row_c, text=label, value=key, variable=v_colors, command=lambda: schedule()).pack(side="left", padx=(0, 14))
    section(pg_vary, "자막이 뜰 때 움직임")
    row_a = ttk.Frame(pg_vary)
    row_a.pack(anchor="w")
    for key, label in (("pop", "톡 튀어나오기"), ("rise", "아래에서 올라오기"), ("none", "없음")):
        ttk.Radiobutton(row_a, text=label, value=key, variable=v_anim).pack(side="left", padx=(0, 14))
    ttk.Label(pg_vary, text="움직임은 완성 영상에서 보입니다(미리보기는 정지 화면).\n이미 만든 편에 강조 낱말을 넣으려면 본 창에서 '컷 설계부터 다시'로 만드세요.",
              foreground=UI["sub"], justify="left", wraplength=460).pack(anchor="w", pady=(6, 0))

    # ---- 제목 · 출처
    section(pg_title, "썸네일 문구(상단 제목) 모양")
    for key, label in (("plain", "기본 — 윗줄 흰색 · 아랫줄 노랑"), ("band", "빨간 띠 — 윗줄에 빨간 띠, 낱말마다 다른 색")):
        ttk.Radiobutton(pg_title, text=label, value=key, variable=v_title_style, command=lambda: schedule()).pack(anchor="w")
    ttk.Label(pg_title, text="색을 줄 낱말은 AI가 고릅니다. 글자체는 [글자체] 탭에서 고릅니다.", foreground=UI["sub"]).pack(anchor="w")
    section(pg_title, "출처 문구")
    for key, label in (("plain", "출처 : 유튜브 '채널'"), ("bar", "출처 | 채널")):
        ttk.Radiobutton(pg_title, text=label, value=key, variable=v_src_format, command=lambda: schedule()).pack(anchor="w")

    def num_row(label, var, lo, hi, step, hint=""):
        r = ttk.Frame(pg_title)
        r.pack(fill="x", pady=(6, 0))
        ttk.Label(r, text=label, width=9).pack(side="left")
        sp = ttk.Spinbox(r, from_=lo, to=hi, increment=step, textvariable=var, width=6, command=lambda: schedule())
        sp.pack(side="left", padx=6)
        sp.bind("<KeyRelease>", lambda e: schedule(400))
        ttk.Label(r, text=hint, foreground=UI["sub"]).pack(side="left", padx=6)

    num_row("크기", v_src_size, 20, 70, 2, "기본 30")
    num_row("위치", v_src_y, 1540, 1880, 10, "작을수록 위 · 기본 1700")
    num_row("진하기(%)", v_src_alpha, 15, 100, 5, "작을수록 투명 · 기본 84")
    section(pg_title, "TTS(나레이션) 때의 화면")
    for key, label in (("stills", "여러 장면이 지나가기 (원본의 다른 장면 또는 넣은 사진들)"),
                       ("clip", "원본의 움직이는 장면 (소리 없이)"), ("one", "한 장만")):
        ttk.Radiobutton(pg_title, text=label, value=key, variable=v_tts_bg).pack(anchor="w")

    section(pg_app, "앱에서 보이는 모습")
    for key, label in [("", "없음 (완성본 그대로)")] + list(platforms.PLATFORMS.items()):
        ttk.Radiobutton(pg_app, text=label, value=key, variable=v_platform, command=lambda: schedule()).pack(anchor="w")
    ttk.Label(pg_app, text="버튼과 글자가 놓이는 자리를 비슷하게 흉내 낸 것입니다.\n기기와 앱 버전에 따라 조금 다릅니다.",
              foreground=UI["sub"]).pack(anchor="w", pady=(2, 0))

    section(pg_music, "배경 음악")
    ttk.Label(pg_music, text="목소리만 있는 버전 밑에 깔아 '_음악.mp4' 파일을 하나 더 만듭니다.",
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

    ttk.Label(pg_music, textvariable=v_music_label, foreground=UI["ink"]).pack(anchor="w")
    m1 = ttk.Frame(pg_music)
    m1.pack(fill="x", pady=(2, 0))
    ttk.Button(m1, text="음악 파일 고르기", command=pick_music).pack(side="left")
    ttk.Button(m1, text="들어 보기", command=listen).pack(side="left", padx=4)
    ttk.Button(m1, text="음악 없음", command=no_music).pack(side="left")
    m2 = ttk.Frame(pg_music)
    m2.pack(fill="x", pady=(8, 0))
    ttk.Label(m2, text="음악 크기").pack(side="left")
    ttk.Scale(m2, from_=3, to=60, variable=v_volume, orient="horizontal", length=150,
              command=lambda v: v_vol_text.set(f"{int(float(v))}%")).pack(side="left", padx=6)
    v_vol_text = tk.StringVar(value=f"{v_volume.get()}%")
    ttk.Label(m2, textvariable=v_vol_text, width=5).pack(side="left")
    ttk.Button(pg_music, text="유튜브 오디오 보관함 열기", command=open_library).pack(anchor="w", pady=(8, 0))
    music_label()

    ttk.Label(bar, textvariable=v_note, foreground=UI["warn"], wraplength=460, justify="left").pack(anchor="w", pady=(0, 4))

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
                "font_em": refs.get(v_em_font.get()), "font_em_name": v_em_font.get(),
                "em_scale": max(100, min(170, num(v_em_scale, 125))), "sub_vary": bool(v_vary.get()),
                "sub_colors": v_colors.get() or "cycle", "sub_anim": v_anim.get() or "pop",
                "sub_sticker": bool(v_sticker.get()), "tts_bg": v_tts_bg.get() or "stills",
                "title_style": v_title_style.get() or "plain", "source_format": v_src_format.get() or "plain",
                "source_size": max(20, min(70, num(v_src_size, 30))), "source_y": max(1540, min(1880, num(v_src_y, 1700))),
                "source_alpha": max(15, min(100, num(v_src_alpha, 84))),
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
        for cb in (cb_title, cb_sub, cb_em):
            cb.configure(values=names)
        if not state.get("loaded"):      # 처음 한 번만 저장된 글자체로 맞춘다(새로 고침 때는 고른 것을 그대로 둔다)
            by_ref = {e["ref"]: e["name"] for e in items}
            v_title_font.set(by_ref.get(st0.get("font_title"), DEFAULT_NAME))
            v_sub_font.set(by_ref.get(st0.get("font_sub"), DEFAULT_NAME))
            v_em_font.set(by_ref.get(st0.get("font_em"), DEFAULT_NAME))
            state["loaded"] = True
        v_note.set(f"한글이 되는 글자체 {len(items)}개를 찾았습니다." if has_episode else
                   f"한글이 되는 글자체 {len(items)}개를 찾았습니다. 편을 만든 뒤 열면 실제 장면으로 보입니다.")
        schedule(10)

    found: dict = {}
    state: dict = {}

    def load_fonts(refresh: bool = False):   # 다른 스레드에서는 창을 건드리지 않고 결과만 남긴다
        try:
            found["items"] = fonts.scan(refresh)
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
        for k in ("font_title", "font_sub", "font_em"):
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
            v_note.set("저장했습니다. 다음에 만드는 영상부터 이 글자체·자막 변화" + ("와 음악으로" if st["music_file"] else "로") + " 나옵니다.")

    def reset():
        v_title_font.set(DEFAULT_NAME)
        v_sub_font.set(DEFAULT_NAME)
        v_title_size.set(112)
        v_sub_size.set(66)
        v_title_bold.set(False)
        v_sub_bold.set(False)
        v_em_font.set(DEFAULT_NAME)
        v_em_scale.set(125)
        v_vary.set(True)
        v_colors.set("cycle")
        v_anim.set("pop")
        v_sticker.set(True)
        v_tts_bg.set("stills")
        v_title_style.set("plain")
        v_src_format.set("plain")
        v_src_size.set(30)
        v_src_y.set(1700)
        v_src_alpha.set(84)
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
