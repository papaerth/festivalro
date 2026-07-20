import "server-only";
// ────────────────────────────────────────────────────────────────
//  전국 국립 미술관·박물관 전시 — 문화공공데이터광장 「전시정보(통합)」 (KCISA API_CCA_145)
//
//  · 국립현대미술관·국립중앙박물관·예술의전당·국립아시아문화전당·지방 국립박물관 등의
//    현재/예정 전시를 이미지·기간·상세URL과 함께 제공. (전국, 최신 갱신)
//  · ⚠️ 별도 인증키 필요: 문화공공데이터광장(culture.go.kr/data)에서 "전시정보(통합)"
//    활용신청 후 받은 키를 .env.local 의 KCISA_EXHIBIT_KEY 에 넣으면 켜집니다.
//    (관광공사·서울 키와 다른 키. 없으면 조용히 [] → 사이트 정상)
//  · 이 API는 좌표(위경도)가 없어, 기관/장소명 → 좌표를 자체 매핑합니다(국립기관은 위치 고정).
//    매핑 안 되는 곳은 지도 마커 없이 목록에만 표시.
//
//  응답: XML <response><body><items><item>…</item></items></body></response>
//    TITLE, CNTC_INSTT_NM(기관), EVENT_SITE(장소), PERIOD(기간 YYYY-MM-DD~YYYY-MM-DD),
//    IMAGE_OBJECT(이미지), URL(상세), GENRE
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";

const KCISA_BASE =
  process.env.KCISA_EXHIBIT_BASE || "https://api.kcisa.kr/openapi/API_CCA_145/request";
const MAX_PAGES = Number(process.env.KCISA_MAX_PAGES || 25); // 100건×페이지 (전체 ~9500건 중 스캔량)

// 도시/지점 → { 좌표, 시도 }  (국립기관 위치, 대략 중심)
const CITY = {
  서울: { xy: [37.5665, 126.978], sido: "서울특별시" },
  서초: { xy: [37.4795, 127.0119], sido: "서울특별시" }, // 예술의전당
  덕수궁: { xy: [37.5658, 126.9751], sido: "서울특별시" },
  과천: { xy: [37.4292, 126.9877], sido: "경기도" },
  고양: { xy: [37.6584, 126.832], sido: "경기도" },
  용인: { xy: [37.2411, 127.1776], sido: "경기도" },
  청주: { xy: [36.6424, 127.489], sido: "충청북도" },
  공주: { xy: [36.4466, 127.119], sido: "충청남도" },
  부여: { xy: [36.2757, 126.9099], sido: "충청남도" },
  제주: { xy: [33.5104, 126.4914], sido: "제주특별자치도" },
  춘천: { xy: [37.8813, 127.73], sido: "강원특별자치도" },
  김해: { xy: [35.2285, 128.8894], sido: "경상남도" },
  진주: { xy: [35.18, 128.1076], sido: "경상남도" },
  대구: { xy: [35.8714, 128.6014], sido: "대구광역시" },
  경주: { xy: [35.8562, 129.2247], sido: "경상북도" },
  익산: { xy: [35.9483, 126.9576], sido: "전라북도" },
  전주: { xy: [35.8242, 127.148], sido: "전라북도" },
  광주: { xy: [35.1595, 126.8526], sido: "전남광주통합특별시" },
  나주: { xy: [35.016, 126.7108], sido: "전남광주통합특별시" },
  부산: { xy: [35.1796, 129.0756], sido: "부산광역시" },
};
// 기관명 → 도시 키 (도시명이 이름에 안 들어간 기관들)
const INST_CITY = {
  국립중앙박물관: "서울", 국립한글박물관: "서울", 예술의전당: "서초",
  국립아시아문화전당: "광주", 한국예술종합학교: "서울", 국립어린이청소년도서관: "서울",
  국립박물관문화재단: "서울", 한국영상자료원: "서울",
};

