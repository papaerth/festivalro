import "server-only";
// ────────────────────────────────────────────────────────────────
//  전시·박람회·공연 데이터 — 문화포털 「공연전시정보」 오픈API (한국문화정보원)
//
//  · 공공데이터포털(data.go.kr) 데이터셋 15138937 "한눈에보는문화정보조회서비스".
//    기존 TOUR_API_KEY(같은 data.go.kr 계정 인증키)를 그대로 씁니다.
//  · ⚠️ 단, 이 데이터셋을 사장님 계정에서 **활용신청(자동승인·무료)** 해야 켜집니다.
//    신청 전에는 문화포털이 에러 페이지(HTML)를 주므로, 이 코드는 조용히 [] 반환 → 사이트 정상.
//  · TourAPI detailIntro2(일일 한도 낮음)를 쓰지 않고, 이 API가 목록에서
//    날짜(startDate/endDate) + 좌표(gpsX/gpsY) + 장르(realmName)를 한 번에 줍니다.
//
//  응답: XML. 항목은 <perforList>…</perforList> 반복.
//    title, startDate(YYYYMMDD), endDate, place, area, realmName, gpsX(경도), gpsY(위도), thumbnail, seq
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";

// 활성화: 이 API 전용 키(CULTURE_API_KEY)를 넣으면 자동으로 켜집니다.
//  (예전엔 TOUR_API_KEY 공용키로 쓰고 CULTURE_API_ENABLED=true 로만 켰음 — 하위호환 유지)
//  · 전용 키는 문화공공데이터광장/공공데이터포털에서 "한눈에보는문화정보조회서비스"(15138937)
//    활용신청 후 받은 인증키. 없으면 TOUR_API_KEY로 폴백.
const CULTURE_KEY_RAW = (process.env.CULTURE_API_KEY || process.env.TOUR_API_KEY || "").trim();
const CULTURE_KEY_TRIM = (process.env.CULTURE_API_KEY || "").trim();
const HAS_CULTURE_KEY = !!CULTURE_KEY_TRIM && !CULTURE_KEY_TRIM.startsWith("여기에");
// ※ Vercel 붙여넣기 시 끝 공백/줄바꿈이 흔해서 trim + 소문자로 관대하게 판정(=== "true" 강비교 금지)
const CULTURE_ENABLED =
  HAS_CULTURE_KEY || (process.env.CULTURE_API_ENABLED || "").trim().toLowerCase() === "true";
// data.go.kr 게이트웨이 경유 엔드포인트(활용신청 대상 15138937 · 기관코드 B553457).
//  현재 경로: /B553457/cultureinfo/period2 (기간별 공연전시). 기관이 경로를 바꾸면
//  .env의 CULTURE_API_BASE로 덮어쓸 수 있습니다.
const CULTURE_BASE =
  process.env.CULTURE_API_BASE ||
  "https://apis.data.go.kr/B553457/cultureinfo/period2";

// 시/도 이름 → 권역 코드 (festivals.js와 동일 규칙, 순환 import 방지용 최소 복제)
function sidoToRegion(sido = "") {
  // ⚠️ 문화포털 area는 축약형("충북","충남","전남","경북"…)으로 옴 → 축약형까지 매칭.
  if (sido.includes("서울")) return "seoul";
  if (sido.includes("경기") || sido.includes("인천")) return "gyeonggi";
  if (sido.includes("강원")) return "gangwon";
  if (sido.includes("충청") || sido.includes("충북") || sido.includes("충남") || sido.includes("대전") || sido.includes("세종")) return "chungcheong";
  if (sido.includes("전라") || sido.includes("전북") || sido.includes("전남") || sido.includes("광주")) return "jeolla";
  if (sido.includes("경상") || sido.includes("경북") || sido.includes("경남") || sido.includes("대구") || sido.includes("부산") || sido.includes("울산")) return "gyeongsang";
  if (sido.includes("제주")) return "jeju";
  return "seoul";
}
function seasonOf(startDate = "") {
  const m = Number(String(startDate).slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}
function stableId(str = "") {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = (h << 5) + h + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}
function normDate(raw = "") {
  const d = String(raw).replace(/[^0-9]/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
}
function ymd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// realmName(장르) → 우리 유형. 시각예술류=전시, 공연예술류=공연, 축제=제외(TourAPI와 중복 방지)
function classifyRealm(realm = "") {
  const r = String(realm);
  if (/축제/.test(r)) return null; // 축제는 TourAPI가 담당 → 제외
  if (/(전시|미술|공예|사진|서예|디자인|건축|박람)/.test(r)) return "exhibition";
  return "performance"; // 음악/국악/무용/연극/뮤지컬/오페라/영화/문학 등
}

// ── 아주 작은 XML 도우미 (외부 라이브러리 없이) ──
function unescapeXml(s = "") {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
}

function mapItem(block) {
  const title = tag(block, "title");
  const start = normDate(tag(block, "startDate"));
  if (!title || !start) return null;
  const type = classifyRealm(tag(block, "realmName"));
  if (!type) return null; // 축제(제외) 또는 분류 불가

  const end = normDate(tag(block, "endDate")) || start;
  const area = tag(block, "area"); // 예: 서울, 경기
  const place = tag(block, "place");
  const lat = Number(tag(block, "gpsY"));
  const lng = Number(tag(block, "gpsX"));
  const seq = tag(block, "seq");
  const thumb = tag(block, "thumbnail") || tag(block, "imgUrl");

  return {
    id: "c" + (seq ? stableId(seq) : stableId(`${title}|${start}`)),
    name: title,
    sido: area || "",
    sigungu: "",
    region: sidoToRegion(area || place),
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    season: seasonOf(start),
    startDate: start,
    endDate: end,
    description: place || "",
    image: thumb && thumb.startsWith("http") ? thumb : null,
    source: "culture", // 출처: 문화포털 공연전시정보
    type,
    eventplace: place || null,
    addr: [area, place].filter(Boolean).join(" "),
    homepage: null,
    tel: null,
  };
}

// 정부 게이트웨이(B553457) 콜드스타트가 첫 호출 ~15초라 넉넉히 20초.
//  결과는 unstable_cache로 12시간 캐시 → 실제 원격 호출은 드물어 성능 영향 미미.
async function fetchWithTimeout(url, ms = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { signal: c.signal, next: { revalidate: 60 * 60 * 12 } });
  } finally {
    clearTimeout(t);
  }
}

