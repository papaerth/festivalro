import "server-only"; // 이 파일은 서버에서만 — 실수로 클라이언트에 import하면 빌드 실패(키 보호)
// ────────────────────────────────────────────────────────────────
//  축제 데이터 불러오기
//
//  동작 방식:
//   • .env.local 에 TOUR_API_KEY 가 있으면  → 한국관광공사 TourAPI 실데이터
//   • 키가 없거나 호출에 실패하면            → 내장 샘플 데이터 (자동 대체)
//
//  즉, 지금은 키 없이도 샘플로 잘 돌아가고,
//  나중에 키만 넣으면 코드 수정 없이 실데이터로 전환됩니다.
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { SAMPLE_FESTIVALS } from "./sampleFestivals";
import { translateText, translateNames } from "./translate";
import { translateTextAI } from "./translateAI";
import { getPublishedNewFestivals } from "./submissions";

// ── 국문 로마자 표기(개정 로마자, 간이) — 번역 실패 시 병기용 폴백 ──
const RCHO = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const RJUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const RJONG = ["","k","k","ks","n","nj","nh","t","l","lk","lm","lb","ls","lt","lp","lh","m","p","ps","t","t","ng","t","t","k","t","p","h"];
function romanize(str = "") {
  let out = "";
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const s = c - 0xac00;
      out += RCHO[Math.floor(s / 588)] + RJUNG[Math.floor((s % 588) / 28)] + RJONG[s % 28];
    } else {
      out += ch;
    }
  }
  out = out.replace(/\s+/g, " ").trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
}

// TourAPI searchFestival2 엔드포인트 기본 주소 (필요시 .env로 덮어쓸 수 있음)
const TOUR_API_BASE =
  process.env.TOUR_API_BASE ||
  "https://apis.data.go.kr/B551011/KorService2/searchFestival2";

// 시/도 이름 → 우리 서비스의 권역(region) 코드로 변환
function sidoToRegion(sido = "") {
  if (sido.includes("서울")) return "seoul";
  if (sido.includes("경기") || sido.includes("인천")) return "gyeonggi";
  if (sido.includes("강원")) return "gangwon";
  if (sido.includes("충청") || sido.includes("대전") || sido.includes("세종"))
    return "chungcheong";
  if (sido.includes("전라") || sido.includes("전북") || sido.includes("전남") || sido.includes("광주"))
    return "jeolla";
  if (
    sido.includes("경상") ||
    sido.includes("경북") ||
    sido.includes("경남") ||
    sido.includes("대구") ||
    sido.includes("부산") ||
    sido.includes("울산")
  )
    return "gyeongsang";
  if (sido.includes("제주")) return "jeju";
  return "seoul"; // 알 수 없으면 기본값
}