function stableId(str = "") {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = (h << 5) + h + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}
function normDate(raw = "") {
  const d = String(raw).replace(/[^0-9]/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
}
function seasonOf(startDate = "") {
  const mo = Number(String(startDate).slice(5, 7));
  if (mo >= 3 && mo <= 5) return "spring";
  if (mo >= 6 && mo <= 8) return "summer";
  if (mo >= 9 && mo <= 11) return "autumn";
  return "winter";
}
// XML 태그 값 추출 (정규식 이스케이프 이슈 피하려 split 기반)
function tag(block, name) {
  const a = block.split(`<${name}>`)[1];
  if (a === undefined) return "";
  return a
    .split(`</${name}>`)[0]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .trim();
}

// 기관/장소 → { lat, lng, sido }  (국립현대미술관은 EVENT_SITE로 지점 판별)
function resolvePlace(inst = "", site = "") {
  const both = `${inst} ${site}`;
  if (inst.includes("국립현대미술관")) {
    for (const c of ["과천", "청주", "덕수궁"]) if (both.includes(c)) return { ...CITY[c], key: c };
    return { ...CITY.서울, key: "서울" }; // 서울/레지던시/해외 등 → 서울 대표
  }
  for (const [k, city] of Object.entries(INST_CITY)) if (inst.includes(k)) return { ...CITY[city], key: city };
  const m = inst.match(/국립([가-힣]{2,4})(박물관|미술관)/);
  if (m && CITY[m[1]]) return { ...CITY[m[1]], key: m[1] };
  for (const c of Object.keys(CITY)) if (both.includes(c)) return { ...CITY[c], key: c };
  return null;
}
function sidoToRegion(sido = "") {
  if (sido.includes("서울")) return "seoul";
  if (sido.includes("경기") || sido.includes("인천")) return "gyeonggi";
  if (sido.includes("강원")) return "gangwon";
  if (sido.includes("충청") || sido.includes("대전") || sido.includes("세종")) return "chungcheong";
  if (sido.includes("전라") || sido.includes("전북") || sido.includes("전남") || sido.includes("광주")) return "jeolla";
  if (sido.includes("경상") || sido.includes("경북") || sido.includes("경남") || sido.includes("대구") || sido.includes("부산") || sido.includes("울산")) return "gyeongsang";
  if (sido.includes("제주")) return "jeju";
  return "seoul";
}

async function fetchWithTimeout(url, ms = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers: { "User-Agent": "chukjero/1.0" }, next: { revalidate: 60 * 60 * 12 } }); }
  finally { clearTimeout(t); }
}

function mapItem(block, today) {
  const title = tag(block, "TITLE");
  const period = tag(block, "PERIOD") || tag(block, "EVENT_PERIOD");
  const dates = period.replace(/[.\/]/g, "-").match(/\d{4}-\d{2}-\d{2}/g) || [];
  const start = dates[0] || "";
  const end = dates[1] || start;
  if (!title || !start) return null;
  if (end < today) return null; // 종료된 전시 제외

  const inst = tag(block, "CNTC_INSTT_NM");
  const site = tag(block, "EVENT_SITE");
  const place = resolvePlace(inst, site);
  const img = tag(block, "IMAGE_OBJECT");
  const sido = place?.sido || "";

  return {
    id: "x" + stableId(`${title}|${start}|${inst}`),
    name: title,
    sido,
    sigungu: place?.key && place.key !== sido ? place.key : "",
    region: sidoToRegion(sido),
    lat: place ? place.xy[0] : null,
    lng: place ? place.xy[1] : null,
    season: seasonOf(start),
    startDate: start,
    endDate: end,
    description: [inst, site].filter(Boolean).join(" · "),
    image: img.startsWith("http") ? img : null,
    source: "kcisa", // 출처: 문화공공데이터광장 전시정보(통합)
    type: "exhibition",
    eventplace: inst || site || null,
    addr: [sido, inst].filter(Boolean).join(" "),
    homepage: tag(block, "URL") || null,
    tel: null,
  };
}

async function fetchKcisaRaw() {
  const key = process.env.KCISA_EXHIBIT_KEY;
  if (!key) return [];
  const today = new Date().toISOString().slice(0, 10);

  const out = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await fetchWithTimeout(`${KCISA_BASE}?serviceKey=${encodeURIComponent(key)}&numOfRows=100&pageNo=${page}`);
    } catch { break; }
    if (!res.ok) break;
    const x = await res.text();
    if (page === 1 && !x.includes("<item>")) break; // 키 문제/에러 → 조용히 종료
    const blocks = x.split("<item>").slice(1).map((s) => s.split("</item>")[0]);
    if (blocks.length === 0) break;
    for (const b of blocks) {
      const it = mapItem(b, today);
      if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    }
  }
  if (out.length === 0) throw new Error("전시정보(통합) 결과 없음(또는 키 문제)");
  return out;
}

const kcisaCached = unstable_cache(fetchKcisaRaw, ["kcisa-exhibit-v1"], {
  revalidate: 60 * 60 * 12,
});

// [공개] 전국 국립 미술관·박물관 전시. 키 없음/실패 시 [] (사이트 정상).
export async function fetchFromKcisa() {
  if (!process.env.KCISA_EXHIBIT_KEY) return [];
  try {
    return await kcisaCached();
  } catch (err) {
    console.warn("[축제로] 전시정보(통합) 실패:", err.message);
    return [];
  }
}
