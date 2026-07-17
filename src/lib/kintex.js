import "server-only";
// ────────────────────────────────────────────────────────────────
//  킨텍스(KINTEX) 전시·박람회 일정 — 경기데이터드림 오픈API 연동
//
//  ※ 이 API는 공공데이터포털(data.go.kr)의 TourAPI 키와 별개인
//     '경기데이터드림(data.gg.go.kr)' 인증키가 필요합니다.
//     → .env.local 에 GG_DATA_KEY 를 넣으면 켜지고, 없으면 조용히 꺼집니다(빈 배열).
//        (즉, 키가 없으면 사이트에 아무 영향 없음)
//
//  발급 방법 안내는 RECOVERY.md 참고.
//
//  경기데이터드림 오픈API 공통 규격:
//     https://openapi.gg.go.kr/{ServiceName}?KEY=..&Type=json&pIndex=1&pSize=100
//     응답: { "{ServiceName}": [ { "head":[...] }, { "row":[ {..필드..}, ... ] } ] }
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";

// 킨텍스는 위치가 고정(경기 고양시 일산서구 킨텍스로 217-59) → 좌표 내장
const KINTEX = {
  lat: 37.6676,
  lng: 126.7459,
  sido: "경기도",
  sigungu: "고양시",
};

// 경기데이터드림 KINTEX 행사일정 서비스명(페이지에서 확인되면 .env로 교정 가능)
const GG_HOST = process.env.GG_DATA_HOST || "https://openapi.gg.go.kr";
const GG_KINTEX_SERVICE = process.env.GG_KINTEX_SERVICE || "Kintex";

// 문자열 → 짧고 안정적인 id
function stableId(str = "") {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) + h + str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

// "2026-03-03", "20260303", "2026.03.03" 등 → "2026-03-03"
function normDate(raw = "") {
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// "2026-03-03 ~ 2026-03-06" 또는 "20260303~20260306" → { start, end }
function parsePeriod(raw = "") {
  const parts = String(raw).split(/[~\-–—]|\bto\b/i).map((s) => normDate(s)).filter(Boolean);
  // '2026-03-03'처럼 하이픈이 날짜 구분자로 쓰인 경우까지 고려해 8자리 덩어리를 다시 추출
  const chunks = (String(raw).match(/\d{8}|\d{4}[.\-/]\d{2}[.\-/]\d{2}/g) || []).map(normDate);
  const all = chunks.length ? chunks : parts;
  return { start: all[0] || "", end: all[1] || all[0] || "" };
}

function seasonOf(startDate = "") {
  const m = Number(String(startDate).slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// row의 값들 중 후보 키 목록에서 처음 발견되는 비어있지 않은 값
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

async function fetchKintexRaw() {
  const key = process.env.GG_DATA_KEY;
  if (!key) return []; // 키 없으면 꺼짐(사이트 무영향)

  const params = new URLSearchParams({
    KEY: key,
    Type: "json",
    pIndex: "1",
    pSize: "100",
  });
  const url = `${GG_HOST}/${GG_KINTEX_SERVICE}?${params.toString()}`;

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
  if (!res.ok) throw new Error(`킨텍스 API 응답 오류: ${res.status}`);
  const data = await res.json();

  // 경기데이터드림 표준 응답: { [service]: [ {head}, {row:[...]} ] }
  const svc = data[GG_KINTEX_SERVICE];
  const rowsWrap = Array.isArray(svc) ? svc.find((x) => x && x.row) : null;
  const rows = rowsWrap?.row || [];
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const cutoff = `${new Date().getFullYear()}-01-01`;
  const mapped = rows
    .map((row) => {
      // 필드명은 데이터셋마다 조금씩 달라 후보 키를 폭넓게 탐색(정확한 키는 발급 후 확정)
      const name = pick(row, ["EVENT_NM", "EVENT_NAME", "행사명", "TITLE", "EVENTS_NM"]);
      const period = pick(row, ["EVENT_PD", "EVENT_PERIOD", "행사기간", "EVENT_DE", "PERIOD"]);
      const startRaw = pick(row, ["EVENT_BGNG_DE", "BEGIN_DE", "START_DE", "행사시작일"]);
      const endRaw = pick(row, ["EVENT_END_DE", "END_DE", "행사종료일"]);
      const place = pick(row, ["EVENT_PLC", "PLACE", "행사장소", "HALL", "EVENT_HALL"]);
      const homepage = pick(row, ["HMPG_ADDR", "HOMEPAGE", "홈페이지", "URL"]);
      if (!name) return null;

      let start = normDate(startRaw);
      let end = normDate(endRaw);
      if (!start) {
        const p = parsePeriod(period);
        start = p.start;
        end = end || p.end;
      }
      if (!start) return null;

      return {
        id: "k" + stableId(`${name}|${start}`),
        name,
        sido: KINTEX.sido,
        sigungu: KINTEX.sigungu,
        region: "gyeonggi",
        lat: KINTEX.lat,
        lng: KINTEX.lng,
        season: seasonOf(start),
        startDate: start,
        endDate: end || start,
        description: place ? `킨텍스 · ${place}` : "킨텍스(KINTEX)",
        image: null,
        source: "kintex",
        type: "exhibition", // 킨텍스 행사는 전시·박람회로 분류
        eventplace: place || "킨텍스(KINTEX)",
        addr: `${KINTEX.sido} ${KINTEX.sigungu}`,
        homepage: homepage || null,
        tel: null,
      };
    })
    .filter(Boolean)
    .filter((f) => f.endDate >= cutoff);

  return mapped;
}

const kintexCached = unstable_cache(fetchKintexRaw, ["kintex-events-v1"], {
  revalidate: 60 * 60 * 12,
});

// [공개] 킨텍스 전시·박람회 목록. 키 없거나 실패하면 [] (사이트 정상).
export async function fetchFromKintex() {
  if (!process.env.GG_DATA_KEY) return [];
  try {
    return await kintexCached();
  } catch (err) {
    console.warn("[축제로] 킨텍스 연동 실패:", err.message);
    return [];
  }
}
