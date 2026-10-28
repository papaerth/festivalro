import type { LineAnalysis, LyricsAnalysis, SectionAnalysis } from "@/lib/types";

const SECTION_RE =
  /^\s*[\[(]?\s*(intro|verse|pre-?chorus|chorus|bridge|outro|hook|refrain|interlude|solo|final chorus|ending|coda)\s*(\d+)?\s*[\])]?\s*:?\s*$/i;

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are",
  "was", "were", "be", "been", "am", "it", "its", "my", "your", "his", "her", "our", "their", "me", "you", "him", "them",
  "us", "we", "i", "he", "she", "they", "that", "this", "these", "those", "than", "then", "so", "if", "do", "did", "does",
  "has", "have", "had", "will", "would", "can", "could", "shall", "should", "may", "might", "not", "no", "nor", "up",
  "out", "into", "oh", "ah", "ooh", "there", "here", "when", "where", "while", "just", "yet", "still", "all", "some",
]);

const MOOD_LEXICON: Record<string, { ko: string; words: string[] }> = {
  nostalgia: { ko: "추억·향수", words: ["remember", "memory", "memories", "yesterday", "once", "old", "photograph", "faded", "long ago", "used to", "those days", "childhood", "years", "back then", "echo", "still"] },
  love: { ko: "사랑", words: ["love", "heart", "hold", "kiss", "darling", "arms", "forever", "together", "sweetheart", "tender", "dear", "mine", "yours"] },
  family: { ko: "가족", words: ["mother", "father", "mama", "papa", "daddy", "son", "daughter", "home", "family", "child", "children", "grandma", "grandpa", "kitchen", "table", "porch"] },
  life: { ko: "인생·세월", words: ["life", "road", "river", "journey", "time", "seasons", "grow", "older", "wiser", "miles", "chapter", "pages", "wind", "mountain"] },
  hope: { ko: "희망", words: ["hope", "dawn", "morning", "light", "shine", "rise", "tomorrow", "sunrise", "new day", "wings", "sky", "brighter", "dream", "believe"] },
  farewell: { ko: "이별·그리움", words: ["goodbye", "gone", "miss", "lonely", "alone", "tears", "cry", "empty", "farewell", "leaving", "left", "without", "fade", "rain", "ache"] },
  gratitude: { ko: "감사", words: ["thank", "grateful", "blessed", "gift", "grace", "give", "thankful", "kindness", "stayed"] },
  peace: { ko: "평온", words: ["quiet", "still", "calm", "gentle", "soft", "slow", "breathe", "peace", "rest", "evening", "moonlight", "lake"] },
};

