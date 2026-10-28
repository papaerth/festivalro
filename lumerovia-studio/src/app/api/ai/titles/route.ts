import { generateTitles } from "@/lib/ai";
import { analyzeLyrics } from "@/lib/lyricsAnalysis";
import { json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await readBody(req);
  const emotion = typeof body.emotion === "string" && body.emotion ? body.emotion : "nostalgia";
  const count = Number(body.count) || 12;
  const reference = typeof body.referenceLyrics === "string" && body.referenceLyrics.trim() ? analyzeLyrics(body.referenceLyrics) : null;
  const notes = typeof body.notes === "string" ? body.notes : undefined;
  const result = await generateTitles({ emotion, count, reference, notes });
  return json({ titles: result.data, source: result.source, note: result.note });
}