async function fetchCultureRaw() {
  const apiKey = (CULTURE_KEY_RAW || "").trim();
  if (!apiKey || apiKey.startsWith("여기에")) return [];

  // 키 인코딩 정규화: data.go.kr 키는 Encoding(이미 %인코딩)/Decoding(원문) 두 형태로 발급됨.
  //  어느 쪽을 넣어도 되도록 '디코딩 후 한 번만 인코딩'해 항상 올바른 단일 인코딩으로 맞춤.
  let decoded = apiKey;
  try { decoded = decodeURIComponent(apiKey); } catch { decoded = apiKey; }
  const serviceKey = encodeURIComponent(decoded);

  const today = new Date();
  // ⚠️ period2는 from~to '기간과 겹치는' 이벤트를 줌. from=오늘로 잡아야
  //  이미 끝난 이벤트를 API 단에서 제외하고 '현재 진행중/예정'만 받음.
  //  (from을 과거로 잡으면 끝난 전시가 앞 페이지를 가득 채워 정작 진행중이 안 들어옴)
  const from = ymd(today);
  const to = ymd(new Date(today.getTime() + 365 * 86400000)); // 1년 후
  const todayStr = today.toISOString().slice(0, 10);

  // period2는 페이지당 10건 고정(rows/numOfRows 무시). cPage로 페이징.
  const PAGE_SIZE = 10;
  const url = (page) =>
    `${CULTURE_BASE}?serviceKey=${serviceKey}&from=${from}&to=${to}&cPage=${page}&rows=${PAGE_SIZE}&sortStdr=1`;

  const parseBlocks = (text) => {
    const wrap = text.includes("<perforList>")
      ? "perforList"
      : text.includes("<item>")
      ? "item"
      : null;
    if (!wrap) return null; // 활용신청 전/에러 페이지
    return text.split(`<${wrap}>`).slice(1).map((b) => b.split(`</${wrap}>`)[0]);
  };

  // 1페이지: totalCount 확인 + 첫 데이터
  const first = await fetchWithTimeout(url(1));
  if (!first.ok) throw new Error(`문화포털 HTTP ${first.status}`);
  const firstText = await first.text();
  const firstBlocks = parseBlocks(firstText);
  if (!firstBlocks) throw new Error("문화포털 응답 형식 오류(활용신청 전일 수 있음)");
  const totalCount = Number((firstText.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0);

  const all = firstBlocks.map(mapItem).filter(Boolean);

  // 남은 페이지를 병렬 배치로 수집(콜드스타트 후엔 빠름). 상한은 CULTURE_MAX_PAGES.
  const MAX = Number(process.env.CULTURE_MAX_PAGES || 120); // 전국 전체(~1200건)
  const lastPage = Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, MAX);
  const BATCH = 10;
  for (let start = 2; start <= lastPage; start += BATCH) {
    const pages = [];
    for (let p = start; p < start + BATCH && p <= lastPage; p++) pages.push(p);
    const texts = await Promise.all(
      pages.map((p) => fetchWithTimeout(url(p)).then((r) => (r.ok ? r.text() : "")).catch(() => ""))
    );
    for (const text of texts) {
      const blocks = parseBlocks(text);
      if (blocks) all.push(...blocks.map(mapItem).filter(Boolean));
    }
  }

  // 종료되지 않은(오늘 이후 종료) 전시·공연만 — 안전망(API가 이미 걸러주지만 이중 확인)
  const upcoming = all.filter((f) => f.endDate >= todayStr);
  if (upcoming.length === 0) throw new Error("문화포털 전시·공연 결과 없음(또는 활용신청 전)");
  return upcoming;
}

const cultureCached = unstable_cache(fetchCultureRaw, ["culture-events-v5"], {
  revalidate: 60 * 60 * 12,
});

// [공개] 문화포털 전시·공연 목록. 키 없음/미신청/실패 시 [] (사이트 정상).
export async function fetchFromCulture() {
  if (!CULTURE_ENABLED) return [];
  try {
    return await cultureCached();
  } catch (err) {
    console.warn("[축제로] 문화포털 전시·공연 실패:", err.message);
    return [];
  }
}