// 축제 시작일(YYYYMMDD)의 '월'로 계절 추정
function monthToSeason(dateStr = "") {
  const month = Number(String(dateStr).slice(4, 6));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// "20260327" → "2026-03-27"
function normalizeDate(raw = "") {
  const s = String(raw);
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// TourAPI 응답 1건(item) → 우리 서비스가 쓰는 축제 객체로 변환
function mapTourItem(item) {
  const sido = (item.addr1 || "").split(" ")[0] || "";
  const sigungu = (item.addr1 || "").split(" ")[1] || "";
  const startDate = normalizeDate(item.eventstartdate);
  const endDate = normalizeDate(item.eventenddate) || startDate;
  return {
    id: String(item.contentid),
    name: item.title,
    sido,
    sigungu,
    region: sidoToRegion(sido),
    lat: Number(item.mapy), // TourAPI: mapy = 위도
    lng: Number(item.mapx), // TourAPI: mapx = 경도
    season: monthToSeason(item.eventstartdate),
    startDate,
    endDate,
    description: item.addr1 || "",
    image: item.firstimage || null,
    source: "tour", // 출처: 한국관광공사 TourAPI
    cat3: item.cat3 || null, // TourAPI 소분류코드(비슷한 유형 추천용)
    addr: item.addr1 || "",
    homepage: null,
    tel: null,
  };
}

// 외부 API가 느리거나 멈춰도 무한정 기다리지 않도록 타임아웃(기본 15초)을 겁니다.
//  - 특히 빌드 때 홈페이지 정적 생성이 60초를 넘겨 실패하는 것을 방지합니다.
//  - 시간 초과 시 예외가 나고, 호출한 쪽에서 다른 소스/샘플로 안전하게 대체합니다.
async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// TourAPI에서 축제 목록을 가져옵니다. 실패하면 예외를 던집니다.
async function fetchFromTourApi(apiKey) {
  // 공공데이터포털은 인증키를 두 종류(Encoding/Decoding)로 줍니다.
  // 어떤 걸 넣어도 되도록, 먼저 디코딩해 원본으로 되돌린 뒤
  // URLSearchParams가 한 번만 인코딩하도록 합니다. (이중 인코딩 방지)
  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  const params = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    arrange: "A", // 제목순 정렬
    numOfRows: "200",
    pageNo: "1",
    eventStartDate: "20260101", // 이 날짜 이후 시작하는 축제
  });

  const res = await fetchWithTimeout(`${TOUR_API_BASE}?${params.toString()}`, {
    // 서버에서 하루(초 단위) 캐시 — 매 요청마다 외부 API를 부르지 않도록
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`TourAPI 응답 오류: ${res.status}`);

  const data = await res.json();
  const raw = data?.response?.body?.items?.item;
  // 결과가 1개면 배열이 아니라 객체로 오므로 배열로 통일
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (items.length === 0) {
    throw new Error("TourAPI에서 축제 목록을 찾지 못했습니다.");
  }
  return items
    .map(mapTourItem)
    .filter((f) => f.name && Number.isFinite(f.lat) && Number.isFinite(f.lng));
}

// ── 전국문화축제표준데이터 (행정안전부, 공공데이터포털) ──
const STANDARD_API_BASE =
  process.env.STANDARD_API_BASE ||
  "https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";

// "2026-05-01" 또는 "20260501" → "2026-05-01"
function normalizeDateFlex(raw = "") {
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// "YYYY-MM-DD"의 월로 계절 추정
function seasonOf(startDate = "") {
  const m = Number(String(startDate).slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// 주소 → 시/도, 시군구
function splitAddr(addr = "") {
  const parts = String(addr).trim().split(/\s+/);
  return { sido: parts[0] || "", sigungu: parts[1] || "" };
}

// 문자열 → 짧고 안정적인 id (즐겨찾기/후기 저장용으로 일관성 유지)
function stableId(str = "") {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) + h + str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

// 표준데이터 1건 → 우리 축제 객체로 변환 (좌표 없으면 lat/lng = null)
function mapStandardItem(item) {
  const addr = item.rdnmadr || item.lnmadr || "";
  const { sido, sigungu } = splitAddr(addr);
  const name = (item.fstvlNm || "").trim();
  const startDate = normalizeDateFlex(item.fstvlStartDate);
  const endDate = normalizeDateFlex(item.fstvlEndDate) || startDate;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return {
    id: "s" + stableId(`${name}|${startDate}|${sigungu}`),
    name,
    sido,
    sigungu,
    region: sidoToRegion(sido),
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    season: seasonOf(startDate),
    startDate,
    endDate,
    description: (item.fstvlCo || item.fstvlCn || item.opar || "").trim(),
    image: null, // 표준데이터엔 이미지가 없음 → 화면에서 계절색 카드로 대체
    source: "standard", // 출처: 지자체 표준데이터(행정안전부)
    addr,
    homepage: item.homepageUrl || null,
    tel: item.phoneNumber || null,
  };
}

// 표준데이터 원본 호출 (fetch 레벨 캐시는 쓰지 않음 — 오류 응답이 캐시를
// 오염시키지 못하도록 no-store로 받고, 캐싱은 unstable_cache가 '성공 결과만' 담당).
async function fetchStandardRaw() {
  const apiKey = process.env.TOUR_API_KEY;
  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    type: "json",
  });

  const res = await fetchWithTimeout(`${STANDARD_API_BASE}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`표준데이터 응답 오류: ${res.status}`);

  const data = await res.json();
  const resultCode = data?.response?.header?.resultCode;
  let raw = data?.response?.body?.items;
  if (raw && raw.item) raw = raw.item; // 혹시 items.item 형태면 처리
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  // 정상(00)이 아니거나 결과가 없으면 예외 → unstable_cache가 캐시하지 않음(오염 방지)
  if (resultCode !== "00" || items.length === 0) {
    throw new Error(`표준데이터 오류/빈 결과 (resultCode=${resultCode})`);
  }

  // 올해 이후(종료되지 않은/올해 진행) 축제만 → 데이터 양·관련성 관리
  const cutoff = `${new Date().getFullYear()}-01-01`;
  return items
    .map(mapStandardItem)
    .filter((f) => f.name && f.startDate && f.endDate >= cutoff);
}

// 성공한 결과만 캐시(6시간). 캐시 키에 버전(v2)을 넣어 예전 오염 캐시를 무시.
const fetchFromStandardApi = unstable_cache(fetchStandardRaw, ["standard-festivals-v2"], {
  revalidate: 60 * 60 * 6,
});

// 중복 판정용 정규화 이름 (공백·숫자·흔한 접미사 제거)
function normName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, "")
    // 회차 접두어/표기 먼저 제거 (숫자 제거보다 앞) — 예: 제29회 / 29회 / 제3차 / 2026년
    .replace(/제?\s*\d+\s*(회|차|주년)/g, "")
    .replace(/\d+(년|st|nd|rd|th)/g, "")
    .replace(/[0-9]/g, "")
    // 남은 회차 흔적('제'로 시작하는 한 글자) 및 흔한 꼬리말 제거
    .replace(/(축제|페스티벌|페스타|festival|문화제|대축제|엑스포|expo|행사|기념행사|축전)/g, "")
    .replace(/[^가-힣a-z]/g, "");
}
function dedupKey(f) {
  return `${normName(f.name)}|${f.sigungu || f.sido || ""}`;
}

// TourAPI(우선) + 표준데이터 합치기, 이름+지역 유사 시 표준데이터 중복 제거
function mergeFestivals(tourList, stdList) {
  const seen = new Set();
  for (const f of tourList) {
    const k = dedupKey(f);
    if (normName(f.name).length > 1) seen.add(k);
  }
  const merged = [...tourList];
  for (const f of stdList) {
    const k = dedupKey(f);
    if (normName(f.name).length > 1 && seen.has(k)) continue; // 이미 TourAPI에 있음
    seen.add(k);
    merged.push(f);
  }
  return merged;
}

// [공개] 전체 축제 목록 가져오기 (서버 컴포넌트에서 사용)
//  - TourAPI + 표준데이터를 병렬로 불러와 합칩니다.
//  - 한쪽이 실패해도 다른 쪽 데이터로 동작하고, 둘 다 실패하면 샘플로 대체합니다.
export async function getFestivals() {
  const apiKey = process.env.TOUR_API_KEY;
  const hasRealKey = apiKey && apiKey !== "여기에_키를_붙여넣기";
  if (!hasRealKey) return SAMPLE_FESTIVALS;

  const standardEnabled = process.env.STANDARD_API_ENABLED !== "false";

  const [tourRes, stdRes] = await Promise.allSettled([
    fetchFromTourApi(apiKey),
    standardEnabled ? fetchFromStandardApi() : Promise.resolve([]),
  ]);

  const tourList = tourRes.status === "fulfilled" ? tourRes.value : [];
  const stdList = stdRes.status === "fulfilled" ? stdRes.value : [];
  if (tourRes.status === "rejected")
    console.warn("[축제로] TourAPI 실패:", tourRes.reason?.message);
  if (stdRes.status === "rejected")
    console.warn("[축제로] 표준데이터 실패:", stdRes.reason?.message);

  const merged = mergeFestivals(tourList, stdList);
  if (merged.length === 0) return SAMPLE_FESTIVALS; // 둘 다 실패 → 안전장치

  // 게시된 '새 축제'(기존과 연결 안 된 담당자 등록) 합성 후 병합.
  //  - 이름+지역이 기존 축제와 겹치면 새로 추가하지 않음(중복 방지).
  //  - Supabase 미설정/오류면 조용히 건너뜀(사이트 정상).
  try {
    const submitted = await getPublishedNewFestivals();
    if (submitted.length > 0) {
      const seen = new Set(merged.filter((f) => normName(f.name).length > 1).map(dedupKey));
      for (const f of submitted) {
        const k = dedupKey(f);
        if (normName(f.name).length > 1 && seen.has(k)) continue;
        seen.add(k);
        merged.push(f);
      }
    }
  } catch {
    /* 제출 축제 병합 실패는 무시 */
  }

  return merged;
}

// [공개] 축제 목록에 현재 언어의 표시명(displayName)·시군구(displaySigungu)를 채웁니다.
//  우선순위(제목):
//    1) TourAPI 다국어 서비스 공식 번역 제목 (관광공사 공식 — 최우선)
//    2) Google 번역 (명칭 전용 30일 캐시 → 같은 제목 재번역 안 함)
//    3) 한국어 제목 + 로마자 병기  (둘 다 실패 시)
//  · 지역명(시군구)도 같은 규칙으로 번역/로마자. 한국어(ko) 페이지는 원문 그대로.
//  · 카드뉴스·지도·목록·영상/블로그 섹션 등 축제명이 나오는 모든 화면에서 재사용.
export async function localizeFestivals(festivals, locale = "ko") {
  if (locale === "ko" || !Array.isArray(festivals) || festivals.length === 0) {
    return festivals;
  }

  // 1) TourAPI 공식 이름 맵 (지원 언어·커버된 축제만)
  let tourMap = {};
  try {
    tourMap = await getFestivalNameMap(locale);
  } catch {
    tourMap = {};
  }

  // 2) TourAPI에 없는 이름 + 모든 시군구 → Google 번역 (정렬·중복제거로 캐시 안정)
  const missing = festivals.filter((f) => !tourMap[f.id] && f.name);
  const uniqNames = [...new Set(missing.map((f) => f.name))].sort();
  const uniqSigungu = [...new Set(festivals.map((f) => f.sigungu).filter(Boolean))].sort();

  const [nameTr, sgTr] = await Promise.all([
    translateNames(uniqNames, locale),
    translateNames(uniqSigungu, locale),
  ]);
  const nameMap = {};
  uniqNames.forEach((nm, i) => (nameMap[nm] = nameTr[i]));
  const sgMap = {};
  uniqSigungu.forEach((sg, i) => (sgMap[sg] = sgTr[i]));

  // 3) 표시명 조립
  return festivals.map((f) => {
    let displayName = tourMap[f.id];
    if (!displayName) {
      const g = nameMap[f.name];
      displayName = g && g !== f.name ? g : f.name ? `${f.name} (${romanize(f.name)})` : f.name;
    }
    let displaySigungu = "";
    if (f.sigungu) {
      const gs = sgMap[f.sigungu];
      displaySigungu = gs && gs !== f.sigungu ? gs : romanize(f.sigungu) || f.sigungu;
    }
    return { ...f, displayName, displaySigungu };
  });
}

// HTML 태그/특수문자를 사람이 읽기 좋은 순수 텍스트로 정리
function cleanHtml(s = "") {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// TourAPI detailCommon2로 축제 상세 소개문(overview)을 가져옵니다. 실패하면 null.
async function fetchOverview(contentId, apiKey) {
  const base =
    process.env.TOUR_DETAIL_BASE ||
    "https://apis.data.go.kr/B551011/KorService2/detailCommon2";

  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  const params = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    contentId: String(contentId),
  });

  const res = await fetch(`${base}?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 }, // 하루 캐시
  });
  if (!res.ok) throw new Error(`detailCommon2 응답 오류: ${res.status}`);

  const data = await res.json();
  const raw = data?.response?.body?.items?.item;
  const item = Array.isArray(raw) ? raw[0] : raw;
  const overview = item?.overview;
  return overview ? cleanHtml(overview) : null;
}

