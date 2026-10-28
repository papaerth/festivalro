import { AI_MODEL, hasAI } from "@/lib/ai/client";
import { json } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ok: true, ai: hasAI(), model: hasAI() ? AI_MODEL : null, mode: hasAI() ? "ai" : "sample" });
}
