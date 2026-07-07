// 영상 조회수·업로드시점을 언어별 관습에 맞게 표기하는 공용 유틸.
//  - 유튜브 API가 이미 주는 값(statistics.viewCount, snippet.publishedAt)을
//    화면 표시용으로만 변환합니다. (추가 API 호출 없음)

// 언어별 "조회수" 단어. CJK는 숫자에 붙여 쓰고, 그 외는 한 칸 띄웁니다.
const VIEWS_WORD = {
  ko: "회", ja: "回", zh: "次", "zh-TW": "次",
  en: "views", es: "vistas", fr: "vues", ru: "просмотров",
  de: "Aufrufe", ar: "مشاهدة", vi: "lượt xem", id: "ditonton", th: "ครั้ง",
};
const CJK = new Set(["ko", "ja", "zh", "zh-TW"]);

// 조회수 축약: 한국어 "1.2천회 / 80만회", 영어 "803K views" 등.
export function formatViews(n, locale = "ko") {
  const v = Number(n) || 0;
  let num;
  if (v < 1000) {
    // 1000 미만은 그대로 (523회)
    num = new Intl.NumberFormat(locale).format(v);
  } else if (CJK.has(locale)) {
    // 한중일은 만/억 단위라 유효숫자 2자리가 자연스러움 (80만, 1.2천)
    num = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumSignificantDigits: 2,
    }).format(v);
  } else {
    // 영어권 등은 K/M 소수 1자리 (803K, 1.2M)
    num = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  }
  const word = VIEWS_WORD[locale] || VIEWS_WORD.en;
  return CJK.has(locale) ? `${num}${word}` : `${num} ${word}`;
}

// 업로드 상대 시간: "6시간 전 / 1일 전 / 2주 전" (언어별 자동).
const UNITS = [
  ["year", 31536000], ["month", 2592000], ["week", 604800],
  ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1],
];
export function relativeTime(iso, locale = "ko") {
  const then = iso ? new Date(iso).getTime() : 0;
  if (!then) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diffSec) >= secs || unit === "second") {
      return rtf.format(-Math.floor(diffSec / secs), unit);
    }
  }
  return "";
}
