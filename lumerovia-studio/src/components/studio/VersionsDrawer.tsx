"use client";
import { useEffect, useState } from "react";
import type { ProjectDTO, ProjectVersionDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { History, RotateCcw, Save, X } from "lucide-react";

export function VersionsDrawer({ projectId, open, onClose, onRestored, flush, refreshKey }: {
  projectId: string; open: boolean; onClose: () => void; onRestored: (p: ProjectDTO) => void; flush: () => Promise<void>; refreshKey: number;
}) {
  const [versions, setVersions] = useState<ProjectVersionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`);
      const data = (await res.json()) as { versions: ProjectVersionDTO[] };
      setVersions(data.versions ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, refreshKey]);

  const saveManual = async () => {
    setBusy("save");
    try {
      await flush();
      await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label || "수동 저장" }) });
      setLabel("");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const restore = async (v: ProjectVersionDTO) => {
    if (!confirm(`"${v.label}" (${new Date(v.createdAt).toLocaleString("ko-KR")}) 버전으로 되돌릴까요?\n현재 상태는 '복원 전 자동 백업'으로 저장됩니다.`)) return;
    setBusy(v.id);
    try {
      await flush();
      const res = await fetch(`/api/projects/${projectId}/versions/${v.id}/restore`, { method: "POST" });
      const data = (await res.json()) as { project?: ProjectDTO };
      if (data.project) onRestored(data.project);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-navy-800 p-5 shadow-2xl scrollbar-thin" onClick={(e) => e.stopPropagation()} data-testid="versions-drawer">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-xl text-ivory"><History className="h-5 w-5 text-gold-400" /> 수정 기록</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기"><X /></Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Input placeholder="버전 메모 (예: 후렴 수정 전)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button onClick={saveManual} disabled={busy === "save"} data-testid="save-version">{busy === "save" ? <Spinner /> : <Save />} 저장</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">제목 선택, 가사 생성, 재작성 적용, 스타일 생성 시 자동으로 버전이 남습니다.</p>
        <ul className="mt-4 space-y-2">
          {loading && <li className="text-sm text-muted-foreground"><Spinner className="inline" /> 불러오는 중…</li>}
          {!loading && versions.length === 0 && <li className="text-sm text-muted-foreground">아직 버전이 없습니다.</li>}
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/60 p-3" data-testid="version-item">
              <div className="min-w-0">
                <div className="truncate text-sm text-ivory">{v.label}</div>
                <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString("ko-KR")}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(v)} disabled={busy === v.id}>{busy === v.id ? <Spinner /> : <RotateCcw />} 복원</Button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
