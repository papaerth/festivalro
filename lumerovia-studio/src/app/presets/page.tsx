import { BrandMark } from "@/components/BrandMark";
import { PresetManager } from "@/components/PresetManager";
import { ensurePresets } from "@/lib/presets";

export const dynamic = "force-dynamic";
export const metadata = { title: "스타일 프리셋" };

export default async function PresetsPage() {
  const presets = await ensurePresets();
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <BrandMark compact />
      </header>
      <h1 className="mt-8 font-serif text-3xl text-ivory">스타일 프리셋</h1>
      <p className="mt-2 text-sm text-ivory-400">
        장르별 Suno 스타일 프롬프트를 저장·수정하고 새 프리셋을 추가합니다. 기본값으로 지정한 프리셋이 모든 새 곡에 자동 선택됩니다.
      </p>
      <PresetManager initial={presets} />
    </main>
  );
}
