// ────────────────────────────────────────────────────────────────
//  데이터 출처 표기 — 공공 오픈API 이용조건(특히 KOPIS)에 따른 출처 명시.
//   · shortSourceLabel: 카드·상세 팝업에 넣는 짧은 출처 한 줄(attribution 필요한 소스만)
//   · getFooterSources: 푸터의 데이터 출처 안내(긴 KOPIS 고지 + 출처 목록 + 최종집계)
//   · formatCollectedDate: 최종 수집(캐시 갱신) 시각 → "YYYY.MM.DD"
//  ※ 다국어: 한국어·영어를 기본 제공하고, 그 외 언어는 영어로 폴백(출처 고지 자체는 항상 노출).
// ────────────────────────────────────────────────────────────────

// 카드·팝업용 짧은 출처 라벨. attribution이 필요한 소스(KOPIS·문화정보)만 노출.
const SHORT = {
  kopis: {
    ko: "출처: 공연예술통합전산망(KOPIS)",
    en: "Source: KOPIS (Korea Performing Arts)",
    ja: "出典: 公演芸術統合電算網(KOPIS)",
    zh: "来源: 演出艺术综合信息系统(KOPIS)",
  },
  culture: {
    ko: "출처: 한국문화정보원 문화공공데이터광장",
    en: "Source: KCISA Culture Data",
    ja: "出典: 韓国文化情報院",
    zh: "来源: 韩国文化信息院",
  },
};

// festival.source → 카드/팝업 짧은 출처 라벨. 대상 아니면 null(표기 안 함).
export function shortSourceLabel(source, locale = "ko") {
  const m = SHORT[source];
  if (!m) return null;
  return m[locale] || m.en || m.ko;
}

// 푸터 데이터 출처 안내(언어별). ko·en 제공, 그 외는 en 폴백.
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
