import { prisma } from "@/lib/prisma";
import { toVersionDTO } from "@/lib/projects";
import { json, notFound, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Params<{ id: string; vid: string }>) {
  const { id, vid } = await params;
  const v = await prisma.projectVersion.findFirst({ where: { id: vid, projectId: id } });
  if (!v) return notFound("버전을 찾을 수 없습니다.");
  return json({ version: toVersionDTO(v, true) });
}

export async function DELETE(_req: Request, { params }: Params<{ id: string; vid: string }>) {
  const { id, vid } = await params;
  const v = await prisma.projectVersion.findFirst({ where: { id: vid, projectId: id } });
  if (!v) return notFound("버전을 찾을 수 없습니다.");
  await prisma.projectVersion.delete({ where: { id: vid } });
  return json({ ok: true });
}
