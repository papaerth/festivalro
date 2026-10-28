export const EMOTIONS = [
  { key: "nostalgia", ko: "추억·향수", en: "Nostalgia" },
  { key: "love", ko: "사랑", en: "Love" },
  { key: "family", ko: "가족", en: "Family" },
  { key: "life", ko: "인생·세월", en: "Life" },
  { key: "hope", ko: "희망", en: "Hope" },
  { key: "farewell", ko: "이별·그리움", en: "Farewell" },
  { key: "gratitude", ko: "감사", en: "Gratitude" },
] as const;
export type EmotionKey = (typeof EMOTIONS)[number]["key"];

export const RIGHTS_OPTIONS = [
  { key: "unknown", ko: "확인 안 함", desc: "출처를 모르는 가사. 음악적 특징만 참고합니다." },
  { key: "own", ko: "본인 작품", desc: "내가 쓴 가사. 정밀 편집 모드 사용 가능." },
  { key: "licensed", ko: "이용 허락 받음", desc: "저작권자 허락을 받은 가사. 정밀 편집 모드 사용 가능." },
  { key: "third_party", ko: "타인 저작물", desc: "타인의 저작권 보호 작품. 구조·표현 복제 금지, 분위기만 참고." },
] as const;
export type RightsKey = (typeof RIGHTS_OPTIONS)[number]["key"];

export const VOCAL_OPTIONS = [
  "warm mature male baritone",
  "tender mature male tenor",
  "warm mature female alto",
  "soft mature female vocal",
  "male and female duet",
] as const;

export const PROJECT_STATUSES = [
  { key: "draft", ko: "작성 중" },
  { key: "lyrics_done", ko: "가사 완성" },
  { key: "ready", ko: "Suno 준비 완료" },
  { key: "produced", ko: "제작 완료" },
  { key: "published", ko: "업로드 완료" },
] as const;

export interface TitleCandidate {
  id: string;
  title: string;
  titleKo: string;
  story: string;
  vocal: string;
  genre: string;
  landscape: string;
}

export interface StyleFields {
  genre: string;
  vocal: string;
  bpm: number;
  timeSig: string;
  instruments: string;
  emotion: string;
  arrangement: string;
  chorusBuild: string;
  mixing: string;
  length: string;
}

export interface StyleOption extends StyleFields {
  key: string;
  name: string;
  nameKo: string;
  prompt: string;
  excludes: string;
}

export interface LineAnalysis {
  index: number;
  text: string;
  section: string;
  syllables: number;
  words: number;
  stress: string;
  rhymeKey: string;
  rhymeLetter: string;
  slashPositions: number[];
  isBlank: boolean;
}

export interface SectionAnalysis {
  name: string;
  lines: number;
  syllables: number;
  avgSyllables: number;
  rhymeScheme: string;
}

export interface LyricsAnalysis {
  structure: string[];
  sections: SectionAnalysis[];
  lines: LineAnalysis[];
  totalLines: number;
  totalWords: number;
  totalSyllables: number;
  avgSyllablesPerLine: number;
  mood: string[];
  moodKo: string;
  difficulty: "easy" | "medium" | "hard";
  difficultyKo: string;
  difficultyReasons: string[];
  estimatedMinutes: number;
}

export interface ProjectDTO {
  id: string;
  title: string;
  titleKo: string;
  story: string;
  emotion: EmotionKey | string;
  referenceLyrics: string;
  referenceRights: RightsKey | string;
  referenceNotes: string;
  lyrics: string;
  stylePrompt: string;
  styleKey: string;
  styleOptions: StyleOption[];
  excludeStyles: string;
  titleCandidates: TitleCandidate[];
  bpm: number;
  vocal: string;
  genre: string;
  landscape: string;
  videoConcept: string;
  status: string;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectVersionDTO {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  snapshot?: Partial<ProjectDTO>;
}

export interface PresetDTO {
  id: string;
  key: string;
  name: string;
  nameKo: string;
  description: string;
  prompt: string;
  excludes: string;
  bpm: number;
  timeSig: string;
  vocal: string;
  genreTags: string;
  isDefault: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export type AISource = "ai" | "sample";
