"""창의 모양: 색, 둥근 버튼·입력 칸·카드, 알약 모양 탭, 진행 단계 표시.

표준 라이브러리만 쓴다(gui.py 가 numpy·PIL 없이 열리도록). 둥근 모서리는 작은 PNG를 직접 만들어
ttk 의 그림 요소(가장자리만 남기고 가운데를 늘이는 방식)로 쓴다.
"""
from __future__ import annotations

import base64
import math
import struct
import zlib

C = {
    "bg": "#F2F3F7",          # 창 바탕
    "surface": "#FFFFFF",     # 카드
    "line": "#E4E7EE",        # 옅은 선
    "line2": "#CDD2DD",       # 입력 칸·버튼 테두리
    "ink": "#171A22",         # 본문 글자
    "sub": "#667085",         # 보조 글자
    "faint": "#9AA3B5",       # 아주 옅은 글자
    "accent": "#5B5FEF",      # 강조(보라빛 파랑)
    "accent_hover": "#4B4FE0",
    "accent_press": "#3E42C8",
    "accent_soft": "#EEEFFE",
    "accent_soft2": "#E1E3FD",
    "hover": "#F5F6FA",
    "press": "#ECEEF4",
    "ok": "#0F9960",
    "warn": "#B45F06",
    "err": "#D93A3F",
    "err_soft": "#FDECEC",
    "off_bg": "#EEF0F4",
    "off_fg": "#A6ADBB",
    "quote": "#F6F7FB",
}


