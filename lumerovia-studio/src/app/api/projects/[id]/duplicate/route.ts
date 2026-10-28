import { prisma } from "@/lib/prisma";
import { toProjectDTO } from "@/lib/projects";
import { json, notFound, type Params } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: Params<{ id: string }>) {
  const { id } = await params;
  const src = await prisma.project.findUnique({ where: { id } });
  if (!src) return notFound("프로젝트를 찾을 수 없습니다.");
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _i; void _c; void _u;
  const copy = await prisma.project.create({
    data: { ...rest, title: rest.title ? `${rest.title} (Copy)` : "", status: "draft" },
  });
  await prisma.projectVersion.create({ data: { projectId: copy.id, label: `"${src.title || "제목 없음"}"에서 복제`, snapshot: JSON.stringify(toProjectDTO(copy)) } });
  return json({ project: toProjectDTO(copy) }, 201);
}
