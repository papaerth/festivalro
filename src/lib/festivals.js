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
import { fetchFromKintex } from "./kintex";
import { fetchFromCulture } from "./culture";
import { fetchFromSeoul } from "./seoul";
import { fetchFromKcisa } from "./kcisa";
import { matchSido } from "./regionsKr";

// 17개 시도 대략 중심 좌표 — 직접 등록 축제(좌표 없음)에 근사 마커를 띄우기 위한 폴백값.
//  (시군구에 기존 축제가 있으면 그 평균 좌표를 우선 쓰고, 없으면 이 시도 중심을 씀)
const SIDO_CENTER = {
  seoul: [37.5665, 126.978], busan: [35.1796, 129.0756], daegu: [35.8714, 128.6014],
  incheon: [37.4563, 126.7052], gwangju: [35.1595, 126.8526], daejeon: [36.3504, 127.3845],
  ulsan: [35.5384, 129.3114], sejong: [36.48, 127.289], gyeonggi: [37.4138, 127.5183],
  gangwon: [37.8228, 128.1555], chungbuk: [36.8, 127.7], chungnam: [36.6588, 126.6728],
  jeonbuk: [35.7175, 127.153], jeonnam: [34.8161, 126.4629], gyeongbuk: [36.4919, 128.8889],
  gyeongnam: [35.4606, 128.2132], jeju: [33.4996, 126.5312],
};

// 직접 등록 축제(좌표 없음)에 근사 좌표를 채워 지도 마커가 뜨게 함.
//  우선순위: (같은 시도+시군구의 기존 축제 평균 좌표) → (시도 중심). 둘 다 없으면 좌표 없이 둠.
function assignApproxCoords(list, coordFestivals) {
  const acc = {}; // `${sidoKey}|${sigungu}` → 좌표 합계
  for (const f of coordFestivals) {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng) && f.sigungu) {
      const key = `${matchSido(f.sido || "")}|${f.sigungu}`;
      const a = acc[key] || (acc[key] = { lat: 0, lng: 0, n: 0 });
      a.lat += f.lat; a.lng += f.lng; a.n += 1;
    }
  }
  for (const f of list) {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) continue;
    const sidoKey = matchSido(f.sido || "");
    const a = acc[`${sidoKey}|${f.sigungu || ""}`];
    if (a && a.n > 0) {
      f.lat = a.lat / a.n;
      f.lng = a.lng / a.n;
      f.approxLocation = true;
    } else if (SIDO_CENTER[sidoKey]) {
      f.lat = SIDO_CENTER[sidoKey][0];
      f.lng = SIDO_CENTER[sidoKey][1];
      f.approxLocation = true;
    }
  }
}

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

// TourAPI areaBasedList2 / detailIntro2 — 전시·박람회·공연(행사) 조회·날짜 보강용
const AREA_LIST_BASE =
  process.env.TOUR_AREALIST_BASE ||
  "https://apis.data.go.kr/B551011/KorService2/areaBasedList2";
const INTRO_BASE =
  process.env.TOUR_INTRO_BASE ||
  "https://apis.data.go.kr/B551011/KorService2/detailIntro2";

// ── 유형(type) 분류 ──
//  모든 항목은 축제 / 전시·박람회(exhibition) / 공연(performance) 중 하나로 태깅됩니다.
//  제목 강신호 규칙(축제 이름은 축제로 보호 · 전시/공연 신호는 넓게):
const FESTIVAL_TITLE_RE = /(축제|페스티벌|페스타|festival)/i; // 이름이 '축제/페스티벌'이면 축제 우선
const EXHIBITION_TITLE_RE = /(전시회|전시전|전시|미술관|미술전|갤러리|기획전|특별전|상설전|사진전|공예전|아트전|조각전|회화전|박람회|박람전|엑스포|expo|비엔날레|페어|일러스트레이션|디자인위크|북페어|도서전|모터쇼|아트페스타)/i;
const PERFORMANCE_TITLE_RE = /(뮤지컬|오페라|콘서트|리사이틀|내한공연|교향|필하모닉|음악회|연극제|국악공연|공연예술|상설공연|문화공연|정기공연)/i;

