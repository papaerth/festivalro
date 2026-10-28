import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toProjectDTO } from "@/lib/projects";
import { ensurePresets } from "@/lib/presets";
import { AI_MODEL, hasAI } from "@/lib/ai/client";
import { Studio } from "@/components/studio/Studio";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.project.findUnique({ where: { id }, select: { title: true } });
  return { title: row?.title ? row.title : "새 곡" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row, presets] = await Promise.all([prisma.project.findUnique({ where: { id } }), ensurePresets()]);
  if (!row) notFound();
  const ai = hasAI();
  return <Studio initial={toProjectDTO(row)} presets={presets} ai={ai} model={ai ? AI_MODEL : null} />;
}
