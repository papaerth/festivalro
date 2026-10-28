"use client";
import { useState } from "react";
import type { StepProps } from "@/components/studio/types";
import { useCopy } from "@/hooks/useCopy";
import { SourceNote } from "@/components/studio/SourceNote";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Check, Clapperboard, Copy } from "lucide-react";

export function VideoStep({ project, update, saveVersion }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ source?: string; note?: string }>({});
  const { copy, copied } = useCopy();

  const generate = async () => {
    if (!project.title) {
      setError("먼저 제목을 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: project.title, story: project.story, lyrics: project.lyrics, landscape: project.landscape }) });
      const data = (await res.json()) as { concept?: string; source?: string; note?: string; error?: string };
      if (!res.ok || !data.concept) throw new Error(data.error ?? "영상 콘셉트 생성 실패");
      update({ videoConcept: data.concept });
      setSource({ source: data.source, note: data.note });
      await saveVersion("영상 콘셉트 생성");
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-serif text-2xl">영상 콘셉트</CardTitle>
            <CardDescription>가사 섹션별 한국 풍경 장면, 색감·톤, 썸네일 아이디어, 영상 설명란 문구를 한국어로 기획합니다.</CardDescription>
          </div>
          <Button onClick={generate} disabled={busy} data-testid="generate-video">{busy ? <Spinner /> : <Clapperboard />} 콘셉트 {project.videoConcept ? "다시 " : ""}생성</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>대표 한국 풍경</Label>
          <Input value={project.landscape} onChange={(e) => update({ landscape: e.target.value })} placeholder="예: 담양 메타세쿼이아길 가을" />
        </div>
        <Textarea rows={18} className="leading-relaxed" value={project.videoConcept} onChange={(e) => update({ videoConcept: e.target.value })} placeholder="생성 버튼을 누르거나 직접 작성하세요." data-testid="video-editor" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SourceNote source={source.source} note={source.note} />
          <Button variant="outline" onClick={() => copy(project.videoConcept, "video")} disabled={!project.videoConcept}>{copied === "video" ? <Check /> : <Copy />} 콘셉트 복사</Button>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
