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

// [공개] 전체 축제 목록 가져오기 (서버 컴포넌트에서 사용)
export async function getFestivals() {
  const apiKey = process.env.TOUR_API_KEY;

  // 키가 예시값 그대로이거나 비어 있으면 샘플로
  const hasRealKey = apiKey && apiKey !== "여기에_키를_붙여넣기";

  if (hasRealKey) {
    try {
      return await fetchFromTourApi(apiKey);
    } catch (err) {
      // 실데이터 실패 시에도 서비스가 멈추지 않도록 샘플로 안전하게 대체
      console.warn("[축제로] TourAPI 호출 실패 → 샘플 데이터로 대체합니다.", err.message);
      return SAMPLE_FESTIVALS;
    }
  }
  return SAMPLE_FESTIVALS;
}

// [공개] id로 축제 1건 가져오기 (상세 화면에서 사용)
export async function getFestivalById(id) {
  const all = await getFestivals();
  return all.find((f) => f.id === id) || null;
}

// [공개] 현재 실데이터를 쓰는 중인지 여부 (화면 안내용)
export function isUsingSampleData() {
  const apiKey = process.env.TOUR_API_KEY;
  return !(apiKey && apiKey !== "여기에_키를_붙여넣기");
}
