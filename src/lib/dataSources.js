// ────────────────────────────────────────────────────────────────
//  데이터 출처 표기 — 공공 오픈API 이용조건(특히 KOPIS)에 따른 출처 명시.
//   · shortSourceLabel: 카드·상세 팝업에 넣는 짧은 출처 한 줄(attribution 필요한 소스만)
//   · getFooterSources: 푸터의 데이터 출처 안내(긴 KOPIS 고지 + 출처 목록 + 최종집계)
//   · formatCollectedDate: 최종 수집(캐시 갱신) 시각 → "YYYY.MM.DD"
//  ※ 다국어: 사이트 지원 13개 언어 전체 제공. 누락 언어는 영어로 폴백.
// ────────────────────────────────────────────────────────────────

// 카드·팝업용 짧은 출처 라벨. attribution이 필요한 소스(KOPIS·문화정보)만 노출.
const SHORT = {
  kopis: {
    ko: "출처: 공연예술통합전산망(KOPIS)",
    en: "Source: KOPIS (Korea Performing Arts)",
    ja: "出典: 公演芸術統合電算網(KOPIS)",
    zh: "来源: 演出艺术综合信息系统(KOPIS)",
    "zh-TW": "來源: 演出藝術整合資訊系統(KOPIS)",
    es: "Fuente: KOPIS (artes escénicas de Corea)",
    fr: "Source : KOPIS (arts du spectacle de Corée)",
    ru: "Источник: KOPIS (исполнительские искусства Кореи)",
    de: "Quelle: KOPIS (Darstellende Künste Korea)",
    ar: "المصدر: KOPIS (الفنون الأدائية الكورية)",
    vi: "Nguồn: KOPIS (nghệ thuật biểu diễn Hàn Quốc)",
    id: "Sumber: KOPIS (seni pertunjukan Korea)",
    th: "แหล่งที่มา: KOPIS (ศิลปะการแสดงเกาหลี)",
  },
  culture: {
    ko: "출처: 한국문화정보원 문화공공데이터광장",
    en: "Source: KCISA Culture Data",
    ja: "出典: 韓国文化情報院 文化公共データ広場",
    zh: "来源: 韩国文化信息院 文化公共数据广场",
    "zh-TW": "來源: 韓國文化資訊院 文化公共資料廣場",
    es: "Fuente: Datos Públicos de Cultura KCISA",
    fr: "Source : Données publiques culturelles KCISA",
    ru: "Источник: Открытые культурные данные KCISA",
    de: "Quelle: KCISA Öffentliche Kulturdaten",
    ar: "المصدر: بيانات KCISA الثقافية العامة",
    vi: "Nguồn: Dữ liệu công cộng văn hóa KCISA",
    id: "Sumber: Data Publik Budaya KCISA",
    th: "แหล่งที่มา: ข้อมูลสาธารณะด้านวัฒนธรรม KCISA",
  },
};

// festival.source → 카드/팝업 짧은 출처 라벨. 대상 아니면 null(표기 안 함).
export function shortSourceLabel(source, locale = "ko") {
  const m = SHORT[source];
  if (!m) return null;
  return m[locale] || m.en || m.ko;
}

