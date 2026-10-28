import type { PresetDTO, StyleFields, StyleOption } from "@/lib/types";
import { analyzeLyrics } from "@/lib/lyricsAnalysis";

export interface StyleContext {
  lyrics: string;
  title: string;
  emotion: string;
  vocal?: string;
  landscape?: string;
}

const EMOTION_TUNING: Record<string, { bpmDelta: number; emotion: string; build: string }> = {
  nostalgia: { bpmDelta: 0, emotion: "warm nostalgic longing, bittersweet reflection", build: "gradual emotional build into a wide, soaring chorus full of remembrance" },
  love: { bpmDelta: +2, emotion: "tender romantic devotion, warm intimacy", build: "gentle swell into a heartfelt, embracing chorus" },
  family: { bpmDelta: -2, emotion: "deep familial warmth, gratitude and tenderness", build: "quiet intimate verses rising into a comforting, tearful chorus" },
  life: { bpmDelta: 0, emotion: "reflective wisdom, dignified acceptance of time passing", build: "steady build toward a grand, uplifting chorus" },
  hope: { bpmDelta: +4, emotion: "hopeful, uplifting, sunrise-like optimism", build: "brightening dynamics into a soaring, triumphant chorus" },
  farewell: { bpmDelta: -4, emotion: "aching farewell, longing and quiet sorrow", build: "restrained verses breaking into a tearful, soaring chorus" },
  gratitude: { bpmDelta: 0, emotion: "heartfelt gratitude, humble warmth", build: "warm build into a glowing, thankful chorus" },
};

function detectAccentFromLyrics(lyrics: string): string[] {
  const l = lyrics.toLowerCase();
  const accents: string[] = [];
  if (/\b(rain|storm|tears)\b/.test(l)) accents.push("rain-soaked melancholic textures");
  if (/\b(sea|ocean|waves|shore|harbor|island)\b/.test(l)) accents.push("wide open oceanic reverb");
  if (/\b(mountain|pine|cedar|valley|hills)\b/.test(l)) accents.push("airy mountain-wind ambience");
  if (/\b(river|stream|lake)\b/.test(l)) accents.push("flowing, gentle rhythmic motion");
  if (/\b(autumn|leaves|maple|fall)\b/.test(l)) accents.push("golden autumn warmth");
  if (/\b(spring|blossom|cherry|bloom)\b/.test(l)) accents.push("blooming springtime lightness");
  if (/\b(winter|snow|frost)\b/.test(l)) accents.push("hushed snowy stillness");
  if (/\b(dance|danced|dancing)\b/.test(l)) accents.push("gentle swaying groove");
  return accents.slice(0, 2);
}

