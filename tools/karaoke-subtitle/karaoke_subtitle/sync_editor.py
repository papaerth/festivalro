"""싱크 보정 창: 줄별 시작 시각을 듣고 고치거나, 스페이스바로 직접 찍는다(탭 싱크)."""

import json
import tkinter as tk
from tkinter import messagebox, ttk

from .player import Player
from .timing import lines_to_dict, move_line_start, normalize_lines, retime_line_by_tap


def fmt_time(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


class SyncEditor(tk.Toplevel):
    """lines(곡 전체 기준 Line 리스트)를 고쳐 save_path에 저장한다. 저장하면 on_saved(save_path) 호출."""

    def __init__(self, master, audio_path, lines, save_path, language=None, on_saved=None, note=""):
        super().__init__(master)
        self.title("싱크 보정")
        self.geometry("820x620")
        self.audio_path, self.lines, self.save_path = audio_path, lines, save_path
        self.language, self.on_saved = language, on_saved
        self.player = Player()
        self.tap_index = None   # 탭 싱크 중이면 다음에 찍을 줄 번호
        self.dirty = False
        self._build(note)
        self._refresh()
        if self.lines:
            self._select(0)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.bind("<space>", self._on_space)
        self.bind("<Escape>", lambda _e: self._stop())
        self._tick_id = self.after(100, self._tick)

    # ------------------------------------------------------------------ UI
    def _build(self, note):
        top = ttk.Frame(self, padding=8)
        top.pack(fill="both", expand=True)
        help_text = ("① 줄을 고르고 [선택 줄부터 듣기]로 확인 → 늦거나 빠르면 −/+ 버튼으로 고칩니다.\n"
                     "② 많이 틀렸으면 [탭 싱크 시작]을 누르고, 각 줄의 첫 글자가 들리는 순간 스페이스바를 누르세요.\n"
                     "③ [저장]하면 '타이밍 재사용' 칸에 들어가고, 메인 창의 [자막 생성]으로 바로 다시 만들 수 있습니다.")
        ttk.Label(top, text=help_text, foreground="#444", justify="left").pack(anchor="w")
        if note:
            ttk.Label(top, text=note, foreground="#B45309", justify="left").pack(anchor="w", pady=(4, 0))

        mid = ttk.Frame(top)
        mid.pack(fill="both", expand=True, pady=6)
        self.tree = ttk.Treeview(mid, columns=("no", "start", "end", "text"), show="headings", selectmode="browse")
        for col, label, w, anchor in (("no", "#", 40, "e"), ("start", "시작", 80, "e"), ("end", "끝", 80, "e"),
                                      ("text", "가사", 540, "w")):
            self.tree.heading(col, text=label)
            self.tree.column(col, width=w, anchor=anchor, stretch=(col == "text"))
        sb = ttk.Scrollbar(mid, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.tree.bind("<space>", self._on_space)
        self.tree.bind("<Double-1>", lambda _e: self._play_selected())

        row = ttk.Frame(top)
        row.pack(fill="x", pady=2)
        ttk.Button(row, text="▶ 선택 줄부터 듣기", command=self._play_selected).pack(side="left")
        ttk.Button(row, text="■ 정지 (Esc)", command=self._stop).pack(side="left", padx=4)
        ttk.Label(row, text="   선택 줄 이동(초)").pack(side="left")
        for d in (-0.5, -0.1, 0.1, 0.5):
            ttk.Button(row, text=f"{d:+.1f}", width=5, command=lambda d=d: self._nudge(d)).pack(side="left", padx=1)
        self.ripple_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(row, text="뒤의 줄도 함께 이동", variable=self.ripple_var).pack(side="left", padx=8)

        row = ttk.Frame(top)
        row.pack(fill="x", pady=2)
        self.tap_btn = ttk.Button(row, text="탭 싱크 시작 (선택 줄부터)", command=self._start_tap)
        self.tap_btn.pack(side="left")
        self.status_var = tk.StringVar(value="")
        ttk.Label(row, textvariable=self.status_var, foreground="#1D4ED8").pack(side="left", padx=10)

        row = ttk.Frame(top)
        row.pack(fill="x", pady=(8, 0))
        ttk.Button(row, text="닫기", command=self._close).pack(side="right")
        ttk.Button(row, text="저장", command=self._save).pack(side="right", padx=6)
        ttk.Label(row, text=f"저장 위치: {self.save_path}", foreground="#666").pack(side="left")

    def _refresh(self, keep=None):
        sel = self._selected() if keep is None else keep
        self.tree.delete(*self.tree.get_children())
        for i, ln in enumerate(self.lines):
            self.tree.insert("", "end", iid=str(i), values=(i + 1, fmt_time(ln.start), fmt_time(ln.end), ln.text))
        if sel is not None and sel < len(self.lines):
            self._select(sel)

    def _selected(self):
        sel = self.tree.selection()
        return int(sel[0]) if sel else None

    def _select(self, i):
        self.tree.selection_set(str(i))
        self.tree.see(str(i))

    # ------------------------------------------------------------ 동작
    def _play(self, start):
        try:
            self.player.play(self.audio_path, start)
            return True
        except Exception as e:
            messagebox.showerror("재생 오류", str(e), parent=self)
            return False

    def _play_selected(self):
        i = self._selected()
        if i is None:
            return
        self.tap_index = None
        if self._play(self.lines[i].start - 2.0):
            self.status_var.set("재생 중 — 지금 불리는 줄이 자동으로 선택됩니다")

    def _stop(self):
        self.player.stop()
        if self.tap_index is not None:
            self.tap_index = None
            self._refresh()
        self.status_var.set("")
        self.tap_btn.configure(state="normal")

    def _nudge(self, delta):
        i = self._selected()
        if i is None:
            return
        move_line_start(self.lines, i, self.lines[i].start + delta, ripple=self.ripple_var.get())
        self.dirty = True
        self._refresh(keep=i)

    def _start_tap(self):
        i = self._selected()
        if i is None:
            return
        # 앞 줄이 끝난 뒤부터, 최소 3초의 준비 시간을 두고 재생
        start = max(0.0, (self.lines[i - 1].end if i > 0 else self.lines[i].start) - 3.0)
        if i > 0:
            start = max(0.0, min(start, self.lines[i].start - 3.0))
        else:
            start = 0.0 if self.lines[i].start < 15 else start
        if not self._play(start):
            return
        self.tap_index = i
        self.tap_btn.configure(state="disabled")
        self.tree.focus_set()
        self._tap_status()

    def _tap_status(self):
        i = self.tap_index
        if i is not None and i < len(self.lines):
            self.status_var.set(f"탭 싱크 중 — {i + 1}번 줄 첫 글자에서 스페이스바!  (끝내기: Esc)")

    def _on_space(self, _event=None):
        if self.tap_index is None:
            return "break"
        pos = self.player.position()
        if pos is None:
            self._stop()
            return "break"
        i = self.tap_index
        if i > 0 and pos <= self.lines[i - 1].start + 0.05:
            return "break"  # 앞 줄보다 이른 탭은 무시
        nxt = self.lines[i + 1].start if i + 1 < len(self.lines) else None
        retime_line_by_tap(self.lines, i, pos, next_start=nxt if nxt and nxt > pos + 0.3 else None)
        normalize_lines(self.lines)
        self.dirty = True
        self.tap_index = i + 1
        if self.tap_index >= len(self.lines):
            self.tap_index = None
            self.tap_btn.configure(state="normal")
            self.status_var.set("마지막 줄까지 찍었습니다. [저장]을 누르세요.")
            self._refresh(keep=i)
        else:
            self._refresh(keep=self.tap_index)
            self._tap_status()
        return "break"

    def _tick(self):
        pos = self.player.position()
        if pos is not None and self.tap_index is None:
            cur = None
            for i, ln in enumerate(self.lines):
                if ln.start <= pos:
                    cur = i
                else:
                    break
            if cur is not None and cur != self._selected():
                self._select(cur)
        elif pos is None and self.tap_index is not None:
            self._stop()  # 곡이 끝남
        self._tick_id = self.after(100, self._tick)

    def _save(self):
        try:
            normalize_lines(self.lines)
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(lines_to_dict(self.lines, self.language), f, ensure_ascii=False, indent=1)
        except Exception as e:
            messagebox.showerror("저장 실패", str(e), parent=self)
            return
        self.dirty = False
        self.status_var.set("저장했습니다. 메인 창에서 [자막 생성]을 누르면 반영됩니다.")
        if self.on_saved:
            self.on_saved(self.save_path)

    def _close(self):
        if self.dirty and not messagebox.askyesno("싱크 보정", "저장하지 않은 변경이 있습니다. 그냥 닫을까요?", parent=self):
            return
        try:
            self.after_cancel(self._tick_id)
        except Exception:
            pass
        self.player.close()
        self.destroy()
