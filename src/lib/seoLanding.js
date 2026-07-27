import { matchSido } from "./regionsKr";

// ────────────────────────────────────────────────────────────────
//  프로그래매틱 SEO 랜딩(영문 우선) 공용 로직.
//   · 월별 /festivals-in-korea/[month]-[year] · 도시별 /festivals-in-[city] · /this-weekend
//   · 지금은 영어만(SEO_LOCALES). 배열에 로케일을 추가하면 그대로 확장됩니다.
//   · 연/월은 데이터에서 동적 생성(하드코딩 금지) → 크론/ISR 갱신 때 범위가 자동으로 밀림.
// ────────────────────────────────────────────────────────────────

export const SEO_LOCALES = ["en"]; // 확장 시 여기에 로케일 추가

// 도시별 페이지 대상(외국인이 많이 찾는 주요 도시). slug=URL, sido=matchSido 키, center=지도 중심.
export const CITIES = [
  { slug: "seoul", en: "Seoul", sido: "seoul", center: [37.5665, 126.978] },
  { slug: "busan", en: "Busan", sido: "busan", center: [35.1796, 129.0756] },
  { slug: "jeju", en: "Jeju", sido: "jeju", center: [33.4996, 126.5312] },
  { slug: "incheon", en: "Incheon", sido: "incheon", center: [37.4563, 126.7052] },
  { slug: "daegu", en: "Daegu", sido: "daegu", center: [35.8714, 128.6014] },
  { slug: "gwangju", en: "Gwangju", sido: "gwangju", center: [35.1595, 126.8526] },
  { slug: "daejeon", en: "Daejeon", sido: "daejeon", center: [36.3504, 127.3845] },
];
export function findCity(slug) {
  return CITIES.find((c) => c.slug === (slug || "").toLowerCase()) || null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_LABEL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");

// KST 기준 오늘/이번 주말 범위(YYYY-MM-DD 문자열). 문자열 비교로 KST 날짜 비교가 됩니다.
function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), dow: k.getUTCDay() };
}
const ymdUTC = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

// 현재 월부터 향후 count개월(기본 12) — [{ year, month(1-12), slug:"august-2026", label:"August 2026" }]
export function currentMonths(now = new Date(), count = 12) {
  const { y, m } = kstNow(now);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m + i, 1));
    const mm = d.getUTCMonth();
    out.push({ year: d.getUTCFullYear(), month: mm + 1, slug: `${MONTHS[mm]}-${d.getUTCFullYear()}`, label: `${MONTH_LABEL[mm]} ${d.getUTCFullYear()}` });
  }
  return out;
}

// "march-2027" → { year, month(1-12), label } / 형식 오류면 null.
export function parseMonthYear(slug) {
  const m = String(slug || "").toLowerCase().match(/^([a-z]+)-(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1]);
  const year = Number(m[2]);
  if (idx < 0 || !(year >= 2000 && year <= 2100)) return null;
  return { year, month: idx + 1, label: `${MONTH_LABEL[idx]} ${year}` };
}

// 그 월-연이 '현재 월 ~ +11개월' 창 안에 있는지(과거/먼 미래 페이지는 색인 대상 아님).
export function isMonthInWindow(year, month, now = new Date()) {
  return currentMonths(now, 12).some((x) => x.year === year && x.month === month);
}

// 주어진 월(연,월)에 '진행 중이거나 걸치는' 축제(그 달과 기간이 겹침).
export function festivalsInMonth(festivals, year, month) {
  const start = `${year}-${pad(month)}-01`;
  const end = ymdUTC(new Date(Date.UTC(year, month, 0))); // 말일
  return festivals.filter((f) => {
    if (!f || !f.startDate) return false;
    const fEnd = f.endDate || f.startDate;
    return f.startDate <= end && fEnd >= start;
  });
}

// 도시(시도) 소속 축제.
export function festivalsInCity(festivals, sidoKey) {
  return festivals.filter((f) => f && matchSido(f.sido || "") === sidoKey);
}

// 이번 주말(KST 토~일) 범위 [start,end].
export function weekendRange(now = new Date()) {
  const { y, m, d, dow } = kstNow(now);
  const toSat = (6 - dow + 7) % 7; // 다가오는 토요일까지(오늘이 토=0)
  const sat = new Date(Date.UTC(y, m, d + (dow === 0 ? -1 : toSat))); // 일요일이면 어제(토)
  const sun = new Date(sat.getTime() + 86400000);
  return [ymdUTC(sat), ymdUTC(sun)];
}

// 기간이 [rs,re]와 겹치는 축제.
export function festivalsInRange(festivals, rs, re) {
  return festivals.filter((f) => {
    if (!f || !f.startDate) return false;
    const fEnd = f.endDate || f.startDate;
    return f.startDate <= re && fEnd >= rs;
  });
}

// 진행중 우선 → 시작 임박 순 정렬(랜딩 목록용).
export function sortForLanding(list, todayStr) {
  return [...list].sort((a, b) => {
    const ao = a.startDate <= todayStr && (a.endDate || a.startDate) >= todayStr ? 0 : 1;
    const bo = b.startDate <= todayStr && (b.endDate || b.startDate) >= todayStr ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (a.startDate || "").localeCompare(b.startDate || "");
  });
}

export function todayKst(now = new Date()) {
  const { y, m, d } = kstNow(now);
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