export function countSyllables(rawWord: string): number {
  let word = rawWord.toLowerCase().replace(/[^a-z']/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  const exceptions: Record<string, number> = {
    beautiful: 3, every: 2, everything: 3, evening: 3, family: 3, memories: 3, memory: 3, poem: 2, fire: 1, hour: 1,
    our: 1, flower: 2, power: 2, forever: 3, heaven: 2, something: 2, nothing: 2, somewhere: 2, lonely: 2, angel: 2,
    little: 2, table: 2, people: 2, simple: 2, gentle: 2, candle: 2, maybe: 2, really: 2, idea: 3, area: 3, being: 2,
    going: 2, doing: 2, seeing: 2, ocean: 2, violet: 3, quiet: 2, science: 2, create: 2, museum: 3, cafe: 2,
  };
  if (exceptions[word] !== undefined) return exceptions[word];
  word = word.replace(/'(s|d|ll|ve|re|m)$/, "");
  // "ed" endings that are silent
  word = word.replace(/([^td])ed$/, "$1");
  // silent trailing e (not "le" after consonant)
  if (/[^aeiou]le$/.test(word)) {
    word = word.replace(/le$/, "l@");
  } else {
    word = word.replace(/([^aeiouy])e$/, "$1");
  }
  word = word.replace(/^y/, "");
  const groups = word.match(/[aeiouy@]+/g);
  let count = groups ? groups.length : 0;
  // diphthong-ish corrections
  if (/[aeiou]{2}[^aeiou]*ia/.test(word)) count += 0;
  if (/(ia|io|eo|ua|iu)(?!n$)/.test(word)) count += 1;
  if (/ying$/.test(rawWord.toLowerCase())) count = Math.max(count, 2);
  return Math.max(1, count);
}

function tokenize(line: string): string[] {
  return line
    .replace(/\//g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, ""))
    .filter((w) => /[a-zA-Z]/.test(w));
}

function stressPattern(words: string[]): string {
  const parts: string[] = [];
  for (const w of words) {
    const syl = countSyllables(w);
    const lower = w.toLowerCase();
    if (syl === 1) {
      parts.push(FUNCTION_WORDS.has(lower) ? "u" : "S");
    } else {
      // Heuristic: most English 2-syllable nouns/adjectives stress the first syllable;
      // words with common unstressed prefixes stress the second.
      const secondStress = /^(a|be|re|de|for|con|com|pro|per|pre|un|in|im|en|ex)[a-z]/.test(lower) && syl === 2;
      let p = "";
      for (let i = 0; i < syl; i++) {
        const stressed = secondStress ? i === 1 : i === 0 || (syl >= 4 && i === 2);
        p += stressed ? "S" : "u";
      }
      parts.push(p);
    }
  }
  return parts.join(" ");
}

function rhymeKey(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  const m = w.match(/[aeiouy]+[^aeiouy]*$/);
  let key = m ? m[0] : w.slice(-2);
  key = key.replace(/e$/, "").replace(/s$/, "");
  // normalize common spellings
  key = key.replace(/igh/, "i").replace(/ay$/, "a").replace(/ey$/, "a").replace(/ow$/, "o");
  return key || w.slice(-2);
}

function slashPositions(line: string): number[] {
  // position = number of words before each slash
  const positions: number[] = [];
  let wordCount = 0;
  const tokens = line.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t === "/") {
      positions.push(wordCount);
      continue;
    }
    const pieces = t.split("/");
    pieces.forEach((piece, i) => {
      if (/[a-zA-Z]/.test(piece)) wordCount += 1;
      if (i < pieces.length - 1) positions.push(wordCount);
    });
  }
  return positions;
}

function inferSectionName(blockIndex: number, blockText: string, repeated: boolean, total: number): string {
  if (repeated) return "Chorus";
  if (blockIndex === total - 1 && total > 2) return "Outro";
  if (blockIndex >= 2 && total >= 4 && blockIndex === total - 2) return "Bridge";
  return `Verse ${blockIndex + 1}`;
}

export function analyzeLyrics(text: string): LyricsAnalysis {
  const rawLines = text.replace(/\r/g, "").split("\n");
  const lines: LineAnalysis[] = [];
  const sectionsOrder: string[] = [];
  const hasHeaders = rawLines.some((l) => SECTION_RE.test(l));
  let current = "Verse 1";
  let verseCount = 0;

  // Infer sections when no headers
  let inferred: string[] = [];
  if (!hasHeaders) {
    const blocks: string[][] = [];
    let cur: string[] = [];
    for (const l of rawLines) {
      if (l.trim() === "") {
        if (cur.length) blocks.push(cur);
        cur = [];
      } else cur.push(l);
    }
    if (cur.length) blocks.push(cur);
    const norm = (b: string[]) => b.map((x) => x.trim().toLowerCase()).join("|");
    const counts = new Map<string, number>();
    blocks.forEach((b) => counts.set(norm(b), (counts.get(norm(b)) ?? 0) + 1));
    inferred = blocks.map((b, i) => inferSectionName(i, norm(b), (counts.get(norm(b)) ?? 0) > 1 && blocks.length > 1, blocks.length));
    // Renumber verses
    let v = 0;
    inferred = inferred.map((n) => (n.startsWith("Verse") ? `Verse ${++v}` : n));
  }

  let blockIdx = -1;
  let prevBlank = true;
  let lineIndex = 0;
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    const headerMatch = hasHeaders ? trimmed.match(SECTION_RE) : null;
    if (headerMatch) {
      const base = headerMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-c/i, "-C");
      const num = headerMatch[2];
      if (/^verse$/i.test(base) && !num) verseCount += 1;
      current = num ? `${base} ${num}` : /^verse$/i.test(base) ? `Verse ${verseCount}` : base;
      sectionsOrder.push(current);
      continue;
    }
    if (!hasHeaders) {
      if (trimmed === "") {
        prevBlank = true;
      } else {
        if (prevBlank) {
          blockIdx += 1;
          current = inferred[blockIdx] ?? `Verse ${blockIdx + 1}`;
          sectionsOrder.push(current);
        }
        prevBlank = false;
      }
    }
    if (trimmed === "") {
      lines.push({ index: lineIndex++, text: "", section: current, syllables: 0, words: 0, stress: "", rhymeKey: "", rhymeLetter: "", slashPositions: [], isBlank: true });
      continue;
    }
    const words = tokenize(trimmed);
    const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
    lines.push({
      index: lineIndex++,
      text: raw,
      section: current,
      syllables,
      words: words.length,
      stress: stressPattern(words),
      rhymeKey: words.length ? rhymeKey(words[words.length - 1]) : "",
      rhymeLetter: "",
      slashPositions: slashPositions(trimmed),
      isBlank: false,
    });
  }

  // Rhyme scheme per section
  const sections: SectionAnalysis[] = [];
  const bySection = new Map<string, LineAnalysis[]>();
  for (const l of lines) {
    if (l.isBlank) continue;
    if (!bySection.has(l.section)) bySection.set(l.section, []);
    bySection.get(l.section)!.push(l);
  }
  for (const [name, ls] of bySection) {
    const letters = new Map<string, string>();
    let next = 0;
    let scheme = "";
    for (const l of ls) {
      const k = l.rhymeKey;
      if (!k) {
        l.rhymeLetter = "-";
        scheme += "-";
        continue;
      }
      let letter = letters.get(k);
      if (!letter) {
        // near-rhyme: match if keys share last 2 chars
        for (const [key, let_] of letters) {
          if (key.length >= 2 && k.length >= 2 && key.slice(-2) === k.slice(-2)) {
            letter = let_;
            break;
          }
        }
        if (!letter) {
          letter = String.fromCharCode(65 + (next++ % 26));
          letters.set(k, letter);
        }
      }
      l.rhymeLetter = letter;
      scheme += letter;
    }
    const syl = ls.reduce((s, l) => s + l.syllables, 0);
    sections.push({ name, lines: ls.length, syllables: syl, avgSyllables: ls.length ? Math.round((syl / ls.length) * 10) / 10 : 0, rhymeScheme: scheme });
  }

  const nonBlank = lines.filter((l) => !l.isBlank);
  const totalWords = nonBlank.reduce((s, l) => s + l.words, 0);
  const totalSyllables = nonBlank.reduce((s, l) => s + l.syllables, 0);
  const avg = nonBlank.length ? totalSyllables / nonBlank.length : 0;

  // Mood detection
  const lower = text.toLowerCase();
  const scores: { key: string; ko: string; score: number }[] = [];
  for (const [key, { ko, words }] of Object.entries(MOOD_LEXICON)) {
    let score = 0;
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`, "g");
      score += (lower.match(re) ?? []).length;
    }
    if (score > 0) scores.push({ key, ko, score });
  }
  scores.sort((a, b) => b.score - a.score);
  const mood = scores.slice(0, 3).map((s) => s.key);
  const moodKo = scores.length ? scores.slice(0, 3).map((s) => s.ko).join(" · ") : "중립적 / 서정적";

  // Difficulty
  const reasons: string[] = [];
  let diff = 0;
  if (avg > 11) { diff += 2; reasons.push("행당 평균 음절이 11을 넘어 호흡이 길다"); }
  else if (avg > 8.5) { diff += 1; reasons.push("행당 평균 음절이 다소 많다"); }
  const longWords = nonBlank.flatMap((l) => tokenize(l.text)).filter((w) => countSyllables(w) >= 4).length;
  if (longWords >= 4) { diff += 1; reasons.push(`4음절 이상 긴 단어가 ${longWords}개`); }
  const clusterWords = nonBlank.flatMap((l) => tokenize(l.text)).filter((w) => /[^aeiou\s]{4,}/i.test(w)).length;
  if (clusterWords >= 3) { diff += 1; reasons.push("자음이 연속되는 단어가 많아 발음 난이도가 있다"); }
  const variance = nonBlank.length
    ? nonBlank.reduce((s, l) => s + Math.abs(l.syllables - avg), 0) / nonBlank.length
    : 0;
  if (variance > 3) { diff += 1; reasons.push("행별 음절 수 편차가 커서 리듬 맞추기가 어렵다"); }
  if (reasons.length === 0) reasons.push("행 길이가 고르고 단어가 단순해 부르기 편하다");
  const difficulty = diff >= 3 ? "hard" : diff >= 1 ? "medium" : "easy";
  const difficultyKo = difficulty === "hard" ? "어려움" : difficulty === "medium" ? "보통" : "쉬움";

  // Rough length estimate: ~1 syllable per 0.42s at ballad tempo + section breathing
  const estimatedMinutes = Math.round(((totalSyllables * 0.42 + sections.length * 6) / 60) * 10) / 10;

  const structure = sectionsOrder.length ? sectionsOrder : Array.from(bySection.keys());

  return {
    structure,
    sections,
    lines,
    totalLines: nonBlank.length,
    totalWords,
    totalSyllables,
    avgSyllablesPerLine: Math.round(avg * 10) / 10,
    mood,
    moodKo,
    difficulty,
    difficultyKo,
    difficultyReasons: reasons,
    estimatedMinutes,
  };
}

/** Compare generated lyrics against a reference for precision-edit mode. */
export interface LineComparison {
  index: number;
  reference: string;
  target: string;
  refSyllables: number;
  targetSyllables: number;
  refSlashes: number[];
  targetSlashes: number[];
  syllableMatch: boolean;
  slashMatch: boolean;
  blankMatch: boolean;
}

export function compareStructure(reference: string, target: string) {
  const ref = analyzeLyrics(reference).lines;
  const tgt = analyzeLyrics(target).lines;
  const n = Math.max(ref.length, tgt.length);
  const rows: LineComparison[] = [];
  let matched = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = ref[i];
    const t = tgt[i];
    const refBlank = !r || r.isBlank;
    const tgtBlank = !t || t.isBlank;
    const row: LineComparison = {
      index: i,
      reference: r?.text ?? "",
      target: t?.text ?? "",
      refSyllables: r?.syllables ?? 0,
      targetSyllables: t?.syllables ?? 0,
      refSlashes: r?.slashPositions ?? [],
      targetSlashes: t?.slashPositions ?? [],
      syllableMatch: (r?.syllables ?? 0) === (t?.syllables ?? 0),
      slashMatch: JSON.stringify(r?.slashPositions ?? []) === JSON.stringify(t?.slashPositions ?? []),
      blankMatch: refBlank === tgtBlank,
    };
    if (!refBlank || !tgtBlank) {
      total += 1;
      if (row.syllableMatch && row.slashMatch && row.blankMatch) matched += 1;
    }
    rows.push(row);
  }
  return {
    rows,
    matched,
    total,
    lineCountMatch: ref.length === tgt.length,
    score: total ? Math.round((matched / total) * 100) : 100,
  };
}
