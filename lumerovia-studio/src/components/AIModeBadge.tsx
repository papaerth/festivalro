import { Badge } from "@/components/ui/badge";
import { Sparkles, FlaskConical } from "lucide-react";

export function AIModeBadge({ ai, model }: { ai: boolean; model?: string | null }) {
  return ai ? (
    <Badge variant="success" className="gap-1" title={`모델: ${model ?? ""}`}>
      <Sparkles className="h-3 w-3" /> AI 연결됨
    </Badge>
  ) : (
    <Badge variant="warning" className="gap-1" title="ANTHROPIC_API_KEY를 .env에 넣으면 실제 AI로 생성됩니다">
      <FlaskConical className="h-3 w-3" /> 샘플 모드
    </Badge>
  );
}
