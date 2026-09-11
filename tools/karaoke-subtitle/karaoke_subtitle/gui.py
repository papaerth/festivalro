"""Tkinter 기반 GUI (Windows 기본 파이썬에 포함된 tkinter만 사용)."""

import os
import queue
import subprocess
import sys
import threading
import traceback
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, scrolledtext, ttk

from PIL import Image, ImageDraw, ImageFont

from .fonts import default_font_entry, load_font_entries, scan_fonts
from .history import add_entry, clear_history, entry_label, load_history, load_settings, save_settings
from .pipeline import JobOptions, parse_time, run_job
from .render import CODECS, RESOLUTIONS, RenderStyle

try:
    from PIL import ImageTk
except ImportError:  # tkinter 이미지 지원이 없는 환경
    ImageTk = None

LANGUAGES = [("자동 감지", "auto"), ("한국어", "ko"), ("영어", "en"), ("일본어", "ja"), ("중국어", "zh"),
             ("스페인어", "es"), ("프랑스어", "fr"), ("독일어", "de"), ("베트남어", "vi"), ("태국어", "th")]
MODELS = ["tiny", "base", "small", "medium", "large-v3"]
COLOR_PRESETS = [("흰색", "#FFFFFF"), ("노랑", "#FFD400"), ("빨강", "#FF3B30"), ("주황", "#FF8C00"),
                 ("분홍", "#FF4FA3"), ("연두", "#7CFC00"), ("초록", "#22C55E"), ("하늘", "#4FC3F7"),
                 ("파랑", "#2F6BFF"), ("보라", "#A855F7"), ("금색", "#E5B80B"), ("회색", "#9E9E9E"),
                 ("검정", "#000000"), ("남색", "#1E2A5A")]
