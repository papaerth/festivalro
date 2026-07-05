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
import { SAMPLE_FESTIVALS } from "./sampleFestivals";

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
    addr: item.addr1 || "",
    homepage: null,
    tel: null,
  };
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

  const res = await fetch(`${TOUR_API_BASE}?${params.toString()}`, {
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

// 표준데이터에서 축제 목록을 가져옵니다. 실패하면 예외를 던집니다.
async function fetchFromStandardApi(apiKey) {
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

  const res = await fetch(`${STANDARD_API_BASE}?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`표준데이터 응답 오류: ${res.status}`);

  const data = await res.json();
  let raw = data?.response?.body?.items;
  if (raw && raw.item) raw = raw.item; // 혹시 items.item 형태면 처리
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (items.length === 0) {
    throw new Error("표준데이터에서 축제 목록을 찾지 못했습니다.");
  }

  // 올해 이후(종료되지 않은/올해 진행) 축제만 → 데이터 양·관련성 관리
  const cutoff = `${new Date().getFullYear()}-01-01`;
  return items
    .map(mapStandardItem)
    .filter((f) => f.name && f.startDate && f.endDate >= cutoff);
}

// 중복 판정용 정규화 이름 (공백·숫자·흔한 접미사 제거)
function normName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[0-9]/g, "")
    .replace(/(축제|페스티벌|festival|문화제|엑스포|expo|행사)/g, "")
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
    standardEnabled ? fetchFromStandardApi(apiKey) : Promise.resolve([]),
  ]);

  const tourList = tourRes.status === "fulfilled" ? tourRes.value : [];
  const stdList = stdRes.status === "fulfilled" ? stdRes.value : [];
  if (tourRes.status === "rejected")
    console.warn("[축제로] TourAPI 실패:", tourRes.reason?.message);
  if (stdRes.status === "rejected")
    console.warn("[축제로] 표준데이터 실패:", stdRes.reason?.message);

  const merged = mergeFestivals(tourList, stdList);
  if (merged.length === 0) return SAMPLE_FESTIVALS; // 둘 다 실패 → 안전장치
  return merged;
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

// [공개] id로 축제 1건 가져오기 (상세 화면에서 사용)
// 실데이터인 경우 상세 소개문(overview)을 추가로 불러와 붙입니다.
export async function getFestivalById(id) {
  const all = await getFestivals();
  const festival = all.find((f) => f.id === id);
  if (!festival) return null;

  const apiKey = process.env.TOUR_API_KEY;
  const hasRealKey = apiKey && apiKey !== "여기에_키를_붙여넣기";
  // 소개문 보강은 TourAPI 축제(숫자 contentid)만 — 표준데이터는 자체 소개문 사용
  if (hasRealKey && festival.source === "tour") {
    try {
      const overview = await fetchOverview(festival.id, apiKey);
      if (overview) return { ...festival, description: overview };
    } catch (err) {
      // 소개문을 못 불러와도 기본 정보는 그대로 보여줍니다.
      console.warn("[축제로] 상세 소개문 불러오기 실패:", err.message);
    }
  }
  return festival;
}

// [공개] 현재 실데이터를 쓰는 중인지 여부 (화면 안내용)
export function isUsingSampleData() {
  const apiKey = process.env.TOUR_API_KEY;
  return !(apiKey && apiKey !== "여기에_키를_붙여넣기");
}
