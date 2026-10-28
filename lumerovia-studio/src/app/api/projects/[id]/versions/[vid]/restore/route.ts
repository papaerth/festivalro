import { prisma } from "@/lib/prisma";
import { snapshotOf, toProjectDTO, toPrismaPatch } from "@/lib/projects";
import { json, notFound, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: Params<{ id: string; vid: string }>) {
  const { id, vid } = await params;
  const [row, v] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.projectVersion.findFirst({ where: { id: vid, projectId: id } }),
  ]);
  if (!row || !v) return notFound("프로젝트 또는 버전을 찾을 수 없습니다.");
  // Back up the current state before restoring so the restore itself is reversible.
  await prisma.projectVersion.create({ data: { projectId: id, label: "복원 전 자동 백업", snapshot: JSON.stringify(snapshotOf(toProjectDTO(row))) } });
  let snap: Record<string, unknown> = {};
  try { snap = JSON.parse(v.snapshot); } catch { snap = {}; }
  const updated = await prisma.project.update({ where: { id }, data: toPrismaPatch(snap) });
  return json({ project: toProjectDTO(updated) });
}
