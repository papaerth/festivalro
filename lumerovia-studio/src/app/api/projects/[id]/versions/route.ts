import { prisma } from "@/lib/prisma";
import { snapshotOf, toProjectDTO, toVersionDTO } from "@/lib/projects";
import { json, notFound, readBody, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const rows = await prisma.projectVersion.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 100 });
  return json({ versions: rows.map((v) => toVersionDTO(v)) });
}

/** Save a snapshot of the project's current state as a version. */
export async function POST(req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const body = await readBody(req);
  const row = await prisma.project.findUnique({ where: { id } });
  if (!row) return notFound("프로젝트를 찾을 수 없습니다.");
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : "수동 저장";
  const v = await prisma.projectVersion.create({ data: { projectId: id, label, snapshot: JSON.stringify(snapshotOf(toProjectDTO(row))) } });
  return json({ version: toVersionDTO(v) }, 201);
}
