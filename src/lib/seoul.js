import "server-only";
// ────────────────────────────────────────────────────────────────
//  서울 문화행사(공연·전시) — 서울 열린데이터광장 culturalEventInfo (OA-15486)
//
//  · 전시/미술 + 공연 + 축제를 좌표(LAT/LOT)·날짜·이미지와 함께 제공(전국 아님, 서울시).
//    → 코엑스 등 서울 상업 전시·미술 전시 보강에 특히 유용.
//  · ⚠️ 서울 열린데이터광장(data.seoul.go.kr)의 '무료 인증키'가 별도로 필요합니다.
//    .env.local 에 SEOUL_API_KEY 를 넣으면 켜지고, 없으면 조용히 [] (사이트 정상).
//    (관광공사 TOUR_API_KEY 와는 다른 키입니다. 발급: RECOVERY.md 참고)
//  · HTTP(:8088) 엔드포인트라 반드시 서버에서만 호출(여기 server-only).
//
//  응답: { culturalEventInfo: { list_total_count, RESULT:{CODE}, row:[ {CODENAME,TITLE,...} ] } }
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { typeByTitle } from "./festivals";

const SEOUL_HOST = process.env.SEOUL_API_HOST || "http://openapi.seoul.go.kr:8088";
const PAGE = 1000; // 한 요청 최대 1000행
const MAX_PAGES = Number(process.env.SEOUL_MAX_PAGES || 20); // 최대 스캔 페이지(≈전량)

function stableId(str = "") {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = (h << 5) + h + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}

// CODENAME(분류)+제목 → 우리 유형. 전시·공연·축제만 채택, 그 외(교육/체험·기타·영화)는 null(제외).
function mapCategory(codename = "", title = "") {
  // 1) 제목 강신호 우선 — 미술관/전시/갤러리/박람회 등은 CODENAME이 '축제'여도 전시로 교정.
  //    (서울 데이터엔 여름행사·식물원 전시 등이 '축제'로 뭉뚱그려진 경우가 있어 인기축제 오염 방지)
  const byTitle = typeByTitle(title); // 'festival'|'exhibition'|'performance'|null
  if (byTitle === "exhibition" || byTitle === "performance") return byTitle;
  // 2) CODENAME 분류
  const c = String(codename);
  if (c.includes("축제")) return "festival";
  if (c.includes("전시") || c.includes("미술") || c.includes("박람")) return "exhibition";
  if (/(콘서트|클래식|뮤지컬|오페라|연극|무용|국악|독주|독창|음악|공연)/.test(c)) return "performance";
  // 3) 제목이 '축제/페스티벌'이면 축제로 채택, 그 외(교육/체험·기타·영화 등)는 제외
  if (byTitle === "festival") return "festival";
  return null;
}

// "2026-10-28 00:00:00.0" 또는 "2026-10-28~..." → "2026-10-28"
function toDate(raw = "") {
  const m = String(raw).match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function seasonOf(startDate = "") {
  const mo = Number(String(startDate).slice(5, 7));
  if (mo >= 3 && mo <= 5) return "spring";
  if (mo >= 6 && mo <= 8) return "summer";
  if (mo >= 9 && mo <= 11) return "autumn";
  return "winter";
}

// 좌표 안전검사: 한국 범위(위도33~39, 경도124~132). 라벨이 뒤섞여 있으면 스왑, 아니면 null.
function safeCoords(latRaw, lonRaw) {
  let lat = Number(latRaw), lng = Number(lonRaw);
  const inKR = (a, b) => a >= 33 && a <= 39 && b >= 124 && b <= 132;
  if (inKR(lat, lng)) return { lat, lng };
  if (inKR(lng, lat)) return { lat: lng, lng: lat }; // 뒤바뀐 경우 스왑
  return { lat: null, lng: null };
}

async function fetchWithTimeout(url, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, next: { revalidate: 60 * 60 * 12 } }); }
  finally { clearTimeout(t); }
}

function mapRow(row) {
  const title = (row.TITLE || "").trim();
  const start = toDate(row.STRTDATE || row.DATE);
  if (!title || !start) return null;
  const type = mapCategory(row.CODENAME, title);
  if (!type) return null; // 전시·공연·축제가 아니면 제외(교육/체험·기타·영화 등)
  const end = toDate(row.END_DATE) || toDate((row.DATE || "").split("~")[1]) || start;
  const { lat, lng } = safeCoords(row.LAT, row.LOT);
  const gu = (row.GUNAME || "").trim();
  const img = (row.MAIN_IMG || "").trim();
  return {
    id: "seoul" + stableId(`${title}|${start}|${gu}`),
    name: title,
    sido: "서울특별시",
    sigungu: gu,
    region: "seoul",
    lat,
    lng,
    season: seasonOf(start),
    startDate: start,
    endDate: end,
    description: (row.PLACE || "").trim(),
    image: img.startsWith("http") ? img : null,
    source: "seoul", // 출처: 서울 열린데이터광장
    type,
    eventplace: (row.PLACE || "").trim() || null,
    addr: `서울특별시 ${gu}`.trim(),
    homepage: (row.HMPG_ADDR || "").trim() || null,
    tel: (row.INQUIRY || "").trim() || null,
  };
}

async function fetchSeoulRaw() {
  const key = process.env.SEOUL_API_KEY;
  if (!key) return [];

  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const s = page * PAGE + 1;
    const e = s + PAGE - 1;
    const url = `${SEOUL_HOST}/${key}/json/culturalEventInfo/${s}/${e}/`;
    let res;
    try { res = await fetchWithTimeout(url); } catch { break; }
    if (!res.ok) break;
    let data;
    try { data = JSON.parse(await res.text()); } catch { break; }
    const info = data.culturalEventInfo;
    const code = info?.RESULT?.CODE;
    if (code && code !== "INFO-000") break; // 오류/키문제 → 조용히 종료
    const rows = info?.row || [];
    for (const r of rows) {
      const it = mapRow(r);
      // 종료 안 된(오늘 이후) 행사만, id 중복 제거
      if (it && it.endDate >= today && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    }
    const total = Number(info?.list_total_count || 0);
    if (rows.length < PAGE || e >= total) break; // 마지막 페이지
  }

  if (out.length === 0) throw new Error("서울 문화행사 결과 없음(또는 키 문제)");
  return out;
}

const seoulCached = unstable_cache(fetchSeoulRaw, ["seoul-events-v2"], {
  revalidate: 60 * 60 * 12,
});

// [공개] 서울 공연·전시 목록. 키 없음/실패 시 [] (사이트 정상).
export async function fetchFromSeoul() {
  if (!process.env.SEOUL_API_KEY) return [];
  try {
    return await seoulCached();
  } catch (err) {
    console.warn("[축제로] 서울 문화행사 실패:", err.message);
    return [];
  }
}
