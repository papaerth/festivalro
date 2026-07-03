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
