import { compareStructure } from "@/lib/lyricsAnalysis";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const reference = typeof body.reference === "string" ? body.reference : "";
  const target = typeof body.target === "string" ? body.target : "";
  if (!reference.trim() || !target.trim()) return badRequest("reference와 target이 모두 필요합니다.");
  return json({ comparison: compareStructure(reference, target) });
}
