"use client";
import { useState } from "react";
import type { LyricsAnalysis } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-navy-900/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-lg text-ivory">{value}</div>
    </div>
  );
}

export function AnalysisPanel({ analysis, compact = false }: { analysis: LyricsAnalysis; compact?: boolean }) {
  const [showLines, setShowLines] = useState(!compact);
  const diffVariant = analysis.difficulty === "hard" ? "destructive" : analysis.difficulty === "medium" ? "warning" : "success";
  return (
    <div className="space-y-4" data-testid="analysis">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="행 수" value={analysis.totalLines} />
        <Stat label="단어" value={analysis.totalWords} />
        <Stat label="음절" value={analysis.totalSyllables} />
        <Stat label="행당 평균 음절" value={analysis.avgSyllablesPerLine} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">구성:</span>
        {analysis.structure.length ? analysis.structure.map((s, i) => <Badge key={`${s}-${i}`} variant="outline">{s}</Badge>) : <span className="text-ivory-400">감지되지 않음</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-navy-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">감정·분위기</div>
          <div className="mt-1 text-sm text-ivory">{analysis.moodKo}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-navy-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">가창 난이도</div>
          <div className="mt-1 flex items-center gap-2"><Badge variant={diffVariant}>{analysis.difficultyKo}</Badge></div>
          <ul className="mt-1 list-inside list-disc text-xs text-ivory-400">{analysis.difficultyReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <div className="rounded-lg border border-border/60 bg-navy-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">예상 길이</div>
          <div className="mt-1 font-serif text-lg text-ivory">약 {analysis.estimatedMinutes}분</div>
          <div className="text-xs text-muted-foreground">{analysis.estimatedMinutes <= 3 ? "3분 이내 목표에 적합" : "3분을 넘을 수 있어요 — 행을 줄여보세요"}</div>
        </div>
      </div>
      {analysis.sections.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-navy-900/60 text-muted-foreground">
              <tr><th className="px-3 py-2">섹션</th><th className="px-3 py-2">행</th><th className="px-3 py-2">음절</th><th className="px-3 py-2">평균</th><th className="px-3 py-2">라임 패턴</th></tr>
            </thead>
            <tbody>
              {analysis.sections.map((s) => (
                <tr key={s.name} className="border-t border-border/40">
                  <td className="px-3 py-1.5 text-ivory">{s.name}</td><td className="px-3 py-1.5">{s.lines}</td><td className="px-3 py-1.5">{s.syllables}</td><td className="px-3 py-1.5">{s.avgSyllables}</td><td className="px-3 py-1.5 font-mono text-gold-300">{s.rhymeScheme}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className="text-xs text-gold-400 underline-offset-2 hover:underline" onClick={() => setShowLines((v) => !v)}>
        {showLines ? "행별 분석 숨기기" : "행별 분석 보기 (음절·단어·강세·라임·슬래시)"}
      </button>
      {showLines && (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60 scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-navy-800 text-muted-foreground">
              <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">행</th><th className="px-2 py-2">음절</th><th className="px-2 py-2">단어</th><th className="px-2 py-2">강세(S/u)</th><th className="px-2 py-2">라임</th><th className="px-2 py-2">/ 위치</th></tr>
            </thead>
            <tbody>
              {analysis.lines.map((l) => (
                <tr key={l.index} className={cn("border-t border-border/30", l.isBlank && "opacity-40")}>
                  <td className="px-2 py-1 text-muted-foreground">{l.index + 1}</td>
                  <td className="px-2 py-1 font-serif text-sm text-ivory">{l.isBlank ? "—" : l.text}</td>
                  <td className="px-2 py-1 tabular-nums">{l.isBlank ? "" : l.syllables}</td>
                  <td className="px-2 py-1 tabular-nums">{l.isBlank ? "" : l.words}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-ivory-400">{l.stress}</td>
                  <td className="px-2 py-1 font-mono text-gold-300">{l.rhymeLetter}</td>
                  <td className="px-2 py-1 font-mono">{l.slashPositions.length ? l.slashPositions.join(", ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
