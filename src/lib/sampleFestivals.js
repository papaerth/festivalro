// ────────────────────────────────────────────────────────────────
//  내장 샘플 축제 데이터 (TourAPI 키가 없을 때 자동으로 사용됩니다)
//
//  - 실제 축제 이름과 실제 좌표(위도 lat / 경도 lng)를 사용했습니다.
//  - 전국 7개 권역, 사계절이 고루 포함되도록 구성했습니다.
//  - 날짜는 데모용으로 2026년 기준입니다. 오늘 날짜에 따라
//    '진행중 / 예정 / 종료' 배지가 자동으로 계산됩니다.
// ────────────────────────────────────────────────────────────────
const SAMPLE_RAW = [
  // ─── 봄 (spring) ───
  {
    id: "jinhae-gunhangje",
    name: "진해군항제",
    sido: "경상남도",
    sigungu: "창원시",
    region: "gyeongsang",
    lat: 35.1486,
    lng: 128.6636,
    season: "spring",
    startDate: "2026-03-27",
    endDate: "2026-04-05",
    description:
      "대한민국 최대의 벚꽃 축제. 진해 도심과 여좌천, 경화역을 뒤덮는 벚꽃 터널과 군악의장 페스티벌을 즐길 수 있습니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/2016_Jinhae_Naval_Port_Festival_040.JPG/330px-2016_Jinhae_Naval_Port_Festival_040.JPG",
  },
  {
    id: "yeouido-spring-flower",
    name: "영등포 여의도 봄꽃축제",
    sido: "서울특별시",
    sigungu: "영등포구",
    region: "seoul",
    lat: 37.5285,
    lng: 126.9327,
    season: "spring",
    startDate: "2026-04-04",
    endDate: "2026-04-12",
    description:
      "여의서로 윤중로를 따라 이어지는 벚꽃길을 걸으며 한강과 봄꽃을 함께 즐기는 서울의 대표 봄 축제입니다.",
    image: null,
  },
  {
    id: "gwangyang-maehwa",
    name: "광양매화축제",
    sido: "전라남도",
    sigungu: "광양시",
    region: "jeolla",
    lat: 35.0567,
    lng: 127.7089,
    season: "spring",
    startDate: "2026-03-14",
    endDate: "2026-03-22",
    description:
      "섬진강변 매화마을을 하얗게 물들이는 매화꽃을 감상하며 봄의 시작을 가장 먼저 만나는 축제입니다.",
    image: null,
  },
  {
    id: "goyang-flower",
    name: "고양국제꽃박람회",
    sido: "경기도",
    sigungu: "고양시",
    region: "gyeonggi",
    lat: 37.6584,
    lng: 126.832,
    season: "spring",
    startDate: "2026-04-24",
    endDate: "2026-05-10",
    description:
      "일산호수공원에서 열리는 국내 최대 규모의 꽃 박람회. 세계 각국의 화려한 정원과 꽃 예술 작품을 볼 수 있습니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/KOCIS_Goyang_International_Flower_Festival_%284560157260%29.jpg/330px-KOCIS_Goyang_International_Flower_Festival_%284560157260%29.jpg",
  },
  {
    id: "taean-tulip",
    name: "태안 세계튤립꽃박람회",
    sido: "충청남도",
    sigungu: "태안군",
    region: "chungcheong",
    lat: 36.7799,
    lng: 126.1447,
    season: "spring",
    startDate: "2026-04-11",
    endDate: "2026-05-10",
    description:
      "코리아플라워파크를 가득 메운 수백만 송이의 튤립과 봄꽃이 서해 바다와 어우러지는 국제 꽃 박람회입니다.",
    image: null,
  },
  {
    id: "jeju-deulbul",
    name: "제주들불축제",
    sido: "제주특별자치도",
    sigungu: "제주시",
    region: "jeju",
    lat: 33.3617,
    lng: 126.3686,
    season: "spring",
    startDate: "2026-03-06",
    endDate: "2026-03-09",
    description:
      "새별오름을 불로 태우는 장엄한 오름 불놓기로 유명한 축제. 한 해의 무사안녕과 풍요를 기원합니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/%EC%A0%9C%EC%A3%BC%EB%93%A4%EB%B6%88%EC%B6%95%EC%A0%9C.png/330px-%EC%A0%9C%EC%A3%BC%EB%93%A4%EB%B6%88%EC%B6%95%EC%A0%9C.png",
  },

  // ─── 여름 (summer) ───
  {
    id: "daegu-chimac",
    name: "대구치맥페스티벌",
    sido: "대구광역시",
    sigungu: "달서구",
    region: "gyeongsang",
    lat: 35.848,
    lng: 128.5327,
    season: "summer",
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    description:
      "두류공원 일대에서 치킨과 맥주를 함께 즐기는 대구의 대표 여름 축제. 다양한 공연과 이벤트가 밤까지 이어집니다.",
    image: null,
  },
  {
    id: "boryeong-mud",
    name: "보령머드축제",
    sido: "충청남도",
    sigungu: "보령시",
    region: "chungcheong",
    lat: 36.3197,
    lng: 126.5147,
    season: "summer",
    startDate: "2026-07-17",
    endDate: "2026-07-26",
    description:
      "대천해수욕장에서 펼쳐지는 세계적인 머드(진흙) 축제. 머드 체험과 바다, 여름 음악 공연을 한번에 즐깁니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Mud_Fest_2008_%282679028799%29.jpg/330px-Mud_Fest_2008_%282679028799%29.jpg",
  },
  {
    id: "busan-sea",
    name: "부산바다축제",
    sido: "부산광역시",
    sigungu: "해운대구",
    region: "gyeongsang",
    lat: 35.1587,
    lng: 129.1604,
    season: "summer",
    startDate: "2026-08-01",
    endDate: "2026-08-09",
    description:
      "해운대·광안리 해수욕장을 무대로 열리는 부산 대표 여름 축제. 바다를 배경으로 한 공연과 이벤트가 가득합니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Haeundae_Beach_in_Busan.jpg/330px-Haeundae_Beach_in_Busan.jpg",
  },
  {
    id: "gangneung-danoje",
    name: "강릉단오제",
    sido: "강원특별자치도",
    sigungu: "강릉시",
    region: "gangwon",
    lat: 37.7519,
    lng: 128.8761,
    season: "summer",
    startDate: "2026-06-15",
    endDate: "2026-06-22",
    description:
      "유네스코 인류무형문화유산으로 등재된 우리나라 대표 전통 축제. 단오굿, 관노가면극 등 전통문화를 만납니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Korea_Gangneung_Danoje_Jangneung_49_%2814140137998%29.jpg/330px-Korea_Gangneung_Danoje_Jangneung_49_%2814140137998%29.jpg",
  },
  {
    id: "muju-firefly",
    name: "무주반딧불축제",
    sido: "전라북도",
    sigungu: "무주군",
    region: "jeolla",
    lat: 36.0068,
    lng: 127.6608,
    season: "summer",
    startDate: "2026-08-29",
    endDate: "2026-09-06",
    description:
      "청정 자연의 상징인 반딧불이를 만나는 환경 축제. 밤하늘의 반딧불이 탐사와 다양한 자연 체험이 열립니다.",
    image: null,
  },

  // ─── 가을 (autumn) ───
  {
    id: "andong-maskdance",
    name: "안동국제탈춤페스티벌",
    sido: "경상북도",
    sigungu: "안동시",
    region: "gyeongsang",
    lat: 36.5684,
    lng: 128.7294,
    season: "autumn",
    startDate: "2026-09-25",
    endDate: "2026-10-04",
    description:
      "하회별신굿탈놀이를 비롯한 국내외 탈춤 공연이 어우러지는 세계적인 탈춤 축제입니다.",
    image: null,
  },
  {
    id: "jinju-namgang",
    name: "진주남강유등축제",
    sido: "경상남도",
    sigungu: "진주시",
    region: "gyeongsang",
    lat: 35.1917,
    lng: 128.0836,
    season: "autumn",
    startDate: "2026-10-01",
    endDate: "2026-10-15",
    description:
      "남강 위를 수놓는 수많은 유등(등불)의 불빛이 장관을 이루는 축제. 소망등 띄우기 체험도 인기입니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Jinju_namgang_lantern_festival.jpg/330px-Jinju_namgang_lantern_festival.jpg",
  },
  {
    id: "gimje-horizon",
    name: "김제지평선축제",
    sido: "전라북도",
    sigungu: "김제시",
    region: "jeolla",
    lat: 35.8033,
    lng: 126.888,
    season: "autumn",
    startDate: "2026-10-07",
    endDate: "2026-10-11",
    description:
      "우리나라에서 유일하게 지평선을 볼 수 있는 김제 벽골제에서 열리는 황금 들녘의 추수 문화 축제입니다.",
    image: null,
  },
  {
    id: "seoul-fireworks",
    name: "서울세계불꽃축제",
    sido: "서울특별시",
    sigungu: "영등포구",
    region: "seoul",
    lat: 37.5219,
    lng: 126.9345,
    season: "autumn",
    startDate: "2026-10-10",
    endDate: "2026-10-10",
    description:
      "여의도 한강공원 밤하늘을 화려하게 수놓는 국내 최대 규모의 불꽃 축제. 세계 각국의 불꽃 팀이 참가합니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/2011%EB%85%84_11%EC%9B%94_16%EC%9D%BC_%EC%84%9C%EC%9A%B8%EC%84%B8%EA%B3%84%EB%B6%88%EA%BD%83%EC%B6%95%EC%A0%9C%28Seoul_international_fireworks_festival%29_000001.JPG/330px-2011%EB%85%84_11%EC%9B%94_16%EC%9D%BC_%EC%84%9C%EC%9A%B8%EC%84%B8%EA%B3%84%EB%B6%88%EA%BD%83%EC%B6%95%EC%A0%9C%28Seoul_international_fireworks_festival%29_000001.JPG",
  },
  {
    id: "icheon-rice",
    name: "이천쌀문화축제",
    sido: "경기도",
    sigungu: "이천시",
    region: "gyeonggi",
    lat: 37.2792,
    lng: 127.4425,
    season: "autumn",
    startDate: "2026-10-21",
    endDate: "2026-10-25",
    description:
      "임금님께 진상하던 이천쌀을 주제로 한 축제. 가마솥 밥 짓기, 쌀 요리 체험 등 풍성한 먹거리가 가득합니다.",
    image: null,
  },

  // ─── 겨울 (winter) ───
  {
    id: "hwacheon-sancheoneo",
    name: "화천산천어축제",
    sido: "강원특별자치도",
    sigungu: "화천군",
    region: "gangwon",
    lat: 38.1061,
    lng: 127.708,
    season: "winter",
    startDate: "2027-01-09",
    endDate: "2027-01-31",
    description:
      "꽁꽁 언 얼음 위에서 즐기는 산천어 얼음낚시로 세계적으로 유명한 겨울 축제. 눈썰매 등 즐길 거리도 풍성합니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/ko/f/f5/%EC%96%BC%EC%9D%8C%EB%82%98%EB%9D%BC_%ED%99%94%EC%B2%9C_%EC%82%B0%EC%B2%9C%EC%96%B4_%EC%B6%95%EC%A0%9C.gif",
  },
  {
    id: "taebaek-snow",
    name: "태백산눈축제",
    sido: "강원특별자치도",
    sigungu: "태백시",
    region: "gangwon",
    lat: 37.1641,
    lng: 128.9856,
    season: "winter",
    startDate: "2027-01-23",
    endDate: "2027-02-01",
    description:
      "태백산의 설경과 대형 눈 조각 작품을 감상하는 겨울 축제. 눈 조각 전시와 다양한 겨울 체험이 열립니다.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/%ED%83%9C%EB%B0%B1%EC%82%B0%EB%88%88%EC%B6%95%EC%A0%9C2019%28AMJ%29.jpg/330px-%ED%83%9C%EB%B0%B1%EC%82%B0%EB%88%88%EC%B6%95%EC%A0%9C2019%28AMJ%29.jpg",
  },
  {
    id: "busan-christmas-tree",
    name: "부산크리스마스트리문화축제",
    sido: "부산광역시",
    sigungu: "중구",
    region: "gyeongsang",
    lat: 35.0986,
    lng: 129.0306,
    season: "winter",
    startDate: "2026-11-28",
    endDate: "2027-01-04",
    description:
      "남포동 광복로 일대를 화려한 조명과 크리스마스 트리로 장식하는 부산의 겨울 빛 축제입니다.",
    image: null,
  },

  // ─── 전시·박람회 / 공연 데모 (유형 필터 미리보기용) ───
  {
    id: "coex-cafeshow",
    name: "서울카페쇼",
    sido: "서울특별시",
    sigungu: "강남구",
    region: "seoul",
    lat: 37.5126,
    lng: 127.0589,
    season: "autumn",
    startDate: "2026-11-04",
    endDate: "2026-11-07",
    description: "코엑스에서 열리는 아시아 최대 규모의 커피·차 산업 전시회입니다.",
    image: null,
    type: "exhibition",
    eventplace: "코엑스(COEX) 1층 A~C홀",
  },
  {
    id: "bexco-motorshow",
    name: "부산국제모터쇼",
    sido: "부산광역시",
    sigungu: "해운대구",
    region: "gyeongsang",
    lat: 35.1691,
    lng: 129.1349,
    season: "summer",
    startDate: "2026-06-25",
    endDate: "2026-07-05",
    description: "벡스코(BEXCO)에서 열리는 국내 대표 자동차 산업 박람회입니다.",
    image: null,
    type: "exhibition",
    eventplace: "벡스코(BEXCO) 제1전시장",
  },
  {
    id: "seoul-arts-concert",
    name: "예술의전당 교향악축제",
    sido: "서울특별시",
    sigungu: "서초구",
    region: "seoul",
    lat: 37.4795,
    lng: 127.0119,
    season: "spring",
    startDate: "2026-04-01",
    endDate: "2026-04-20",
    description: "국내 주요 교향악단이 한자리에 모이는 대표 클래식 공연입니다.",
    image: null,
    type: "performance",
    eventplace: "예술의전당 콘서트홀",
  },
];

// 모든 샘플에 유형(type) 기본값(축제)을 보장 — 지도/필터/배지가 항상 동작하도록
export const SAMPLE_FESTIVALS = SAMPLE_RAW.map((f) => ({ type: "festival", ...f }));
