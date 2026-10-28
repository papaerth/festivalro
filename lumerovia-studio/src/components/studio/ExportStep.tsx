"use client";
import type { StepProps } from "@/components/studio/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { useCopy } from "@/hooks/useCopy";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Copy, ExternalLink, Clapperboard } from "lucide-react";

function cleanForSuno(text: string): string {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ExportStep({ project, update, goTo }: StepProps) {
  const { copy, copied } = useCopy();
  const blocks: { key: string; title: string; label: string; value: string; mono?: boolean; testid: string }[] = [
    { key: "title", title: "Song Title", label: "Copy Title", value: cleanForSuno(project.title), testid: "copy-title" },
    { key: "lyrics", title: "Lyrics", label: "Copy Lyrics", value: cleanForSuno(project.lyrics), testid: "copy-lyrics" },
    { key: "style", title: "Style of Music", label: "Copy Style", value: cleanForSuno(project.stylePrompt), mono: true, testid: "copy-style" },
    { key: "exclude", title: "Exclude Styles", label: "Copy Exclusions", value: cleanForSuno(project.excludeStyles), mono: true, testid: "copy-exclude" },
  ];
  const missing = blocks.filter((b) => !b.value).map((b) => b.title);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-2xl">Suno 복사 화면</CardTitle>
              <CardDescription>각 버튼은 해당 내용만 그대로 복사합니다. 설명·머리말 없이 Suno의 네 입력란에 바로 붙여 넣으세요.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">제작 상태</Label>
              <Select className="h-9 w-[160px] text-xs" value={project.status} onChange={(e) => update({ status: e.target.value })} data-testid="status-select">
                {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.ko}</option>)}
              </Select>
              <a href="https://suno.com/create" target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink className="h-4 w-4" /> Suno 열기</a>
            </div>
          </div>
          {missing.length > 0 && <p className="text-xs text-amber-300">비어 있는 항목: {missing.join(", ")} — 이전 단계에서 채워주세요.</p>}
        </CardHeader>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {blocks.map((b) => {
          const done = copied === b.key;
          return (
            <Card key={b.key} className={cn("flex flex-col", b.key === "lyrics" && "lg:row-span-2")} data-testid={`block-${b.key}`}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="font-serif text-xl">{b.title}</CardTitle>
                <Badge variant="muted">{b.value ? `${b.value.length}자` : "비어 있음"}</Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <pre className={cn("whitespace-pre-wrap rounded-lg border border-border/60 bg-navy-900/50 p-4 text-ivory", b.mono ? "text-xs leading-relaxed" : "lyrics-area", b.key === "title" && "text-2xl", b.key === "lyrics" ? "min-h-[420px]" : "min-h-[80px]")}>
                  {b.value || <span className="text-muted-foreground">—</span>}
                </pre>
                <Button size="xl" className={cn("w-full", done && "bg-emerald-500 text-white hover:bg-emerald-500")} onClick={() => copy(b.value, b.key)} disabled={!b.value} data-testid={b.testid}>
                  {done ? <Check className="!size-5" /> : <Copy className="!size-5" />} {done ? "Copied!" : b.label}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-4">
        <p className="text-sm text-ivory-400">곡이 완성되면 영상 콘셉트(한국 풍경 장면 구성)를 만들어 보세요.</p>
        <Button variant="outline" onClick={() => goTo(6)}><Clapperboard /> 영상 콘셉트</Button>
      </div>
    </div>
  );
}
