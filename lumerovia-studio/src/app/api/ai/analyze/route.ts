import { analyzeLyrics } from "@/lib/lyricsAnalysis";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const lyrics = typeof body.lyrics === "string" ? body.lyrics : "";
  if (!lyrics.trim()) return badRequest("lyrics가 비어 있습니다.");
  return json({ analysis: analyzeLyrics(lyrics) });
}
