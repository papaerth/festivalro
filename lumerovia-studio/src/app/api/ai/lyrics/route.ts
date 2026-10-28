import { generateLyrics } from "@/lib/ai";
import { analyzeLyrics } from "@/lib/lyricsAnalysis";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  const b = await readBody(req);
  const title = String(b.title ?? "").trim();
  if (!title) return badRequest("title이 필요합니다. 먼저 제목을 선택하세요.");
  const reference = typeof b.referenceLyrics === "string" && b.referenceLyrics.trim() ? b.referenceLyrics : undefined;
  const result = await generateLyrics({
    title,
    titleKo: String(b.titleKo ?? ""),
    story: String(b.story ?? ""),
    emotion: String(b.emotion ?? "nostalgia"),
    vocal: String(b.vocal ?? "warm mature male baritone"),
    genre: String(b.genre ?? "Cinematic Nostalgic Soft Rock"),
    landscape: String(b.landscape ?? ""),
    reference,
    rights: String(b.referenceRights ?? "unknown"),
    referenceAnalysis: reference ? analyzeLyrics(reference) : null,
  });
  return json({ ...result.data, source: result.source, note: result.note });
}
