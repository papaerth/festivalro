import { prisma } from "@/lib/prisma";
import { BUILTIN_PRESETS, ensurePresets } from "@/lib/presets";
import { json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

/** Restore a builtin preset (by key) to its shipped prompt, or all builtins when no key given. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const key = typeof body.key === "string" ? body.key : null;
  const targets = key ? BUILTIN_PRESETS.filter((p) => p.key === key) : BUILTIN_PRESETS;
  for (const p of targets) {
    const { isDefault: _d, ...rest } = p;
    void _d;
    await prisma.stylePreset.upsert({ where: { key: p.key }, update: rest, create: p });
  }
  return json({ presets: await ensurePresets() });
}
