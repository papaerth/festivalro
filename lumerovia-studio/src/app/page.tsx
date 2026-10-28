import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toProjectDTO } from "@/lib/projects";
import { hasAI, AI_MODEL } from "@/lib/ai/client";
import { BrandMark } from "@/components/BrandMark";
import { AIModeBadge } from "@/components/AIModeBadge";
import { NewProjectButton } from "@/components/NewProjectButton";
import { ProjectCard } from "@/components/ProjectCard";
import { buttonVariants } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  const projects = rows.map(toProjectDTO);
  const ai = hasAI();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <BrandMark />
        <div className="flex items-center gap-3">
          <AIModeBadge ai={ai} model={ai ? AI_MODEL : null} />
          <Link href="/presets" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <SlidersHorizontal className="h-4 w-4" /> 스타일 프리셋
          </Link>
        </div>
      </header>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold-400">AI Music Production Studio</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-ivory sm:text-5xl">
            기억이 <span className="gold-text">멜로디</span>가 되는 곳
          </h1>
          <p className="mt-4 max-w-xl text-base text-ivory-400">
            한국의 아름다운 풍경과 1970~80년대 올드팝의 따뜻한 감성을 잇는 영어 음악 브랜드 LUMEROVIA의 제작 스튜디오입니다.
            참고 가사 분석 → 영어 제목·한국어 스토리 → 영어 가사 → Suno 스타일 프롬프트 → 원클릭 복사까지 한 흐름으로 완성하세요.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <NewProjectButton />
            <span className="text-sm text-muted-foreground">기본 스타일: Cinematic Nostalgic Soft Rock · 모든 곡은 자동 저장됩니다</span>
          </div>
        </div>
        <div className="rounded-2xl border border-gold-500/30 bg-navy-700/50 p-5 shadow-gold">
          <p className="font-serif text-sm uppercase tracking-[0.25em] text-gold-400">Workflow</p>
          <ol className="mt-3 space-y-2 text-sm text-ivory-300">
            {["참고 가사 입력·분석", "영어 제목 + 한국어 스토리 생성", "제목·스토리 선택과 수정", "영어 가사 생성·부분 재작성", "C / A / B 스타일 프롬프트", "Suno 원클릭 복사"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold-500/50 font-serif text-xs text-gold-300">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-ivory">내 곡 ({projects.length})</h2>
        </div>
        {projects.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            아직 저장된 곡이 없습니다. <span className="text-ivory">새 곡 만들기</span>로 첫 곡을 시작해 보세요.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
