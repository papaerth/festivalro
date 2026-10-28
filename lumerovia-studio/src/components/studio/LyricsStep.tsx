"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StepProps } from "@/components/studio/types";
import { VOCAL_OPTIONS } from "@/lib/types";
import { analyzeLyrics, compareStructure } from "@/lib/lyricsAnalysis";
import { AnalysisPanel } from "@/components/studio/AnalysisPanel";
import { SourceNote } from "@/components/studio/SourceNote";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, RefreshCw, Sparkles, Wand2, X } from "lucide-react";

export function LyricsStep({ project, update, saveVersion, goTo, ai }: StepProps) {
  const [busy, setBusy] = useState<"gen" | "rewrite" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ source?: string; note?: string }>({});
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [instruction, setInstruction] = useState("");
  const [keepSyllables, setKeepSyllables] = useState(false);
  const [preview, setPreview] = useState<{ replacement: string; source?: string; note?: string } | null>(null);
  const [tab, setTab] = useState<"analysis" | "precision">("analysis");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const analysis = useMemo(() => (project.lyrics.trim() ? analyzeLyrics(project.lyrics) : null), [project.lyrics]);
  const precisionAllowed = Boolean(project.referenceLyrics.trim()) && (project.referenceRights === "own" || project.referenceRights === "licensed");
  const comparison = useMemo(
    () => (precisionAllowed && project.lyrics.trim() ? compareStructure(project.referenceLyrics, project.lyrics) : null),
    [precisionAllowed, project.referenceLyrics, project.lyrics],
  );
  const selectedText = project.lyrics.slice(sel.start, sel.end);

  const generate = async () => {
    if (!project.title) {
      setError("먼저 2단계에서 제목을 선택하세요.");
      return;
    }
    setBusy("gen");
    setError(null);
    try {
      const res = await fetch("/api/ai/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title, titleKo: project.titleKo, story: project.story, emotion: project.emotion, vocal: project.vocal,
          genre: project.genre, landscape: project.landscape, referenceLyrics: project.referenceLyrics, referenceRights: project.referenceRights,
        }),
      });
      const data = (await res.json()) as { lyrics?: string; vocal?: string; bpm?: number; landscape?: string; source?: string; note?: string; error?: string };
      if (!res.ok || !data.lyrics) throw new Error(data.error ?? "가사 생성 실패");
      update({ lyrics: data.lyrics, vocal: data.vocal || project.vocal, bpm: data.bpm || project.bpm, landscape: data.landscape || project.landscape, status: "lyrics_done" });
      setSource({ source: data.source, note: data.note });
      await saveVersion(project.lyrics.trim() ? "가사 재생성" : "가사 생성");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가사 생성 실패");
    } finally {
      setBusy(null);
    }
  };

  const captureSelection = () => {
    const ta = taRef.current;
    if (!ta) return;
    setSel({ start: ta.selectionStart, end: ta.selectionEnd });
  };

  // Keyboard/programmatic selections don't always fire React's onSelect; track document selection too.
  useEffect(() => {
    const onChange = () => {
      if (document.activeElement === taRef.current) captureSelection();
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const rewrite = async () => {
    if (!selectedText.trim()) {
      setError("가사에서 다시 쓸 구간을 마우스로 선택하세요.");
      return;
    }
    setBusy("rewrite");
    setError(null);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: project.lyrics, selection: selectedText, instruction, title: project.title, story: project.story, keepSyllables: keepSyllables || precisionAllowed }),
      });
      const data = (await res.json()) as { replacement?: string; source?: string; note?: string; error?: string };
      if (!res.ok || !data.replacement) throw new Error(data.error ?? "재작성 실패");
      setPreview({ replacement: data.replacement, source: data.source, note: data.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "재작성 실패");
    } finally {
      setBusy(null);
    }
  };

  const applyPreview = async () => {
    if (!preview) return;
    const next = project.lyrics.slice(0, sel.start) + preview.replacement + project.lyrics.slice(sel.end);
    update({ lyrics: next });
    setPreview(null);
    await saveVersion("부분 재작성 적용");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="font-serif text-2xl">영어 가사</CardTitle>
                <CardDescription>
                  {project.title ? <>“{project.title}” · {project.titleKo}</> : "제목을 먼저 선택하면 스토리 기반으로 가사를 씁니다."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={project.vocal} onChange={(e) => update({ vocal: e.target.value })} className="h-9 w-[230px] text-xs" aria-label="보컬">
                  {[...VOCAL_OPTIONS, ...(VOCAL_OPTIONS.includes(project.vocal as never) || !project.vocal ? [] : [project.vocal])].map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
                <Button onClick={generate} disabled={busy !== null} data-testid="generate-lyrics">
                  {busy === "gen" ? <Spinner /> : project.lyrics ? <RefreshCw /> : <Sparkles />} {project.lyrics ? "가사 다시 생성" : "가사 생성"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              ref={taRef}
              data-testid="lyrics-editor"
              className="lyrics-area min-h-[520px]"
              placeholder={"[Verse 1]\n...\n\n[Chorus]\n..."}
              value={project.lyrics}
              onChange={(e) => update({ lyrics: e.target.value })}
              onSelect={captureSelection}
              onKeyUp={captureSelection}
              onMouseUp={captureSelection}
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{analysis ? `${analysis.totalLines}행 · ${analysis.totalSyllables}음절 · 약 ${analysis.estimatedMinutes}분` : "가사를 쓰거나 생성하세요"}</span>
              <SourceNote source={source.source} note={source.note} />
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-xl"><Wand2 className="h-5 w-5 text-gold-400" /> AI 부분 재작성</CardTitle>
            <CardDescription>위 편집기에서 다시 쓸 구간을 드래그로 선택한 뒤 지시를 입력하세요. 결과를 미리 보고 적용합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border/60 bg-navy-900/40 p-3 text-sm">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">선택된 구간 {selectedText ? `(${selectedText.split("\n").length}행)` : ""}</div>
              <pre className="mt-1 whitespace-pre-wrap font-serif text-ivory">{selectedText || <span className="text-muted-foreground">아직 선택된 구간이 없습니다.</span>}</pre>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input placeholder="지시 (예: 더 따뜻하게, 바다 이미지 추가, 라임 맞추기)" value={instruction} onChange={(e) => setInstruction(e.target.value)} data-testid="rewrite-instruction" />
              <Button onClick={rewrite} disabled={busy !== null || !selectedText.trim()} data-testid="rewrite-btn">{busy === "rewrite" ? <Spinner /> : <Wand2 />} 다시 쓰기</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-ivory-400">
              <input type="checkbox" className="accent-gold-500" checked={keepSyllables || precisionAllowed} disabled={precisionAllowed} onChange={(e) => setKeepSyllables(e.target.checked)} />
              음절 수와 슬래시 위치 유지 {precisionAllowed && "(정밀 편집 모드에서는 항상 켜짐)"}
            </label>
            {preview && (
              <div className="rounded-lg border border-gold-500/50 bg-gold-500/5 p-3" data-testid="rewrite-preview">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gold-300">재작성 미리보기</span>
                  <SourceNote source={preview.source} note={preview.note} />
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-serif text-ivory">{preview.replacement}</pre>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={applyPreview} data-testid="apply-rewrite"><Check /> 적용</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPreview(null)}><X /> 취소</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-serif text-xl">검증</CardTitle>
              <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
                <button type="button" onClick={() => setTab("analysis")} className={cn("rounded-md px-3 py-1 text-xs", tab === "analysis" ? "bg-gold-500 text-navy-900" : "text-ivory-400")}>음절·구성</button>
                <button type="button" onClick={() => setTab("precision")} className={cn("rounded-md px-3 py-1 text-xs", tab === "precision" ? "bg-gold-500 text-navy-900" : "text-ivory-400")} data-testid="tab-precision">정밀 편집</button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tab === "analysis" ? (
              analysis ? <AnalysisPanel analysis={analysis} compact /> : <p className="text-sm text-muted-foreground">가사가 있으면 행별 음절·강세·라임을 보여줍니다.</p>
            ) : !project.referenceLyrics.trim() ? (
              <p className="text-sm text-muted-foreground">1단계에 참고 가사를 넣으면 구조를 비교할 수 있습니다.</p>
            ) : !precisionAllowed ? (
              <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-200">
                참고 가사의 권리가 <b>본인 작품</b> 또는 <b>이용 허락 받음</b>으로 확인된 경우에만 음절·행·슬래시 구조를 그대로 맞추는 정밀 편집 모드를 제공합니다. 현재 설정에서는 분위기·구성 같은 음악적 특징만 참고합니다.
              </div>
            ) : comparison ? (
              <div className="space-y-3" data-testid="precision-table">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={comparison.score === 100 ? "success" : comparison.score >= 70 ? "warning" : "destructive"}>일치율 {comparison.score}%</Badge>
                  <span className="text-muted-foreground">{comparison.matched}/{comparison.total}행 일치 · 행 수 {comparison.lineCountMatch ? "일치" : "불일치"}</span>
                </div>
                <div className="max-h-[520px] overflow-auto rounded-lg border border-border/60 scrollbar-thin">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-navy-800 text-muted-foreground"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">참고</th><th className="px-2 py-2">음절</th><th className="px-2 py-2">새 가사</th><th className="px-2 py-2">음절</th><th className="px-2 py-2">/</th></tr></thead>
                    <tbody>
                      {comparison.rows.map((r) => (
                        <tr key={r.index} className={cn("border-t border-border/30", !(r.syllableMatch && r.slashMatch && r.blankMatch) && "bg-red-500/10")}>
                          <td className="px-2 py-1 text-muted-foreground">{r.index + 1}</td>
                          <td className="px-2 py-1 font-serif text-ivory-300">{r.reference || "—"}</td>
                          <td className="px-2 py-1 tabular-nums">{r.refSyllables || ""}</td>
                          <td className="px-2 py-1 font-serif text-ivory">{r.target || "—"}</td>
                          <td className={cn("px-2 py-1 tabular-nums", !r.syllableMatch && "font-bold text-red-300")}>{r.targetSyllables || ""}</td>
                          <td className={cn("px-2 py-1 font-mono", !r.slashMatch && "text-red-300")}>{r.refSlashes.join(",")}{r.refSlashes.length || r.targetSlashes.length ? ` → ${r.targetSlashes.join(",")}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">가사를 생성하면 참고 가사와 구조를 비교합니다.</p>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button size="lg" onClick={() => goTo(4)} disabled={!project.lyrics.trim()} data-testid="next-to-style">스타일 프롬프트 만들기 <ArrowRight /></Button>
        </div>
        {!ai && <p className="text-right text-xs text-muted-foreground">샘플 모드: .env에 ANTHROPIC_API_KEY를 넣으면 실제 AI가 스토리 기반 가사를 씁니다.</p>}
      </div>
    </div>
  );
}
