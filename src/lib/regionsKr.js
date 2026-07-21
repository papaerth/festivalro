// ────────────────────────────────────────────────────────────────
//  대한민국 시도(17개) 정의 + 축제 주소 → 시도 매칭
//   - TourAPI 지역체계(17개 시도)를 코드에 내장(추가 API 호출 없음)
//   - 시군구 목록은 실제 축제 데이터에서 뽑아 씀(빈 지역 방지)
// ────────────────────────────────────────────────────────────────

// 표시 순서 = 사용자가 지정한 17개 시도 순서
export const SIDO = [
  { key: "seoul", ko: "서울", kw: ["서울"] },
  { key: "busan", ko: "부산", kw: ["부산"] },
  { key: "daegu", ko: "대구", kw: ["대구"] },
  { key: "incheon", ko: "인천", kw: ["인천"] },
  { key: "gwangju", ko: "광주", kw: ["광주"] },
  { key: "daejeon", ko: "대전", kw: ["대전"] },
  { key: "ulsan", ko: "울산", kw: ["울산"] },
  { key: "sejong", ko: "세종", kw: ["세종"] },
  { key: "gyeonggi", ko: "경기", kw: ["경기"] },
  { key: "gangwon", ko: "강원", kw: ["강원"] },
  { key: "chungbuk", ko: "충북", kw: ["충청북", "충북"] },
  { key: "chungnam", ko: "충남", kw: ["충청남", "충남"] },
  { key: "jeonbuk", ko: "전북", kw: ["전라북", "전북"] },
  { key: "jeonnam", ko: "전남", kw: ["전라남", "전남"] },
  { key: "gyeongbuk", ko: "경북", kw: ["경상북", "경북"] },
  { key: "gyeongnam", ko: "경남", kw: ["경상남", "경남"] },
  { key: "jeju", ko: "제주", kw: ["제주"] },
];

export const SIDO_ORDER = SIDO.map((s) => s.key);

// 시도별 대략 중심 좌표 [위도, 경도] — 지역 선택 시 마커가 없으면 이 좌표로 지도 이동(fallback).
export const SIDO_CENTER = {
  seoul: [37.5665, 126.978],
  busan: [35.1796, 129.0756],
  daegu: [35.8714, 128.6014],
  incheon: [37.4563, 126.7052],
  gwangju: [35.1595, 126.8526],
  daejeon: [36.3504, 127.3845],
  ulsan: [35.5384, 129.3114],
  sejong: [36.48, 127.289], // 세종시청 기준
  gyeonggi: [37.4138, 127.5183],
  gangwon: [37.8228, 128.1555],
  chungbuk: [36.6357, 127.4917],
  chungnam: [36.6588, 126.6728],
  jeonbuk: [35.7175, 127.153],
  jeonnam: [34.8161, 126.463],
  gyeongbuk: [36.576, 128.5056],
  gyeongnam: [35.4606, 128.2132],
  jeju: [33.4996, 126.5312],
};

// 축제의 시도 문자열(예 "서울특별시")을 17개 시도 key로 변환. 못 찾으면 null.
export function matchSido(sidoStr = "") {
  const s = String(sidoStr);
  for (const item of SIDO) {
    if (item.kw.some((k) => s.includes(k))) return item.key;
  }
  return null;
}
