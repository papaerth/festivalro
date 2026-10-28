import { prisma } from "@/lib/prisma";
import type { PresetDTO } from "@/lib/types";

export const DEFAULT_EXCLUDES =
  "heavy metal, EDM, trap, hip hop, rap, autotune, screaming, harsh distortion, lo-fi noise, chiptune, children's choir, spoken word, fast tempo, club beat";

export const BUILTIN_PRESETS: Omit<PresetDTO, "id">[] = [
  {
    key: "C",
    name: "Cinematic Nostalgic Soft Rock",
    nameKo: "시네마틱 노스탤직 소프트록",
    description:
      "LUMEROVIA 대표 스타일. 성숙하고 따뜻한 남성 중저음, 감성적인 일렉 기타·피아노·오케스트라 스트링, 조용히 시작해 감동적으로 고조되는 후렴.",
    prompt:
      "Cinematic nostalgic soft rock ballad, warm and expressive mature male baritone, emotional 1970s and 1980s classic pop atmosphere, melodic electric guitar, gentle acoustic guitar, rich piano chords, sweeping orchestral strings, organic live drums, warm bass, subtle Korean-inspired melodic ornaments, intimate storytelling verses, gradual emotional build, powerful soaring chorus, tasteful guitar solo, heartfelt romantic atmosphere, timeless melody, polished warm analog-inspired production, approximately 76 BPM, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", synth-pop, disco",
    bpm: 76,
    timeSig: "4/4",
    vocal: "warm mature male baritone",
    genreTags: "soft rock, cinematic, nostalgic, ballad",
    isDefault: true,
    isBuiltin: true,
    sortOrder: 1,
  },
  {
    key: "A",
    name: "Vintage Pop Ballad",
    nameKo: "빈티지 팝 발라드",
    description: "따뜻한 올드팝 발라드. 부드러운 피아노와 어쿠스틱 기타, 감성적인 남녀 보컬, 클래식한 스트링 편곡. 추억과 사랑 중심.",
    prompt:
      "Vintage 1970s pop ballad, warm and tender male and female vocals with gentle harmonies, soft piano, fingerpicked acoustic guitar, classic lush string arrangement, light brushed drums, round warm bass, nostalgic and romantic atmosphere about memories and love, intimate storytelling verses, heartfelt lifting chorus, timeless memorable melody, warm analog tape production, approximately 72 BPM, 4/4, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", electric guitar solo, arena rock",
    bpm: 72,
    timeSig: "4/4",
    vocal: "male and female duet",
    genreTags: "pop ballad, vintage, 1970s, romantic",
    isDefault: false,
    isBuiltin: true,
    sortOrder: 2,
  },
  {
    key: "B",
    name: "Korean Trot Ballad Fusion",
    nameKo: "코리안 트로트 발라드 퓨전",
    description: "한국적인 애절한 선율과 절제된 꺾기·비브라토. 영어 가사, 감성적인 피아노와 현악기. 전통 트로트 리듬보다 세련된 팝 발라드 편곡 중심.",
    prompt:
      "Korean-inspired emotional pop ballad with trot-influenced melodic phrasing, expressive mature vocal with restrained vibrato and subtle melodic bends, English lyrics, emotional piano, lush sorrowful strings, gentle acoustic guitar, soft live drums, sophisticated modern pop ballad arrangement rather than traditional trot rhythm, deeply sorrowful yet hopeful mood, slow build to a tearful soaring chorus, polished warm mix, approximately 70 BPM, 4/4, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", traditional trot rhythm, accordion polka beat, cheesy synth brass",
    bpm: 70,
    timeSig: "4/4",
    vocal: "tender mature male tenor",
    genreTags: "korean ballad, trot fusion, emotional, strings",
    isDefault: false,
    isBuiltin: true,
    sortOrder: 3,
  },
  {
    key: "C1",
    name: "Romantic Soft Rock",
    nameKo: "로맨틱 소프트록",
    description: "C 스타일의 로맨틱 변주. 1980년대 소프트록의 부드러운 질감, 깨끗한 일렉 기타와 따뜻한 피아노, 사랑 이야기에 어울리는 잔잔한 고조.",
    prompt:
      "Romantic nostalgic soft rock ballad, warm mature male baritone, tender 1980s soft rock feel, clean melodic electric guitar with gentle chorus effect, warm piano, soft strings, laid-back live drums, round bass, romantic storytelling verses, heartfelt chorus with a gentle lift, intimate warm analog production, approximately 78 BPM, 4/4, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", heavy orchestral brass",
    bpm: 78,
    timeSig: "4/4",
    vocal: "warm mature male baritone",
    genreTags: "soft rock, romantic, 1980s",
    isDefault: false,
    isBuiltin: true,
    sortOrder: 4,
  },
  {
    key: "C2",
    name: "Epic Cinematic Rock",
    nameKo: "에픽 시네마틱 록",
    description: "C 스타일의 웅장한 변주. 영화 OST 같은 스케일, 솟구치는 기타 리드, 풀 오케스트라, 마지막 후렴의 전조와 폭발적인 감정.",
    prompt:
      "Epic cinematic rock ballad, powerful warm mature male vocal, film score grandeur, soaring melodic electric guitar leads, dramatic piano, full orchestral strings and brass swells, thunderous yet organic live drums, deep bass, quiet reflective opening, massive emotional build, anthemic soaring final chorus with a key-change lift, wide cinematic mix, approximately 80 BPM, 4/4, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", thin lo-fi mix, minimal acoustic",
    bpm: 80,
    timeSig: "4/4",
    vocal: "warm mature male baritone",
    genreTags: "cinematic rock, epic, orchestral",
    isDefault: false,
    isBuiltin: true,
    sortOrder: 5,
  },
  {
    key: "C3",
    name: "Heartfelt Korean Fusion",
    nameKo: "하트펠트 코리안 퓨전",
    description: "C 스타일에 한국 발라드의 애절함을 더한 변주. 절제된 비브라토, 한국적 선율 장식, 눈물 어린 후렴.",
    prompt:
      "Heartfelt cinematic soft rock with Korean ballad sensibility, warm mature male vocal with subtle emotional vibrato, Korean-inspired sorrowful melodic ornaments, expressive melodic electric guitar, warm piano, sweeping strings, gentle live drums, warm bass, intimate verses, aching emotional build, tearful soaring chorus, polished warm analog-inspired production, approximately 74 BPM, 4/4, under 3 minutes.",
    excludes: DEFAULT_EXCLUDES + ", traditional trot rhythm",
    bpm: 74,
    timeSig: "4/4",
    vocal: "warm mature male baritone",
    genreTags: "soft rock, korean ballad, cinematic",
    isDefault: false,
    isBuiltin: true,
    sortOrder: 6,
  },
];

export async function ensurePresets(): Promise<PresetDTO[]> {
  const count = await prisma.stylePreset.count();
  if (count === 0) {
    for (const p of BUILTIN_PRESETS) {
      await prisma.stylePreset.create({ data: p });
    }
  }
  const rows = await prisma.stylePreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(toPresetDTO);
}

export function toPresetDTO(row: {
  id: string; key: string; name: string; nameKo: string; description: string; prompt: string; excludes: string;
  bpm: number; timeSig: string; vocal: string; genreTags: string; isDefault: boolean; isBuiltin: boolean; sortOrder: number;
}): PresetDTO {
  return {
    id: row.id, key: row.key, name: row.name, nameKo: row.nameKo, description: row.description, prompt: row.prompt,
    excludes: row.excludes, bpm: row.bpm, timeSig: row.timeSig, vocal: row.vocal, genreTags: row.genreTags,
    isDefault: row.isDefault, isBuiltin: row.isBuiltin, sortOrder: row.sortOrder,
  };
}