// 제목만으로 강한 유형 신호 판정. 반환: 'festival'|'exhibition'|'performance'|null(신호 없음).
//  · '축제/페스티벌' 이름은 무조건 festival(전시/공연 단어가 섞여 있어도 축제로 보호).
//  · 그 외 전시/공연 강신호면 해당 유형, 아무 신호 없으면 null.
export function typeByTitle(title = "") {
  const t = String(title);
  if (FESTIVAL_TITLE_RE.test(t)) return "festival";
  if (EXHIBITION_TITLE_RE.test(t)) return "exhibition";
  if (PERFORMANCE_TITLE_RE.test(t)) return "performance";
  return null;
}

//  1순위: TourAPI 소분류코드(cat3) — 있으면 그대로 신뢰
//    · A0207* → festival, A02080500 전시회/A02080600 박람회 → exhibition, 그 밖 A0208* → performance
//  2순위: 코드가 비어 있으면(현재 행사 대부분이 그렇다) 제목 강신호로 판정, 신호 없으면 축제.
//  ※ 이 방식은 추가 API 호출이 전혀 없습니다(이미 받는 축제 목록을 분류만).
export function classifyType(cat3, title = "") {
  const c = String(cat3 || "");
  if (c === "A02080500" || c === "A02080600") return "exhibition";
  if (c.startsWith("A0208")) return "performance";
  if (c.startsWith("A0207")) return "festival";
  return typeByTitle(title) || "festival";
}

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
    type: classifyType(item.cat3, item.title), // 유형: 축제/전시·박람회/공연 (코드+제목)
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
    type: "festival", // 문화축제 표준데이터는 전부 축제
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

// ── TourAPI 전시·박람회·공연(행사) 조회 ──
//  축제 피드(searchFestival2)는 유형 분류코드가 대부분 비어 있어 전시·공연을 골라낼 수 없습니다.
//  그래서 areaBasedList2로 '공연/행사(cat2=A0208)'만 별도로 가져와 유형을 붙이고,
//  목록엔 개최일자가 없으므로 detailIntro2로 날짜·장소를 보강한 뒤,
//  '오늘 이후(종료 안 된)' 항목만 남깁니다.  (모든 호출은 기존 TOUR_API_KEY 하나로 동작)
//  ⚠️ 기본 OFF: detailIntro2는 일일 한도가 낮고 상세페이지와 공유하므로, 전시·공연은
//     문화포털 API(culture.js)를 기본 소스로 씁니다. 이 방식을 쓰려면 EVENTS_API_ENABLED=true.
const EVENTS_ENABLED = process.env.EVENTS_API_ENABLED === "true";

// areaBasedList2 응답 1건 → 우리 객체(날짜는 이후 detailIntro2로 보강)
function mapEventItem(item) {
  const sido = (item.addr1 || "").split(" ")[0] || "";
  const sigungu = (item.addr1 || "").split(" ")[1] || "";
  return {
    id: String(item.contentid),
    name: item.title,
    sido,
    sigungu,
    region: sidoToRegion(sido),
    lat: Number(item.mapy),
    lng: Number(item.mapx),
    season: "spring", // detailIntro2 날짜로 보강 후 다시 계산
    startDate: "",
    endDate: "",
    description: item.addr1 || "",
    image: item.firstimage || null,
    source: "tour",
    cat3: item.cat3 || null,
    type: classifyType(item.cat3), // exhibition 또는 performance
    addr: item.addr1 || "",
    homepage: null,
    tel: null,
  };
}

