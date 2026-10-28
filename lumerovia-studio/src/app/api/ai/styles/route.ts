import { refineStyles } from "@/lib/ai";
import { ensurePresets } from "@/lib/presets";
import { buildAllStyleOptions } from "@/lib/styleBuilder";
import { json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = await readBody(req);
  const presets = await ensurePresets();
  const ctx = {
    lyrics: String(b.lyrics ?? ""),
    title: String(b.title ?? ""),
    emotion: String(b.emotion ?? "nostalgia"),
    vocal: typeof b.vocal === "string" && b.vocal ? b.vocal : undefined,
    landscape: String(b.landscape ?? ""),
  };
  const base = buildAllStyleOptions(presets, ctx);
  if (b.refine === false || !ctx.lyrics.trim()) {
    return json({ styles: base, source: "rules", note: undefined });
  }
  const result = await refineStyles({ title: ctx.title, lyrics: ctx.lyrics, emotion: ctx.emotion, options: base });
  return json({ styles: result.data, source: result.source === "ai" ? "ai" : "rules", note: result.note });
}
