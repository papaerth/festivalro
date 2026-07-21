// ────────────────────────────────────────────────────────────────
//  상설(수시) 불꽃놀이 명소 — 테마파크 등 정기 불꽃놀이 장소
//   · data/fireworks/spots.json 큐레이션.
//   · 불꽃놀이(🎆) 태그 목록 '맨 뒤'에 '상설' 배지로 붙습니다(기간 있는 불꽃축제 뒤).
//   · 기존 축제 파이프라인(캐러셀·카운트)엔 안 섞이도록 페이지에서 별도 prop으로 전달.
// ────────────────────────────────────────────────────────────────
import SPOTS_JSON from "../../data/fireworks/spots.json";

function normalize(s) {
  return {
    ...s,
    type: "festival", // 카드·마커가 축제처럼 렌더(단, permanent 플래그로 상설 처리)
    permanent: true, // 상설(수시) — 기간/상태(진행중·예정·종료) 대신 '상설' 배지
    tags: ["fireworks"],
    startDate: null,
    endDate: null,
    season: null,
    image: null,
    source: "fireworks-spot",
    tel: null,
  };
}

// [공개] 상설 불꽃놀이 명소 목록 (좌표 있는 것만).
export async function getFireworksSpots() {
  const list = Array.isArray(SPOTS_JSON.spots) ? SPOTS_JSON.spots.map(normalize) : [];
  return list.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
