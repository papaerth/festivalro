import { generateVideoConcept } from "@/lib/ai";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = await readBody(req);
  const title = String(b.title ?? "").trim();
  if (!title) return badRequest("title이 필요합니다.");
  const result = await generateVideoConcept({ title, story: String(b.story ?? ""), lyrics: String(b.lyrics ?? ""), landscape: String(b.landscape ?? "") });
  return json({ concept: result.data, source: result.source, note: result.note });
}
