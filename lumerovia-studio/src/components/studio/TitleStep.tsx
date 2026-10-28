"use client";
import { useState } from "react";
import type { StepProps } from "@/components/studio/types";
import type { TitleCandidate } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SourceNote } from "@/components/studio/SourceNote";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, Mountain, Music2, Sparkles, Mic2 } from "lucide-react";

export function TitleStep({ project, update, saveVersion, goTo }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(12);
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<{ source?: string; note?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion: project.emotion, count, referenceLyrics: project.referenceLyrics, notes: notes || project.referenceNotes }),
      });
      const data = (await res.json()) as { titles?: TitleCandidate[]; source?: string; note?: string; error?: string };
      if (!res.ok || !data.titles) throw new Error(data.error ?? "제목 생성 실패");
      update({ titleCandidates: data.titles });
      setSource({ source: data.source, note: data.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "제목 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const editCandidate = (id: string, patch: Partial<TitleCandidate>) => {
    update({ titleCandidates: project.titleCandidates.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  };

  const select = async (c: TitleCandidate) => {
    update({ title: c.title, titleKo: c.titleKo, story: c.story, vocal: c.vocal, genre: c.genre, landscape: c.landscape });
    await saveVersion(`제목 선택: ${c.title}`);
  };

  const isSelected = (c: TitleCandidate) => project.title === c.title && project.story === c.story;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">감정 선택 → 영어 제목 · 한국어 스토리</CardTitle>
          <CardDescription>원하는 감정을 고르면 영어 제목 10~20개를 한국어 뜻, 200자 내외 스토리, 추천 보컬·장르·한국 풍경과 함께 생성합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {EMOTIONS.map((e) => (
              <button
                key={e.key}
                type="button"
                data-testid={`emotion-${e.key}`}
                onClick={() => update({ emotion: e.key })}
                className={cn("rounded-xl border px-3 py-3 text-center transition", project.emotion === e.key ? "border-gold-500/70 bg-gold-500/10 shadow-gold" : "border-border/60 hover:border-gold-500/40")}
              >
                <div className="text-sm font-medium text-ivory">{e.ko}</div>
                <div className="font-serif text-xs text-gold-300">{e.en}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="title-notes">추가 방향 (선택)</Label>
              <Input id="title-notes" placeholder="예: 바닷가 마을, 은퇴한 어부, 아내에게 보내는 편지" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title-count">개수 ({count})</Label>
              <input id="title-count" type="range" min={10} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-10 w-40 accent-gold-500" />
            </div>
            <Button size="lg" onClick={generate} disabled={busy} data-testid="generate-titles">
              {busy ? <Spinner /> : <Sparkles />} 제목 {project.titleCandidates.length ? "다시 " : ""}생성
            </Button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <SourceNote source={source.source} note={source.note} />
        </CardContent>
      </Card>

      {project.title && (
        <Card className="border-gold-500/50 shadow-gold" data-testid="selected-title">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 font-serif text-2xl"><Check className="h-5 w-5 text-emerald-300" /> 선택된 곡 — 수정 가능</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>영어 제목</Label><Input className="font-serif text-lg" value={project.title} onChange={(e) => update({ title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>한국어 뜻</Label><Input value={project.titleKo} onChange={(e) => update({ titleKo: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>한국어 스토리 ({project.story.length}자)</Label><Textarea rows={4} value={project.story} onChange={(e) => update({ story: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>추천 한국 풍경</Label><Input value={project.landscape} onChange={(e) => update({ landscape: e.target.value })} /></div>
            <div className="flex items-end justify-end">
              <Button size="lg" onClick={() => goTo(3)} data-testid="next-to-lyrics">영어 가사 쓰기 <ArrowRight /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {project.titleCandidates.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="title-candidates">
          {project.titleCandidates.map((c, i) => {
            const sel = isSelected(c);
            const open = expanded === c.id;
            return (
              <Card key={c.id} className={cn("flex flex-col transition", sel && "border-gold-500/70 shadow-gold")}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">#{i + 1}</div>
                      {open ? (
                        <Input className="font-serif text-lg" value={c.title} onChange={(e) => editCandidate(c.id, { title: e.target.value })} />
                      ) : (
                        <CardTitle className="font-serif text-xl leading-snug text-ivory">{c.title}</CardTitle>
                      )}
                      {open ? (
                        <Input className="mt-1 text-sm" value={c.titleKo} onChange={(e) => editCandidate(c.id, { titleKo: e.target.value })} />
                      ) : (
                        <p className="mt-1 text-sm text-gold-300">{c.titleKo}</p>
                      )}
                    </div>
                    {sel && <Badge variant="success">선택됨</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {open ? (
                    <Textarea rows={5} value={c.story} onChange={(e) => editCandidate(c.id, { story: e.target.value })} />
                  ) : (
                    <p className="text-sm leading-relaxed text-ivory-300">{c.story}</p>
                  )}
                  <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Mic2 className="h-3.5 w-3.5 text-gold-400" /> {c.vocal}</div>
                    <div className="flex items-center gap-1.5"><Music2 className="h-3.5 w-3.5 text-gold-400" /> {c.genre}</div>
                    <div className="flex items-center gap-1.5"><Mountain className="h-3.5 w-3.5 text-gold-400" /> {open ? <Input className="h-7 text-xs" value={c.landscape} onChange={(e) => editCandidate(c.id, { landscape: e.target.value })} /> : c.landscape}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" variant={sel ? "secondary" : "default"} onClick={() => select(c)} data-testid={`select-title-${i}`}>
                      <Check /> {sel ? "선택됨" : "이 제목 선택"}
                    </Button>
                    <Button variant="ghost" onClick={() => setExpanded(open ? null : c.id)}>{open ? "닫기" : "수정"}</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