// detailIntro2로 개최일자(YYYYMMDD)·장소를 가져옵니다.
//  반환: 날짜 객체 | null(없음) | { quota:true }(429 할당량 초과 → 상위에서 조기 중단)
async function fetchEventDates(contentId, serviceKey) {
  const params = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    contentId: String(contentId),
    contentTypeId: "15",
  });
  const res = await fetchWithTimeout(`${INTRO_BASE}?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 },
  }, 8000);
  if (res.status === 429) return { quota: true }; // 할당량 초과
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.response?.body?.items?.item;
  const it = Array.isArray(raw) ? raw[0] : raw;
  if (!it) return null;
  return {
    startDate: normalizeDate(it.eventstartdate),
    endDate: normalizeDate(it.eventenddate) || normalizeDate(it.eventstartdate),
    eventplace: (it.eventplace || "").trim() || null,
  };
}

async function fetchEventsRaw() {
  const apiKey = process.env.TOUR_API_KEY;
  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  // 1) areaBasedList2에서 공연/행사(cat2=A0208)만 페이지네이션으로 수집
  const collected = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({
      serviceKey,
      MobileOS: "ETC",
      MobileApp: "chukjero",
      _type: "json",
      arrange: "A",
      numOfRows: "100",
      pageNo: String(page),
      contentTypeId: "15",
      cat1: "A02",
      cat2: "A0208",
    });
    const res = await fetchWithTimeout(`${AREA_LIST_BASE}?${params.toString()}`, {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) break;
    const data = await res.json();
    const raw = data?.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    collected.push(...items);
    const total = Number(data?.response?.body?.totalCount || 0);
    if (page * 100 >= total || items.length === 0) break;
  }

  const mappedAll = collected
    .map(mapEventItem)
    .filter((f) => f.name && Number.isFinite(f.lat) && Number.isFinite(f.lng));
  if (mappedAll.length === 0) throw new Error("전시·공연 목록이 비어 있음");

  // 전시·박람회를 앞에 두고(사용자 우선순위), detailIntro2 호출을 상한(EVENTS_MAX, 기본 60)까지만.
  //  ⚠️ detailIntro2는 일일 한도가 낮고 상세페이지(프로그램·이용안내)와 공유하므로,
  //     리스트 보강이 그 한도를 다 쓰지 않도록 상한을 둡니다. (없으면 상세페이지 정보가 막힘)
  const EVENTS_MAX = Number(process.env.EVENTS_MAX || 60);
  const mapped = mappedAll
    .slice()
    .sort((a, b) => (a.type === "exhibition" ? 0 : 1) - (b.type === "exhibition" ? 0 : 1))
    .slice(0, EVENTS_MAX);

  // 2) detailIntro2로 날짜 보강(동시 6건씩). 429(할당량)면 즉시 중단하고 얻은 것만 사용.
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const CONC = 6;
  const enriched = [];
  let quotaHit = false;
  for (let i = 0; i < mapped.length && !quotaHit; i += CONC) {
    const batch = mapped.slice(i, i + CONC);
    const results = await Promise.all(
      batch.map(async (f) => {
        try {
          const d = await fetchEventDates(f.id, serviceKey);
          if (d && d.quota) { quotaHit = true; return null; }
          if (!d || !d.startDate) return null;
          return {
            ...f,
            startDate: d.startDate,
            endDate: d.endDate || d.startDate,
            season: seasonOf(d.startDate), // 개최월 기준 계절 (여름 필터에 7~8월 전시가 걸림)
            eventplace: d.eventplace,
          };
        } catch {
          return null;
        }
      })
    );
    enriched.push(...results.filter(Boolean));
  }
  if (quotaHit) console.warn("[축제로] 전시·공연: API 할당량 초과로 일부만 수집");

  // 3) 종료되지 않은(오늘 이후 종료) 행사만
  const upcoming = enriched.filter((f) => f.endDate >= today);
  if (upcoming.length === 0) throw new Error("표시할 전시·공연이 없음");
  return upcoming;
}

// 성공 결과만 캐시(24시간) — detailIntro2 호출량(할당량) 절약.
const fetchFromEventsApi = unstable_cache(fetchEventsRaw, ["tour-events-v1"], {
  revalidate: 60 * 60 * 24,
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

  const [tourRes, stdRes, seoulRes, kcisaRes, cultureRes, eventsRes, kintexRes] = await Promise.allSettled([
    fetchFromTourApi(apiKey),
    standardEnabled ? fetchFromStandardApi() : Promise.resolve([]),
    fetchFromSeoul(), // 서울 공연·전시(키 없으면 빈 배열) — 전시 보강 주력
    fetchFromKcisa(), // 전국 국립 미술관·박물관 전시(키 없으면 빈 배열)
    fetchFromCulture(), // 문화포털 전시·공연(기본 OFF)
    EVENTS_ENABLED ? fetchFromEventsApi() : Promise.resolve([]), // (선택) TourAPI 기반
    fetchFromKintex(), // 경기데이터드림 킨텍스(키 없으면 조용히 빈 배열)
  ]);

  const tourList = tourRes.status === "fulfilled" ? tourRes.value : [];
  const stdList = stdRes.status === "fulfilled" ? stdRes.value : [];
  const seoulList = seoulRes.status === "fulfilled" ? seoulRes.value : [];
  const kcisaList = kcisaRes.status === "fulfilled" ? kcisaRes.value : [];
  const cultureList = cultureRes.status === "fulfilled" ? cultureRes.value : [];
  const eventsList = eventsRes.status === "fulfilled" ? eventsRes.value : [];
  const kintexList = kintexRes.status === "fulfilled" ? kintexRes.value : [];
  if (tourRes.status === "rejected")
    console.warn("[축제로] TourAPI 실패:", tourRes.reason?.message);
  if (stdRes.status === "rejected")
    console.warn("[축제로] 표준데이터 실패:", stdRes.reason?.message);
  if (seoulRes.status === "rejected")
    console.warn("[축제로] 서울 문화행사 실패:", seoulRes.reason?.message);
  if (kintexRes.status === "rejected")
    console.warn("[축제로] 킨텍스 실패:", kintexRes.reason?.message);

  const merged = mergeFestivals(tourList, stdList);

  // 추가 소스(서울·문화포털·킨텍스 등) 병합 — 중복 제거 필수:
  //  ① id 중복 제거  ② 이름+지역(dedupKey) 중복 제거(기존 축제/행사와 겹치면 스킵, 기존 우선).
  //  이렇게 하면 서울 축제가 TourAPI 축제와 겹쳐도 하나만 남습니다.
  const idSeen = new Set(merged.map((f) => f.id));
  const nameSeen = new Set(merged.filter((f) => normName(f.name).length > 1).map(dedupKey));
  for (const f of [...seoulList, ...kcisaList, ...cultureList, ...eventsList, ...kintexList]) {
    if (idSeen.has(f.id)) continue;
    const k = dedupKey(f);
    if (normName(f.name).length > 1 && nameSeen.has(k)) continue; // 이름+지역 중복
    idSeen.add(f.id);
    nameSeen.add(k);
    merged.push(f);
  }

  if (merged.length === 0) return SAMPLE_FESTIVALS; // 전부 실패 → 안전장치

  // 게시된 '새 축제'(기존과 연결 안 된 담당자 등록) 합성 후 병합.
  //  - 이름+지역이 기존 축제와 겹치면 새로 추가하지 않음(중복 방지).
  //  - Supabase 미설정/오류면 조용히 건너뜀(사이트 정상).
  try {
    const submitted = await getPublishedNewFestivals();
    if (submitted.length > 0) {
      // 좌표 없는 직접 등록 축제에 지역 근사 좌표 부여 → 지도 마커가 뜨게 함
      assignApproxCoords(submitted, merged);
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
