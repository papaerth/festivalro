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
//   operatingDays: (선택) 운영 요일 배열. 예: ["금","토","일"]  ← 확정 요일이 있으면 채우기.
//                  · ⚠️ 이 파크들은 시즌·행사에 따라 요일이 자주 바뀌므로 대부분 비워 둡니다
//                    (정확한 날짜는 scheduleText가 홈페이지로 안내). 확실할 때만 채우세요.
//   seasons      : (선택) 운영 시즌 배열. 예: ["summer","winter"]  ← 특정 계절에만 운영할 때만 채우기.
//                  · ⚠️ 아래 6곳은 여름 야간개장·겨울 별빛 등으로 '연중 여러 계절' 운영하므로
//                    비워 둡니다(비움 = 모든 계절 노출). 특정 계절 전용 명소를 추가할 때만 값을 넣으세요.
//                    (spring/summer/autumn/winter)
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
    // 2026 50주년 새 불꽃쇼를 3월부터 상시 운영, 여름 야간개장(7~8월 금·토·성수기).
    scheduleText: "50주년 새 불꽃쇼 상시 운영 · 여름 야간개장(7~8월 금·토·성수기) · 정확한 일정은 공식 홈페이지 확인",
    homepage: "https://www.everland.com",
    addr: "경기도 용인시 처인구 포곡읍",
    operatingDays: [], // 연중 운영(여름 야간은 금·토 중심) — 일자는 홈페이지 확인
    seasons: [], // 연중(봄 시작~여름·겨울 성수기) → 모든 계절 노출
  },
  {
    id: "fw-seoulland",
    name: "서울랜드",
    sido: "경기도",
    sigungu: "과천시",
    region: "gyeonggi",
    lat: 37.4348,
    lng: 127.0203,
    scheduleText: "주말·성수기 야간 불꽃 · 여름 야간개장·시즌 이벤트 · 정확한 일정은 공식 홈페이지 확인",
    homepage: "https://www.seoulland.co.kr",
    addr: "경기도 과천시 광명로",
    operatingDays: [], // 주말·성수기 중심 — 일자는 홈페이지 확인
    seasons: [], // 여러 시즌 운영 → 모든 계절 노출
  },
  {
    id: "fw-lotteworld",
    name: "롯데월드 어드벤처",
    sido: "서울특별시",
    sigungu: "송파구",
    region: "seoul",
    lat: 37.5111,
    lng: 127.098,
    scheduleText: "시즌 불꽃·레이저 야간쇼 (매직아일랜드) · 정확한 일정은 공식 홈페이지 확인",
    homepage: "https://adventure.lotteworld.com",
    addr: "서울특별시 송파구 올림픽로 240",
    operatingDays: [], // 시즌·행사별 — 일자는 홈페이지 확인
    seasons: [], // 연중 시즌쇼 → 모든 계절 노출
  },
  {
    id: "fw-busanlotteworld",
    name: "롯데월드 어드벤처 부산",
    sido: "부산광역시",
    sigungu: "기장군",
    region: "gyeongsang",
    lat: 35.1957,
    lng: 129.213,
    scheduleText: "야간개장 시 불꽃·쇼(성수기) · 정확한 일정은 공식 홈페이지 확인",
    homepage: "https://adventurebusan.lotteworld.com",
    addr: "부산광역시 기장군 기장읍 동부산관광로",
    operatingDays: [], // 야간개장(성수기) 중심 — 일자는 홈페이지 확인
    seasons: [], // 성수기 여러 시즌 → 모든 계절 노출
  },
  {
    id: "fw-gyeongjuworld",
    name: "경주월드",
    sido: "경상북도",
    sigungu: "경주시",
    region: "gyeongsang",
    lat: 35.8329,
    lng: 129.2818,
    scheduleText: "여름 야간개장 불꽃·성수기 야간쇼 · 정확한 일정은 공식 홈페이지 확인",
    homepage: "https://www.gyeongjuworld.com",
    addr: "경상북도 경주시 보문로",
    operatingDays: [], // 여름·성수기 중심 — 일자는 홈페이지 확인
    seasons: [], // 성수기 중심이나 시즌 폭이 넓어 모든 계절 노출
  },
  {
    id: "fw-eworld",
    name: "이월드",
    sido: "대구광역시",
    sigungu: "달서구",
    region: "gyeongsang",
    lat: 35.8536,
    lng: 128.5606,
    // 여름 워터워즈 야간 불꽃쇼(6~8월) + 겨울 별빛축제, 성수기엔 매일 야간 불꽃쇼.
    scheduleText: "여름 워터워즈 야간 불꽃쇼(6~8월) · 겨울 별빛축제 · 성수기 매일 야간 불꽃 · 일정은 공식 홈페이지 확인",
    homepage: "https://www.eworld.kr",
    addr: "대구광역시 달서구 두류공원로",
    operatingDays: [], // 성수기 매일·시즌별 — 일자는 홈페이지 확인
    seasons: [], // 여름·겨울 등 여러 시즌 → 모든 계절 노출
  },
];