// ── TourAPI 다국어 서비스 (contentId는 언어 서비스 간 공통) ──
//  국문(KorService2)과 별개로, 언어별 서비스가 축제 이름·소개문을 공식 번역해 제공합니다.
//  ※ 지원 언어만(아래 8종). 지원되지 않는 언어·표준데이터 축제는 한국어를 그대로 씁니다.
//  ※ 번역 호출이 실패하면 조용히 한국어로 폴백 → 한국어 사이트는 영향 없음.
const LANG_SERVICE = {
  en: "EngService2",
  ja: "JpnService2",
  zh: "ChsService2", // 중국어 간체
  "zh-TW": "ChtService2", // 중국어 번체
  de: "GerService2",
  fr: "FreService2",
  es: "SpnService2",
  ru: "RusService2",
};
const TRANS_HOST = process.env.TOUR_TRANS_HOST || "https://apis.data.go.kr/B551011";

function svcKey(apiKey) {
  try {
    return decodeURIComponent(apiKey);
  } catch {
    return apiKey;
  }
}

// 언어별 '축제 이름 맵' {contentId: 번역된제목} 원본 호출. 실패하면 예외(캐시 오염 방지).
async function fetchNameMapRaw(locale) {
  const apiKey = process.env.TOUR_API_KEY;
  const service = LANG_SERVICE[locale];
  if (!apiKey || !service) return {};

  const params = new URLSearchParams({
    serviceKey: svcKey(apiKey),
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    arrange: "A",
    numOfRows: "400",
    pageNo: "1",
    eventStartDate: "20260101",
  });

  const res = await fetchWithTimeout(`${TRANS_HOST}/${service}/searchFestival2?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${service} searchFestival2 응답 오류: ${res.status}`);

  const data = await res.json();
  const raw = data?.response?.body?.items?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const map = {};
  for (const it of items) {
    if (it.contentid && it.title) map[String(it.contentid)] = it.title;
  }
  if (Object.keys(map).length === 0) throw new Error(`${service} 축제 이름 맵이 비어 있음`);
  return map;
}

