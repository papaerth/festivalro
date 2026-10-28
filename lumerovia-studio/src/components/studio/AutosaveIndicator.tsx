"use client";
import type { SaveStatus } from "@/hooks/useAutosave";
import { Check, CloudUpload, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function AutosaveIndicator({ status, savedAt, error }: { status: SaveStatus; savedAt: string | null; error: string | null }) {
  const time = savedAt ? new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
  const map: Record<SaveStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    idle: { icon: <Check className="h-3.5 w-3.5" />, text: time ? `저장됨 ${time}` : "자동 저장 켜짐", cls: "text-emerald-300" },
    pending: { icon: <Clock className="h-3.5 w-3.5" />, text: "변경 사항 저장 대기 중…", cls: "text-ivory-400" },
    saving: { icon: <CloudUpload className="h-3.5 w-3.5 animate-pulse" />, text: "저장 중…", cls: "text-gold-300" },
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: `저장됨 ${time ?? ""}`, cls: "text-emerald-300" },
    error: { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: error ?? "저장 실패", cls: "text-red-300" },
  };
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-navy-900/50 px-3 py-1 text-xs", m.cls)} data-testid="autosave" data-status={status}>
      {m.icon} {m.text}
    </span>
  );
}
