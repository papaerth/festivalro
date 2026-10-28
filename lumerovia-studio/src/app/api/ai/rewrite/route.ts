import { rewriteLyrics } from "@/lib/ai";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = await readBody(req);
  const lyrics = String(b.lyrics ?? "");
  const selection = String(b.selection ?? "");
  if (!selection.trim()) return badRequest("다시 쓸 구간(selection)을 선택하세요.");
  const result = await rewriteLyrics({
    lyrics,
    selection,
    instruction: String(b.instruction ?? ""),
    title: String(b.title ?? ""),
    story: String(b.story ?? ""),
    keepSyllables: Boolean(b.keepSyllables),
  });
  return json({ replacement: result.data, source: result.source, note: result.note });
}
