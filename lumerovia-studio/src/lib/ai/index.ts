import "server-only";
import { z } from "zod";
import { askJSON, hasAI } from "@/lib/ai/client";
import { BRAND_SYSTEM, lyricsPrompt, rewritePrompt, styleRefinePrompt, titlesPrompt, videoConceptPrompt } from "@/lib/ai/prompts";
import { sampleLyrics, sampleRewrite, sampleTitles, sampleVideoConcept } from "@/lib/ai/fallback";
import type { AISource, LyricsAnalysis, StyleOption, TitleCandidate } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { uid } from "@/lib/utils";

export interface AIResult<T> {
  data: T;
  source: AISource;
  note?: string;
}

function summarizeReference(a: LyricsAnalysis | null): string | undefined {
  if (!a) return undefined;
  return [
    `Structure: ${a.structure.join(" → ") || "unknown"}`,
    `Lines: ${a.totalLines}, avg syllables/line: ${a.avgSyllablesPerLine}`,
    `Sections: ${a.sections.map((s) => `${s.name} (${s.lines} lines, rhyme ${s.rhymeScheme})`).join("; ")}`,
    `Mood: ${a.moodKo}; difficulty: ${a.difficultyKo}`,
  ].join("\n");
}

async function withFallback<T>(run: () => Promise<T>, fallback: () => T, note: string): Promise<AIResult<T>> {
  if (!hasAI()) {
    return { data: fallback(), source: "sample", note: "ANTHROPIC_API_KEY가 설정되지 않아 내장 샘플 생성기로 만든 결과입니다." };
  }
  try {
    return { data: await run(), source: "ai" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lumerovia-ai] ${note} failed:`, msg);
    return { data: fallback(), source: "sample", note: `AI 호출 실패(${msg.slice(0, 120)}). 내장 샘플 생성기로 대체했습니다.` };
  }
}

const TitleSchema = z.object({
  titles: z.array(
    z.object({
      title: z.string().min(1),
      titleKo: z.string().default(""),
      story: z.string().default(""),
      vocal: z.string().default("warm mature male baritone"),
      genre: z.string().default("Cinematic Nostalgic Soft Rock"),
      landscape: z.string().default(""),
    }),
  ).min(1),
});

export async function generateTitles(opts: { emotion: string; count: number; reference?: LyricsAnalysis | null; notes?: string }) {
  const emotionKo = EMOTIONS.find((e) => e.key === opts.emotion)?.ko ?? opts.emotion;
  const count = Math.max(10, Math.min(20, opts.count || 12));
  return withFallback<TitleCandidate[]>(
    async () => {
      const res = await askJSON(
        BRAND_SYSTEM,
        titlesPrompt({ emotion: opts.emotion, emotionKo, count, referenceSummary: summarizeReference(opts.reference ?? null), notes: opts.notes }),
        TitleSchema,
      );
      return res.titles.slice(0, 20).map((t) => ({ id: uid("t"), ...t }));
    },
    () => sampleTitles(opts.emotion, count),
    "titles",
  );
}

const LyricsSchema = z.object({
  lyrics: z.string().min(20),
  vocal: z.string().default(""),
  bpm: z.coerce.number().default(76),
  landscape: z.string().default(""),
});

export async function generateLyrics(opts: {
  title: string; titleKo: string; story: string; emotion: string; vocal: string; genre: string; landscape: string;
  reference?: string; rights: string; referenceAnalysis?: LyricsAnalysis | null;
}) {
  const precision = Boolean(opts.reference) && (opts.rights === "own" || opts.rights === "licensed");
  return withFallback(
    async () =>
      askJSON(
        BRAND_SYSTEM,
        lyricsPrompt({ ...opts, precision, referenceSummary: summarizeReference(opts.referenceAnalysis ?? null) }),
        LyricsSchema,
        12000,
      ),
    () => ({ lyrics: sampleLyrics({ title: opts.title, emotion: opts.emotion, landscape: opts.landscape }), vocal: opts.vocal, bpm: 76, landscape: opts.landscape }),
    "lyrics",
  );
}

const RewriteSchema = z.object({ replacement: z.string().min(1) });

export async function rewriteLyrics(opts: { lyrics: string; selection: string; instruction: string; title: string; story: string; keepSyllables: boolean }) {
  return withFallback(
    async () => (await askJSON(BRAND_SYSTEM, rewritePrompt(opts), RewriteSchema)).replacement,
    () => sampleRewrite(opts.selection),
    "rewrite",
  );
}

const StyleRefineSchema = z.object({ styles: z.array(z.object({ key: z.string(), prompt: z.string().min(10) })) });

export async function refineStyles(opts: { title: string; lyrics: string; emotion: string; options: StyleOption[] }) {
  return withFallback(
    async () => {
      const res = await askJSON(BRAND_SYSTEM, styleRefinePrompt(opts), StyleRefineSchema);
      return opts.options.map((o) => {
        const refined = res.styles.find((s) => s.key === o.key);
        return refined ? { ...o, prompt: refined.prompt.trim() } : o;
      });
    },
    () => opts.options,
    "styles",
  );
}

const VideoSchema = z.object({ concept: z.string().min(10) });

export async function generateVideoConcept(opts: { title: string; story: string; lyrics: string; landscape: string }) {
  return withFallback(
    async () => (await askJSON(BRAND_SYSTEM, videoConceptPrompt(opts), VideoSchema)).concept,
    () => sampleVideoConcept(opts),
    "video",
  );
}
