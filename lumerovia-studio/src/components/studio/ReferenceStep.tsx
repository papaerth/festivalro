"use client";
import { useMemo } from "react";
import type { StepProps } from "@/components/studio/types";
import { RIGHTS_OPTIONS } from "@/lib/types";
import { analyzeLyrics } from "@/lib/lyricsAnalysis";
import { AnalysisPanel } from "@/components/studio/AnalysisPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";

export function ReferenceStep({ project, update, goTo }: StepProps) {
  const analysis = useMemo(() => (project.referenceLyrics.trim() ? analyzeLyrics(project.referenceLyrics) : null), [project.referenceLyrics]);
  const precisionAllowed = project.referenceRights === "own" || project.referenceRights === "licensed";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">참고 가사 입력</CardTitle>
          <CardDescription>영어 참고 가사를 붙여 넣으면 구성·음절·강세·라임·슬래시 위치·분위기·난이도를 즉시 분석합니다. 참고 가사는 선택 사항입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Textarea
            data-testid="reference-lyrics"
            className="lyrics-area min-h-[380px]"
            placeholder={"[Verse 1]\nThe road still bends the way it did / when we were young\n...\n\n[Chorus]\n..."}
            value={project.referenceLyrics}
            onChange={(e) => update({ referenceLyrics: e.target.value })}
            spellCheck={false}
          />
          <div className="space-y-2">
            <Label>권리 확인 (Rights check)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {RIGHTS_OPTIONS.map((r) => {
                const active = project.referenceRights === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    data-testid={`rights-${r.key}`}
                    onClick={() => update({ referenceRights: r.key })}
                    className={cn("rounded-lg border p-3 text-left transition", active ? "border-gold-500/70 bg-gold-500/10" : "border-border/60 hover:border-gold-500/40")}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-ivory">
                      {r.key === "own" || r.key === "licensed" ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-amber-300" />}
                      {r.ko}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.desc}</div>
                  </button>
                );
              })}
            </div>
            <p className={cn("rounded-md px-3 py-2 text-xs", precisionAllowed ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200")}>
              {precisionAllowed
                ? "정밀 편집 모드 사용 가능: 가사 단계에서 음절 수·행 수·공백 구조·슬래시 위치를 그대로 유지하는 새 가사를 쓸 수 있습니다."
                : "타인의 저작권 보호 작품일 수 있으므로 원문의 독특한 구조·표현은 복제하지 않고, 분위기·호흡·구성 같은 음악적 특징만 참고하여 독창적인 가사를 씁니다."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-notes">프로듀서 메모 (선택)</Label>
            <Input id="ref-notes" placeholder="예: 이 노래의 후렴 호흡과 느린 템포 느낌만 가져가고 싶어요" value={project.referenceNotes} onChange={(e) => update({ referenceNotes: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button size="lg" onClick={() => goTo(2)} data-testid="next-to-title">제목·스토리 만들기 <ArrowRight /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">가사 분석</CardTitle>
          <CardDescription>규칙 기반 분석(영어 음절·강세 추정). 참고용 수치이며 실제 가창에서는 보컬 해석에 따라 달라질 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {analysis ? <AnalysisPanel analysis={analysis} compact /> : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">왼쪽에 가사를 붙여 넣으면 분석이 표시됩니다.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
