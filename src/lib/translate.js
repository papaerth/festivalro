import "server-only";
import { unstable_cache } from "next/cache";

// ────────────────────────────────────────────────────────────────
//  Google 번역 도우미 (Cloud Translation API v2)
//
//  TourAPI가 공식 번역을 제공하지 않는 콘텐츠(축제 프로그램/소개 일부 언어,
//  블로그 후기 제목, 영상 제목)를 자동 번역합니다.
//
//  ▸ 원문은 한국어(source=ko) 기준.
//  ▸ 키(GOOGLE_TRANSLATE_API_KEY)가 없거나 실패하면 '원문 그대로' 반환 →
//    한국어 사이트·다른 기능엔 전혀 영향 없음.
//  ▸ 결과는 24시간 캐시(unstable_cache) → 같은 문장 반복 번역 안 함(비용↓).
// ────────────────────────────────────────────────────────────────

// 사이트 로케일 → Google 번역 언어코드 (한국어는 원문이라 제외)
const GLANG = {
  en: "en",
  ja: "ja",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  es: "es",
  fr: "fr",
  ru: "ru",
  de: "de",
  ar: "ar",
  vi: "vi",
  id: "id",
  th: "th",
};

function apiKey() {
  const k = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!k || k.startsWith("여기에")) return null; // 미설정/자리표시자면 번역 안 함
  return k;
}

// 이 로케일을 번역할 수 있는가? (키 있고, 한국어가 아니고, 지원 언어)
export function canTranslate(locale) {
  return !!apiKey() && locale !== "ko" && !!GLANG[locale];
}

// 원본 호출: 여러 문자열을 한 번에 번역. 실패 시 예외(캐시 오염 방지).
async function translateRaw(texts, locale) {
  const key = apiKey();
  const target = GLANG[locale];
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: "ko", target, format: "text" }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`google translate ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = data?.data?.translations;
  if (!Array.isArray(out) || out.length !== texts.length) {
    throw new Error("google translate: 응답 개수 불일치");
  }
  return out.map((t) => t.translatedText);
}

// 성공 결과만 24시간 캐시. 캐시 키에 (texts, locale)이 포함됨.
const translateCached = unstable_cache(translateRaw, ["gtranslate-v1"], {
  revalidate: 60 * 60 * 24,
});

// [공개] 문자열 배열 번역. 불가/실패 시 '원문 그대로' 반환.
export async function translateMany(texts, locale) {
  const arr = (texts || []).map((t) => (t == null ? "" : String(t)));
  if (!canTranslate(locale) || arr.length === 0) return arr;
  // 빈 문자열만 있는 경우는 호출 낭비 방지
  if (arr.every((s) => s.trim() === "")) return arr;
  try {
    return await translateCached(arr, locale);
  } catch (err) {
    console.warn("[축제로] Google 번역 실패:", locale, err.message);
    return arr; // 폴백: 한국어 원문 유지
  }
}

// 축제명·지역명처럼 '한 번 정하면 안 바뀌는 짧은 명칭' 전용 — 30일 장기 캐시.
//  (제목은 재번역할 필요가 없으니 유효기간을 길게 잡아 API 호출을 최대한 억제)
const translateNamesCached = unstable_cache(translateRaw, ["gtranslate-names-v1"], {
  revalidate: 60 * 60 * 24 * 30,
});

// Google 번역 v2는 한 요청당 텍스트 세그먼트 수(128개)·총 길이 제한이 있어,
// 축제 목록처럼 많은 명칭은 청크로 나눠 보냅니다. (각 청크는 개별 30일 캐시)
const NAME_CHUNK = 80;

// [공개] 명칭 배열 번역(청크 + 30일 캐시). 불가/실패 시 해당 청크는 '원문 그대로'.
export async function translateNames(texts, locale) {
  const arr = (texts || []).map((t) => (t == null ? "" : String(t)));
  if (!canTranslate(locale) || arr.length === 0) return arr;
  if (arr.every((s) => s.trim() === "")) return arr;

  const out = [];
  for (let i = 0; i < arr.length; i += NAME_CHUNK) {
    const chunk = arr.slice(i, i + NAME_CHUNK);
    try {
      out.push(...(await translateNamesCached(chunk, locale)));
    } catch (err) {
      console.warn("[축제로] 명칭 번역 실패:", locale, err.message);
      out.push(...chunk); // 폴백: 이 청크만 한국어 원문 유지
    }
  }
  return out;
}

// [공개] 단일 문자열 번역. 불가/실패 시 원문 그대로.
export async function translateText(text, locale) {
  if (text == null || text === "") return text;
  const [out] = await translateMany([text], locale);
  return out ?? text;
}
