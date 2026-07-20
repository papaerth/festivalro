// ────────────────────────────────────────────────────────────────
//  다국어(i18n) 정적 사전 + 도우미
//   - 자동번역 위젯/실시간 AI 번역 없이, 미리 번역해 둔 문구를 사용합니다.
//   - 축제 이름·소개 등 공공API 원문(한국어)은 번역하지 않습니다.
// ────────────────────────────────────────────────────────────────

export const LOCALES = ["ko","en","ja","zh","zh-TW","es","fr","ru","de","ar","vi","id","th"];
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
  "zh-TW": "zh-TW",
  es: "es",
  fr: "fr",
  ru: "ru",
  de: "de",
  ar: "ar",
  vi: "vi",
  id: "id",
  th: "th",
};

// 오른쪽→왼쪽(RTL) 언어
export const RTL_LOCALES = ["ar"];
export function isRtl(locale) {
  return RTL_LOCALES.includes(locale);
}

// 사이트 절대 주소 (hreflang/canonical용)
export const SITE_URL = "https://chukjero.com";
// 브랜드명(og:site_name·구조화데이터용) — 한글 브랜드 + 도메인 병기
export const SITE_NAME = "축제로 (chukjero.com)";

// 지도 제스처 안내 (터치 기기에서 한 손가락으로 지도를 움직이려 할 때 잠깐 표시)
export const MAP_GESTURE_TEXT = {
  ko: "두 손가락으로 지도를 움직이세요",
  en: "Use two fingers to move the map",
  ja: "2本の指で地図を操作してください",
  zh: "用两根手指移动地图",
  "zh-TW": "用兩根手指移動地圖",
  es: "Usa dos dedos para mover el mapa",
  fr: "Utilisez deux doigts pour déplacer la carte",
  ru: "Проведите двумя пальцами, чтобы переместить карту",
  de: "Bewege die Karte mit zwei Fingern",
  ar: "استخدم إصبعين لتحريك الخريطة",
  vi: "Dùng hai ngón tay để di chuyển bản đồ",
  id: "Gunakan dua jari untuk menggerakkan peta",
  th: "ใช้สองนิ้วเพื่อเลื่อนแผนที่",
};

