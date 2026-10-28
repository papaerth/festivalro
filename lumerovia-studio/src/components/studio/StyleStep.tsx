"use client";
import { useState } from "react";
import type { StepProps } from "@/components/studio/types";
import type { StyleOption } from "@/lib/types";
import { VOCAL_OPTIONS } from "@/lib/types";
import { SourceNote } from "@/components/studio/SourceNote";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, SlidersHorizontal, Star } from "lucide-react";

const FIELD_LABELS: { key: keyof StyleOption; ko: string }[] = [
  { key: "genre", ko: "장르" },
  { key: "vocal", ko: "보컬" },
  { key: "bpm", ko: "BPM" },
  { key: "timeSig", ko: "박자" },
  { key: "instruments", ko: "주요 악기" },
  { key: "emotion", ko: "감정" },
  { key: "arrangement", ko: "편곡" },
  { key: "chorusBuild", ko: "후렴 고조" },
  { key: "mixing", ko: "믹싱 분위기" },
  { key: "length", ko: "목표 길이" },
];

export function StyleStep({ project, presets, update, saveVersion, goTo }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ source?: string; note?: string }>({});
  const [open, setOpen] = useState<string | null>(null);
  const defaultKey = presets.find((p) => p.isDefault)?.key ?? "C";

  const generate = async (refine = true) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: project.lyrics, title: project.title, emotion: project.emotion, vocal: project.vocal, landscape: project.landscape, refine }),
      });
      const data = (await res.json()) as { styles?: StyleOption[]; source?: string; note?: string; error?: string };
      if (!res.ok || !data.styles) throw new Error(data.error ?? "스타일 생성 실패");
      const current = data.styles.find((s) => s.key === project.styleKey) ?? data.styles.find((s) => s.key === defaultKey) ?? data.styles[0];
      update({
        styleOptions: data.styles,
        styleKey: current.key,
        stylePrompt: current.prompt,
        excludeStyles: project.excludeStyles || current.excludes,
        bpm: current.bpm,
        genre: current.name,
        vocal: current.vocal,
      });
      setSource({ source: data.source, note: data.note });
      await saveVersion("스타일 프롬프트 생성");
    } catch (e) {
      setError(e instanceof Error ? e.message : "스타일 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const choose = (s: StyleOption) => {
    update({ styleKey: s.key, stylePrompt: s.prompt, bpm: s.bpm, genre: s.name, vocal: s.vocal, excludeStyles: s.excludes, status: project.lyrics ? "ready" : project.status });
  };

  const editPrompt = (key: string, prompt: string) => {
    const next = project.styleOptions.map((s) => (s.key === key ? { ...s, prompt } : s));
    update({ styleOptions: next, ...(project.styleKey === key ? { stylePrompt: prompt } : {}) });
  };

  const main = project.styleOptions.filter((s) => ["C", "A", "B"].includes(s.key));
  const variants = project.styleOptions.filter((s) => !["C", "A", "B"].includes(s.key));

  const renderCard = (s: StyleOption) => {
    const selected = project.styleKey === s.key;
    const expanded = open === s.key;
    return (
      <Card key={s.key} className={cn("flex flex-col transition", selected && "border-gold-500/70 shadow-gold")} data-testid={`style-${s.key}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">{s.key}</Badge>
                {s.key === defaultKey && <Badge className="gap-1"><Star className="h-3 w-3" /> 기본</Badge>}
                {selected && <Badge variant="success">선택됨</Badge>}
              </div>
              <CardTitle className="mt-2 font-serif text-xl">{s.name}</CardTitle>
              <CardDescription>{s.nameKo}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {FIELD_LABELS.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-muted-foreground">{f.ko}</dt>
                <dd className="text-ivory-300">{String(s[f.key])}</dd>
              </div>
            ))}
          </dl>
          {expanded ? (
            <Textarea rows={6} className="font-mono text-xs leading-relaxed" value={s.prompt} onChange={(e) => editPrompt(s.key, e.target.value)} />
          ) : (
            <p className="line-clamp-4 rounded-md bg-navy-900/50 p-2 font-mono text-[11px] leading-relaxed text-ivory-400">{s.prompt}</p>
          )}
          <div className="mt-auto flex gap-2">
            <Button className="flex-1" variant={selected ? "secondary" : "default"} onClick={() => choose(s)} data-testid={`choose-style-${s.key}`}><Check /> {selected ? "선택됨" : "이 스타일 선택"}</Button>
            <Button variant="ghost" onClick={() => setOpen(expanded ? null : s.key)}>{expanded ? "닫기" : "프롬프트 수정"}</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-2xl">Suno 스타일 프롬프트</CardTitle>
              <CardDescription>가사 내용(감정·이미지·호흡)에 맞춰 C / A / B 세 가지 기본 스타일과 C1 / C2 / C3 변주를 자동 조정해 생성합니다. 기본값은 Cinematic Nostalgic Soft Rock.</CardDescription>
            </div>
            <Link href="/presets" className={buttonVariants({ variant: "outline", size: "sm" })}><SlidersHorizontal className="h-4 w-4" /> 프리셋 관리</Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>보컬 (프롬프트에 반영)</Label>
              <Select value={project.vocal} onChange={(e) => update({ vocal: e.target.value })}>
                {[...VOCAL_OPTIONS, ...(VOCAL_OPTIONS.includes(project.vocal as never) || !project.vocal ? [] : [project.vocal])].map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </div>
            <Button size="lg" onClick={() => generate(true)} disabled={busy} data-testid="generate-styles">{busy ? <Spinner /> : <Sparkles />} 스타일 프롬프트 {project.styleOptions.length ? "다시 " : ""}생성</Button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <SourceNote source={source.source} note={source.note} />
        </CardContent>
      </Card>

      {main.length > 0 && <div className="grid gap-4 lg:grid-cols-3" data-testid="style-main">{main.map(renderCard)}</div>}
      {variants.length > 0 && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-ivory-300">C 변주 (C1 · C2 · C3) 및 사용자 프리셋</h3>
          <div className="grid gap-4 lg:grid-cols-3">{variants.map(renderCard)}</div>
        </div>
      )}

      {project.styleOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">제외할 음악 요소 (Exclude Styles)</CardTitle>
            <CardDescription>Suno의 "Exclude Styles"에 붙여 넣을 내용입니다. 쉼표로 구분된 영어 키워드.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={3} className="font-mono text-xs" value={project.excludeStyles} onChange={(e) => update({ excludeStyles: e.target.value })} data-testid="exclude-editor" />
            <div className="flex justify-end">
              <Button size="lg" onClick={() => goTo(5)} disabled={!project.stylePrompt} data-testid="next-to-export">Suno 복사 화면으로 <ArrowRight /></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