// 성공 결과만 캐시(6시간). 캐시 키에 locale 인자가 포함됨.
const nameMapCached = unstable_cache(fetchNameMapRaw, ["tour-namemap-v1"], {
  revalidate: 60 * 60 * 6,
});

// [공개] 언어별 축제 이름 맵. 지원 언어가 아니거나 실패하면 {} (→ 한국어 이름 유지).
export async function getFestivalNameMap(locale) {
  if (!LANG_SERVICE[locale]) return {};
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey || apiKey === "여기에_키를_붙여넣기") return {};
  try {
    return await nameMapCached(locale);
  } catch (err) {
    console.warn("[축제로] 이름 번역 맵 실패:", locale, err.message);
    return {};
  }
}

// 언어 서비스의 detailCommon2로 번역된 제목·소개문을 가져옵니다. 없으면 null.
async function fetchTranslationRaw(contentId, locale) {
  const apiKey = process.env.TOUR_API_KEY;
  const service = LANG_SERVICE[locale];
  if (!apiKey || !service) return null;

  const params = new URLSearchParams({
    serviceKey: svcKey(apiKey),
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    contentId: String(contentId),
  });

  const res = await fetch(`${TRANS_HOST}/${service}/detailCommon2?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${service} detailCommon2 응답 오류: ${res.status}`);

  const data = await res.json();
  const raw = data?.response?.body?.items?.item;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item) return null;
  return {
    title: item.title || null,
    overview: item.overview ? cleanHtml(item.overview) : null,
  };
}
const translationCached = unstable_cache(fetchTranslationRaw, ["tour-trans-v1"], {
  revalidate: 60 * 60 * 24,
});
async function getTranslation(contentId, locale) {
  try {
    return await translationCached(contentId, locale);
  } catch (err) {
    console.warn("[축제로] 상세 번역 실패:", locale, err.message);
    return null;
  }
}