export function buildStyleFields(preset: PresetDTO, ctx: StyleContext): StyleFields {
  const tuning = EMOTION_TUNING[ctx.emotion] ?? EMOTION_TUNING.nostalgia;
  const analysis = ctx.lyrics ? analyzeLyrics(ctx.lyrics) : null;
  const dense = analysis ? analysis.avgSyllablesPerLine > 10 : false;
  const sparse = analysis ? analysis.avgSyllablesPerLine > 0 && analysis.avgSyllablesPerLine < 6 : false;
  let bpm = preset.bpm + tuning.bpmDelta + (dense ? -2 : 0) + (sparse ? +2 : 0);
  bpm = Math.max(62, Math.min(92, bpm));

  const instrumentsByKey: Record<string, string> = {
    C: "melodic electric guitar, gentle acoustic guitar, rich piano chords, sweeping orchestral strings, organic live drums, warm bass",
    A: "soft piano, fingerpicked acoustic guitar, classic lush strings, light brushed drums, round warm bass",
    B: "emotional piano, lush sorrowful strings, gentle acoustic guitar, soft live drums, warm bass",
    C1: "clean melodic electric guitar with gentle chorus effect, warm piano, soft strings, laid-back live drums, round bass",
    C2: "soaring electric guitar leads, dramatic piano, full orchestral strings and brass swells, thunderous organic live drums, deep bass",
    C3: "expressive melodic electric guitar, warm piano, sweeping strings, gentle live drums, warm bass",
  };
  const arrangementByKey: Record<string, string> = {
    C: "intimate storytelling verses, subtle Korean-inspired melodic ornaments, tasteful guitar solo before the final chorus",
    A: "intimate verses with gentle vocal harmonies, classic string countermelodies, soft final refrain",
    B: "restrained vibrato and subtle melodic bends, sophisticated modern pop ballad arrangement rather than traditional trot rhythm",
    C1: "romantic storytelling verses, warm guitar fills, gentle vocal harmonies on the chorus",
    C2: "quiet reflective opening, massive orchestral build, key-change lift into the anthemic final chorus",
    C3: "intimate verses, Korean-inspired sorrowful melodic ornaments, aching emotional build",
  };
  const mixingByKey: Record<string, string> = {
    C: "polished warm analog-inspired production",
    A: "warm analog tape production, vintage 1970s mix",
    B: "polished warm mix with lush reverb on strings",
    C1: "intimate warm analog production",
    C2: "wide cinematic mix with deep low end",
    C3: "polished warm analog-inspired production",
  };

  const accents = detectAccentFromLyrics(ctx.lyrics);
  const emotionText = [tuning.emotion, ...accents].join(", ");

  return {
    genre: preset.name,
    vocal: ctx.vocal || preset.vocal || "warm mature male baritone",
    bpm,
    timeSig: preset.timeSig || "4/4",
    instruments: instrumentsByKey[preset.key] ?? extractInstruments(preset.prompt),
    emotion: emotionText,
    arrangement: arrangementByKey[preset.key] ?? "intimate verses with a gradual emotional build",
    chorusBuild: tuning.build,
    mixing: mixingByKey[preset.key] ?? "polished warm production",
    length: "under 3 minutes",
  };
}

function extractInstruments(prompt: string): string {
  const known = ["piano", "guitar", "strings", "drums", "bass", "brass", "cello", "violin", "organ", "harmonica", "saxophone"];
  const parts = prompt.split(",").map((s) => s.trim()).filter((p) => known.some((k) => p.toLowerCase().includes(k)));
  return parts.length ? parts.join(", ") : "piano, acoustic guitar, strings, live drums, warm bass";
}

/** Compose the Suno "Style of Music" prompt from fields. Keeps the C default prompt shape. */
export function composePrompt(f: StyleFields, preset: PresetDTO): string {
  const era =
    preset.key === "A" ? "vintage 1970s pop atmosphere" :
    preset.key === "B" ? "Korean-inspired trot-influenced melodic phrasing, English lyrics" :
    preset.key === "C2" ? "film score grandeur" :
    "emotional 1970s and 1980s classic pop atmosphere";
  const genreLine = `${preset.name.replace(/\s+/g, " ").trim()} ballad`.replace(/ballad ballad/i, "ballad").toLowerCase();
  const text = [
    capitalize(genreLine),
    f.vocal,
    era,
    f.instruments,
    f.arrangement,
    f.emotion,
    f.chorusBuild,
    "timeless melody",
    f.mixing,
    `approximately ${f.bpm} BPM`,
    f.timeSig,
    f.length,
  ]
    .filter(Boolean)
    .join(", ");
  return text.endsWith(".") ? text : text + ".";
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildStyleOption(preset: PresetDTO, ctx: StyleContext): StyleOption {
  const fields = buildStyleFields(preset, ctx);
  return {
    key: preset.key,
    name: preset.name,
    nameKo: preset.nameKo,
    prompt: composePrompt(fields, preset),
    excludes: preset.excludes,
    ...fields,
  };
}

export function buildAllStyleOptions(presets: PresetDTO[], ctx: StyleContext): StyleOption[] {
  const order = ["C", "A", "B", "C1", "C2", "C3"];
  const sorted = [...presets].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? 100 + a.sortOrder : ia) - (ib === -1 ? 100 + b.sortOrder : ib);
  });
  return sorted.map((p) => buildStyleOption(p, ctx));
}
