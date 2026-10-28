"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PresetDTO, ProjectDTO } from "@/lib/types";
import { useAutosave } from "@/hooks/useAutosave";
import { BrandMark } from "@/components/BrandMark";
import { AIModeBadge } from "@/components/AIModeBadge";
import { AutosaveIndicator } from "@/components/studio/AutosaveIndicator";
import { StepNav } from "@/components/studio/StepNav";
import { STEPS, type StepProps } from "@/components/studio/types";
import { ReferenceStep } from "@/components/studio/ReferenceStep";
import { TitleStep } from "@/components/studio/TitleStep";
import { LyricsStep } from "@/components/studio/LyricsStep";
import { StyleStep } from "@/components/studio/StyleStep";
import { ExportStep } from "@/components/studio/ExportStep";
import { VideoStep } from "@/components/studio/VideoStep";
import { VersionsDrawer } from "@/components/studio/VersionsDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, History, Trash2 } from "lucide-react";

export function Studio({ initial, presets, ai, model }: { initial: ProjectDTO; presets: PresetDTO[]; ai: boolean; model: string | null }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDTO>(initial);
  const [step, setStep] = useState<number>(Math.min(6, Math.max(1, initial.currentStep || 1)));
  const [maxReached, setMaxReached] = useState<number>(step);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);
  const { status, savedAt, error, schedule, flush } = useAutosave(project.id);

  const update = useCallback(
    (patch: Partial<ProjectDTO>) => {
      setProject((p) => ({ ...p, ...patch }));
      schedule(patch);
    },
    [schedule],
  );

  const goTo = useCallback(
    (n: number) => {
      const clamped = Math.min(6, Math.max(1, n));
      setStep(clamped);
      setMaxReached((m) => Math.max(m, clamped));
      update({ currentStep: clamped });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [update],
  );

  const saveVersion = useCallback(
    async (label: string) => {
      await flush();
      await fetch(`/api/projects/${project.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      setVersionsKey((k) => k + 1);
    },
    [flush, project.id],
  );

  const duplicate = async () => {
    await flush();
    const res = await fetch(`/api/projects/${project.id}/duplicate`, { method: "POST" });
    const data = (await res.json()) as { project?: ProjectDTO };
    if (data.project) router.push(`/studio/${data.project.id}`);
  };

  const remove = async () => {
    if (!confirm(`"${project.title || "제목 없는 곡"}"을(를) 삭제할까요? 모든 버전 기록도 함께 삭제됩니다.`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const stepProps: StepProps = useMemo(() => ({ project, presets, ai, update, saveVersion, goTo }), [project, presets, ai, update, saveVersion, goTo]);
  const current = STEPS[step - 1];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <BrandMark compact />
        <div className="flex flex-wrap items-center gap-2">
          <AIModeBadge ai={ai} model={model} />
          <AutosaveIndicator status={status} savedAt={savedAt} error={error} />
          <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)} data-testid="open-versions"><History /> 수정 기록</Button>
          <Button variant="ghost" size="sm" onClick={duplicate} data-testid="duplicate"><Copy /> 복제</Button>
          <Button variant="ghost" size="sm" onClick={remove} className="text-red-300 hover:text-red-200"><Trash2 /> 삭제</Button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="w-full min-w-0 sm:flex-1">
          <label className="text-[11px] uppercase tracking-[0.3em] text-gold-400">Song Title</label>
          <Input
            className="mt-1 h-auto border-0 border-b border-border/60 bg-transparent px-0 font-serif text-3xl text-ivory shadow-none focus-visible:ring-0 sm:text-4xl"
            placeholder="제목 없는 곡"
            value={project.title}
            onChange={(e) => update({ title: e.target.value })}
            data-testid="project-title"
          />
          {project.titleKo && <p className="mt-1 text-sm text-gold-300">{project.titleKo}</p>}
        </div>
        <div className="text-xs text-muted-foreground sm:text-right">
          <div>{project.genre} · {project.bpm} BPM</div>
          <div>{project.vocal}</div>
        </div>
      </div>

      <div className="mt-6">
        <StepNav current={step} maxReached={maxReached} onSelect={goTo} />
      </div>

      <section className="mt-6" aria-label={current.ko} data-testid={`panel-${step}`}>
        {step === 1 && <ReferenceStep {...stepProps} />}
        {step === 2 && <TitleStep {...stepProps} />}
        {step === 3 && <LyricsStep {...stepProps} />}
        {step === 4 && <StyleStep {...stepProps} />}
        {step === 5 && <ExportStep {...stepProps} />}
        {step === 6 && <VideoStep {...stepProps} />}
      </section>

      <VersionsDrawer
        projectId={project.id}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        flush={flush}
        refreshKey={versionsKey}
        onRestored={(p) => {
          setProject(p);
          setVersionsOpen(false);
        }}
      />
    </div>
  );
}