// 푸터 데이터 출처 안내(언어별). 13개 언어 제공, 누락 시 en 폴백.
const FOOTER = {
  ko: {
    heading: "데이터 출처",
    kopis:
      "공연 정보는 (재)예술경영지원센터 공연예술통합전산망(KOPIS)의 오픈API를 활용하며, 집계 데이터는 연계기관 티켓판매시스템 발권 분량 기준으로 실제 관객 수와 차이가 있을 수 있습니다.",
    sources: [
      "축제·관광 정보: 한국관광공사 TourAPI",
      "전시·공연 정보: 한국문화정보원 문화공공데이터광장",
      "축제 표준데이터: 행정안전부 전국문화축제표준데이터",
    ],
    lastAggregated: (d) => `최종집계 ${d}`,
  },
  en: {
    heading: "Data Sources",
    kopis:
      "Performance information is provided via the open API of KOPIS (Korea Performing Arts Box Office Information System, Korea Arts Management Service). Aggregated figures are based on tickets issued through affiliated ticketing systems and may differ from actual attendance.",
    sources: [
      "Festivals & tourism: Korea Tourism Organization TourAPI",
      "Exhibitions & performances: KCISA Culture Public Data",
      "Festival standard data: National Festival Standard Data (MOIS)",
    ],
    lastAggregated: (d) => `Last aggregated ${d}`,
  },
  ja: {
    heading: "データ出典",
    kopis:
      "公演情報は(財)芸術経営支援センターの公演芸術統合電算網(KOPIS)のオープンAPIを利用しており、集計データは連携機関のチケット販売システムの発券分を基準とするため、実際の観客数と異なる場合があります。",
    sources: [
      "祭り・観光情報:韓国観光公社 TourAPI",
      "展示・公演情報:韓国文化情報院 文化公共データ広場",
      "祭り標準データ:行政安全部 全国文化祭り標準データ",
    ],
    lastAggregated: (d) => `最終集計 ${d}`,
  },
  zh: {
    heading: "数据来源",
    kopis:
      "演出信息使用（财）艺术经营支援中心演出艺术综合信息系统（KOPIS）的开放API，统计数据以合作机构票务系统的出票数量为准，可能与实际观众人数存在差异。",
    sources: [
      "庆典·旅游信息：韩国观光公社 TourAPI",
      "展览·演出信息：韩国文化信息院 文化公共数据广场",
      "庆典标准数据：行政安全部 全国文化庆典标准数据",
    ],
    lastAggregated: (d) => `最终统计 ${d}`,
  },
  "zh-TW": {
    heading: "資料來源",
    kopis:
      "演出資訊使用（財）藝術經營支援中心演出藝術整合資訊系統（KOPIS）的開放API，統計資料以合作機構票務系統的出票數量為準，可能與實際觀眾人數有所差異。",
    sources: [
      "慶典·旅遊資訊：韓國觀光公社 TourAPI",
      "展覽·演出資訊：韓國文化資訊院 文化公共資料廣場",
      "慶典標準資料：行政安全部 全國文化慶典標準資料",
    ],
    lastAggregated: (d) => `最終統計 ${d}`,
  },
  es: {
    heading: "Fuentes de datos",
    kopis:
      "La información de espectáculos se obtiene mediante la API abierta de KOPIS (Sistema de Información de Taquilla de Artes Escénicas de Corea, del Korea Arts Management Service). Las cifras agregadas se basan en las entradas emitidas por los sistemas de venta asociados y pueden diferir de la asistencia real.",
    sources: [
      "Festivales y turismo: Korea Tourism Organization TourAPI",
      "Exposiciones y espectáculos: Datos Públicos de Cultura KCISA",
      "Datos estándar de festivales: Datos Estándar Nacionales de Festivales (MOIS)",
    ],
    lastAggregated: (d) => `Última actualización ${d}`,
  },
  fr: {
    heading: "Sources des données",
    kopis:
      "Les informations sur les spectacles proviennent de l'API ouverte de KOPIS (système d'information billetterie des arts du spectacle de Corée, Korea Arts Management Service). Les données agrégées reposent sur les billets émis par les systèmes de billetterie partenaires et peuvent différer de la fréquentation réelle.",
    sources: [
      "Festivals et tourisme : Korea Tourism Organization TourAPI",
      "Expositions et spectacles : Données publiques culturelles KCISA",
      "Données standard des festivals : Données standard nationales des festivals (MOIS)",
    ],
    lastAggregated: (d) => `Dernière agrégation ${d}`,
  },
  ru: {
    heading: "Источники данных",
    kopis:
      "Информация о спектаклях предоставляется через открытый API KOPIS (Корейская система информации о билетах на исполнительские искусства, Korea Arts Management Service). Сводные данные основаны на билетах, оформленных партнёрскими системами продажи, и могут отличаться от фактической посещаемости.",
    sources: [
      "Фестивали и туризм: Korea Tourism Organization TourAPI",
      "Выставки и спектакли: Открытые культурные данные KCISA",
      "Стандартные данные фестивалей: Национальные стандартные данные о фестивалях (MOIS)",
    ],
    lastAggregated: (d) => `Последнее обновление ${d}`,
  },
  de: {
    heading: "Datenquellen",
    kopis:
      "Die Veranstaltungsinformationen stammen aus der offenen API von KOPIS (Korea Performing Arts Box Office Information System des Korea Arts Management Service). Die aggregierten Zahlen beruhen auf den von den angeschlossenen Ticketsystemen ausgestellten Tickets und können von den tatsächlichen Besucherzahlen abweichen.",
    sources: [
      "Feste & Tourismus: Korea Tourism Organization TourAPI",
      "Ausstellungen & Aufführungen: KCISA Öffentliche Kulturdaten",
      "Festival-Standarddaten: Nationale Festival-Standarddaten (MOIS)",
    ],
    lastAggregated: (d) => `Zuletzt aktualisiert ${d}`,
  },
  ar: {
    heading: "مصادر البيانات",
    kopis:
      "تُستقى معلومات العروض من واجهة البرمجة المفتوحة لنظام KOPIS (نظام معلومات شبّاك تذاكر الفنون الأدائية الكوري التابع لمركز Korea Arts Management Service)، وتستند البيانات المجمّعة إلى التذاكر الصادرة عن أنظمة التذاكر الشريكة وقد تختلف عن عدد الحضور الفعلي.",
    sources: [
      "المهرجانات والسياحة: Korea Tourism Organization TourAPI",
      "المعارض والعروض: بيانات KCISA الثقافية العامة",
      "البيانات المعيارية للمهرجانات: البيانات المعيارية الوطنية للمهرجانات (MOIS)",
    ],
    lastAggregated: (d) => `آخر تجميع ${d}`,
  },
  vi: {
    heading: "Nguồn dữ liệu",
    kopis:
      "Thông tin biểu diễn được cung cấp qua API mở của KOPIS (Hệ thống thông tin phòng vé nghệ thuật biểu diễn Hàn Quốc, thuộc Korea Arts Management Service). Dữ liệu tổng hợp dựa trên số vé phát hành bởi các hệ thống bán vé liên kết và có thể khác với số khán giả thực tế.",
    sources: [
      "Lễ hội & du lịch: Korea Tourism Organization TourAPI",
      "Triển lãm & biểu diễn: Dữ liệu công cộng văn hóa KCISA",
      "Dữ liệu chuẩn lễ hội: Dữ liệu chuẩn lễ hội toàn quốc (MOIS)",
    ],
    lastAggregated: (d) => `Cập nhật lần cuối ${d}`,
  },
  id: {
    heading: "Sumber data",
    kopis:
      "Informasi pertunjukan menggunakan API terbuka KOPIS (Sistem Informasi Box Office Seni Pertunjukan Korea, dari Korea Arts Management Service). Data agregat didasarkan pada tiket yang diterbitkan oleh sistem tiket mitra dan dapat berbeda dari jumlah penonton sebenarnya.",
    sources: [
      "Festival & pariwisata: Korea Tourism Organization TourAPI",
      "Pameran & pertunjukan: Data Publik Budaya KCISA",
      "Data standar festival: Data Standar Festival Nasional (MOIS)",
    ],
    lastAggregated: (d) => `Terakhir diperbarui ${d}`,
  },
  th: {
    heading: "แหล่งข้อมูล",
    kopis:
      "ข้อมูลการแสดงใช้ API แบบเปิดของ KOPIS (ระบบข้อมูลบ็อกซ์ออฟฟิศศิลปะการแสดงของเกาหลี โดย Korea Arts Management Service) ข้อมูลที่รวบรวมอ้างอิงจากจำนวนตั๋วที่ออกโดยระบบจำหน่ายตั๋วของหน่วยงานพันธมิตร จึงอาจแตกต่างจากจำนวนผู้ชมจริง",
    sources: [
      "เทศกาลและการท่องเที่ยว: Korea Tourism Organization TourAPI",
      "นิทรรศการและการแสดง: ข้อมูลสาธารณะด้านวัฒนธรรม KCISA",
      "ข้อมูลมาตรฐานเทศกาล: ข้อมูลมาตรฐานเทศกาลแห่งชาติ (MOIS)",
    ],
    lastAggregated: (d) => `รวบรวมล่าสุด ${d}`,
  },
};

export function getFooterSources(locale = "ko") {
  return FOOTER[locale] || FOOTER.en;
}

// 최종 수집(캐시 갱신) 시각 → "YYYY.MM.DD". ts는 ms(number) 또는 ISO 문자열.
export function formatCollectedDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
