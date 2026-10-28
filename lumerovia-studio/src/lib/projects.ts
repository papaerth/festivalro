import type { Project, ProjectVersion } from "@prisma/client";
import type { ProjectDTO, ProjectVersionDTO } from "@/lib/types";

function parseJSON<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function toProjectDTO(p: Project): ProjectDTO {
  return {
    id: p.id,
    title: p.title,
    titleKo: p.titleKo,
    story: p.story,
    emotion: p.emotion,
    referenceLyrics: p.referenceLyrics,
    referenceRights: p.referenceRights,
    referenceNotes: p.referenceNotes,
    lyrics: p.lyrics,
    stylePrompt: p.stylePrompt,
    styleKey: p.styleKey,
    styleOptions: parseJSON(p.styleOptions, []),
    excludeStyles: p.excludeStyles,
    titleCandidates: parseJSON(p.titleCandidates, []),
    bpm: p.bpm,
    vocal: p.vocal,
    genre: p.genre,
    landscape: p.landscape,
    videoConcept: p.videoConcept,
    status: p.status,
    currentStep: p.currentStep,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Fields a client may PATCH. JSON-ish fields are stringified for SQLite. */
export const PATCHABLE_FIELDS = [
  "title", "titleKo", "story", "emotion", "referenceLyrics", "referenceRights", "referenceNotes", "lyrics", "stylePrompt",
  "styleKey", "styleOptions", "excludeStyles", "titleCandidates", "bpm", "vocal", "genre", "landscape", "videoConcept", "status", "currentStep",
] as const;

export function toPrismaPatch(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const key of PATCHABLE_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];
    if (key === "styleOptions" || key === "titleCandidates") data[key] = JSON.stringify(Array.isArray(v) ? v : []);
    else if (key === "bpm" || key === "currentStep") data[key] = Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined;
    else data[key] = typeof v === "string" ? v : String(v ?? "");
  }
  return data;
}

/** Snapshot of everything that matters for version history. */
export function snapshotOf(dto: ProjectDTO): Partial<ProjectDTO> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = dto;
  void _id; void _c; void _u;
  return rest;
}

export function toVersionDTO(v: ProjectVersion, includeSnapshot = false): ProjectVersionDTO {
  return {
    id: v.id,
    projectId: v.projectId,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
    snapshot: includeSnapshot ? parseJSON<Partial<ProjectDTO>>(v.snapshot, {}) : undefined,
  };
}
