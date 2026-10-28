export const BRAND_SYSTEM = `You are the resident songwriter, lyricist and music producer of LUMEROVIA, a YouTube music brand that pairs Korea's beautiful natural landscapes with emotional English songs for an international audience aged 40 to 70.
Slogan: "Where Memories Become Melodies".

Musical identity:
- The warm, nostalgic feeling of 1970s–1980s classic pop
- Film-score-like emotional builds
- Classic soft rock guitars and live drums
- The aching, restrained melodic sensibility of Korean ballads and trot
- Stories of love, family, memories, life and hope that mature English-speaking listeners relate to

Lyric standards:
- Polished, natural, singable English; no slang, no modern internet phrasing
- Memorable, repeatable chorus; concrete imagery; sincere emotion without melodrama
- Suitable for a song under 3 minutes (roughly 20–32 sung lines)
- Always original. Never reproduce or closely paraphrase existing copyrighted lyrics.

You always answer with valid JSON only (no markdown, no commentary) exactly in the shape requested.`;

export function titlesPrompt(opts: { emotion: string; emotionKo: string; count: number; referenceSummary?: string; notes?: string }) {
  return `Generate ${opts.count} original English song title ideas for LUMEROVIA.
Target emotion: ${opts.emotion} (${opts.emotionKo}).
${opts.referenceSummary ? `Reference lyric analysis (use only musical features such as mood, pacing and structure — never copy phrases):\n${opts.referenceSummary}\n` : ""}${opts.notes ? `Extra direction from the producer: ${opts.notes}\n` : ""}
For each title return:
- "title": English title (2–6 words, evocative, timeless, no clichés like "My Heart Will Go On")
- "titleKo": natural Korean translation of the title
- "story": a Korean story synopsis of about 200 characters (180–230자) describing who, where, what memory, what emotional turn — written for a Korean producer
- "vocal": recommended vocal, one of: "warm mature male baritone", "tender mature male tenor", "warm mature female alto", "soft mature female vocal", "male and female duet"
- "genre": one of "Cinematic Nostalgic Soft Rock", "Vintage Pop Ballad", "Korean Trot Ballad Fusion", "Romantic Soft Rock", "Epic Cinematic Rock", "Heartfelt Korean Fusion" (prefer Cinematic Nostalgic Soft Rock for about half)
- "landscape": a specific Korean natural landscape that fits the story, written in Korean (e.g. "담양 메타세쿼이아길 가을", "제주 성산일출봉 새벽")
Return JSON: {"titles":[{...}]}`;
}

export function lyricsPrompt(opts: {
  title: string;
  titleKo: string;
  story: string;
  emotion: string;
  vocal: string;
  genre: string;
  landscape: string;
  reference?: string;
  rights: string;
  precision: boolean;
  referenceSummary?: string;
}) {
  const refBlock = opts.reference
    ? opts.precision
      ? `PRECISION EDIT MODE (the producer owns or has licensed the reference below). Write NEW original words that keep EXACTLY the same number of lines, the same blank-line structure, the same syllable count on every line, and the same "/" positions (a "/" marks a breath/phrase break). Keep section headers in the same places.\nReference:\n${opts.reference}`
      : `A reference lyric is provided ONLY for musical features (line counts per section, pacing, mood, rhyme density). The reference may be a copyrighted work: do NOT reuse its phrases, images, title, hook, or distinctive structure. Write something clearly different.\nReference features:\n${opts.referenceSummary ?? "(none)"}`
    : "";
  return `Write the complete English lyrics for a new LUMEROVIA song.
Title: "${opts.title}" (${opts.titleKo})
Korean story to tell: ${opts.story}
Emotion: ${opts.emotion}
Vocal: ${opts.vocal}
Genre: ${opts.genre}
Korean landscape imagery to weave in subtly (don't name the place literally unless natural): ${opts.landscape}
${refBlock}

Format requirements:
- Use section headers in square brackets: [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Final Chorus], [Outro] (adapt as needed; Outro optional)
- One blank line between sections
- The chorus should contain the title or a natural variation of it
- 7–10 syllables per line on average, easy to sing, warm 1970s–80s pop phrasing
- Total under about 30 sung lines (fits under 3 minutes)
- Clean rhymes (AABB or ABAB), no forced rhymes
Return JSON: {"lyrics": "<full lyrics with headers and \\n line breaks>", "vocal": "<final recommended vocal>", "bpm": <number 64-88>, "landscape": "<Korean landscape used>"}`;
}

export function rewritePrompt(opts: { lyrics: string; selection: string; instruction: string; title: string; story: string; keepSyllables: boolean }) {
  return `Here are the current lyrics of the LUMEROVIA song "${opts.title}":
---
${opts.lyrics}
---
Rewrite ONLY this selected passage:
---
${opts.selection}
---
Producer's instruction: ${opts.instruction || "Make it more vivid, singable and emotionally resonant while keeping the meaning."}
Story context: ${opts.story}
Rules: keep the same number of lines${opts.keepSyllables ? ", keep the same syllable count on every line and the same '/' positions" : ""}; keep section headers unchanged if present; keep the tone of the surrounding lyrics; original writing only.
Return JSON: {"replacement": "<rewritten passage only, same line count>"}`;
}

export function styleRefinePrompt(opts: { title: string; lyrics: string; emotion: string; options: { key: string; name: string; prompt: string }[] }) {
  return `For the LUMEROVIA song "${opts.title}" (emotion: ${opts.emotion}) with these lyrics:
---
${opts.lyrics}
---
Here are base Suno "Style of Music" prompts (one per preset). Lightly adjust each prompt so it matches the song's specific content (imagery, mood, pacing) while keeping the preset's genre, vocal, instrumentation, BPM range and "under 3 minutes". Keep each prompt as one comma-separated English line, 40–75 words, no explanations.
${opts.options.map((o) => `- key ${o.key} (${o.name}): ${o.prompt}`).join("\n")}
Return JSON: {"styles":[{"key":"C","prompt":"..."}, ...]} with one entry per key given.`;
}

export function videoConceptPrompt(opts: { title: string; story: string; lyrics: string; landscape: string }) {
  return `Create a Korean-language YouTube video concept for the LUMEROVIA song "${opts.title}".
Story: ${opts.story}
Main landscape: ${opts.landscape}
Lyrics:
---
${opts.lyrics}
---
Write the concept in Korean with these sections, as plain text with line breaks:
1) 전체 콘셉트 (3~4문장)
2) 색감·톤 (컬러 그레이딩, 시간대, 날씨)
3) 섹션별 장면 (각 섹션마다 한국 풍경 장소 1~2곳 + 카메라 움직임 + 분위기, 가사 섹션 이름 표기)
4) 썸네일 아이디어 2개
5) 영상 설명란 영어 문구 1~2문장
Return JSON: {"concept": "<the Korean text>"}`;
}
