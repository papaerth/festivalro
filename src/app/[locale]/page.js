import HomeClient from "@/components/HomeClient";
import { getFestivals, localizeFestivals, isUsingSampleData } from "@/lib/festivals";
import { getMarkets } from "@/lib/markets";
import { getPopularFestivals } from "@/lib/popular";
import { isLocale, DEFAULT_LOCALE, SITE_URL } from "@/lib/i18n";

// 구조화 데이터(JSON-LD) — 브랜드("축제로") 검색 노출 강화 + 검색창(SearchAction).
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "축제로",
      alternateName: ["Chukjero", "chukjero", "축제로 지도"],
      url: `${SITE_URL}/`,
      inLanguage: "ko",
      publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "축제로",
      alternateName: "Chukjero",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon.svg`,
    },
  ],
};

// 홈 화면을 6시간마다 자동으로 다시 만들어(ISR) 최신 축제 데이터를 반영합니다.
//  - 이 값이 없으면 홈이 '배포 시점'에 굳어 재배포 전까지 안 바뀝니다.
//  - 방문자가 있으면 6시간 지난 뒤 첫 방문에서 백그라운드로 새로 고쳐집니다.
//  - 방문자가 없어도 하루 한 번 Vercel Cron(/api/cron/refresh)이 강제로 새로 고칩니다.
export const revalidate = 21600; // 6시간(초)

// 이 페이지는 서버에서 축제 데이터를 먼저 불러온 뒤,
// 화면 조작(필터/지도)은 HomeClient(브라우저)에 넘깁니다.
export default async function HomePage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;

  const festivals = await getFestivals();
  const usingSample = isUsingSampleData();

  // 현재 언어의 표시명(displayName)·시군구(displaySigungu)를 채움
  //  (TourAPI 공식 번역 → Google 번역[장기캐시] → 한국어+로마자). ko면 원문 그대로.
  const localized = await localizeFestivals(festivals, loc);

  // 다가오는 인기 축제(복합 점수: 블로그 글 수 등) → 카드별 점수 힌트맵
  const popular = await getPopularFestivals(localized);
  const popScoreById = Object.fromEntries(
    popular.map((f) => [f.id, f.popScore])
  );

  // 전통시장(장터·야시장) — 지도 필터 토글에서만 노출(메인 추천 X). 현재 언어로 이름 번역.
  const markets = await localizeFestivals(await getMarkets(), loc);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <HomeClient
        festivals={localized}
        markets={markets}
        usingSample={usingSample}
        popScoreById={popScoreById}
      />
    </>
  );
}
