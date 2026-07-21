// ────────────────────────────────────────────────────────────────
//  카테고리별 '유효한 하위 필터' 매핑 (단일 설정 객체)
//   · 새 카테고리나 필터가 생기면 이 객체만 수정하면 됩니다(하드코딩 분기 X).
//   · key = 지도 카테고리
//       all=전체 · festival=축제 · exhibition=전시·박람회 · performance=공연 · market=장터·야시장
//   · 값 = 그 카테고리에서 '보이고 & 적용되는' 하위 필터 그룹
//       tags   : 테마 태그(🎆 불꽃놀이 / 🌙 야간 / 💧 물놀이) — 축제 속성이라 전체·축제만.
//       season : 계절(+월) 필터
//       period : 이번 주말·이번 달 필터
//     (region·favorites 등은 모든 카테고리 공통이라 여기서 관리하지 않음)
// ────────────────────────────────────────────────────────────────
export const CATEGORY_FILTERS = {
  all: { tags: true, season: true, period: true },
  festival: { tags: true, season: true, period: true },
  exhibition: { tags: false, season: true, period: true },
  performance: { tags: false, season: true, period: true },
  market: { tags: false, season: true, period: true },
};

// 현재 상태 → 카테고리 key (시장 모드 우선 → 유형 → 전체)
export function currentCategory({ showMarkets, type }) {
  if (showMarkets) return "market";
  return type || "all";
}

// 카테고리 key → 유효 필터 설정 (알 수 없으면 all 기준)
export function categoryFilters(cat) {
  return CATEGORY_FILTERS[cat] || CATEGORY_FILTERS.all;
}
