import { prisma } from "@/lib/prisma";
import { toProjectDTO, toPrismaPatch } from "@/lib/projects";
import { json, notFound, readBody, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const row = await prisma.project.findUnique({ where: { id } });
  if (!row) return notFound("프로젝트를 찾을 수 없습니다.");
  return json({ project: toProjectDTO(row) });
}

export async function PATCH(req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const body = await readBody(req);
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return notFound("프로젝트를 찾을 수 없습니다.");
  const data = toPrismaPatch(body);
  const row = await prisma.project.update({ where: { id }, data });
  return json({ project: toProjectDTO(row), savedAt: row.updatedAt.toISOString() });
}

export async function DELETE(_req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return notFound("프로젝트를 찾을 수 없습니다.");
  await prisma.project.delete({ where: { id } });
  return json({ ok: true });
}
