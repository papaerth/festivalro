import type { PresetDTO, ProjectDTO } from "@/lib/types";

export interface StepProps {
  project: ProjectDTO;
  presets: PresetDTO[];
  ai: boolean;
  /** Update local state and schedule autosave. */
  update: (patch: Partial<ProjectDTO>) => void;
  /** Flush pending edits and snapshot a named version. */
  saveVersion: (label: string) => Promise<void>;
  goTo: (step: number) => void;
}

export const STEPS = [
  { n: 1, key: "reference", ko: "참고 가사", desc: "가사 붙여넣기·분석·권리 확인" },
  { n: 2, key: "title", ko: "제목·스토리", desc: "영어 제목 + 한국어 스토리 생성" },
  { n: 3, key: "lyrics", ko: "영어 가사", desc: "생성·수정·부분 재작성·음절 검증" },
  { n: 4, key: "style", ko: "스타일", desc: "C / A / B 프롬프트 생성·선택" },
  { n: 5, key: "export", ko: "Suno 복사", desc: "제목·가사·스타일·제외 원클릭 복사" },
  { n: 6, key: "video", ko: "영상 콘셉트", desc: "한국 풍경 영상 기획" },
] as const;
