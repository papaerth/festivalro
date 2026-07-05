// ────────────────────────────────────────────────────────────────
//  다국어(i18n) 정적 사전 + 도우미
//   - 자동번역 위젯/실시간 AI 번역 없이, 미리 번역해 둔 문구를 사용합니다.
//   - 축제 이름·소개 등 공공API 원문(한국어)은 번역하지 않습니다.
// ────────────────────────────────────────────────────────────────

export const LOCALES = ["ko", "en", "ja", "zh"];
export const DEFAULT_LOCALE = "ko";

export function isLocale(x) {
  return LOCALES.includes(x);
}

// 언어별 링크 경로 (한국어는 접두어 없음: '/', 그 외는 '/en' 등)
export function localeHref(locale, path = "/") {
  const p = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? path : `/${locale}${p}`;
}

// <html lang="...">에 넣을 값 (중국어 간체는 zh-CN)
export const HTML_LANG = {
  ko: "ko",
  en: "en",
  ja: "ja",
  zh: "zh-CN",
};

// 사이트 절대 주소 (hreflang/canonical용)
export const SITE_URL = "https://festivalro.vercel.app";

const dictionaries = {
  ko: {
    langName: "한국어",
    brandSub: "전국 사계절 축제 지도",
    meta: {
      homeTitle: "축제로 — 전국 축제 지도",
      homeDesc:
        "대한민국 전국 시군구의 사계절 축제를 지도에서 한눈에. 날씨와 길찾기까지 한 번에 확인하세요.",
      detailSuffix: " · 축제로",
    },
    nav: { login: "로그인", signup: "회원가입", logout: "로그아웃", mypage: "내 페이지" },
    hero: {
      titleA: "지금 가장 예쁜",
      titleB: "축제, 한눈에",
      subtitle: "계절·지역으로 골라보고, 날씨·길찾기까지 한 번에.",
      searchPlaceholder: "축제 이름·지역 검색 (예: 머드, 부산)",
    },
    filters: {
      season: "계절",
      region: "지역",
      weekend: "📅 이번 주말",
      month: "🗓️ 이번 달",
      favorites: "즐겨찾기",
      clearAll: "전체 보기 ✕",
    },
    seasons: { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" },
    regions: {
      all: "전국",
      seoul: "서울",
      gyeonggi: "경기·인천",
      gangwon: "강원",
      chungcheong: "충청",
      jeolla: "전라",
      gyeongsang: "경상",
      jeju: "제주",
    },
    status: { ongoing: "LIVE 진행중", ended: "종료", ongoingShort: "진행중", upcoming: "예정" },
    list: {
      searchResult: (q, n) => `🔍 전국에서 "${q}" 검색 결과 ${n}곳`,
      periodResult: (label, n) => `${label}에 열리는 축제 ${n}곳`,
      favResult: (n) => `❤️ 즐겨찾기한 축제 ${n}곳`,
      loadMore: "더 보기",
      remain: (n) => `(${n}곳 남음)`,
      emptySearch: "검색 결과가 없어요. 다른 이름이나 지역으로 검색해 보세요!",
      emptyPeriod: "이 기간에 열리는 축제가 없어요.",
      emptyFav: "아직 즐겨찾기한 축제가 없어요. 축제 카드의 🤍 하트를 눌러 담아보세요!",
      emptyDefault: "선택하신 조건에 맞는 축제가 아직 없어요.",
    },
    detail: {
      back: "← 전체 축제 목록으로",
      tabs: { info: "정보", weather: "날씨", reviews: "후기", blog: "블로그" },
      about: "🎪 축제 소개",
      weather: "🌤️ 오늘부터 3일 날씨",
      directions: "🧭 길찾기",
      location: "🗺️ 축제 위치",
      reviews: "⭐ 후기·평점",
      blog: "📝 블로그 후기",
      share: "🔗 공유하기",
      favorite: "🤍 즐겨찾기",
      favorited: "❤️ 저장됨",
      visit: "📍 방문기록",
      visited: "✅ 방문함",
      sourcePrefix: "출처 · ",
      directionsBtn: "🧭 카카오맵으로 길찾기",
    },
    footer: "축제로 · 지도 © OpenStreetMap · 날씨 © Open-Meteo",
  },

  en: {
    langName: "English",
    brandSub: "Korea Festival Map",
    meta: {
      homeTitle: "Chukjero — Korea Festival Map",
      homeDesc:
        "Discover festivals across every region of South Korea on one map, with weather and directions in a single tap.",
      detailSuffix: " · Chukjero",
    },
    nav: { login: "Log in", signup: "Sign up", logout: "Log out", mypage: "My Page" },
    hero: {
      titleA: "The best festivals",
      titleB: "right now, at a glance",
      subtitle: "Filter by season & region — weather and directions included.",
      searchPlaceholder: "Search festival or region (e.g. Mud, Busan)",
    },
    filters: {
      season: "Season",
      region: "Region",
      weekend: "📅 This weekend",
      month: "🗓️ This month",
      favorites: "Favorites",
      clearAll: "Show all ✕",
    },
    seasons: { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" },
    regions: {
      all: "Nationwide",
      seoul: "Seoul",
      gyeonggi: "Gyeonggi·Incheon",
      gangwon: "Gangwon",
      chungcheong: "Chungcheong",
      jeolla: "Jeolla",
      gyeongsang: "Gyeongsang",
      jeju: "Jeju",
    },
    status: { ongoing: "LIVE Now", ended: "Ended", ongoingShort: "Now", upcoming: "Upcoming" },
    list: {
      searchResult: (q, n) => `🔍 ${n} results for "${q}" nationwide`,
      periodResult: (label, n) => `${n} festivals ${label}`,
      favResult: (n) => `❤️ ${n} favorite festivals`,
      loadMore: "Load more",
      remain: (n) => `(${n} left)`,
      emptySearch: "No results. Try another name or region!",
      emptyPeriod: "No festivals during this period.",
      emptyFav: "No favorites yet. Tap the 🤍 heart on a festival card to save it!",
      emptyDefault: "No festivals match your filters yet.",
    },
    detail: {
      back: "← Back to all festivals",
      tabs: { info: "Info", weather: "Weather", reviews: "Reviews", blog: "Blog" },
      about: "🎪 About",
      weather: "🌤️ 3-day weather",
      directions: "🧭 Directions",
      location: "🗺️ Location",
      reviews: "⭐ Reviews & Ratings",
      blog: "📝 Blog posts",
      share: "🔗 Share",
      favorite: "🤍 Favorite",
      favorited: "❤️ Saved",
      visit: "📍 Log visit",
      visited: "✅ Visited",
      sourcePrefix: "Source · ",
      directionsBtn: "🧭 Directions via KakaoMap",
    },
    footer: "Chukjero · Map © OpenStreetMap · Weather © Open-Meteo",
  },

  ja: {
    langName: "日本語",
    brandSub: "韓国 全国お祭りマップ",
    meta: {
      homeTitle: "チュッチェロ — 韓国お祭りマップ",
      homeDesc:
        "韓国全国のお祭りを地図でひと目でチェック。天気やルート案内もまとめて確認できます。",
      detailSuffix: " · チュッチェロ",
    },
    nav: { login: "ログイン", signup: "会員登録", logout: "ログアウト", mypage: "マイページ" },
    hero: {
      titleA: "いま一番すてきな",
      titleB: "お祭りをひと目で",
      subtitle: "季節・地域で選んで、天気やルート案内までまとめて。",
      searchPlaceholder: "お祭り名・地域で検索（例：マッド、釜山）",
    },
    filters: {
      season: "季節",
      region: "地域",
      weekend: "📅 今週末",
      month: "🗓️ 今月",
      favorites: "お気に入り",
      clearAll: "すべて表示 ✕",
    },
    seasons: { spring: "春", summer: "夏", autumn: "秋", winter: "冬" },
    regions: {
      all: "全国",
      seoul: "ソウル",
      gyeonggi: "京畿·仁川",
      gangwon: "江原",
      chungcheong: "忠清",
      jeolla: "全羅",
      gyeongsang: "慶尚",
      jeju: "済州",
    },
    status: { ongoing: "LIVE 開催中", ended: "終了", ongoingShort: "開催中", upcoming: "予定" },
    list: {
      searchResult: (q, n) => `🔍 全国で「${q}」の検索結果 ${n}件`,
      periodResult: (label, n) => `${label}のお祭り ${n}件`,
      favResult: (n) => `❤️ お気に入りのお祭り ${n}件`,
      loadMore: "もっと見る",
      remain: (n) => `（残り${n}件）`,
      emptySearch: "検索結果がありません。別の名前や地域で検索してみてください！",
      emptyPeriod: "この期間に開催されるお祭りはありません。",
      emptyFav: "お気に入りがまだありません。カードの🤍ハートを押して追加できます！",
      emptyDefault: "条件に合うお祭りがまだありません。",
    },
    detail: {
      back: "← お祭り一覧へ",
      tabs: { info: "情報", weather: "天気", reviews: "レビュー", blog: "ブログ" },
      about: "🎪 お祭り紹介",
      weather: "🌤️ 今日から3日間の天気",
      directions: "🧭 ルート案内",
      location: "🗺️ 開催場所",
      reviews: "⭐ レビュー・評価",
      blog: "📝 ブログ投稿",
      share: "🔗 シェア",
      favorite: "🤍 お気に入り",
      favorited: "❤️ 保存済み",
      visit: "📍 訪問記録",
      visited: "✅ 訪問済み",
      sourcePrefix: "出典 · ",
      directionsBtn: "🧭 KakaoMapでルート案内",
    },
    footer: "チュッチェロ · 地図 © OpenStreetMap · 天気 © Open-Meteo",
  },

  zh: {
    langName: "简体中文",
    brandSub: "韩国全国庆典地图",
    meta: {
      homeTitle: "Chukjero — 韩国庆典地图",
      homeDesc:
        "在一张地图上一览韩国各地的四季庆典，还能查看天气和路线导航。",
      detailSuffix: " · Chukjero",
    },
    nav: { login: "登录", signup: "注册", logout: "退出", mypage: "我的" },
    hero: {
      titleA: "此刻最精彩的",
      titleB: "庆典，一览无余",
      subtitle: "按季节·地区筛选，天气和路线一次搞定。",
      searchPlaceholder: "搜索庆典名称·地区（例如：泥浆、釜山）",
    },
    filters: {
      season: "季节",
      region: "地区",
      weekend: "📅 本周末",
      month: "🗓️ 本月",
      favorites: "收藏",
      clearAll: "查看全部 ✕",
    },
    seasons: { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" },
    regions: {
      all: "全国",
      seoul: "首尔",
      gyeonggi: "京畿·仁川",
      gangwon: "江原",
      chungcheong: "忠清",
      jeolla: "全罗",
      gyeongsang: "庆尚",
      jeju: "济州",
    },
    status: { ongoing: "LIVE 进行中", ended: "已结束", ongoingShort: "进行中", upcoming: "预定" },
    list: {
      searchResult: (q, n) => `🔍 全国“${q}”的搜索结果 ${n}个`,
      periodResult: (label, n) => `${label}举办的庆典 ${n}个`,
      favResult: (n) => `❤️ 收藏的庆典 ${n}个`,
      loadMore: "查看更多",
      remain: (n) => `（还有${n}个）`,
      emptySearch: "没有搜索结果。换个名称或地区试试吧！",
      emptyPeriod: "这个时间段没有庆典。",
      emptyFav: "还没有收藏。点击庆典卡片上的🤍即可收藏！",
      emptyDefault: "还没有符合条件的庆典。",
    },
    detail: {
      back: "← 返回庆典列表",
      tabs: { info: "信息", weather: "天气", reviews: "评价", blog: "博客" },
      about: "🎪 庆典介绍",
      weather: "🌤️ 未来3天天气",
      directions: "🧭 路线导航",
      location: "🗺️ 举办地点",
      reviews: "⭐ 评价与评分",
      blog: "📝 博客文章",
      share: "🔗 分享",
      favorite: "🤍 收藏",
      favorited: "❤️ 已收藏",
      visit: "📍 到访记录",
      visited: "✅ 已到访",
      sourcePrefix: "来源 · ",
      directionsBtn: "🧭 用 KakaoMap 导航",
    },
    footer: "Chukjero · 地图 © OpenStreetMap · 天气 © Open-Meteo",
  },
};

export function getDictionary(locale) {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}
