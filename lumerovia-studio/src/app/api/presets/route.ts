import { prisma } from "@/lib/prisma";
import { ensurePresets, toPresetDTO } from "@/lib/presets";
import { badRequest, json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ presets: await ensurePresets() });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const name = String(body.name ?? "").trim();
  const prompt = String(body.prompt ?? "").trim();
  if (!name || !prompt) return badRequest("name과 prompt는 필수입니다.");
  let key = String(body.key ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!key) key = `P${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const dup = await prisma.stylePreset.findUnique({ where: { key } });
  if (dup) return badRequest(`키 "${key}"가 이미 존재합니다.`);
  const max = await prisma.stylePreset.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.stylePreset.create({
    data: {
      key,
      name,
      nameKo: String(body.nameKo ?? name),
      description: String(body.description ?? ""),
      prompt,
      excludes: String(body.excludes ?? ""),
      bpm: Number(body.bpm) || 76,
      timeSig: String(body.timeSig ?? "4/4"),
      vocal: String(body.vocal ?? ""),
      genreTags: String(body.genreTags ?? ""),
      isDefault: false,
      isBuiltin: false,
      sortOrder: (max._max.sortOrder ?? 100) + 1,
    },
  });
  return json({ preset: toPresetDTO(row) }, 201);
}
