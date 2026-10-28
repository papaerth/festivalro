import Link from "next/link";
import type { ProjectDTO } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Music2 } from "lucide-react";

export function ProjectCard({ project: p }: { project: ProjectDTO }) {
  const status = PROJECT_STATUSES.find((s) => s.key === p.status)?.ko ?? p.status;
  const progress = Math.min(100, Math.round(((p.currentStep - 1) / 5) * 100));
  return (
    <Link
      href={`/studio/${p.id}`}
      className="group flex flex-col rounded-2xl border border-border/80 bg-card/80 p-5 transition hover:-translate-y-0.5 hover:border-gold-500/60 hover:shadow-gold"
      data-testid="project-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-xl text-ivory">{p.title || "제목 없는 곡"}</h3>
          {p.titleKo && <p className="truncate text-sm text-gold-300">{p.titleKo}</p>}
        </div>
        <Badge variant={p.status === "ready" || p.status === "produced" || p.status === "published" ? "success" : "muted"}>{status}</Badge>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-ivory-400">{p.story || "스토리가 아직 없습니다."}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Music2 className="h-3.5 w-3.5 text-gold-400" />
        <span className="truncate">{p.genre}</span>
        <span>· {p.bpm} BPM</span>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-navy-900/70">
        <div className="h-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>단계 {p.currentStep}/6</span>
        <span>{new Date(p.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </Link>
  );
}