def _rgb(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def rounded_png(size: int, radius: float, fill: str, border: str | None, back: str, bw: float = 1.0) -> bytes:
    """둥근 사각형 PNG(바탕색 back 위에 미리 얹은 불투명 그림). 가장자리는 부드럽게 처리한다."""
    f, bk = _rgb(fill), _rgb(back)
    b = _rgb(border) if border else f
    half = size / 2
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            qx, qy = abs(x + 0.5 - half) - (half - radius), abs(y + 0.5 - half) - (half - radius)
            d = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius
            a = min(1.0, max(0.0, 0.5 - d))
            inner = min(1.0, max(0.0, 0.5 - (d + bw))) if border else 1.0
            for i in range(3):
                col = b[i] + (f[i] - b[i]) * inner
                raw.append(int(round(bk[i] + (col - bk[i]) * a)))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


class Theme:
    """apply() 가 돌려주는 묶음: 색, 글꼴, 그림(지워지지 않게 붙잡아 둔다)."""

    def __init__(self, root, fam: str):
        self.root, self.fam, self.C = root, fam, C
        self.images: dict = {}
        self.f_body = (fam, 11)
        self.f_small = (fam, 10)
        self.f_bold = (fam, 11, "bold")
        self.f_head = (fam, 13, "bold")
        self.f_title = (fam, 21, "bold")

    def img(self, radius: int, fill: str, border: str | None, back: str, bw: float = 1.0):
        import tkinter as tk
        key = (radius, fill, border, back, bw)
        if key not in self.images:
            size = radius * 2 + 8
            data = base64.b64encode(rounded_png(size, radius, fill, border, back, bw))
            self.images[key] = tk.PhotoImage(master=self.root, data=data)
        return self.images[key]


def apply(root, fam: str) -> Theme:
    """창 전체에 모양을 입힌다. ttk 기본 모양(TButton, TEntry …)을 바꾸므로 딸린 창(미리보기 등)에도 적용된다."""
    from tkinter import ttk
    T = Theme(root, fam)
    st = ttk.Style(root)
    try:
        st.theme_use("clam")
    except Exception:
        pass
    root.configure(background=C["bg"])
    st.configure(".", font=T.f_body, background=C["surface"], foreground=C["ink"], bordercolor=C["line2"],
                 lightcolor=C["surface"], darkcolor=C["surface"], troughcolor=C["off_bg"], focuscolor=C["surface"],
                 selectbackground=C["accent_soft2"], selectforeground=C["ink"], insertcolor=C["ink"])

    # ---- 바탕과 글자
    st.configure("TFrame", background=C["surface"])
    st.configure("Bg.TFrame", background=C["bg"])
    st.configure("TLabel", background=C["surface"], foreground=C["ink"])
    st.configure("Sub.TLabel", foreground=C["sub"])
    st.configure("Faint.TLabel", foreground=C["faint"], font=T.f_small)
    st.configure("H.TLabel", font=T.f_head)
    st.configure("Field.TLabel", foreground=C["sub"], font=T.f_bold)
    st.configure("Bg.TLabel", background=C["bg"])
    st.configure("BgTitle.TLabel", background=C["bg"], font=T.f_title)
    st.configure("BgSub.TLabel", background=C["bg"], foreground=C["sub"])
    st.configure("Status.TLabel", font=(fam, 12, "bold"), foreground=C["accent"])

    # ---- 카드(둥근 흰 판)
    st.element_create("Card.bg", "image", T.img(14, C["surface"], C["line"], C["bg"]), border=16, padding=0, sticky="nsew")
    st.layout("Card.TFrame", [("Card.bg", {"sticky": "nsew"})])
    st.configure("Card.TFrame", background=C["surface"])

    # ---- 버튼
    def button(style: str, back: str, radius: int, states: dict, fg: dict, font, padding):
        """states: {"": (채움, 테두리), "active": …, "pressed": …, "disabled": …}"""
        el = style.replace(".", "_") + ".bg"
        maps = [(k, T.img(radius, f, b, back)) for k, (f, b) in states.items() if k]
        order = {"disabled": 0, "pressed": 1, "active": 2}
        maps.sort(key=lambda kv: order.get(kv[0], 3))
        st.element_create(el, "image", T.img(radius, *states[""], back), *maps, border=radius + 2, padding=0, sticky="nsew")
        st.layout(style, [(el, {"sticky": "nsew", "children": [
            ("Button.padding", {"sticky": "nsew", "children": [("Button.label", {"sticky": "nsew"})]})]})])
        st.configure(style, font=font, padding=padding, foreground=fg[""], background=back, anchor="center",
                     borderwidth=0, relief="flat")
        st.map(style, foreground=[(k, v) for k, v in fg.items() if k], background=[("active", back)])

    plain = {"": (C["surface"], C["line2"]), "active": (C["hover"], C["line2"]), "pressed": (C["press"], C["line2"]),
             "disabled": (C["off_bg"], C["line"])}
    plain_fg = {"": C["ink"], "disabled": C["off_fg"]}
    primary = {"": (C["accent"], None), "active": (C["accent_hover"], None), "pressed": (C["accent_press"], None),
               "disabled": ("#C9CBF6", None)}
    white_fg = {"": "#FFFFFF", "disabled": "#FFFFFF"}
    soft = {"": (C["accent_soft"], None), "active": (C["accent_soft2"], None), "pressed": ("#D3D6FB", None),
            "disabled": (C["off_bg"], None)}
    soft_fg = {"": C["accent"], "disabled": C["off_fg"]}

    for back, prefix in ((C["surface"], ""), (C["bg"], "Bg.")):
        button(prefix + "TButton", back, 9, plain, plain_fg, T.f_body, (14, 6))
        ghost = {"": (back, None), "active": (C["press"] if prefix else C["hover"], None),
                 "pressed": (C["line"], None), "disabled": (back, None)}
        button(prefix + "Ghost.TButton", back, 9, ghost, {"": C["sub"], "active": C["ink"], "disabled": C["off_fg"]},
               T.f_body, (10, 5))
    button("Primary.TButton", C["surface"], 11, primary, white_fg, (fam, 13, "bold"), (30, 9))
    button("Go.TButton", C["surface"], 9, primary, white_fg, T.f_bold, (16, 7))
    button("Soft.TButton", C["surface"], 9, soft, soft_fg, T.f_bold, (14, 6))
    button("Small.Soft.TButton", C["surface"], 8, soft, soft_fg, (fam, 10, "bold"), (10, 3))
    button("Stop.TButton", C["surface"], 11,
           {"": (C["surface"], C["line2"]), "active": (C["err_soft"], C["err"]), "pressed": (C["err_soft"], C["err"]),
            "disabled": (C["off_bg"], C["line"])},
           {"": C["err"], "disabled": C["off_fg"]}, (fam, 12, "bold"), (18, 9))
    tab_off = {"": (C["surface"], None), "active": (C["hover"], None), "pressed": (C["press"], None),
               "disabled": (C["surface"], None)}
    button("Tab.TButton", C["surface"], 14, tab_off, {"": C["sub"], "active": C["ink"]}, (fam, 11, "bold"), (16, 6))
    button("TabOn.TButton", C["surface"], 14, {"": (C["accent_soft"], None), "active": (C["accent_soft"], None),
                                              "pressed": (C["accent_soft2"], None), "disabled": (C["accent_soft"], None)},
           {"": C["accent"]}, (fam, 11, "bold"), (16, 6))
    st.configure("Tab.TButton", width=0)
    st.configure("TabOn.TButton", width=0)

    # ---- 입력 칸
    field = [("disabled", T.img(9, C["off_bg"], C["line"], C["surface"])),
             ("focus", T.img(9, C["surface"], C["accent"], C["surface"], 1.6))]
    st.element_create("Round.field", "image", T.img(9, C["surface"], C["line2"], C["surface"]), *field,
                      border=11, padding=0, sticky="nsew")
    st.layout("TEntry", [("Round.field", {"sticky": "nsew", "children": [
        ("Entry.padding", {"sticky": "nsew", "children": [("Entry.textarea", {"sticky": "nsew"})]})]})])
    st.configure("TEntry", padding=(10, 7), fieldbackground=C["surface"], foreground=C["ink"], borderwidth=0)
    st.map("TEntry", foreground=[("disabled", C["off_fg"])])

    for name in ("TCombobox", "TSpinbox"):
        st.configure(name, padding=(8, 6), fieldbackground=C["surface"], background=C["surface"], foreground=C["ink"],
                     arrowcolor=C["sub"], bordercolor=C["line2"], lightcolor=C["surface"], darkcolor=C["surface"],
                     arrowsize=14, relief="flat")
        st.map(name, fieldbackground=[("readonly", C["surface"]), ("disabled", C["off_bg"])],
               bordercolor=[("focus", C["accent"])], background=[("active", C["hover"]), ("readonly", C["surface"])],
               foreground=[("disabled", C["off_fg"])],
               selectbackground=[("readonly", C["surface"])], selectforeground=[("readonly", C["ink"])])
    root.option_add("*TCombobox*Listbox.font", T.f_body)
    root.option_add("*TCombobox*Listbox.background", C["surface"])
    root.option_add("*TCombobox*Listbox.foreground", C["ink"])
    root.option_add("*TCombobox*Listbox.selectBackground", C["accent_soft2"])
    root.option_add("*TCombobox*Listbox.selectForeground", C["ink"])
    root.option_add("*TCombobox*Listbox.borderWidth", 0)

    # ---- 고르기 단추
    for name in ("TCheckbutton", "TRadiobutton"):
        st.configure(name, background=C["surface"], foreground=C["ink"], indicatorcolor=C["surface"],
                     indicatorbackground=C["surface"], upperbordercolor=C["line2"], lowerbordercolor=C["line2"],
                     padding=(2, 3))
        st.map(name, background=[("active", C["surface"])], indicatorcolor=[("selected", C["accent"])],
               foreground=[("disabled", C["off_fg"])])

    # ---- 표
    st.configure("Treeview", background=C["surface"], fieldbackground=C["surface"], foreground=C["ink"],
                 rowheight=34, borderwidth=0, relief="flat", font=T.f_body)
    st.map("Treeview", background=[("selected", C["accent_soft"])], foreground=[("selected", C["ink"])])
    st.configure("Treeview.Heading", background=C["quote"], foreground=C["sub"], font=(fam, 10, "bold"),
                 relief="flat", borderwidth=0, padding=(8, 7))
    st.map("Treeview.Heading", background=[("active", C["press"])])
    st.layout("Treeview", [("Treeview.treearea", {"sticky": "nsew"})])

    # ---- 가는 스크롤 막대
    for o, thumb in (("Vertical", "ns"), ("Horizontal", "ew")):
        st.layout(f"{o}.TScrollbar", [(f"{o}.Scrollbar.trough", {"sticky": thumb, "children": [
            (f"{o}.Scrollbar.thumb", {"expand": "1", "sticky": "nsew"})]})])
    st.configure("TScrollbar", troughcolor=C["surface"], background="#D5D9E2", bordercolor=C["surface"],
                 lightcolor="#D5D9E2", darkcolor="#D5D9E2", relief="flat", borderwidth=0, width=10, arrowsize=10,
                 gripcount=0)
    st.map("TScrollbar", background=[("disabled", C["surface"]), ("active", "#B9BFCC")],
           lightcolor=[("disabled", C["surface"])], darkcolor=[("disabled", C["surface"])],
           bordercolor=[("disabled", C["surface"])])

    st.configure("TScale", background=C["surface"], troughcolor=C["line"], bordercolor=C["line"],
                 lightcolor=C["accent"], darkcolor=C["accent"])
    st.map("TScale", background=[("", C["accent"]), ("active", C["accent_hover"])])
    st.configure("TSeparator", background=C["line"])
    st.configure("TLabelframe", background=C["surface"], bordercolor=C["line"], relief="solid", borderwidth=1)
    st.configure("TLabelframe.Label", background=C["surface"], foreground=C["sub"], font=T.f_bold)
    st.configure("TNotebook", background=C["surface"], borderwidth=0)
    st.configure("TNotebook.Tab", padding=(14, 7), background=C["surface"], foreground=C["sub"])
    st.map("TNotebook.Tab", foreground=[("selected", C["accent"])], background=[("selected", C["accent_soft"])])
    return T


def style_text(widget, T: Theme, boxed: bool = True):
    """tk.Text 를 카드 안의 입력 칸처럼 보이게 한다."""
    widget.configure(background=C["surface"], foreground=C["ink"], insertbackground=C["ink"], relief="flat",
                     borderwidth=0, selectbackground=C["accent_soft2"], selectforeground=C["ink"],
                     highlightthickness=1 if boxed else 0, highlightbackground=C["line2"], highlightcolor=C["accent"])


def style_toplevel(win):
    win.configure(background=C["surface"])


def style_listbox(lb):
    lb.configure(background=C["surface"], foreground=C["ink"], relief="flat", borderwidth=0, highlightthickness=1,
                 highlightbackground=C["line2"], highlightcolor=C["accent"], selectbackground=C["accent_soft2"],
                 selectforeground=C["ink"], activestyle="none")


def hline(parent):
    """옅은 가로줄."""
    import tkinter as tk
    return tk.Frame(parent, height=1, background=C["line"], borderwidth=0, highlightthickness=0)


class Tabs:
    """알약 모양 탭. ttk.Notebook 처럼 add / select / tab(frame, text=…) 을 쓴다. 장은 stack 의 자식으로 만든다."""

    def __init__(self, bar, stack):
        self.bar, self.stack = bar, stack
        self.items: list = []        # (frame, button)
        self.current = None
        stack.rowconfigure(0, weight=1)
        stack.columnconfigure(0, weight=1)

    def add(self, frame, text: str):
        from tkinter import ttk
        b = ttk.Button(self.bar, text=text.strip(), style="Tab.TButton", takefocus=False,
                       command=lambda: self.select(frame))
        b.pack(side="left", padx=(0, 4))
        self.items.append((frame, b))
        if self.current is None:
            self.select(frame)

    def select(self, frame):
        self.current = frame
        for f, b in self.items:
            if f is frame:
                f.grid(row=0, column=0, sticky="nsew")
                b.configure(style="TabOn.TButton")
            else:
                f.grid_remove()
                b.configure(style="Tab.TButton")

    def tab(self, frame, text: str | None = None):
        for f, b in self.items:
            if f is frame and text is not None:
                b.configure(text=text.strip())


class Stepper:
    """진행 단계 표시(동그라미와 선). set(step, state) — state: idle | run | done | fail."""

    def __init__(self, parent, T: Theme, steps: list[str], height: int = 62):
        import tkinter as tk
        self.T, self.steps = T, steps
        self.step, self.state, self.blink = -1, "idle", False
        self.cv = tk.Canvas(parent, height=height, background=C["surface"], highlightthickness=0, borderwidth=0)
        self.cv.bind("<Configure>", lambda e: self.draw())
        self._tick()

    def set(self, step: int, state: str):
        if (step, state) != (self.step, self.state):
            self.step, self.state = step, state
            self.draw()

    def _tick(self):
        try:
            if self.state == "run":
                self.blink = not self.blink
                self.draw()
            self.cv.after(600, self._tick)
        except Exception:      # 창이 닫힌 뒤
            pass

    def draw(self):
        cv, n = self.cv, len(self.steps)
        cv.delete("all")
        w = max(cv.winfo_width(), 200)
        r, y = 12, 20
        left, right = 44, w - 44
        xs = [left + (right - left) * i / (n - 1) for i in range(n)]
        done_to = n if self.state == "done" else self.step     # 이 순번 앞까지는 끝난 단계
        for i in range(n - 1):
            col = C["accent"] if i < done_to else C["line"]
            cv.create_line(xs[i] + r + 4, y, xs[i + 1] - r - 4, y, fill=col, width=2, capstyle="round")
        for i, (x, label) in enumerate(zip(xs, self.steps)):
            if i < done_to:              # 끝난 단계: 채운 동그라미 + 체크
                cv.create_oval(x - r, y - r, x + r, y + r, fill=C["accent"], outline=C["accent"])
                cv.create_line(x - 5, y, x - 1.5, y + 4, x + 5.5, y - 4, fill="#FFFFFF", width=2, capstyle="round",
                               joinstyle="round")
                fg, font = C["ink"], self.T.f_small
            elif i == self.step and self.state in ("run", "fail"):
                col = C["err"] if self.state == "fail" else C["accent"]
                if self.state == "run":
                    halo = C["accent_soft2"] if self.blink else C["accent_soft"]
                    g = r + (6 if self.blink else 4)
                    cv.create_oval(x - g, y - g, x + g, y + g, fill=halo, outline=halo)
                cv.create_oval(x - r, y - r, x + r, y + r, fill=C["surface"], outline=col, width=2)
                cv.create_text(x, y, text="!" if self.state == "fail" else str(i + 1), fill=col,
                               font=(self.T.fam, 10, "bold"))
                fg, font = col, (self.T.fam, 10, "bold")
            else:
                cv.create_oval(x - r, y - r, x + r, y + r, fill=C["surface"], outline=C["line2"], width=1)
                cv.create_text(x, y, text=str(i + 1), fill=C["faint"], font=(self.T.fam, 10))
                fg, font = C["faint"], self.T.f_small
            cv.create_text(x, y + r + 14, text=label, fill=fg, font=font)
