import "server-only";
import { unstable_cache } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";

// ────────────────────────────────────────────────────────────────
//  Claude(AI) 번역 도우미 — 축제 '소개글' 고품질 번역용
//
//  Google 기계번역보다 문맥을 이해해 훨씬 자연스러운 번역을 만듭니다.
//  ▸ 원문은 한국어. 대상 언어는 사이트 로케일 기준.
//  ▸ 키(ANTHROPIC_API_KEY)가 없거나 실패하면 null 반환 → 호출부가
//    기존 번역(TourAPI 공식→Google→한국어)으로 자동 폴백.
//  ▸ 결과는 7일 캐시 → 같은 소개글 반복 번역 안 함(비용↓).
//  ▸ 모델은 기본 Haiku 4.5(가성비). TRANSLATE_MODEL 로 바꿀 수 있음.
// ────────────────────────────────────────────────────────────────

// 로케일 → 사람이 읽는 언어명(프롬프트에 사용). 한국어는 원문이라 제외.
const LANG_NAMES = {
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  es: "Spanish",
  fr: "French",
  ru: "Russian",
  de: "German",
  ar: "Arabic",
  vi: "Vietnamese",
  id: "Indonesian",
  th: "Thai",
};

function apiKey() {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  if (!k || k.startsWith("여기에")) return null; // 미설정/자리표시자
  return k;
}

const MODEL = process.env.TRANSLATE_MODEL?.trim() || "claude-haiku-4-5";

// 이 로케일을 AI로 번역할 수 있는가?
export function canTranslateAI(locale) {
  return !!apiKey() && locale !== "ko" && !!LANG_NAMES[locale];
}

// 원본 호출: 한국어 text를 대상 언어로 번역. 실패 시 예외(캐시 오염 방지).
async function translateAIRaw(text, locale) {
  const client = new Anthropic({ apiKey: apiKey() });
  const lang = LANG_NAMES[locale];

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      `You are a professional translator for a Korean festival information website. ` +
      `Translate the user's Korean text into natural, fluent ${lang} for a general audience ` +
      `reading about a local festival. Preserve the meaning, tone, and useful detail. ` +
      `Keep proper nouns (festival names, place names) natural and readable in ${lang}. ` +
      `Output ONLY the translation itself — no preamble, quotes, explanations, or notes.`,
    messages: [{ role: "user", content: String(text) }],
  });

  const block = msg.content.find((b) => b.type === "text");
  const out = block?.text?.trim();
  if (!out) throw new Error("empty AI translation");
  return out;
}

// 성공 결과만 7일 캐시. 캐시 키에 (text, locale)이 포함됨.
const translateAICached = unstable_cache(translateAIRaw, ["ai-translate-v1"], {
  revalidate: 60 * 60 * 24 * 7,
});

// [공개] 한국어 text를 AI로 번역. 불가/실패 시 null(→ 호출부가 폴백).
export async function translateTextAI(text, locale) {
  if (text == null || String(text).trim() === "") return null;
  if (!canTranslateAI(locale)) return null;
  try {
    return await translateAICached(String(text), locale);
  } catch (err) {
    console.warn("[축제로] Claude 번역 실패:", locale, err.message);
    return null;
  }
}