const dictionaries = {
  "zh-TW": { langName: "繁體中文", brandSub: "韓國慶典地圖", meta: { homeTitle: "Chukjero — 韓國慶典地圖", homeDesc: "在同一張地圖上探索韓國各地區的慶典，天氣與路線一鍵即得。", detailSuffix: " · Chukjero" }, nav: { login: "登入", signup: "註冊", logout: "登出", mypage: "我的頁面" }, hero: { titleA: "最精彩的慶典", titleB: "此刻，一目了然", subtitle: "依季節與地區篩選 — 天氣與路線一併呈現。", searchPlaceholder: "搜尋慶典或地區（例如：泥漿、釜山）" }, filters: { season: "季節", region: "地區", weekend: "📅 本週末", month: "🗓️ 本月", favorites: "收藏", clearAll: "顯示全部 ✕" }, seasons: { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" }, regions: { all: "全國各地", seoul: "首爾", gyeonggi: "京畿·仁川", gangwon: "江原", chungcheong: "忠清", jeolla: "全羅", gyeongsang: "慶尚", jeju: "濟州" }, status: { ongoing: "LIVE 進行中", ended: "已結束", ongoingShort: "進行中", upcoming: "即將舉行" }, list: { searchResult: (q, n) => `🔍 全國「${q}」的 ${n} 項搜尋結果`, periodResult: (label, n) => `${label} 有 ${n} 場慶典`, favResult: (n) => `❤️ ${n} 場收藏的慶典`, loadMore: "載入更多", remain: (n) => `（剩餘 ${n} 場）`, emptySearch: "查無結果。請換個名稱或地區試試！", emptyPeriod: "這段期間沒有慶典。", emptyFav: "尚無收藏。點擊慶典卡片上的 🤍 愛心即可收藏！", emptyDefault: "目前沒有符合篩選條件的慶典。" }, detail: { back: "← 返回所有慶典", tabs: { info: "資訊", weather: "天氣", reviews: "評論", blog: "部落格" }, about: "🎪 關於", weather: "🌤️ 三日天氣", directions: "🧭 路線", location: "🗺️ 位置", reviews: "⭐ 評論與評分", blog: "📝 部落格文章", share: "🔗 分享", favorite: "🤍 收藏", favorited: "❤️ 已收藏", visit: "📍 記錄造訪", visited: "✅ 已造訪", sourcePrefix: "來源 · ", directionsBtn: "🧭 透過 KakaoMap 查看路線" }, footer: "Chukjero · 地圖 © OpenStreetMap · 天氣 © Open-Meteo" },
  es: { langName: "Español", brandSub: "Mapa de festivales de Corea", meta: { homeTitle: "Chukjero — Mapa de festivales de Corea", homeDesc: "Descubre festivales de todas las regiones de Corea del Sur en un solo mapa, con el tiempo y cómo llegar en un solo toque.", detailSuffix: " · Chukjero" }, nav: { login: "Iniciar sesión", signup: "Registrarse", logout: "Cerrar sesión", mypage: "Mi página" }, hero: { titleA: "Los mejores festivales", titleB: "ahora mismo, de un vistazo", subtitle: "Filtra por temporada y región: incluye el tiempo y cómo llegar.", searchPlaceholder: "Busca un festival o región (p. ej. Barro, Busan)" }, filters: { season: "Temporada", region: "Región", weekend: "📅 Este fin de semana", month: "🗓️ Este mes", favorites: "Favoritos", clearAll: "Mostrar todo ✕" }, seasons: { spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno" }, regions: { all: "Todo el país", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE ahora", ended: "Finalizado", ongoingShort: "Ahora", upcoming: "Próximamente" }, list: { searchResult: (q, n) => `🔍 ${n} resultados de "${q}" en todo el país`, periodResult: (label, n) => `${n} festivales ${label}`, favResult: (n) => `❤️ ${n} festivales favoritos`, loadMore: "Cargar más", remain: (n) => `(quedan ${n})`, emptySearch: "Sin resultados. ¡Prueba con otro nombre o región!", emptyPeriod: "No hay festivales durante este periodo.", emptyFav: "Aún no tienes favoritos. ¡Toca el corazón 🤍 en la tarjeta de un festival para guardarlo!", emptyDefault: "Todavía no hay festivales que coincidan con tus filtros." }, detail: { back: "← Volver a todos los festivales", tabs: { info: "Información", weather: "Tiempo", reviews: "Reseñas", blog: "Blog" }, about: "🎪 Acerca de", weather: "🌤️ Tiempo a 3 días", directions: "🧭 Cómo llegar", location: "🗺️ Ubicación", reviews: "⭐ Reseñas y valoraciones", blog: "📝 Publicaciones del blog", share: "🔗 Compartir", favorite: "🤍 Favorito", favorited: "❤️ Guardado", visit: "📍 Registrar visita", visited: "✅ Visitado", sourcePrefix: "Fuente · ", directionsBtn: "🧭 Cómo llegar con KakaoMap" }, footer: "Chukjero · Mapa © OpenStreetMap · Tiempo © Open-Meteo" },
  fr: { langName: "Français", brandSub: "Carte des festivals de Corée", meta: { homeTitle: "Chukjero — Carte des festivals de Corée", homeDesc: "Découvrez les festivals de toutes les régions de Corée du Sud sur une seule carte, avec la météo et l'itinéraire en un seul geste.", detailSuffix: " · Chukjero" }, nav: { login: "Se connecter", signup: "S'inscrire", logout: "Se déconnecter", mypage: "Mon espace" }, hero: { titleA: "Les meilleurs festivals", titleB: "en ce moment, en un coup d'œil", subtitle: "Filtrez par saison et région — météo et itinéraire inclus.", searchPlaceholder: "Rechercher un festival ou une région (ex. Boue, Busan)" }, filters: { season: "Saison", region: "Région", weekend: "📅 Ce week-end", month: "🗓️ Ce mois-ci", favorites: "Favoris", clearAll: "Tout afficher ✕" }, seasons: { spring: "Printemps", summer: "Été", autumn: "Automne", winter: "Hiver" }, regions: { all: "Tout le pays", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE maintenant", ended: "Terminé", ongoingShort: "En cours", upcoming: "À venir" }, list: { searchResult: (q, n) => `🔍 ${n} résultats pour « ${q} » dans tout le pays`, periodResult: (label, n) => `${n} festivals ${label}`, favResult: (n) => `❤️ ${n} festivals favoris`, loadMore: "Charger plus", remain: (n) => `(${n} restants)`, emptySearch: "Aucun résultat. Essayez un autre nom ou une autre région !", emptyPeriod: "Aucun festival pendant cette période.", emptyFav: "Aucun favori pour l'instant. Touchez le cœur 🤍 sur une fiche de festival pour l'enregistrer !", emptyDefault: "Aucun festival ne correspond encore à vos filtres." }, detail: { back: "← Retour à tous les festivals", tabs: { info: "Infos", weather: "Météo", reviews: "Avis", blog: "Blog" }, about: "🎪 À propos", weather: "🌤️ Météo sur 3 jours", directions: "🧭 Itinéraire", location: "🗺️ Emplacement", reviews: "⭐ Avis et notes", blog: "📝 Articles de blog", share: "🔗 Partager", favorite: "🤍 Favori", favorited: "❤️ Enregistré", visit: "📍 Noter la visite", visited: "✅ Visité", sourcePrefix: "Source · ", directionsBtn: "🧭 Itinéraire via KakaoMap" }, footer: "Chukjero · Carte © OpenStreetMap · Météo © Open-Meteo" },
  ru: { langName: "Русский", brandSub: "Карта фестивалей Кореи", meta: { homeTitle: "Chukjero — Карта фестивалей Кореи", homeDesc: "Откройте для себя фестивали во всех регионах Южной Кореи на одной карте — с погодой и маршрутами в одно касание.", detailSuffix: " · Chukjero" }, nav: { login: "Войти", signup: "Регистрация", logout: "Выйти", mypage: "Моя страница" }, hero: { titleA: "Лучшие фестивали", titleB: "прямо сейчас, с одного взгляда", subtitle: "Фильтруйте по сезону и региону — с погодой и маршрутами.", searchPlaceholder: "Поиск фестиваля или региона (напр. Грязь, Пусан)" }, filters: { season: "Сезон", region: "Регион", weekend: "📅 В эти выходные", month: "🗓️ В этом месяце", favorites: "Избранное", clearAll: "Показать все ✕" }, seasons: { spring: "Весна", summer: "Лето", autumn: "Осень", winter: "Зима" }, regions: { all: "Вся страна", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE сейчас", ended: "Завершён", ongoingShort: "Сейчас", upcoming: "Скоро" }, list: { searchResult: (q, n) => `🔍 ${n} результатов по запросу «${q}» по всей стране`, periodResult: (label, n) => `${n} фестивалей ${label}`, favResult: (n) => `❤️ ${n} избранных фестивалей`, loadMore: "Показать ещё", remain: (n) => `(осталось ${n})`, emptySearch: "Ничего не найдено. Попробуйте другое название или регион!", emptyPeriod: "В этот период нет фестивалей.", emptyFav: "Пока нет избранного. Нажмите 🤍 на карточке фестиваля, чтобы сохранить его!", emptyDefault: "Пока нет фестивалей, подходящих под ваши фильтры." }, detail: { back: "← Ко всем фестивалям", tabs: { info: "Информация", weather: "Погода", reviews: "Отзывы", blog: "Блог" }, about: "🎪 О фестивале", weather: "🌤️ Погода на 3 дня", directions: "🧭 Маршрут", location: "🗺️ Расположение", reviews: "⭐ Отзывы и оценки", blog: "📝 Записи в блоге", share: "🔗 Поделиться", favorite: "🤍 В избранное", favorited: "❤️ Сохранено", visit: "📍 Отметить посещение", visited: "✅ Посещено", sourcePrefix: "Источник · ", directionsBtn: "🧭 Маршрут через KakaoMap" }, footer: "Chukjero · Карта © OpenStreetMap · Погода © Open-Meteo" },
  de: { langName: "Deutsch", brandSub: "Korea Festival-Karte", meta: { homeTitle: "Chukjero — Korea Festival-Karte", homeDesc: "Entdecke Festivals in allen Regionen Südkoreas auf einer Karte, mit Wetter und Wegbeschreibung mit nur einem Tipp.", detailSuffix: " · Chukjero" }, nav: { login: "Anmelden", signup: "Registrieren", logout: "Abmelden", mypage: "Meine Seite" }, hero: { titleA: "Die besten Festivals", titleB: "jetzt sofort auf einen Blick", subtitle: "Nach Saison & Region filtern — Wetter und Wegbeschreibung inklusive.", searchPlaceholder: "Festival oder Region suchen (z. B. Schlamm, Busan)" }, filters: { season: "Saison", region: "Region", weekend: "📅 Dieses Wochenende", month: "🗓️ Diesen Monat", favorites: "Favoriten", clearAll: "Alle anzeigen ✕" }, seasons: { spring: "Frühling", summer: "Sommer", autumn: "Herbst", winter: "Winter" }, regions: { all: "Landesweit", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE Jetzt", ended: "Beendet", ongoingShort: "Jetzt", upcoming: "Bald" }, list: { searchResult: (q, n) => `🔍 ${n} Ergebnisse für "${q}" landesweit`, periodResult: (label, n) => `${n} Festivals ${label}`, favResult: (n) => `❤️ ${n} Lieblingsfestivals`, loadMore: "Mehr laden", remain: (n) => `(noch ${n})`, emptySearch: "Keine Ergebnisse. Versuche einen anderen Namen oder eine andere Region!", emptyPeriod: "Keine Festivals in diesem Zeitraum.", emptyFav: "Noch keine Favoriten. Tippe auf das 🤍 Herz einer Festivalkarte, um es zu speichern!", emptyDefault: "Noch keine Festivals passen zu deinen Filtern." }, detail: { back: "← Zurück zu allen Festivals", tabs: { info: "Info", weather: "Wetter", reviews: "Bewertungen", blog: "Blog" }, about: "🎪 Über", weather: "🌤️ 3-Tage-Wetter", directions: "🧭 Wegbeschreibung", location: "🗺️ Standort", reviews: "⭐ Bewertungen & Rezensionen", blog: "📝 Blogbeiträge", share: "🔗 Teilen", favorite: "🤍 Favorit", favorited: "❤️ Gespeichert", visit: "📍 Besuch eintragen", visited: "✅ Besucht", sourcePrefix: "Quelle · ", directionsBtn: "🧭 Wegbeschreibung über KakaoMap" }, footer: "Chukjero · Karte © OpenStreetMap · Wetter © Open-Meteo" },
  ar: { langName: "العربية", brandSub: "خريطة مهرجانات كوريا", meta: { homeTitle: "Chukjero — خريطة مهرجانات كوريا", homeDesc: "اكتشف المهرجانات في جميع مناطق كوريا الجنوبية على خريطة واحدة، مع الطقس والاتجاهات بضغطة واحدة.", detailSuffix: " · Chukjero" }, nav: { login: "تسجيل الدخول", signup: "إنشاء حساب", logout: "تسجيل الخروج", mypage: "صفحتي" }, hero: { titleA: "أفضل المهرجانات", titleB: "الآن، في لمحة", subtitle: "صفِّ حسب الموسم والمنطقة — مع الطقس والاتجاهات.", searchPlaceholder: "ابحث عن مهرجان أو منطقة (مثل: الطين، بوسان)" }, filters: { season: "الموسم", region: "المنطقة", weekend: "📅 نهاية هذا الأسبوع", month: "🗓️ هذا الشهر", favorites: "المفضلة", clearAll: "عرض الكل ✕" }, seasons: { spring: "الربيع", summer: "الصيف", autumn: "الخريف", winter: "الشتاء" }, regions: { all: "جميع أنحاء البلاد", seoul: "سيول", gyeonggi: "جيونجي·إنتشون", gangwon: "جانغوون", chungcheong: "تشونغتشيونغ", jeolla: "جيولا", gyeongsang: "جيونغسانغ", jeju: "جيجو" }, status: { ongoing: "LIVE الآن", ended: "انتهى", ongoingShort: "الآن", upcoming: "قادم" }, list: { searchResult: (q, n) => `🔍 ${n} نتيجة عن "${q}" في جميع أنحاء البلاد`, periodResult: (label, n) => `${n} مهرجان ${label}`, favResult: (n) => `❤️ ${n} مهرجان مفضل`, loadMore: "تحميل المزيد", remain: (n) => `(بقي ${n})`, emptySearch: "لا توجد نتائج. جرّب اسمًا أو منطقة أخرى!", emptyPeriod: "لا توجد مهرجانات خلال هذه الفترة.", emptyFav: "لا توجد مفضلة بعد. اضغط على القلب 🤍 في بطاقة المهرجان لحفظه!", emptyDefault: "لا توجد مهرجانات تطابق عوامل التصفية بعد." }, detail: { back: "← العودة إلى كل المهرجانات", tabs: { info: "معلومات", weather: "الطقس", reviews: "المراجعات", blog: "المدونة" }, about: "🎪 نبذة", weather: "🌤️ طقس 3 أيام", directions: "🧭 الاتجاهات", location: "🗺️ الموقع", reviews: "⭐ المراجعات والتقييمات", blog: "📝 مقالات المدونة", share: "🔗 مشاركة", favorite: "🤍 مفضلة", favorited: "❤️ محفوظ", visit: "📍 تسجيل زيارة", visited: "✅ تمت الزيارة", sourcePrefix: "المصدر · ", directionsBtn: "🧭 الاتجاهات عبر KakaoMap" }, footer: "Chukjero · الخريطة © OpenStreetMap · الطقس © Open-Meteo" },
  vi: { langName: "Tiếng Việt", brandSub: "Bản đồ lễ hội Hàn Quốc", meta: { homeTitle: "Chukjero — Bản đồ lễ hội Hàn Quốc", homeDesc: "Khám phá các lễ hội ở mọi vùng miền Hàn Quốc trên một bản đồ, kèm thời tiết và chỉ đường chỉ với một lần chạm.", detailSuffix: " · Chukjero" }, nav: { login: "Đăng nhập", signup: "Đăng ký", logout: "Đăng xuất", mypage: "Trang của tôi" }, hero: { titleA: "Những lễ hội hay nhất", titleB: "ngay lúc này, trong nháy mắt", subtitle: "Lọc theo mùa & vùng — kèm thời tiết và chỉ đường.", searchPlaceholder: "Tìm lễ hội hoặc vùng (vd: Bùn, Busan)" }, filters: { season: "Mùa", region: "Vùng", weekend: "📅 Cuối tuần này", month: "🗓️ Tháng này", favorites: "Yêu thích", clearAll: "Xem tất cả ✕" }, seasons: { spring: "Xuân", summer: "Hạ", autumn: "Thu", winter: "Đông" }, regions: { all: "Toàn quốc", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE Đang diễn ra", ended: "Đã kết thúc", ongoingShort: "Đang diễn ra", upcoming: "Sắp diễn ra" }, list: { searchResult: (q, n) => `🔍 ${n} kết quả cho "${q}" trên toàn quốc`, periodResult: (label, n) => `${n} lễ hội ${label}`, favResult: (n) => `❤️ ${n} lễ hội yêu thích`, loadMore: "Xem thêm", remain: (n) => `(còn ${n})`, emptySearch: "Không có kết quả. Hãy thử tên hoặc vùng khác!", emptyPeriod: "Không có lễ hội nào trong khoảng thời gian này.", emptyFav: "Chưa có mục yêu thích. Chạm vào trái tim 🤍 trên thẻ lễ hội để lưu!", emptyDefault: "Chưa có lễ hội nào khớp với bộ lọc của bạn." }, detail: { back: "← Quay lại tất cả lễ hội", tabs: { info: "Thông tin", weather: "Thời tiết", reviews: "Đánh giá", blog: "Blog" }, about: "🎪 Giới thiệu", weather: "🌤️ Thời tiết 3 ngày", directions: "🧭 Chỉ đường", location: "🗺️ Vị trí", reviews: "⭐ Đánh giá & Xếp hạng", blog: "📝 Bài viết blog", share: "🔗 Chia sẻ", favorite: "🤍 Yêu thích", favorited: "❤️ Đã lưu", visit: "📍 Ghi nhận đã đến", visited: "✅ Đã đến", sourcePrefix: "Nguồn · ", directionsBtn: "🧭 Chỉ đường qua KakaoMap" }, footer: "Chukjero · Bản đồ © OpenStreetMap · Thời tiết © Open-Meteo" },
  id: { langName: "Bahasa Indonesia", brandSub: "Peta Festival Korea", meta: { homeTitle: "Chukjero — Peta Festival Korea", homeDesc: "Temukan festival di setiap wilayah Korea Selatan dalam satu peta, lengkap dengan cuaca dan petunjuk arah dalam sekali ketuk.", detailSuffix: " · Chukjero" }, nav: { login: "Masuk", signup: "Daftar", logout: "Keluar", mypage: "Halaman Saya" }, hero: { titleA: "Festival terbaik", titleB: "sekarang juga, sekilas pandang", subtitle: "Saring berdasarkan musim & wilayah — cuaca dan petunjuk arah sudah termasuk.", searchPlaceholder: "Cari festival atau wilayah (mis. Lumpur, Busan)" }, filters: { season: "Musim", region: "Wilayah", weekend: "📅 Akhir pekan ini", month: "🗓️ Bulan ini", favorites: "Favorit", clearAll: "Tampilkan semua ✕" }, seasons: { spring: "Musim semi", summer: "Musim panas", autumn: "Musim gugur", winter: "Musim dingin" }, regions: { all: "Seluruh negeri", seoul: "Seoul", gyeonggi: "Gyeonggi·Incheon", gangwon: "Gangwon", chungcheong: "Chungcheong", jeolla: "Jeolla", gyeongsang: "Gyeongsang", jeju: "Jeju" }, status: { ongoing: "LIVE Sekarang", ended: "Berakhir", ongoingShort: "Sekarang", upcoming: "Akan datang" }, list: { searchResult: (q, n) => `🔍 ${n} hasil untuk "${q}" di seluruh negeri`, periodResult: (label, n) => `${n} festival ${label}`, favResult: (n) => `❤️ ${n} festival favorit`, loadMore: "Muat lebih banyak", remain: (n) => `(${n} tersisa)`, emptySearch: "Tidak ada hasil. Coba nama atau wilayah lain!", emptyPeriod: "Tidak ada festival selama periode ini.", emptyFav: "Belum ada favorit. Ketuk hati 🤍 pada kartu festival untuk menyimpannya!", emptyDefault: "Belum ada festival yang cocok dengan filter Anda." }, detail: { back: "← Kembali ke semua festival", tabs: { info: "Info", weather: "Cuaca", reviews: "Ulasan", blog: "Blog" }, about: "🎪 Tentang", weather: "🌤️ Cuaca 3 hari", directions: "🧭 Petunjuk arah", location: "🗺️ Lokasi", reviews: "⭐ Ulasan & Peringkat", blog: "📝 Postingan blog", share: "🔗 Bagikan", favorite: "🤍 Favorit", favorited: "❤️ Tersimpan", visit: "📍 Catat kunjungan", visited: "✅ Sudah dikunjungi", sourcePrefix: "Sumber · ", directionsBtn: "🧭 Petunjuk arah via KakaoMap" }, footer: "Chukjero · Peta © OpenStreetMap · Cuaca © Open-Meteo" },
  th: { langName: "ไทย", brandSub: "แผนที่เทศกาลเกาหลี", meta: { homeTitle: "Chukjero — แผนที่เทศกาลเกาหลี", homeDesc: "ค้นพบเทศกาลจากทุกภูมิภาคทั่วเกาหลีใต้บนแผนที่เดียว พร้อมสภาพอากาศและเส้นทางในแตะเดียว", detailSuffix: " · Chukjero" }, nav: { login: "เข้าสู่ระบบ", signup: "สมัครสมาชิก", logout: "ออกจากระบบ", mypage: "หน้าของฉัน" }, hero: { titleA: "เทศกาลที่ดีที่สุด", titleB: "ตอนนี้ ในพริบตาเดียว", subtitle: "กรองตามฤดูกาลและภูมิภาค — พร้อมสภาพอากาศและเส้นทาง", searchPlaceholder: "ค้นหาเทศกาลหรือภูมิภาค (เช่น โคลน, ปูซาน)" }, filters: { season: "ฤดูกาล", region: "ภูมิภาค", weekend: "📅 สุดสัปดาห์นี้", month: "🗓️ เดือนนี้", favorites: "รายการโปรด", clearAll: "แสดงทั้งหมด ✕" }, seasons: { spring: "ฤดูใบไม้ผลิ", summer: "ฤดูร้อน", autumn: "ฤดูใบไม้ร่วง", winter: "ฤดูหนาว" }, regions: { all: "ทั่วประเทศ", seoul: "โซล", gyeonggi: "คยองกี·อินชอน", gangwon: "คังวอน", chungcheong: "ชุงชอง", jeolla: "ชอลลา", gyeongsang: "คยองซัง", jeju: "เชจู" }, status: { ongoing: "LIVE ตอนนี้", ended: "จบแล้ว", ongoingShort: "ตอนนี้", upcoming: "เร็ว ๆ นี้" }, list: { searchResult: (q, n) => `🔍 ${n} ผลลัพธ์สำหรับ "${q}" ทั่วประเทศ`, periodResult: (label, n) => `${n} เทศกาล ${label}`, favResult: (n) => `❤️ ${n} เทศกาลที่ชื่นชอบ`, loadMore: "โหลดเพิ่มเติม", remain: (n) => `(เหลือ ${n})`, emptySearch: "ไม่พบผลลัพธ์ ลองชื่อหรือภูมิภาคอื่นดูสิ!", emptyPeriod: "ไม่มีเทศกาลในช่วงเวลานี้", emptyFav: "ยังไม่มีรายการโปรด แตะที่หัวใจ 🤍 บนการ์ดเทศกาลเพื่อบันทึกไว้!", emptyDefault: "ยังไม่มีเทศกาลที่ตรงกับตัวกรองของคุณ" }, detail: { back: "← กลับไปยังเทศกาลทั้งหมด", tabs: { info: "ข้อมูล", weather: "สภาพอากาศ", reviews: "รีวิว", blog: "บล็อก" }, about: "🎪 เกี่ยวกับ", weather: "🌤️ สภาพอากาศ 3 วัน", directions: "🧭 เส้นทาง", location: "🗺️ ที่ตั้ง", reviews: "⭐ รีวิวและคะแนน", blog: "📝 โพสต์บล็อก", share: "🔗 แชร์", favorite: "🤍 ชื่นชอบ", favorited: "❤️ บันทึกแล้ว", visit: "📍 บันทึกการเยี่ยมชม", visited: "✅ เยี่ยมชมแล้ว", sourcePrefix: "แหล่งที่มา · ", directionsBtn: "🧭 เส้นทางผ่าน KakaoMap" }, footer: "Chukjero · แผนที่ © OpenStreetMap · สภาพอากาศ © Open-Meteo" },
  ko: {
    langName: "한국어",
    brandSub: "전국 사계절 축제 지도",
    meta: {
      homeTitle: "축제로 - 대한민국 축제 지도",
      homeDesc:
        "축제로(chukjero.com) - 대한민국 전국 시군구의 사계절 축제를 지도에서 한눈에. 날씨와 길찾기까지 한 번에 확인하세요.",
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

// 카드뉴스 뷰어 · 인기 축제 시트용 추가 문구 (13개 언어)
const UI_EXTRA = {
  ko: { detailCta: "자세히 보기", trending: "🔥 다가오는 인기 축제", noWeather: "위치 정보가 없어 날씨를 표시할 수 없어요.", summary: "축제 소개", collapse: "접기", expand: "펼치기", swipeHint: "좌우로 넘겨보세요", directions: "길찾기" },
  en: { detailCta: "View details", trending: "🔥 Trending soon", noWeather: "No location, so weather isn't available.", summary: "About", collapse: "Collapse", expand: "Expand", swipeHint: "Swipe to browse", directions: "Directions" },
  ja: { detailCta: "詳細を見る", trending: "🔥 話題のお祭り", noWeather: "位置情報がないため天気を表示できません。", summary: "お祭り紹介", collapse: "閉じる", expand: "開く", swipeHint: "左右にスワイプ", directions: "経路案内" },
  zh: { detailCta: "查看详情", trending: "🔥 热门即将举办", noWeather: "无位置信息，无法显示天气。", summary: "庆典介绍", collapse: "收起", expand: "展开", swipeHint: "左右滑动浏览", directions: "路线" },
  "zh-TW": { detailCta: "查看詳情", trending: "🔥 熱門即將登場", noWeather: "無位置資訊，無法顯示天氣。", summary: "慶典介紹", collapse: "收合", expand: "展開", swipeHint: "左右滑動瀏覽", directions: "路線" },
  es: { detailCta: "Ver detalles", trending: "🔥 Tendencia próxima", noWeather: "Sin ubicación, no hay clima disponible.", summary: "Acerca de", collapse: "Contraer", expand: "Expandir", swipeHint: "Desliza para explorar", directions: "Cómo llegar" },
  fr: { detailCta: "Voir les détails", trending: "🔥 Tendances à venir", noWeather: "Pas de localisation, météo indisponible.", summary: "À propos", collapse: "Réduire", expand: "Développer", swipeHint: "Balayez pour parcourir", directions: "Itinéraire" },
  ru: { detailCta: "Подробнее", trending: "🔥 Скоро в тренде", noWeather: "Нет геоданных — погода недоступна.", summary: "О фестивале", collapse: "Свернуть", expand: "Развернуть", swipeHint: "Листайте, чтобы смотреть", directions: "Маршрут" },
  de: { detailCta: "Details ansehen", trending: "🔥 Bald angesagt", noWeather: "Kein Standort, kein Wetter verfügbar.", summary: "Über", collapse: "Einklappen", expand: "Ausklappen", swipeHint: "Zum Blättern wischen", directions: "Route" },
  ar: { detailCta: "عرض التفاصيل", trending: "🔥 رائجة قريبًا", noWeather: "لا يوجد موقع، الطقس غير متاح.", summary: "نبذة", collapse: "طيّ", expand: "توسيع", swipeHint: "اسحب للتصفح", directions: "الاتجاهات" },
  vi: { detailCta: "Xem chi tiết", trending: "🔥 Sắp thịnh hành", noWeather: "Không có vị trí, không có thời tiết.", summary: "Giới thiệu", collapse: "Thu gọn", expand: "Mở rộng", swipeHint: "Vuốt để xem", directions: "Chỉ đường" },
  id: { detailCta: "Lihat detail", trending: "🔥 Segera populer", noWeather: "Tanpa lokasi, cuaca tidak tersedia.", summary: "Tentang", collapse: "Tutup", expand: "Buka", swipeHint: "Geser untuk menjelajah", directions: "Rute" },
  th: { detailCta: "ดูรายละเอียด", trending: "🔥 กำลังมาแรง", noWeather: "ไม่มีตำแหน่ง จึงไม่มีสภาพอากาศ", summary: "เกี่ยวกับ", collapse: "ย่อ", expand: "ขยาย", swipeHint: "ปัดเพื่อดู", directions: "เส้นทาง" },
};

export function getUiExtra(locale) {
  return UI_EXTRA[locale] || UI_EXTRA[DEFAULT_LOCALE];
}

// 17개 시도 이름 (13개 언어). 라틴 문자권(en/es/fr/de/vi/id)은 로마자(roman) 공용.
// zt = 중국어 번체. 시군구 이름은 고유명사라 한국어 유지.
const SIDO_LABELS = {
  seoul: { ko: "서울", roman: "Seoul", ja: "ソウル", zh: "首尔", zt: "首爾", ru: "Сеул", ar: "سول", th: "โซล" },
  busan: { ko: "부산", roman: "Busan", ja: "釜山", zh: "釜山", zt: "釜山", ru: "Пусан", ar: "بوسان", th: "ปูซาน" },
  daegu: { ko: "대구", roman: "Daegu", ja: "大邱", zh: "大邱", zt: "大邱", ru: "Тэгу", ar: "دايجو", th: "แทกู" },
  incheon: { ko: "인천", roman: "Incheon", ja: "仁川", zh: "仁川", zt: "仁川", ru: "Инчхон", ar: "إنتشون", th: "อินชอน" },
  gwangju: { ko: "광주", roman: "Gwangju", ja: "光州", zh: "光州", zt: "光州", ru: "Кванджу", ar: "غوانغجو", th: "ควังจู" },
  daejeon: { ko: "대전", roman: "Daejeon", ja: "大田", zh: "大田", zt: "大田", ru: "Тэджон", ar: "دايجون", th: "แทจอน" },
  ulsan: { ko: "울산", roman: "Ulsan", ja: "蔚山", zh: "蔚山", zt: "蔚山", ru: "Ульсан", ar: "أولسان", th: "อุลซัน" },
  sejong: { ko: "세종", roman: "Sejong", ja: "世宗", zh: "世宗", zt: "世宗", ru: "Седжон", ar: "سيجونغ", th: "เซจง" },
  gyeonggi: { ko: "경기", roman: "Gyeonggi", ja: "京畿道", zh: "京畿道", zt: "京畿道", ru: "Кёнгидо", ar: "غيونغي", th: "คยองกี" },
  gangwon: { ko: "강원", roman: "Gangwon", ja: "江原道", zh: "江原道", zt: "江原道", ru: "Канвондо", ar: "غانغوون", th: "คังวอน" },
  chungbuk: { ko: "충북", roman: "Chungbuk", ja: "忠清北道", zh: "忠清北道", zt: "忠清北道", ru: "Чхунбук", ar: "تشنغتشونغ الشمالية", th: "ชุงบุก" },
  chungnam: { ko: "충남", roman: "Chungnam", ja: "忠清南道", zh: "忠清南道", zt: "忠清南道", ru: "Чхуннам", ar: "تشنغتشونغ الجنوبية", th: "ชุงนัม" },
  jeonbuk: { ko: "전북", roman: "Jeonbuk", ja: "全羅北道", zh: "全罗北道", zt: "全羅北道", ru: "Чонбук", ar: "جولا الشمالية", th: "ชอลลาบุก" },
  jeonnam: { ko: "전남", roman: "Jeonnam", ja: "全羅南道", zh: "全罗南道", zt: "全羅南道", ru: "Чоннам", ar: "جولا الجنوبية", th: "ชอลลานัม" },
  gyeongbuk: { ko: "경북", roman: "Gyeongbuk", ja: "慶尚北道", zh: "庆尚北道", zt: "慶尚北道", ru: "Кёнбук", ar: "غيونغسانغ الشمالية", th: "คยองบุก" },
  gyeongnam: { ko: "경남", roman: "Gyeongnam", ja: "慶尚南道", zh: "庆尚南道", zt: "慶尚南道", ru: "Кённам", ar: "غيونغسانغ الجنوبية", th: "คยองนัม" },
  jeju: { ko: "제주", roman: "Jeju", ja: "済州", zh: "济州", zt: "濟州", ru: "Чеджу", ar: "جيجو", th: "เชจู" },
};

const SIDO_SCRIPT = { ja: "ja", zh: "zh", "zh-TW": "zt", ru: "ru", ar: "ar", th: "th" };

// 시도 key + 언어 → 표시 이름
export function getSidoLabel(key, locale) {
  const row = SIDO_LABELS[key];
  if (!row) return key;
  if (locale === "ko") return row.ko;
  const field = SIDO_SCRIPT[locale];
  return field ? row[field] : row.roman; // 라틴 문자권은 로마자 공용
}

// ── 행사 유형(type) 라벨 (13개 언어) ──
//  all(전체) / festival(축제) / exhibition(전시·박람회) / performance(공연)
const TYPE_LABELS = {
  all: { ko: "전체", en: "All", ja: "すべて", zh: "全部", "zh-TW": "全部", es: "Todos", fr: "Tous", ru: "Все", de: "Alle", ar: "الكل", vi: "Tất cả", id: "Semua", th: "ทั้งหมด" },
  festival: { ko: "축제", en: "Festival", ja: "祭り", zh: "庆典", "zh-TW": "慶典", es: "Festival", fr: "Festival", ru: "Фестиваль", de: "Festival", ar: "مهرجان", vi: "Lễ hội", id: "Festival", th: "เทศกาล" },
  exhibition: { ko: "전시·박람회", en: "Expo & Exhibition", ja: "展示・博覧会", zh: "展览·博览会", "zh-TW": "展覽·博覽會", es: "Exposición y feria", fr: "Exposition & salon", ru: "Выставка", de: "Ausstellung & Messe", ar: "معرض", vi: "Triển lãm & Hội chợ", id: "Pameran", th: "นิทรรศการ" },
  performance: { ko: "공연", en: "Performance", ja: "公演", zh: "演出", "zh-TW": "演出", es: "Espectáculo", fr: "Spectacle", ru: "Спектакль", de: "Aufführung", ar: "عرض", vi: "Biểu diễn", id: "Pertunjukan", th: "การแสดง" },
};

// 유형 key + 언어 → 표시 이름 (없으면 영어 → key 폴백)
export function getTypeLabel(key, locale) {
  const row = TYPE_LABELS[key];
  if (!row) return key;
  return row[locale] || row.en || key;
}

// 해당 언어의 유형 라벨 전체 맵 { all, festival, exhibition, performance }
export function getTypeLabels(locale) {
  const out = {};
  for (const k of Object.keys(TYPE_LABELS)) out[k] = getTypeLabel(k, locale);
  return out;
}

// ── 월 표기(계절 세분화 필터용) — 각 언어 관습대로 ──
//  CJK/한국어는 "N월/N月", 그 외는 짧은 월명. 인덱스는 month-1(0~11).
const MONTH_SUFFIX = { ko: "월", ja: "月", zh: "月", "zh-TW": "月" };
const MONTH_SHORT = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  fr: ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  vi: ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  th: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

// month(1~12) + locale → 표시 문자열. 예: (7,"ko")="7월" · (7,"en")="Jul" · (7,"ja")="7月"
export function getMonthLabel(month, locale) {
  if (MONTH_SUFFIX[locale]) return `${month}${MONTH_SUFFIX[locale]}`;
  const arr = MONTH_SHORT[locale] || MONTH_SHORT.en;
  return arr[month - 1] || String(month);
}

// ── 메인 캐러셀 유형 탭 라벨 (인기 축제 / 다가오는 공연 / 다가오는 전시) ──
const CAROUSEL_TABS = {
  festival: { ko: "인기 축제", en: "Popular festivals", ja: "人気の祭り", zh: "热门庆典", "zh-TW": "熱門慶典", es: "Festivales populares", fr: "Festivals populaires", ru: "Популярные фестивали", de: "Beliebte Feste", ar: "مهرجانات رائجة", vi: "Lễ hội nổi bật", id: "Festival populer", th: "เทศกาลยอดนิยม" },
  performance: { ko: "다가오는 공연", en: "Upcoming performances", ja: "近日の公演", zh: "即将上演", "zh-TW": "即將上演", es: "Próximos espectáculos", fr: "Spectacles à venir", ru: "Скоро: спектакли", de: "Kommende Aufführungen", ar: "عروض قادمة", vi: "Biểu diễn sắp tới", id: "Pertunjukan mendatang", th: "การแสดงเร็วๆ นี้" },
  exhibition: { ko: "다가오는 전시", en: "Upcoming exhibitions", ja: "近日の展示", zh: "即将展出", "zh-TW": "即將展出", es: "Próximas exposiciones", fr: "Expositions à venir", ru: "Скоро: выставки", de: "Kommende Ausstellungen", ar: "معارض قادمة", vi: "Triển lãm sắp tới", id: "Pameran mendatang", th: "นิทรรศการเร็วๆ นี้" },
};
// 해당 언어의 캐러셀 탭 라벨 맵 { festival, performance, exhibition }
export function getCarouselTabs(locale) {
  const out = {};
  for (const k of Object.keys(CAROUSEL_TABS)) out[k] = CAROUSEL_TABS[k][locale] || CAROUSEL_TABS[k].en;
  return out;
}

// ── 세부 유형 태그명 (불꽃놀이 / 야간 / 물놀이) 13개 언어 ──
const TAG_LABELS = {
  fireworks: { ko: "불꽃놀이", en: "Fireworks", ja: "花火", zh: "烟花", "zh-TW": "煙火", es: "Fuegos artificiales", fr: "Feux d'artifice", ru: "Фейерверк", de: "Feuerwerk", ar: "الألعاب النارية", vi: "Pháo hoa", id: "Kembang api", th: "พลุ" },
  night: { ko: "야간", en: "Night", ja: "夜間", zh: "夜间", "zh-TW": "夜間", es: "Nocturno", fr: "Nocturne", ru: "Ночной", de: "Nacht", ar: "ليلي", vi: "Ban đêm", id: "Malam", th: "กลางคืน" },
  water: { ko: "물놀이", en: "Water Fun", ja: "水遊び", zh: "戏水", "zh-TW": "戲水", es: "Agua", fr: "Jeux d'eau", ru: "Водный", de: "Wasserspaß", ar: "ألعاب مائية", vi: "Nghịch nước", id: "Main air", th: "เล่นน้ำ" },
};
// 태그 key + 언어 → 표시 이름 (없으면 영어 → key 폴백)
export function getTagLabel(key, locale) {
  const row = TAG_LABELS[key];
  if (!row) return key;
  return row[locale] || row.en || key;
}
// 해당 언어의 태그 라벨 전체 맵 { fireworks, night, water }
export function getTagLabels(locale) {
  const out = {};
  for (const k of Object.keys(TAG_LABELS)) out[k] = getTagLabel(k, locale);
  return out;
}

// ── 전통시장(장터·야시장) 문구 (13개 언어) ──
const MARKET_I18N = {
  ko: { chip: "장터·야시장", fiveday: "5일장", night: "야시장", today: "오늘 장서는 날!", next: "다음 장날", section: "전통시장", intl: "ko" },
  en: { chip: "Markets", fiveday: "5-Day Market", night: "Night Market", today: "Market day today!", next: "Next market day", section: "Traditional Markets", intl: "en" },
  ja: { chip: "市場・夜市", fiveday: "五日市", night: "夜市", today: "今日は市が立つ日！", next: "次の市の日", section: "伝統市場", intl: "ja" },
  zh: { chip: "集市·夜市", fiveday: "五日集", night: "夜市", today: "今天赶集日！", next: "下个集市日", section: "传统市场", intl: "zh" },
  "zh-TW": { chip: "集市·夜市", fiveday: "五日集", night: "夜市", today: "今天趕集日！", next: "下個集市日", section: "傳統市場", intl: "zh-TW" },
  es: { chip: "Mercados", fiveday: "Mercado de 5 días", night: "Mercado nocturno", today: "¡Día de mercado hoy!", next: "Próximo día de mercado", section: "Mercados tradicionales", intl: "es" },
  fr: { chip: "Marchés", fiveday: "Marché de 5 jours", night: "Marché nocturne", today: "Jour de marché aujourd'hui !", next: "Prochain jour de marché", section: "Marchés traditionnels", intl: "fr" },
  ru: { chip: "Рынки", fiveday: "Рынок 5-го дня", night: "Ночной рынок", today: "Сегодня базарный день!", next: "Следующий базарный день", section: "Традиционные рынки", intl: "ru" },
  de: { chip: "Märkte", fiveday: "5-Tage-Markt", night: "Nachtmarkt", today: "Heute ist Markttag!", next: "Nächster Markttag", section: "Traditionelle Märkte", intl: "de" },
  ar: { chip: "الأسواق", fiveday: "سوق كل 5 أيام", night: "سوق ليلي", today: "اليوم يوم السوق!", next: "يوم السوق القادم", section: "الأسواق التقليدية", intl: "ar" },
  vi: { chip: "Chợ", fiveday: "Chợ phiên 5 ngày", night: "Chợ đêm", today: "Hôm nay là ngày họp chợ!", next: "Ngày họp chợ tới", section: "Chợ truyền thống", intl: "vi" },
  id: { chip: "Pasar", fiveday: "Pasar 5-harian", night: "Pasar malam", today: "Hari pasar hari ini!", next: "Hari pasar berikutnya", section: "Pasar tradisional", intl: "id" },
  th: { chip: "ตลาด", fiveday: "ตลาดนัด 5 วัน", night: "ตลาดกลางคืน", today: "วันนี้เป็นวันตลาดนัด!", next: "วันตลาดนัดถัดไป", section: "ตลาดดั้งเดิม", intl: "th" },
};
// 전통시장 문구 묶음(현재 언어). marketType(한국어 "5일장"/"야시장") → 현지어 라벨 포함.
export function getMarketText(locale) {
  const L = MARKET_I18N[locale] || MARKET_I18N.en;
  return {
    ...L,
    typeLabel: (mt) => (mt === "야시장" ? L.night : L.fiveday),
  };
}

// ── 개화·단풍 시즌 배지/배너 문구 (13개 언어) ──
const SEASON_I18N = {
  ko: { bBefore: "개화 예상", bPeak: "지금 절정", bWane: "개화 끝물", fBefore: "단풍 예상", fPeak: "지금 단풍 절정", fWane: "단풍 끝물", bnBloom: "지금 벚꽃 절정", bnFoliage: "지금 단풍 절정", note: "예상일 기준 · 실제와 다를 수 있음" },
  en: { bBefore: "Bloom est.", bPeak: "In full bloom", bWane: "Bloom fading", fBefore: "Foliage est.", fPeak: "Peak foliage now", fWane: "Foliage fading", bnBloom: "Cherry blossoms peaking now", bnFoliage: "Autumn foliage peaking now", note: "Estimated dates · may differ from actual" },
  ja: { bBefore: "開花予想", bPeak: "今が見頃", bWane: "散り始め", fBefore: "紅葉予想", fPeak: "今が紅葉の見頃", fWane: "紅葉終盤", bnBloom: "今が桜の見頃", bnFoliage: "今が紅葉の見頃", note: "予想日基準・実際と異なる場合あり" },
  zh: { bBefore: "预计开花", bPeak: "正值盛放", bWane: "花期将尽", fBefore: "预计红叶", fPeak: "红叶正盛", fWane: "红叶将尽", bnBloom: "樱花正盛地区", bnFoliage: "红叶正盛地区", note: "预计日期 · 或与实际不同" },
  "zh-TW": { bBefore: "預計開花", bPeak: "正值盛放", bWane: "花期將盡", fBefore: "預計紅葉", fPeak: "紅葉正盛", fWane: "紅葉將盡", bnBloom: "櫻花正盛地區", bnFoliage: "紅葉正盛地區", note: "預計日期 · 或與實際不同" },
  es: { bBefore: "Floración est.", bPeak: "En plena flor", bWane: "Floración acabando", fBefore: "Follaje est.", fPeak: "Follaje en su punto", fWane: "Follaje acabando", bnBloom: "Cerezos en flor ahora", bnFoliage: "Follaje otoñal en su punto", note: "Fechas estimadas · pueden variar" },
  fr: { bBefore: "Floraison prévue", bPeak: "En pleine floraison", bWane: "Floraison en fin", fBefore: "Feuillage prévu", fPeak: "Feuillage à son apogée", fWane: "Feuillage en fin", bnBloom: "Cerisiers en fleurs", bnFoliage: "Feuillage d'automne à son apogée", note: "Dates estimées · peuvent varier" },
  ru: { bBefore: "Цветение ~", bPeak: "Пик цветения", bWane: "Цветение спадает", fBefore: "Листва ~", fPeak: "Пик листвы", fWane: "Листва увядает", bnBloom: "Сакура в разгаре цветения", bnFoliage: "Пик осенней листвы", note: "Ориентировочно · может отличаться" },
  de: { bBefore: "Blüte vsl.", bPeak: "In voller Blüte", bWane: "Blüte klingt ab", fBefore: "Laub vsl.", fPeak: "Laub am Höhepunkt", fWane: "Laub klingt ab", bnBloom: "Kirschblüte am Höhepunkt", bnFoliage: "Herbstlaub am Höhepunkt", note: "Schätzung · kann abweichen" },
  ar: { bBefore: "الإزهار المتوقع", bPeak: "في أوج الإزهار", bWane: "الإزهار يتلاشى", fBefore: "أوراق الخريف المتوقعة", fPeak: "ذروة أوراق الخريف", fWane: "الأوراق تتلاشى", bnBloom: "أزهار الكرز في ذروتها", bnFoliage: "أوراق الخريف في ذروتها", note: "تواريخ تقديرية · قد تختلف" },
  vi: { bBefore: "Dự kiến nở", bPeak: "Đang nở rộ", bWane: "Hoa đang tàn", fBefore: "Dự kiến lá đỏ", fPeak: "Lá thu đỉnh điểm", fWane: "Lá đang tàn", bnBloom: "Hoa anh đào đang nở rộ", bnFoliage: "Lá thu đang đỉnh điểm", note: "Ngày dự kiến · có thể khác thực tế" },
  id: { bBefore: "Perkiraan mekar", bPeak: "Sedang mekar penuh", bWane: "Mekar memudar", fBefore: "Perkiraan daun", fPeak: "Puncak dedaunan", fWane: "Dedaunan memudar", bnBloom: "Sakura sedang puncak mekar", bnFoliage: "Dedaunan musim gugur puncak", note: "Perkiraan tanggal · bisa berbeda" },
  th: { bBefore: "คาดว่าบาน", bPeak: "กำลังบานเต็มที่", bWane: "ดอกใกล้โรย", fBefore: "คาดว่าใบเปลี่ยนสี", fPeak: "ใบไม้เปลี่ยนสีเต็มที่", fWane: "ใบใกล้ร่วง", bnBloom: "ซากุระกำลังบานเต็มที่", bnFoliage: "ใบไม้เปลี่ยนสีเต็มที่", note: "วันที่โดยประมาณ · อาจต่างจากจริง" },
};
// 시즌 문구 묶음(현재 언어). 컴포넌트에서 이모지와 조합해 씁니다.
export function getSeasonText(locale) {
  const L = SEASON_I18N[locale] || SEASON_I18N.en;
  return {
    bloomBefore: (d) => `${L.bBefore} ${d}`,
    bloomPeak: L.bPeak,
    bloomWaning: L.bWane,
    foliageBefore: (r) => `${L.fBefore} ${r}`,
    foliagePeak: L.fPeak,
    foliageWaning: L.fWane,
    bannerBloom: L.bnBloom,
    bannerFoliage: L.bnFoliage,
    note: L.note,
  };
}

// ── 히어로 유형별 바로가기 버튼 문구 (13개 언어). n=오늘 진행중 건수 ──
//  festival=오늘 진행중 축제 / festivalWeek=진행 축제 적을 때 이번 주말 폴백(축제 우선)
//  performance·exhibition=오늘 진행중 공연/전시 건수. 클릭 시 해당 유형+진행중 목록으로 이동.
const HERO_BTN = {
  festival: {
    ko: (n) => `오늘 진행중 축제 ${n}개`, en: (n) => `${n} festivals today`, ja: (n) => `本日開催中の祭り ${n}件`,
    zh: (n) => `今日进行中庆典 ${n}个`, "zh-TW": (n) => `今日進行中慶典 ${n}個`, es: (n) => `${n} festivales hoy`,
    fr: (n) => `${n} festivals aujourd'hui`, ru: (n) => `Фестивалей сегодня: ${n}`, de: (n) => `Heute ${n} Feste`,
    ar: (n) => `${n} مهرجانات اليوم`, vi: (n) => `${n} lễ hội hôm nay`, id: (n) => `${n} festival hari ini`, th: (n) => `เทศกาลวันนี้ ${n}`,
  },
  festivalWeek: {
    ko: (n) => `이번 주 진행 축제 ${n}개`, en: (n) => `${n} festivals this week`, ja: (n) => `今週のお祭り ${n}件`,
    zh: (n) => `本周庆典 ${n}个`, "zh-TW": (n) => `本週慶典 ${n}個`, es: (n) => `${n} festivales esta semana`,
    fr: (n) => `${n} festivals cette semaine`, ru: (n) => `Фестивалей на неделе: ${n}`, de: (n) => `Diese Woche ${n} Feste`,
    ar: (n) => `${n} مهرجانات هذا الأسبوع`, vi: (n) => `${n} lễ hội tuần này`, id: (n) => `${n} festival minggu ini`, th: (n) => `เทศกาลสัปดาห์นี้ ${n}`,
  },
  performance: {
    ko: (n) => `공연 ${n}개`, en: (n) => `${n} performances`, ja: (n) => `公演 ${n}件`,
    zh: (n) => `演出 ${n}个`, "zh-TW": (n) => `演出 ${n}個`, es: (n) => `${n} espectáculos`,
    fr: (n) => `${n} spectacles`, ru: (n) => `Спектаклей: ${n}`, de: (n) => `${n} Aufführungen`,
    ar: (n) => `${n} عروض`, vi: (n) => `${n} biểu diễn`, id: (n) => `${n} pertunjukan`, th: (n) => `การแสดง ${n}`,
  },
  exhibition: {
    ko: (n) => `전시·박람회 ${n}개`, en: (n) => `${n} exhibitions`, ja: (n) => `展示・博覧会 ${n}件`,
    zh: (n) => `展览 ${n}个`, "zh-TW": (n) => `展覽 ${n}個`, es: (n) => `${n} exposiciones`,
    fr: (n) => `${n} expositions`, ru: (n) => `Выставок: ${n}`, de: (n) => `${n} Ausstellungen`,
    ar: (n) => `${n} معارض`, vi: (n) => `${n} triển lãm`, id: (n) => `${n} pameran`, th: (n) => `นิทรรศการ ${n}`,
  },
};
// 히어로 버튼 문구 — (kind, n, locale). kind: festival|festivalWeek|performance|exhibition
export function getHeroButtonLabel(kind, n, locale) {
  const row = HERO_BTN[kind];
  if (!row) return String(n);
  return (row[locale] || row.en)(n);
}

// 상세페이지 확장 섹션 제목·라벨 (13개 언어). 내용(축제 데이터)은 번역 안 함.
const SECTION_LABELS = {
  "ko": {
    "titles": {
      "summary": "핵심 요약",
      "timetable": "타임테이블",
      "lineup": "라인업",
      "program": "프로그램",
      "shuttle": "셔틀버스",
      "parking": "주차 안내",
      "food": "먹거리",
      "stay": "주변 숙소",
      "restaurants": "주변 맛집",
      "tourSpots": "축제 왔다가 들르기 좋은 곳",
      "camping": "주변 캠핑장",
      "barrierFree": "무장애 이용 정보",
      "pet": "반려동물 동반",
      "facilities": "현장 시설",
      "tips": "방문 꿀팁",
      "foreigner": "외국인 방문객 안내",
      "usage": "이용 안내",
      "homepage": "공식 홈페이지"
    },
    "labels": {
      "wheelchair": "휠체어 접근",
      "accToilet": "장애인 화장실",
      "accParking": "장애인 주차",
      "interpretation": "통역 안내",
      "halal": "할랄/채식",
      "payment": "결제 팁",
      "petAllowed": "반려동물 동반 가능",
      "petCond": "조건",
      "distanceApprox": "약 {km}km",
      "campType": "유형",
      "tel": "전화",
      "visitSite": "공식 홈페이지 바로가기"
    }
  },
  "en": {
    "titles": {
      "summary": "Key info",
      "timetable": "Timetable",
      "lineup": "Lineup",
      "program": "Program",
      "shuttle": "Shuttle bus",
      "parking": "Parking",
      "food": "Local food",
      "stay": "Nearby stays",
      "restaurants": "Nearby restaurants",
      "tourSpots": "Great spots to visit nearby",
      "camping": "Nearby campgrounds",
      "barrierFree": "Accessibility",
      "pet": "Pets welcome",
      "facilities": "On-site facilities",
      "tips": "Visitor tips",
      "foreigner": "For international visitors",
      "usage": "Visitor information",
      "homepage": "Official website"
    },
    "labels": {
      "wheelchair": "Wheelchair access",
      "accToilet": "Accessible restroom",
      "accParking": "Accessible parking",
      "interpretation": "Interpretation",
      "halal": "Halal / Vegetarian",
      "payment": "Payment tips",
      "petAllowed": "Pets allowed",
      "petCond": "Conditions",
      "distanceApprox": "approx. {km} km",
      "campType": "Type",
      "tel": "Tel",
      "visitSite": "Visit the website"
    }
  },
  "ja": {
    "titles": {
      "summary": "基本情報",
      "timetable": "タイムテーブル",
      "lineup": "ラインナップ",
      "program": "プログラム",
      "shuttle": "シャトルバス",
      "parking": "駐車案内",
      "food": "グルメ",
      "stay": "周辺の宿",
      "restaurants": "周辺の飲食店",
      "tourSpots": "立ち寄りたい周辺スポット",
      "camping": "周辺のキャンプ場",
      "barrierFree": "バリアフリー情報",
      "pet": "ペット同伴",
      "facilities": "会場の設備",
      "tips": "訪問のヒント",
      "foreigner": "外国人来場者のご案内",
      "usage": "ご利用案内",
      "homepage": "公式サイト"
    },
    "labels": {
      "wheelchair": "車椅子でのアクセス",
      "accToilet": "障がい者用トイレ",
      "accParking": "障がい者用駐車場",
      "interpretation": "通訳案内",
      "halal": "ハラル/ベジタリアン",
      "payment": "支払いのヒント",
      "petAllowed": "ペット同伴可",
      "petCond": "条件",
      "distanceApprox": "約{km}km",
      "campType": "タイプ",
      "tel": "電話",
      "visitSite": "公式サイトへ"
    }
  },
  "zh": {
    "titles": {
      "summary": "基本信息",
      "timetable": "时间表",
      "lineup": "演出阵容",
      "program": "节目",
      "shuttle": "班车",
      "parking": "停车指南",
      "food": "美食",
      "stay": "周边住宿",
      "restaurants": "周边餐厅",
      "tourSpots": "顺路值得一去的地方",
      "camping": "周边露营地",
      "barrierFree": "无障碍信息",
      "pet": "可携带宠物",
      "facilities": "现场设施",
      "tips": "参观贴士",
      "foreigner": "外国游客指南",
      "usage": "参观须知",
      "homepage": "官方网站"
    },
    "labels": {
      "wheelchair": "轮椅通行",
      "accToilet": "无障碍卫生间",
      "accParking": "无障碍停车位",
      "interpretation": "翻译服务",
      "halal": "清真/素食",
      "payment": "支付提示",
      "petAllowed": "可携带宠物",
      "petCond": "条件",
      "distanceApprox": "约{km}公里",
      "campType": "类型",
      "tel": "电话",
      "visitSite": "前往官方网站"
    }
  },
  "zh-TW": {
    "titles": {
      "summary": "重點資訊",
      "timetable": "時間表",
      "lineup": "演出陣容",
      "program": "活動節目",
      "shuttle": "接駁巴士",
      "parking": "停車",
      "food": "在地美食",
      "stay": "附近住宿",
      "restaurants": "附近餐廳",
      "tourSpots": "附近必訪景點",
      "camping": "附近露營場",
      "barrierFree": "無障礙設施",
      "pet": "歡迎攜帶寵物",
      "facilities": "現場設施",
      "tips": "參觀小提醒",
      "foreigner": "給外國旅客",
      "usage": "遊客資訊",
      "homepage": "官方網站"
    },
    "labels": {
      "wheelchair": "輪椅通行",
      "accToilet": "無障礙廁所",
      "accParking": "無障礙停車位",
      "interpretation": "口譯服務",
      "halal": "清真 / 素食",
      "payment": "付款提示",
      "petAllowed": "允許攜帶寵物",
      "petCond": "條件",
      "distanceApprox": "約 {km} 公里",
      "campType": "類型",
      "tel": "電話",
      "visitSite": "前往網站"
    }
  },
  "es": {
    "titles": {
      "summary": "Información clave",
      "timetable": "Horario",
      "lineup": "Cartel de artistas",
      "program": "Programa",
      "shuttle": "Autobús lanzadera",
      "parking": "Aparcamiento",
      "food": "Gastronomía local",
      "stay": "Alojamientos cercanos",
      "restaurants": "Restaurantes cercanos",
      "tourSpots": "Lugares imprescindibles para visitar cerca",
      "camping": "Campings cercanos",
      "barrierFree": "Accesibilidad",
      "pet": "Se admiten mascotas",
      "facilities": "Instalaciones en el recinto",
      "tips": "Consejos para visitantes",
      "foreigner": "Para visitantes internacionales",
      "usage": "Información para visitantes",
      "homepage": "Sitio web oficial"
    },
    "labels": {
      "wheelchair": "Acceso para sillas de ruedas",
      "accToilet": "Aseo accesible",
      "accParking": "Aparcamiento accesible",
      "interpretation": "Interpretación",
      "halal": "Halal / Vegetariano",
      "payment": "Consejos de pago",
      "petAllowed": "Se admiten mascotas",
      "petCond": "Condiciones",
      "distanceApprox": "aprox. {km} km",
      "campType": "Tipo",
      "tel": "Teléfono",
      "visitSite": "Visitar el sitio web"
    }
  },
  "fr": {
    "titles": {
      "summary": "Infos clés",
      "timetable": "Horaires",
      "lineup": "Programmation",
      "program": "Programme",
      "shuttle": "Navette",
      "parking": "Stationnement",
      "food": "Spécialités locales",
      "stay": "Hébergements à proximité",
      "restaurants": "Restaurants à proximité",
      "tourSpots": "Beaux endroits à visiter à proximité",
      "camping": "Campings à proximité",
      "barrierFree": "Accessibilité",
      "pet": "Animaux bienvenus",
      "facilities": "Équipements sur place",
      "tips": "Conseils aux visiteurs",
      "foreigner": "Pour les visiteurs étrangers",
      "usage": "Informations pratiques",
      "homepage": "Site officiel"
    },
    "labels": {
      "wheelchair": "Accès en fauteuil roulant",
      "accToilet": "Toilettes accessibles",
      "accParking": "Stationnement accessible",
      "interpretation": "Interprétariat",
      "halal": "Halal / Végétarien",
      "payment": "Conseils de paiement",
      "petAllowed": "Animaux autorisés",
      "petCond": "Conditions",
      "distanceApprox": "env. {km} km",
      "campType": "Type",
      "tel": "Tél.",
      "visitSite": "Visiter le site"
    }
  },
  "ru": {
    "titles": {
      "summary": "Основная информация",
      "timetable": "Расписание",
      "lineup": "Состав участников",
      "program": "Программа",
      "shuttle": "Шаттл-автобус",
      "parking": "Парковка",
      "food": "Местная кухня",
      "stay": "Жильё поблизости",
      "restaurants": "Рестораны поблизости",
      "tourSpots": "Интересные места поблизости",
      "camping": "Кемпинги поблизости",
      "barrierFree": "Доступная среда",
      "pet": "Можно с питомцами",
      "facilities": "Удобства на территории",
      "tips": "Советы для посетителей",
      "foreigner": "Для иностранных гостей",
      "usage": "Информация для посетителей",
      "homepage": "Официальный сайт"
    },
    "labels": {
      "wheelchair": "Доступ для инвалидных колясок",
      "accToilet": "Доступный туалет",
      "accParking": "Парковка для инвалидов",
      "interpretation": "Устный перевод",
      "halal": "Халяль / Вегетарианское",
      "payment": "Советы по оплате",
      "petAllowed": "Питомцы разрешены",
      "petCond": "Условия",
      "distanceApprox": "прибл. {km} км",
      "campType": "Тип",
      "tel": "Тел",
      "visitSite": "Перейти на сайт"
    }
  },
  "de": {
    "titles": {
      "summary": "Wichtige Infos",
      "timetable": "Zeitplan",
      "lineup": "Lineup",
      "program": "Programm",
      "shuttle": "Shuttlebus",
      "parking": "Parkplatz",
      "food": "Regionale Spezialitäten",
      "stay": "Unterkünfte in der Nähe",
      "restaurants": "Restaurants in der Nähe",
      "tourSpots": "Sehenswerte Orte in der Nähe",
      "camping": "Campingplätze in der Nähe",
      "barrierFree": "Barrierefreiheit",
      "pet": "Haustiere willkommen",
      "facilities": "Einrichtungen vor Ort",
      "tips": "Tipps für Besucher",
      "foreigner": "Für internationale Besucher",
      "usage": "Besucherinformationen",
      "homepage": "Offizielle Website"
    },
    "labels": {
      "wheelchair": "Rollstuhlzugang",
      "accToilet": "Barrierefreie Toilette",
      "accParking": "Barrierefreier Parkplatz",
      "interpretation": "Dolmetscherdienst",
      "halal": "Halal / Vegetarisch",
      "payment": "Zahlungshinweise",
      "petAllowed": "Haustiere erlaubt",
      "petCond": "Bedingungen",
      "distanceApprox": "ca. {km} km",
      "campType": "Typ",
      "tel": "Tel",
      "visitSite": "Website besuchen"
    }
  },
  "ar": {
    "titles": {
      "summary": "معلومات أساسية",
      "timetable": "الجدول الزمني",
      "lineup": "قائمة الفنانين",
      "program": "البرنامج",
      "shuttle": "حافلة النقل",
      "parking": "مواقف السيارات",
      "food": "المأكولات المحلية",
      "stay": "أماكن الإقامة القريبة",
      "restaurants": "المطاعم القريبة",
      "tourSpots": "أماكن رائعة للزيارة في الجوار",
      "camping": "مواقع التخييم القريبة",
      "barrierFree": "إمكانية الوصول",
      "pet": "الحيوانات الأليفة مرحّب بها",
      "facilities": "المرافق في الموقع",
      "tips": "نصائح للزوّار",
      "foreigner": "للزوّار الدوليين",
      "usage": "معلومات الزوّار",
      "homepage": "الموقع الرسمي"
    },
    "labels": {
      "wheelchair": "وصول الكراسي المتحركة",
      "accToilet": "دورة مياه مجهّزة لذوي الاحتياجات",
      "accParking": "موقف سيارات مجهّز لذوي الاحتياجات",
      "interpretation": "الترجمة الفورية",
      "halal": "حلال / نباتي",
      "payment": "نصائح الدفع",
      "petAllowed": "الحيوانات الأليفة مسموح بها",
      "petCond": "الشروط",
      "distanceApprox": "حوالي {km} كم",
      "campType": "النوع",
      "tel": "الهاتف",
      "visitSite": "زيارة الموقع الإلكتروني"
    }
  },
  "vi": {
    "titles": {
      "summary": "Thông tin chính",
      "timetable": "Lịch trình",
      "lineup": "Đội hình biểu diễn",
      "program": "Chương trình",
      "shuttle": "Xe buýt đưa đón",
      "parking": "Bãi đỗ xe",
      "food": "Ẩm thực địa phương",
      "stay": "Chỗ nghỉ gần đây",
      "restaurants": "Nhà hàng gần đây",
      "tourSpots": "Điểm tham quan hấp dẫn gần đây",
      "camping": "Khu cắm trại gần đây",
      "barrierFree": "Khả năng tiếp cận",
      "pet": "Chào đón thú cưng",
      "facilities": "Cơ sở vật chất tại chỗ",
      "tips": "Mẹo cho khách tham quan",
      "foreigner": "Dành cho khách quốc tế",
      "usage": "Thông tin cho khách tham quan",
      "homepage": "Trang web chính thức"
    },
    "labels": {
      "wheelchair": "Lối đi cho xe lăn",
      "accToilet": "Nhà vệ sinh dễ tiếp cận",
      "accParking": "Bãi đỗ xe dễ tiếp cận",
      "interpretation": "Phiên dịch",
      "halal": "Halal / Chay",
      "payment": "Mẹo thanh toán",
      "petAllowed": "Cho phép thú cưng",
      "petCond": "Điều kiện",
      "distanceApprox": "khoảng {km} km",
      "campType": "Loại hình",
      "tel": "Điện thoại",
      "visitSite": "Truy cập trang web"
    }
  },
  "id": {
    "titles": {
      "summary": "Info penting",
      "timetable": "Jadwal acara",
      "lineup": "Daftar penampil",
      "program": "Program",
      "shuttle": "Bus antar-jemput",
      "parking": "Parkir",
      "food": "Kuliner khas daerah",
      "stay": "Penginapan terdekat",
      "restaurants": "Restoran terdekat",
      "tourSpots": "Tempat menarik untuk dikunjungi di sekitar",
      "camping": "Bumi perkemahan terdekat",
      "barrierFree": "Aksesibilitas",
      "pet": "Ramah hewan peliharaan",
      "facilities": "Fasilitas di lokasi",
      "tips": "Tips untuk pengunjung",
      "foreigner": "Untuk pengunjung mancanegara",
      "usage": "Informasi pengunjung",
      "homepage": "Situs web resmi"
    },
    "labels": {
      "wheelchair": "Akses kursi roda",
      "accToilet": "Toilet ramah disabilitas",
      "accParking": "Parkir ramah disabilitas",
      "interpretation": "Penerjemahan",
      "halal": "Halal / Vegetarian",
      "payment": "Tips pembayaran",
      "petAllowed": "Hewan peliharaan diperbolehkan",
      "petCond": "Ketentuan",
      "distanceApprox": "sekitar {km} km",
      "campType": "Jenis",
      "tel": "Telepon",
      "visitSite": "Kunjungi situs web"
    }
  },
  "th": {
    "titles": {
      "summary": "ข้อมูลสำคัญ",
      "timetable": "ตารางเวลา",
      "lineup": "รายชื่อศิลปิน",
      "program": "โปรแกรม",
      "shuttle": "รถรับส่ง",
      "parking": "ที่จอดรถ",
      "food": "อาหารท้องถิ่น",
      "stay": "ที่พักใกล้เคียง",
      "restaurants": "ร้านอาหารใกล้เคียง",
      "tourSpots": "สถานที่น่าเที่ยวใกล้เคียง",
      "camping": "ลานกางเต็นท์ใกล้เคียง",
      "barrierFree": "การเข้าถึงสำหรับทุกคน",
      "pet": "ต้อนรับสัตว์เลี้ยง",
      "facilities": "สิ่งอำนวยความสะดวกในสถานที่",
      "tips": "เคล็ดลับสำหรับผู้มาเยือน",
      "foreigner": "สำหรับผู้มาเยือนชาวต่างชาติ",
      "usage": "ข้อมูลสำหรับผู้มาเยือน",
      "homepage": "เว็บไซต์อย่างเป็นทางการ"
    },
    "labels": {
      "wheelchair": "ทางเข้าสำหรับรถเข็น",
      "accToilet": "ห้องน้ำสำหรับผู้พิการ",
      "accParking": "ที่จอดรถสำหรับผู้พิการ",
      "interpretation": "บริการล่าม",
      "halal": "ฮาลาล / มังสวิรัติ",
      "payment": "เคล็ดลับการชำระเงิน",
      "petAllowed": "อนุญาตให้นำสัตว์เลี้ยงเข้า",
      "petCond": "เงื่อนไข",
      "distanceApprox": "ประมาณ {km} กม.",
      "campType": "ประเภท",
      "tel": "โทร",
      "visitSite": "เยี่ยมชมเว็บไซต์"
    }
  }
};

export function getSections(locale) {
  const b = SECTION_LABELS.en;
  const loc = SECTION_LABELS[locale] || b;
  return {
    titles: { ...b.titles, ...loc.titles },
    labels: { ...b.labels, ...loc.labels },
  };
}