CODEC_LABELS = [("ProRes 4444 (알파, 편집기 호환 최고)", "prores4444"),
                ("Animation/qtrle (알파, 빠르고 작음)", "qtrle"),
                ("PNG (알파, 무손실)", "png")]


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("노래방 자막 생성기 (WhisperX)")
        self.minsize(900, 900)
        self.log_queue = queue.Queue()
        self.worker = None
        self._build()
        self._restore_settings()
        self._load_history()
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self._poll_id = self.after(100, self._poll_log)

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

        # 폰트(시스템 폰트 폴더에서 선택)
        ttk.Label(root, text="폰트").grid(row=r, column=0, sticky="w", **pad)
        self.font_entries = scan_fonts()
        self.font_var = tk.StringVar()
        self.font_combo = ttk.Combobox(root, textvariable=self.font_var, state="readonly",
                                       values=[e.label for e in self.font_entries])
        self.font_combo.grid(row=r, column=1, sticky="ew", **pad)
        self.font_combo.bind("<<ComboboxSelected>>", lambda _e: self._update_font_preview())
        ttk.Button(root, text="다른 파일…", command=self._pick_font).grid(row=r, column=2, **pad)
        r += 1
        self.font_preview = ttk.Label(root, text="", foreground="#666")
        self.font_preview.grid(row=r, column=1, columnspan=2, sticky="w", padx=6)
        r += 1
        default = default_font_entry(self.font_entries)
        if default:
            self.font_var.set(default.label)

        ttk.Label(root, text="글자 크기").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        self.size_var = tk.StringVar(value="0")
        ttk.Entry(f, textvariable=self.size_var, width=5).pack(side="left", padx=(0, 2))
        ttk.Label(f, text="px (0 = 화면 폭에 맞춰 자동)").pack(side="left")
        r += 1

        ttk.Label(root, text="자막 색상").grid(row=r, column=0, sticky="nw", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        self.base_color = tk.StringVar(value="#FFFFFF")
        self.hl_color = tk.StringVar(value="#FFD400")
        self.outline_color = tk.StringVar(value="#000000")
        self._color_refreshers = []
        self._color_row(f, 0, "부르기 전 글자", self.base_color)
        self._color_row(f, 1, "부른 글자(채워지는 색)", self.hl_color)
        self._color_row(f, 2, "외곽선", self.outline_color)
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
        self.preview_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(f, text="미리보기 mp4 생성(회색 배경 합성, 1080p)", variable=self.preview_var).pack(side="left")
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
        ttk.Label(f, textvariable=self.status_var, width=22).grid(row=0, column=2)
        self.play_btn = ttk.Button(f, text="완성본 재생", state="disabled",
                                   command=lambda: self._open_path(self.outputs.get("mov")))
        self.play_btn.grid(row=0, column=3, padx=(8, 2))
        self.folder_btn = ttk.Button(f, text="폴더 열기", state="disabled",
                                     command=lambda: self._open_path(self.outputs.get("out_dir")))
        self.folder_btn.grid(row=0, column=4, padx=2)
        r += 1

        # 이전 작업 기록(프로그램을 껐다 켜도 유지)
        ttk.Label(root, text="이전 작업").grid(row=r, column=0, sticky="w", **pad)
        f = ttk.Frame(root)
        f.grid(row=r, column=1, columnspan=2, sticky="ew", **pad)
        f.columnconfigure(0, weight=1)
        self.history = []
        self.history_var = tk.StringVar()
        self.history_combo = ttk.Combobox(f, textvariable=self.history_var, state="readonly")
        self.history_combo.grid(row=0, column=0, sticky="ew")
        self.history_combo.bind("<<ComboboxSelected>>", lambda _e: self._select_history())
        ttk.Button(f, text="타이밍 재사용에 넣기", command=self._reuse_history_timings).grid(row=0, column=1, padx=(6, 2))
        ttk.Button(f, text="기록 지우기", command=self._clear_history).grid(row=0, column=2)
        r += 1

        # 출력 파일 영역
        self.outputs = {}
        of = ttk.LabelFrame(root, text="출력 파일", padding=(6, 2))
        of.grid(row=r, column=0, columnspan=3, sticky="ew", **pad)
        of.columnconfigure(1, weight=1)
        self.output_rows = {}
        for i, (key, label) in enumerate([("mov", "MOV"), ("srt", "SRT"), ("json", "timings.json"), ("preview", "미리보기 mp4")]):
            ttk.Label(of, text=label, width=13).grid(row=i, column=0, sticky="w", pady=1)
            var = tk.StringVar(value="")
            ttk.Entry(of, textvariable=var, state="readonly").grid(row=i, column=1, sticky="ew", padx=4, pady=1)
            btn = ttk.Button(of, text="열기", width=6, state="disabled",
                             command=lambda k=key: self._open_path(self.outputs.get(k)))
            btn.grid(row=i, column=2, pady=1)
            self.output_rows[key] = (var, btn)
        r += 1

        self.log_box = scrolledtext.ScrolledText(root, height=9, state="disabled", font=("Consolas", 9))
        self.log_box.grid(row=r, column=0, columnspan=3, sticky="nsew", **pad)
        root.rowconfigure(r, weight=1)
        self._on_aspect()
        self._update_font_preview()  # 색상 변수까지 만들어진 뒤에 첫 미리보기

    def _color_row(self, parent, row, label, var):
        """색 이름 프리셋 드롭다운 + 색상표 버튼 + HEX 표시 한 줄."""
        ttk.Label(parent, text=label, width=20).grid(row=row, column=0, sticky="w", pady=2)
        names = [n for n, _ in COLOR_PRESETS]
        preset_var = tk.StringVar(value=self._preset_name(var.get()))
        combo = ttk.Combobox(parent, textvariable=preset_var, values=names, width=8, state="readonly")
        combo.grid(row=row, column=1, padx=4)
        swatch = tk.Button(parent, text=var.get(), width=9, bg=var.get(), fg=self._contrast(var.get()),
                           relief="groove")
        swatch.grid(row=row, column=2, padx=4)

        def apply(hexv):
            var.set(hexv.upper())
            swatch.configure(text=var.get(), bg=var.get(), fg=self._contrast(var.get()))
            preset_var.set(self._preset_name(var.get()))
            self._update_font_preview()

        self._color_refreshers.append(lambda: apply(var.get()))
        combo.bind("<<ComboboxSelected>>", lambda _e: apply(dict(COLOR_PRESETS)[preset_var.get()]))
        swatch.configure(command=lambda: self._pick_color(var, apply))
        ttk.Label(parent, text="← 색상표에서 직접 고르기", foreground="#666").grid(row=row, column=3, sticky="w")

    def _refresh_color_widgets(self):
        for fn in self._color_refreshers:
            fn()

    @staticmethod
    def _preset_name(hexv):
        for n, h in COLOR_PRESETS:
            if h.upper() == hexv.upper():
                return n
        return "직접 지정"

    @staticmethod
    def _contrast(hexcolor):
        c = hexcolor.lstrip("#")
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return "#000000" if (r * 299 + g * 587 + b * 114) / 1000 > 128 else "#FFFFFF"

    # ------------------------------------------------------------ handlers
    def _open_path(self, path):
        """파일은 기본 프로그램으로, 폴더는 탐색기로 연다."""
        if not path or not os.path.exists(path):
            messagebox.showwarning("열기", "파일이 없습니다.\n" + str(path or ""), parent=self)
            return
        try:
            if sys.platform == "win32":
                os.startfile(path)  # noqa: S606
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception as e:
            messagebox.showerror("열기 실패", str(e), parent=self)

    def _show_outputs(self, result):
        """출력 파일 영역을 채운다. 파일이 실제로 있을 때만 [열기]를 활성화한다."""
        self.outputs = dict(result)
        for key, (var, btn) in self.output_rows.items():
            path = result.get(key)
            exists = bool(path) and os.path.exists(path)
            if not path:
                var.set("(생성 안 함)" if key == "preview" else "")
            else:
                var.set(path if exists else f"{path}  (파일 없음)")
            btn.configure(state="normal" if exists else "disabled")
        mov = result.get("mov")
        out_dir = result.get("out_dir")
        self.play_btn.configure(state="normal" if mov and os.path.exists(mov) else "disabled")
        self.folder_btn.configure(state="normal" if out_dir and os.path.isdir(out_dir) else "disabled")

    # ------------------------------------------------------------ 기록
    def _load_history(self, select_first=True):
        self.history = load_history()
        self.history_combo.configure(values=[entry_label(h) for h in self.history])
        if self.history and select_first:
            self.history_combo.current(0)
            self._select_history()
        elif not self.history:
            self.history_var.set("")

    def _selected_history(self):
        idx = self.history_combo.current()
        return self.history[idx] if 0 <= idx < len(self.history) else None

    def _select_history(self):
        entry = self._selected_history()
        if entry:
            self._show_outputs(entry)

    def _reuse_history_timings(self):
        entry = self._selected_history()
        if not entry or not entry.get("json") or not os.path.exists(entry["json"]):
            messagebox.showwarning("타이밍 재사용", "선택한 작업의 timings.json 파일이 없습니다.", parent=self)
            return
        self.timings_var.set(entry["json"])
        if entry.get("audio") and os.path.exists(entry["audio"]):
            self.audio_var.set(entry["audio"])
        self._log(f"[기록] 타이밍 재사용: {entry['json']}")

    def _clear_history(self):
        if not self.history:
            return
        if messagebox.askyesno("기록 지우기", "이전 작업 목록만 지웁니다(파일은 삭제되지 않습니다). 계속할까요?", parent=self):
            self.history = clear_history()
            self.history_combo.configure(values=[])
            self.history_var.set("")
            self._clear_outputs()

    # ------------------------------------------------------------ 설정 저장/복원
    def _collect_settings(self):
        font = self._selected_font()
        return {
            "audio": self.audio_var.get(), "lyrics": self.lyrics_text.get("1.0", "end").rstrip("\n"),
            "timings": self.timings_var.get(), "aspect": self.aspect_var.get(), "resolution": self.res_var.get(),
            "start": self.start_var.get(), "end": self.end_var.get(), "language": self.lang_var.get(),
            "model": self.model_var.get(), "device": self.device_var.get(),
            "font_path": font.path if font else "", "font_index": font.index if font else 0,
            "font_size": self.size_var.get(), "base_color": self.base_color.get(), "hl_color": self.hl_color.get(),
            "outline_color": self.outline_color.get(), "codec": self.codec_var.get(), "fps": self.fps_var.get(),
            "show_next": self.next_var.get(), "audio_in_mov": self.audio_var_in.get(),
            "preview_mp4": self.preview_var.get(), "out_dir": self.out_var.get(),
        }

    def _restore_settings(self):
        st = load_settings()
        if not st:
            return
        try:
            self.audio_var.set(st.get("audio", ""))
            if st.get("lyrics"):
                self.lyrics_text.delete("1.0", "end")
                self.lyrics_text.insert("1.0", st["lyrics"])
            self.timings_var.set(st.get("timings", ""))
            if st.get("aspect") in ("16:9", "9:16"):
                self.aspect_var.set(st["aspect"])
            if st.get("resolution") in RESOLUTIONS:
                self.res_var.set(st["resolution"])
            self.start_var.set(st.get("start", "0:00"))
            self.end_var.set(st.get("end", ""))
            if st.get("language") in dict(LANGUAGES):
                self.lang_var.set(st["language"])
            if st.get("model") in MODELS:
                self.model_var.set(st["model"])
            if st.get("device") in ("auto", "cpu", "cuda"):
                self.device_var.set(st["device"])
            fp = st.get("font_path")
            if fp and os.path.exists(fp):
                match = [e for e in self.font_entries if e.path == fp and e.index == st.get("font_index", 0)]
                if not match:
                    match = load_font_entries(fp)
                    if match:
                        self.font_entries = match + self.font_entries
                        self.font_combo.configure(values=[e.label for e in self.font_entries])
                if match:
                    self.font_var.set(match[0].label)
            self.size_var.set(str(st.get("font_size", "0")))
            for key, var in (("base_color", self.base_color), ("hl_color", self.hl_color), ("outline_color", self.outline_color)):
                if st.get(key):
                    var.set(st[key])
            if st.get("codec") in dict(CODEC_LABELS):
                self.codec_var.set(st["codec"])
            self.fps_var.set(str(st.get("fps", "30")))
            self.next_var.set(bool(st.get("show_next", True)))
            self.audio_var_in.set(bool(st.get("audio_in_mov", False)))
            self.preview_var.set(bool(st.get("preview_mp4", False)))
            self.out_var.set(st.get("out_dir", ""))
        except Exception as e:
            self._log(f"[설정] 복원 중 일부 항목을 건너뜀: {e}")
        self._on_aspect()
        self._refresh_color_widgets()
        self._update_font_preview()

    def _on_close(self):
        save_settings(self._collect_settings())
        try:
            self.after_cancel(self._poll_id)
        except Exception:
            pass
        self.destroy()

    def _clear_outputs(self):
        self.outputs = {}
        for var, btn in self.output_rows.values():
            var.set("")
            btn.configure(state="disabled")
        self.play_btn.configure(state="disabled")
        self.folder_btn.configure(state="disabled")

    def _pick_color(self, var, apply):
        _rgb, hexv = colorchooser.askcolor(color=var.get(), parent=self, title="색 선택")
        if hexv:
            apply(hexv)

    def _pick_audio(self):
        p = filedialog.askopenfilename(title="음원 선택", filetypes=[("오디오", "*.mp3 *.wav *.m4a *.flac *.ogg *.aac"), ("모든 파일", "*.*")])
        if p:
            if p != self.audio_var.get() and self.timings_var.get():
                # 다른 곡의 타이밍이 그대로 쓰이지 않도록 비운다
                self.timings_var.set("")
                self._log("[안내] 음원이 바뀌어 '타이밍 재사용' 칸을 비웠습니다.")
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
        """폰트 폴더 밖의 폰트 파일을 목록에 추가하고 선택한다."""
        p = filedialog.askopenfilename(title="폰트 파일 선택", filetypes=[("폰트", "*.ttf *.ttc *.otf"), ("모든 파일", "*.*")])
        if not p:
            return
        entries = load_font_entries(p)
        if not entries:
            messagebox.showerror("폰트 오류", "폰트 파일을 읽을 수 없습니다.", parent=self)
            return
        self.font_entries = entries + self.font_entries
        self.font_combo.configure(values=[e.label for e in self.font_entries])
        self.font_var.set(entries[0].label)
        self._update_font_preview()

    def _selected_font(self):
        label = self.font_var.get()
        for e in self.font_entries:
            if e.label == label:
                return e
        return None

    def _update_font_preview(self):
        entry = self._selected_font()
        if entry is None:
            self.font_preview.configure(text="시스템 폰트를 찾지 못했습니다. '다른 파일…'로 폰트를 지정하세요.", image="")
            return
        if ImageTk is None:
            self.font_preview.configure(text=entry.path, image="")
            return
        try:
            font = ImageFont.truetype(entry.path, 26, index=entry.index)
            text = "노래방 자막 미리보기 Karaoke 123"
            l, t, rgt, b = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), text, font=font, stroke_width=2)
            w, h = rgt - l + 8, b - t + 8
            base = Image.new("RGB", (w, h), "#3A5F8A")
            ImageDraw.Draw(base).text((-l + 4, -t + 4), text, font=font, fill=self.base_color.get(),
                                      stroke_width=2, stroke_fill=self.outline_color.get())
            hl = Image.new("RGB", (w, h), "#3A5F8A")
            ImageDraw.Draw(hl).text((-l + 4, -t + 4), text, font=font, fill=self.hl_color.get(),
                                    stroke_width=2, stroke_fill=self.outline_color.get())
            half = int(w * 0.55)
            base.paste(hl.crop((0, 0, half, h)), (0, 0))
            self._preview_photo = ImageTk.PhotoImage(base)
            self.font_preview.configure(image=self._preview_photo, text="")
        except Exception as e:
            self.font_preview.configure(text=f"미리보기 실패: {e}", image="")

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
                    try:
                        add_entry(payload, self._last_opts)
                        self._load_history(select_first=False)
                        self.history_combo.current(0)
                    except Exception as e:
                        self._log(f"[기록] 저장 실패: {e}")
                    self._show_outputs(payload)
                    msg = f"완료! MOV 파일: {payload.get('mov')}"
                    if payload.get("preview"):
                        msg += f"\n미리보기 mp4: {payload['preview']}"
                    messagebox.showinfo("완료", msg, parent=self)
                elif kind == "error":
                    self.run_btn.configure(state="normal")
                    self.status_var.set("오류")
                    messagebox.showerror("오류", payload, parent=self)
        except queue.Empty:
            pass
        self._poll_id = self.after(100, self._poll_log)

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
        font = self._selected_font()
        if font is None:
            raise ValueError("폰트를 선택하세요.")
        style = RenderStyle(
            font_path=font.path, font_index=font.index, font_size=size,
            base_color=self.base_color.get(), highlight_color=self.hl_color.get(),
            outline_color=self.outline_color.get(), show_next=self.next_var.get(),
        )
        return JobOptions(
            audio_path=audio, lyrics_text=lyrics, aspect=aspect, resolution=self.res_var.get(),
            clip_start=clip_start, clip_end=clip_end, language=lang, model_name=self.model_var.get(),
            device=self.device_var.get(), fps=fps, codec=codec, include_audio=self.audio_var_in.get(),
            preview_mp4=self.preview_var.get(),
            out_dir=self.out_var.get().strip(), timings_json=timings, style=style,
        )

    def _start(self):
        try:
            opts = self._build_options()
        except Exception as e:
            messagebox.showerror("입력 오류", str(e), parent=self)
            return
        self._last_opts = opts
        save_settings(self._collect_settings())
        self.run_btn.configure(state="disabled")
        self._clear_outputs()
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
