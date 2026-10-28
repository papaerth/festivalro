import { prisma } from "@/lib/prisma";
import { toPresetDTO } from "@/lib/presets";
import { badRequest, json, notFound, readBody, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const body = await readBody(req);
  const existing = await prisma.stylePreset.findUnique({ where: { id } });
  if (!existing) return notFound("프리셋을 찾을 수 없습니다.");
  const data: Record<string, unknown> = {};
  for (const k of ["name", "nameKo", "description", "prompt", "excludes", "timeSig", "vocal", "genreTags"] as const) {
    if (typeof body[k] === "string") data[k] = body[k];
  }
  if (body.bpm !== undefined) data.bpm = Number(body.bpm) || existing.bpm;
  if (typeof data.prompt === "string" && !data.prompt.trim()) return badRequest("prompt는 비울 수 없습니다.");
  if (body.isDefault === true) {
    await prisma.stylePreset.updateMany({ data: { isDefault: false } });
    data.isDefault = true;
  }
  const row = await prisma.stylePreset.update({ where: { id }, data });
  return json({ preset: toPresetDTO(row) });
}

export async function DELETE(_req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const existing = await prisma.stylePreset.findUnique({ where: { id } });
  if (!existing) return notFound("프리셋을 찾을 수 없습니다.");
  if (existing.isBuiltin) return badRequest("기본 제공 프리셋은 삭제할 수 없습니다. 내용을 수정하거나 '기본값 복원'을 사용하세요.");
  await prisma.stylePreset.delete({ where: { id } });
  return json({ ok: true });
}
