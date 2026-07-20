// ────────────────────────────────────────────────────────────────
//  전통시장(장터·야시장) 데이터
//   · 기본: data/markets/markets.json (기획자 직접 등록 큐레이션)
//   · 선택: 공공데이터 전국전통시장표준데이터 API — 키 등록 후 MARKET_API_ENABLED=true 로 켜면
//     5일장을 자동 보강(느린 정부 게이트웨이라 기본 꺼짐). 실패/미설정 시 조용히 큐레이션만.
// ────────────────────────────────────────────────────────────────
import MARKETS_JSON from "../../data/markets/markets.json";

// 큐레이션 시장에 type=market 부여 (지도 마커·필터가 유형으로 인식하도록)
function normalize(m) {
  return {
    ...m,
    type: "market",
    source: "market-curation",
    // 목록/지도 공통 필드 맞춤(축제 객체와 호환): 시장은 기간이 없음
    startDate: null,
    endDate: null,
    season: null,
    image: null,
    homepage: m.homepage || null,
    tel: m.tel || null,
  };
}

// [공개] 전통시장 목록. 좌표 있는 것만(지도 노출). 실패해도 빈 배열(사이트 정상).
export async function getMarkets() {
  const curated = Array.isArray(MARKETS_JSON.markets)
    ? MARKETS_JSON.markets.map(normalize)
    : [];
  // (선택) API 자동 보강 자리 — 키 등록 후 구현/활성화. 지금은 큐레이션만.
  //   if (process.env.MARKET_API_ENABLED === "true") { ...fetch + 병합... }
  return curated.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
}