// 한국어 소개문 보강(실패 시 null) — 내부 도우미
async function safeOverview(contentId, apiKey) {
  try {
    return await fetchOverview(contentId, apiKey);
  } catch (err) {
    console.warn("[축제로] 상세 소개문 불러오기 실패:", err.message);
    return null;
  }
}

// [공개] id로 축제 1건 가져오기 (상세 화면에서 사용)
//  - TourAPI 축제(숫자 contentid): 소개문(overview)을 추가로 붙입니다.
//  - 지원 언어면 이름·소개문을 TourAPI 다국어 번역으로 대체(실패 시 한국어 폴백).
export async function getFestivalById(id, locale = "ko") {
  const all = await getFestivals();
  const festival = all.find((f) => f.id === id);
  if (!festival) return null;

  const apiKey = process.env.TOUR_API_KEY;
  const hasRealKey = apiKey && apiKey !== "여기에_키를_붙여넣기";
  // 소개문·번역 보강은 TourAPI 축제만 — 표준데이터는 자체 소개문(한국어) 사용
  if (!(hasRealKey && festival.source === "tour")) return festival;

  // 비한국어 번역 (실패는 단계적으로 폴백 → 절대 화면이 안 깨짐):
  //   이름   : TourAPI 공식(8개 언어) → Google → 한국어  (이름은 짧아 Google로 충분)
  //   소개글 : Claude(AI) 고품질 → TourAPI 공식 → Google → 한국어
  if (locale !== "ko") {
    const tr = LANG_SERVICE[locale] ? await getTranslation(festival.id, locale) : null;

    const name =
      tr?.title || (await translateText(festival.name, locale)) || festival.name;

    const koOverview =
      (await safeOverview(festival.id, apiKey)) || festival.description;
    let description = await translateTextAI(koOverview, locale); // ① AI 고품질
    if (!description) description = tr?.overview; // ② TourAPI 공식
    if (!description) {
      description = (await translateText(koOverview, locale)) || koOverview; // ③ Google → 한국어
    }

    // nameKo: 한국어 원래 이름 — 유튜브/네이버 '검색'은 이걸 써야 올바른
    //  한국 콘텐츠를 찾음(표시 이름은 번역된 name, 검색은 nameKo).
    return { ...festival, name, description, nameKo: festival.name };
  }

  // 한국어: 한국어 소개문 보강
  const overview = await safeOverview(festival.id, apiKey);
  return overview ? { ...festival, description: overview } : festival;
}

// [공개] 현재 실데이터를 쓰는 중인지 여부 (화면 안내용)
export function isUsingSampleData() {
  const apiKey = process.env.TOUR_API_KEY;
  return !(apiKey && apiKey !== "여기에_키를_붙여넣기");
}
