"""Tkinter 기반 GUI (Windows 기본 파이썬에 포함된 tkinter만 사용)."""

import os
import queue
import threading
import traceback
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, scrolledtext, ttk

from .pipeline import JobOptions, parse_time, run_job
from .render import CODECS, RESOLUTIONS, RenderStyle, default_font_path

LANGUAGES = [("자동 감지", "auto"), ("한국어", "ko"), ("영어", "en"), ("일본어", "ja"), ("중국어", "zh"),
             ("스페인어", "es"), ("프랑스어", "fr"), ("독일어", "de"), ("베트남어", "vi"), ("태국어", "th")]
MODELS = ["tiny", "base", "small", "medium", "large-v3"]
CODEC_LABELS = [("ProRes 4444 (알파, 편집기 호환 최고)", "prores4444"),
                ("Animation/qtrle (알파, 빠르고 작음)", "qtrle"),
                ("PNG (알파, 무손실)", "png")]


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("노래방 자막 생성기 (WhisperX)")
        self.minsize(860, 760)
        self.log_queue = queue.Queue()
        self.worker = None
        self._build()
        self.after(100, self._poll_log)

    # ------------------------------------------------------------------ UI
    def _build(self):
        pad = {"padx": 6, "pady": 3}
        root = ttk.Frame(self, padding=10)
        root.pack(fill="both", expand=True)
        root.columnconfigure(1, weight=1)
        r = 0

        # 음원
        ttk.Label(root, text="음원 파일(mp3)").grid(row=r, column=0, sticky="w", **pad)
        self.audio_var = tk.StringVar()
        ttk.Entry(root, textvariable=self.audio_var).grid(row=r, column=1, sticky="ew", **pad)
        ttk.Button(root, text="찾아보기", command=self._pick_audio).grid(row=r, column=2, **pad)
        r += 1

        # 가사
        ttk.Label(root, text="가사 텍스트").grid(row=r, column=0, sticky="nw", **pad)
        lyr = ttk.Frame(root)
        lyr.grid(row=r, column=1, columnspan=2, sticky="nsew", **pad)
        lyr.columnconfigure(0, weight=1)
        root.rowconfigure(r, weight=1)
        self.lyrics_text = scrolledtext.ScrolledText(lyr, height=10, wrap="word", font=("Malgun Gothic", 10))
        self.lyrics_text.grid(row=0, column=0, columnspan=2, sticky="nsew")
        lyr.rowconfigure(0, weight=1)
        ttk.Button(lyr, text="가사 파일 열기(.txt)", command=self._pick_lyrics).grid(row=1, column=0, sticky="w", pady=3)
        ttk.Label(lyr, text="한 줄 = 자막 한 줄. [Verse]·(Chorus) 같은 표시 줄은 무시됩니다.",
                  foreground="#666").grid(row=1, column=1, sticky="e")
        r += 1

        # 타이밍 재사용
        ttk.Label(root, text="타이밍 재사용(선택)").grid(row=r, column=0, sticky="w", **pad)
        self.timings_var = tk.StringVar()
        ttk.Entry(root, textvariable=self.timings_var).grid(row=r, column=1, sticky="ew", **pad)
        ttk.Button(root, text="찾아보기", command=self._pick_timings).grid(row=r, column=2, **pad)
        r += 1
        ttk.Label(root, text="이전 실행 시 저장된 *.timings.json 을 지정하면 WhisperX 정렬을 건너뛰고 바로 렌더링합니다.",
                  foreground="#666").grid(row=r, column=1, columnspan=2, sticky="w", padx=6)
        r += 1

        # 비율·구간
        ttk.Label(root, text="화면 비율").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        self.aspect_var = tk.StringVar(value="16:9")
        ttk.Radiobutton(f, text="16:9 (가로)", variable=self.aspect_var, value="16:9",
                        command=self._on_aspect).pack(side="left")
        ttk.Radiobutton(f, text="9:16 (세로, 구간 지정)", variable=self.aspect_var, value="9:16",
                        command=self._on_aspect).pack(side="left", padx=(12, 0))
        ttk.Label(f, text="   해상도").pack(side="left")
        self.res_var = tk.StringVar(value="1080p")
        ttk.Combobox(f, textvariable=self.res_var, values=RESOLUTIONS, width=7, state="readonly").pack(side="left", padx=4)
        r += 1

        ttk.Label(root, text="구간 (9:16)").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        ttk.Label(f, text="시작").pack(side="left")
        self.start_var = tk.StringVar(value="0:00")
        self.start_entry = ttk.Entry(f, textvariable=self.start_var, width=10)
        self.start_entry.pack(side="left", padx=4)
        ttk.Label(f, text="끝").pack(side="left")
        self.end_var = tk.StringVar(value="")
        self.end_entry = ttk.Entry(f, textvariable=self.end_var, width=10)
        self.end_entry.pack(side="left", padx=4)
        ttk.Label(f, text="(예: 1:05.5 / 83.5, 끝을 비우면 곡 끝까지)", foreground="#666").pack(side="left")
        r += 1

        # 인식 설정
        ttk.Label(root, text="인식 설정").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        ttk.Label(f, text="언어").pack(side="left")
        self.lang_var = tk.StringVar(value=LANGUAGES[0][0])
        ttk.Combobox(f, textvariable=self.lang_var, values=[n for n, _ in LANGUAGES], width=10,
                     state="readonly").pack(side="left", padx=4)
        ttk.Label(f, text="모델").pack(side="left")
        self.model_var = tk.StringVar(value="small")
        ttk.Combobox(f, textvariable=self.model_var, values=MODELS, width=9, state="readonly").pack(side="left", padx=4)
        ttk.Label(f, text="장치").pack(side="left")
        self.device_var = tk.StringVar(value="auto")
        ttk.Combobox(f, textvariable=self.device_var, values=["auto", "cpu", "cuda"], width=6,
                     state="readonly").pack(side="left", padx=4)
        r += 1

        # 폰트·스타일
        ttk.Label(root, text="폰트 파일").grid(row=r, column=0, sticky="w", **pad)
        self.font_var = tk.StringVar(value=default_font_path() or "")
        ttk.Entry(root, textvariable=self.font_var).grid(row=r, column=1, sticky="ew", **pad)
        ttk.Button(root, text="찾아보기", command=self._pick_font).grid(row=r, column=2, **pad)
        r += 1

        ttk.Label(root, text="스타일").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        ttk.Label(f, text="글자 크기").pack(side="left")
        self.size_var = tk.StringVar(value="0")
        ttk.Entry(f, textvariable=self.size_var, width=5).pack(side="left", padx=(4, 2))
        ttk.Label(f, text="(0=자동)").pack(side="left", padx=(0, 10))
        self.base_color = tk.StringVar(value="#FFFFFF")
        self.hl_color = tk.StringVar(value="#FFD400")
        self.outline_color = tk.StringVar(value="#000000")
        self._color_button(f, "기본색", self.base_color)
        self._color_button(f, "채움색", self.hl_color)
        self._color_button(f, "외곽선", self.outline_color)
        r += 1

        ttk.Label(root, text="출력 옵션").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        ttk.Label(f, text="코덱").pack(side="left")
        self.codec_var = tk.StringVar(value=CODEC_LABELS[0][0])
        ttk.Combobox(f, textvariable=self.codec_var, values=[n for n, _ in CODEC_LABELS], width=32,
                     state="readonly").pack(side="left", padx=4)
        ttk.Label(f, text="FPS").pack(side="left")
        self.fps_var = tk.StringVar(value="30")
        ttk.Combobox(f, textvariable=self.fps_var, values=["24", "25", "30", "60"], width=4).pack(side="left", padx=4)
        r += 1
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        self.next_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(f, text="다음 줄 미리보기", variable=self.next_var).pack(side="left")
        self.audio_var_in = tk.BooleanVar(value=False)
        ttk.Checkbutton(f, text="MOV에 (구간) 오디오 포함", variable=self.audio_var_in).pack(side="left", padx=12)
        r += 1

        ttk.Label(root, text="출력 폴더").grid(row=r, column=0, sticky="w", **pad)
        self.out_var = tk.StringVar()
        ttk.Entry(root, textvariable=self.out_var).grid(row=r, column=1, sticky="ew", **pad)
        ttk.Button(root, text="찾아보기", command=self._pick_out).grid(row=r, column=2, **pad)
        r += 1
        ttk.Label(root, text="비우면 음원과 같은 폴더에 <음원이름>_16x9.mov / .srt / .timings.json 으로 저장",
                  foreground="#666").grid(row=r, column=1, columnspan=2, sticky="w", padx=6)
        r += 1

        # 실행
        f = ttk.Frame(root)
        f.grid(row=r, column=0, columnspan=3, sticky="ew", **pad)
        f.columnconfigure(1, weight=1)
        self.run_btn = ttk.Button(f, text="자막 생성", command=self._start)
        self.run_btn.grid(row=0, column=0)
        self.progress = ttk.Progressbar(f, maximum=1.0)
        self.progress.grid(row=0, column=1, sticky="ew", padx=8)
        self.status_var = tk.StringVar(value="대기 중")
        ttk.Label(f, textvariable=self.status_var, width=28).grid(row=0, column=2)
        r += 1

        self.log_box = scrolledtext.ScrolledText(root, height=9, state="disabled", font=("Consolas", 9))
        self.log_box.grid(row=r, column=0, columnspan=3, sticky="nsew", **pad)
        root.rowconfigure(r, weight=1)
        self._on_aspect()

    def _color_button(self, parent, label, var):
        btn = tk.Button(parent, text=label, width=7, bg=var.get(), fg=self._contrast(var.get()),
                        command=lambda: self._pick_color(var, btn))
        btn.pack(side="left", padx=3)

    @staticmethod
    def _contrast(hexcolor):
        c = hexcolor.lstrip("#")
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return "#000000" if (r * 299 + g * 587 + b * 114) / 1000 > 128 else "#FFFFFF"

    # ------------------------------------------------------------ handlers
    def _pick_color(self, var, btn):
        rgb, hexv = colorchooser.askcolor(color=var.get(), parent=self)
        if hexv:
            var.set(hexv.upper())
            btn.configure(bg=hexv, fg=self._contrast(hexv))

    def _pick_audio(self):
        p = filedialog.askopenfilename(title="음원 선택", filetypes=[("오디오", "*.mp3 *.wav *.m4a *.flac *.ogg *.aac"), ("모든 파일", "*.*")])
        if p:
            self.audio_var.set(p)
            if not self.out_var.get():
                self.out_var.set(os.path.dirname(p))

    def _pick_lyrics(self):
        p = filedialog.askopenfilename(title="가사 파일 선택", filetypes=[("텍스트", "*.txt *.lrc"), ("모든 파일", "*.*")])
        if p:
            try:
                with open(p, encoding="utf-8-sig") as f:
                    text = f.read()
            except UnicodeDecodeError:
                with open(p, encoding="cp949", errors="replace") as f:
                    text = f.read()
            self.lyrics_text.delete("1.0", "end")
            self.lyrics_text.insert("1.0", text)

    def _pick_timings(self):
        p = filedialog.askopenfilename(title="타이밍 파일 선택", filetypes=[("타이밍 JSON", "*.timings.json *.json")])
        if p:
            self.timings_var.set(p)

    def _pick_font(self):
        p = filedialog.askopenfilename(title="폰트 선택", initialdir=r"C:\Windows\Fonts" if os.name == "nt" else "/",
                                       filetypes=[("폰트", "*.ttf *.ttc *.otf"), ("모든 파일", "*.*")])
        if p:
            self.font_var.set(p)

    def _pick_out(self):
        p = filedialog.askdirectory(title="출력 폴더 선택")
        if p:
            self.out_var.set(p)

    def _on_aspect(self):
        state = "normal" if self.aspect_var.get() == "9:16" else "disabled"
        self.start_entry.configure(state=state)
        self.end_entry.configure(state=state)

    def _log(self, msg):
        self.log_queue.put(("log", msg))

    def _progress(self, frac, msg):
        self.log_queue.put(("progress", (frac, msg)))

    def _poll_log(self):
        try:
            while True:
                kind, payload = self.log_queue.get_nowait()
                if kind == "log":
                    self.log_box.configure(state="normal")
                    self.log_box.insert("end", payload + "\n")
                    self.log_box.see("end")
                    self.log_box.configure(state="disabled")
                elif kind == "progress":
                    frac, msg = payload
                    self.progress["value"] = frac
                    self.status_var.set(msg)
                elif kind == "done":
                    self.run_btn.configure(state="normal")
                    self.status_var.set("완료")
                    messagebox.showinfo("완료", "생성이 끝났습니다.\n\n" + "\n".join(payload.values()), parent=self)
                elif kind == "error":
                    self.run_btn.configure(state="normal")
                    self.status_var.set("오류")
                    messagebox.showerror("오류", payload, parent=self)
        except queue.Empty:
            pass
        self.after(100, self._poll_log)

    def _build_options(self):
        audio = self.audio_var.get().strip()
        if not audio:
            raise ValueError("음원 파일을 선택하세요.")
        lyrics = self.lyrics_text.get("1.0", "end")
        timings = self.timings_var.get().strip()
        if not timings and not lyrics.strip():
            raise ValueError("가사를 입력하거나 타이밍 파일을 지정하세요.")
        aspect = self.aspect_var.get()
        clip_start = (parse_time(self.start_var.get()) or 0.0) if aspect == "9:16" else 0.0
        clip_end = parse_time(self.end_var.get()) if aspect == "9:16" else None
        lang = dict(LANGUAGES).get(self.lang_var.get(), "auto")
        codec = dict(CODEC_LABELS).get(self.codec_var.get(), "prores4444")
        try:
            size = int(self.size_var.get() or 0)
            fps = int(self.fps_var.get() or 30)
        except ValueError:
            raise ValueError("글자 크기와 FPS는 정수여야 합니다.")
        style = RenderStyle(
            font_path=self.font_var.get().strip() or None, font_size=size,
            base_color=self.base_color.get(), highlight_color=self.hl_color.get(),
            outline_color=self.outline_color.get(), show_next=self.next_var.get(),
        )
        return JobOptions(
            audio_path=audio, lyrics_text=lyrics, aspect=aspect, resolution=self.res_var.get(),
            clip_start=clip_start, clip_end=clip_end, language=lang, model_name=self.model_var.get(),
            device=self.device_var.get(), fps=fps, codec=codec, include_audio=self.audio_var_in.get(),
            out_dir=self.out_var.get().strip(), timings_json=timings, style=style,
        )

    def _start(self):
        try:
            opts = self._build_options()
        except Exception as e:
            messagebox.showerror("입력 오류", str(e), parent=self)
            return
        self.run_btn.configure(state="disabled")
        self.progress["value"] = 0
        self.status_var.set("시작")
        self._log("=" * 60)

        def work():
            try:
                result = run_job(opts, log=self._log, progress=self._progress)
                self.log_queue.put(("done", result))
            except Exception as e:
                self._log(traceback.format_exc())
                self.log_queue.put(("error", str(e)))

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()


def main():
    App().mainloop()
