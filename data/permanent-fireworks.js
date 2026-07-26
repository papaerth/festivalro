// ────────────────────────────────────────────────────────────────
//  상설(수시) 불꽃놀이 명소 — 테마파크 등 정기적으로 불꽃놀이를 하는 곳.
//   · 기간이 정해진 불꽃축제와 달리 '상설(∞)' 배지로 표시되고,
//     불꽃놀이(🎆) 필터에서 '시즌 불꽃축제' 뒤에 기본 노출됩니다(토글 없음).
//   · 항목 추가·수정은 아래 배열에 객체를 한 줄씩 넣거나 고치면 됩니다.
//     좌표는 lat=위도, lng=경도. region: seoul/gyeonggi/gangwon/chungcheong/jeolla/gyeongsang/jeju.
//
//  ── 필드 안내 ──
//   name / sido / sigungu / region / lat / lng : 기본 정보(필수).
//   scheduleText : 운영 안내(자유 문구). 카드·팝업에 '날짜 대신' 이 문구를 표시.
//   homepage     : 공식 홈페이지 URL → 카드·팝업의 '홈페이지' 버튼.
//   addr         : 주소(선택, 표시·검색 보조).
//   operatingDays: (선택) 운영 요일 배열.  ⬅⬅ 여기에 요일을 채워 넣으세요. 예: ["금","토","일"]
//                  · 채우면 안내 문구에 "· 금·토·일 운영"처럼 함께 표시됩니다. 비우면 표시 안 함.
//   seasons      : (선택) 운영 시즌 배열.  ⬅⬅ 여기에 시즌을 채워 넣으세요. 예: ["summer","winter"]
//                  · 값(spring/summer/autumn/winter)을 지정하면 '그 계절 필터'에서만 노출됩니다.
//                  · 비워 두면(기본) 모든 계절에 노출됩니다.
// ────────────────────────────────────────────────────────────────

export const PERMANENT_FIREWORKS = [
  {
    id: "fw-everland",
    name: "에버랜드",
    sido: "경기도",
    sigungu: "용인시 처인구",
    region: "gyeonggi",
    lat: 37.2939,
    lng: 127.2025,
    scheduleText: "시즌별 불꽃쇼 운영 · 일정은 공식 홈페이지 확인",
    homepage: "https://www.everland.com",
    addr: "경기도 용인시 처인구 포곡읍",
    operatingDays: [], // 예: ["금","토","일"]  ← 운영 요일 확인되면 채우기
    seasons: [], // 예: ["summer","winter"]  ← 운영 시즌 있으면 채우기(비우면 모든 계절)
  },
  {
    id: "fw-seoulland",
    name: "서울랜드",
    sido: "경기도",
    sigungu: "과천시",
    region: "gyeonggi",
    lat: 37.4348,
    lng: 127.0203,
    scheduleText: "시즌별 불꽃쇼 운영 · 일정은 공식 홈페이지 확인",
    homepage: "https://www.seoulland.co.kr",
    addr: "경기도 과천시 광명로",
    operatingDays: [], // ← 운영 요일
    seasons: [], // ← 운영 시즌
  },
  {
    id: "fw-lotteworld",
    name: "롯데월드 어드벤처",
    sido: "서울특별시",
    sigungu: "송파구",
    region: "seoul",
    lat: 37.5111,
    lng: 127.098,
    scheduleText: "시즌별 불꽃·레이저 야간쇼 · 일정은 공식 홈페이지 확인",
    homepage: "https://adventure.lotteworld.com",
    addr: "서울특별시 송파구 올림픽로 240",
    operatingDays: [], // ← 운영 요일
    seasons: [], // ← 운영 시즌
  },
  {
    id: "fw-busanlotteworld",
    name: "롯데월드 어드벤처 부산",
    sido: "부산광역시",
    sigungu: "기장군",
    region: "gyeongsang",
    lat: 35.1957,
    lng: 129.213,
    scheduleText: "시즌별 불꽃·쇼 운영 · 일정은 공식 홈페이지 확인",
    homepage: "https://adventurebusan.lotteworld.com",
    addr: "부산광역시 기장군 기장읍 동부산관광로",
    operatingDays: [], // ← 운영 요일
    seasons: [], // ← 운영 시즌
  },
  {
    id: "fw-gyeongjuworld",
    name: "경주월드",
    sido: "경상북도",
    sigungu: "경주시",
    region: "gyeongsang",
    lat: 35.8329,
    lng: 129.2818,
    scheduleText: "시즌별 야간 불꽃 운영 · 일정은 공식 홈페이지 확인",
    homepage: "https://www.gyeongjuworld.com",
    addr: "경상북도 경주시 보문로",
    operatingDays: [], // ← 운영 요일
    seasons: [], // ← 운영 시즌
  },
  {
    id: "fw-eworld",
    name: "이월드",
    sido: "대구광역시",
    sigungu: "달서구",
    region: "gyeongsang",
    lat: 35.8536,
    lng: 128.5606,
    scheduleText: "시즌별 불꽃·별빛축제 운영 · 일정은 공식 홈페이지 확인",
    homepage: "https://www.eworld.kr",
    addr: "대구광역시 달서구 두류공원로",
    operatingDays: [], // ← 운영 요일
    seasons: [], // ← 운영 시즌
  },
];
