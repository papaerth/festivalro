// 계절별 테마 정보 (라벨 / 포인트 색 / 이모지)
// 색상은 기획 요구사항에 명시된 값을 그대로 사용합니다.
export const SEASONS = {
  spring: { key: "spring", label: "봄", color: "#C2578A", soft: "#F7E4EE", emoji: "🌸" },
  summer: { key: "summer", label: "여름", color: "#1E8E85", soft: "#DDF1EF", emoji: "🌊" },
  autumn: { key: "autumn", label: "가을", color: "#C75B1E", soft: "#FBE7DA", emoji: "🍁" },
  winter: { key: "winter", label: "겨울", color: "#3E6E9E", soft: "#E1EAF3", emoji: "❄️" },
};

// 화면에 보여줄 계절 순서 (봄 → 여름 → 가을 → 겨울)
export const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];

// 계절별 월(세분화 필터용) — 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12·1·2월
export const SEASON_MONTHS = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

// 행사 유형(type) 테마 — 축제 / 전시·박람회 / 공연
//  · 축제는 기존 계절색을 그대로 쓰므로 지도 마커 톤을 바꾸지 않습니다(축제 중심 유지).
//  · 전시·공연만 지도에서 별도 톤(보라/청록)으로 살짝 구분합니다.
export const TYPES = {
  festival: { key: "festival", label: "축제", color: "#C2578A", soft: "#F7E4EE", emoji: "🎉" },
  exhibition: { key: "exhibition", label: "전시·박람회", color: "#6A4C93", soft: "#ECE5F5", emoji: "🖼️" },
  performance: { key: "performance", label: "공연", color: "#2A7DB1", soft: "#E1EDF5", emoji: "🎭" },
};

// 필터 칩 순서 (전체 → 축제 → 전시·박람회 → 공연)
export const TYPE_ORDER = ["festival", "exhibition", "performance"];

// 유형 코드로 테마를 꺼내는 도우미 (없으면 축제 기본)
export function typeTheme(type) {
  return TYPES[type] || TYPES.festival;
}

// 지도 마커 색: 축제는 계절색(기존 그대로), 전시·공연은 유형색으로 구분
export function markerColor(item) {
  const t = item?.type;
  if (t === "exhibition" || t === "performance") return TYPES[t].color;
  return seasonColor(item?.season);
}

// 지역(권역) 정의. key는 데이터에서 쓰는 코드, 값은 화면에 보여줄 이름.
export const REGIONS = {
  all: "전국",
  seoul: "서울",
  gyeonggi: "경기·인천",
  gangwon: "강원",
  chungcheong: "충청",
  jeolla: "전라",
  gyeongsang: "경상",
  jeju: "제주",
};

export const REGION_ORDER = [
  "all",
  "seoul",
  "gyeonggi",
  "gangwon",
  "chungcheong",
  "jeolla",
  "gyeongsang",
  "jeju",
];

// 계절 코드로 색상을 편하게 꺼내 쓰는 도우미
export function seasonColor(season) {
  return (SEASONS[season] || SEASONS.spring).color;
}
