import { prisma } from "@/lib/prisma";
import { toProjectDTO, toPrismaPatch } from "@/lib/projects";
import { ensurePresets } from "@/lib/presets";
import { json, readBody } from "@/app/api/_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  return json({ projects: rows.map(toProjectDTO) });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const presets = await ensurePresets();
  const def = presets.find((p) => p.isDefault) ?? presets[0];
  const data = toPrismaPatch(body);
  const row = await prisma.project.create({
    data: {
      styleKey: def?.key ?? "C",
      genre: def?.name ?? "Cinematic Nostalgic Soft Rock",
      vocal: def?.vocal ?? "warm mature male baritone",
      bpm: def?.bpm ?? 76,
      excludeStyles: def?.excludes ?? "",
      stylePrompt: def?.prompt ?? "",
      ...data,
    },
  });
  await prisma.projectVersion.create({ data: { projectId: row.id, label: "프로젝트 생성", snapshot: JSON.stringify(toProjectDTO(row)) } });
  return json({ project: toProjectDTO(row) }, 201);
}
