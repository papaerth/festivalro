import { Badge } from "@/components/ui/badge";

export function SourceNote({ source, note }: { source?: string | null; note?: string | null }) {
  if (!source) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="source-note">
      {source === "ai" ? <Badge variant="success">AI 생성</Badge> : source === "rules" ? <Badge variant="outline">규칙 기반</Badge> : <Badge variant="warning">샘플 생성</Badge>}
      {note && <span>{note}</span>}
    </div>
  );
}
