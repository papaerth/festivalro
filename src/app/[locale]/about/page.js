import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import BrandTagline from "@/components/BrandTagline";
import DataSources from "@/components/DataSources";
import PrivacyLink from "@/components/PrivacyLink";
import { localeHref, isLocale, DEFAULT_LOCALE, SITE_URL } from "@/lib/i18n";

// 축제로 소개 페이지 — 브랜드("축제로") 검색 노출용. 본문에 브랜드명이 자연스럽게 반복됨.
export const revalidate = 86400;

const AB = {
  ko: {
    metaTitle: "축제로 소개 - 대한민국 축제 지도 · 축제로",
    metaDesc:
      "축제로(chukjero.com)는 대한민국 전국의 사계절 축제를 지도에서 한눈에 볼 수 있는 축제 정보 플랫폼입니다.",
    title: "축제로 소개",
    paras: [
      "축제로(chukjero.com)는 대한민국 전국 시군구에서 열리는 사계절 축제를 지도 위에서 한눈에 찾아볼 수 있는 축제 정보 플랫폼입니다. 봄 벚꽃축제부터 여름 물놀이·머드축제, 가을 단풍·불꽃축제, 겨울 산천어·눈꽃축제까지 — 지금 어디서 어떤 축제가 열리는지 축제로에서 바로 확인할 수 있습니다.",
      "축제로는 각 축제의 기간·장소·소개는 물론, 지도 위 정확한 위치, 3일 날씨 미리보기, 카카오맵·네이버지도 길찾기, 방문자 블로그 후기와 축제 영상까지 한 페이지에 모아 보여줍니다. 계절·지역·기간으로 손쉽게 필터링하고, 다가오는 인기 축제와 지금 진행 중인 축제를 카드뉴스로 빠르게 훑어볼 수 있습니다.",
      "여행을 계획하는 국내 사용자뿐 아니라 한국의 축제를 찾는 외국인 방문객을 위해, 축제로는 13개 언어로 축제명·소개·지역명을 자동 번역해 제공합니다. 축제 담당자(지자체·주최측)는 축제로의 등록 기능으로 직접 축제 정보와 사진을 올려 방문객에게 알릴 수 있습니다.",
      "흩어져 있던 전국 축제 정보를 한곳에 모아, 위치·날씨·길찾기·후기까지 축제 하나를 제대로 즐기는 데 필요한 모든 것을 축제로에서 해결하도록 만들었습니다. 지금 축제로(chukjero.com)에서 이번 주말 가볼 만한 축제를 찾아보세요.",
    ],
    back: "← 홈으로",
  },
  en: {
    metaTitle: "About Chukjero - Korea Festival Map · Chukjero",
    metaDesc:
      "Chukjero (chukjero.com) is a festival information platform to discover festivals across South Korea on one map.",
    title: "About Chukjero (축제로)",
    paras: [
      "Chukjero (chukjero.com, 축제로) is a festival information platform that lets you discover four-season festivals held across every city and county of South Korea on a single map. From spring cherry-blossom festivals to summer water and mud festivals, autumn foliage and fireworks festivals, and winter ice-fishing and snow festivals — Chukjero shows you what's happening, and where, right now.",
      "For each festival, Chukjero brings together the dates, location, and description along with its exact spot on the map, a 3-day weather preview, KakaoMap and Naver Map directions, visitor blog reviews, and festival videos — all on one page. You can filter by season, region, and period, and quickly browse trending upcoming and currently-running festivals as cards.",
      "Beyond domestic travelers, Chukjero serves international visitors looking for Korean festivals by automatically translating festival names, descriptions, and place names into 13 languages. Festival organizers (local governments and hosts) can register their own festival details and photos directly on Chukjero.",
      "By gathering scattered nationwide festival information in one place — location, weather, directions, and reviews — Chukjero aims to be everything you need to enjoy a festival. Find a festival to visit this weekend on Chukjero (chukjero.com).",
    ],
    back: "← Home",
  },
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const a = AB[loc] || AB.en;
  return {
    title: a.metaTitle,
    description: a.metaDesc,
    alternates: { canonical: `${SITE_URL}${localeHref(loc, "/about")}` },
    openGraph: { title: a.metaTitle, description: a.metaDesc },
  };
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const a = AB[loc] || AB.en;
  const home = localeHref(loc, "/");

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <BrandLogo />
        </div>
      </header>

      <main className="container legal">
        <h1 className="legal-title">{a.title}</h1>
        {a.paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="legal-back">
          <Link href={home} className="popup-link">
            {a.back}
          </Link>
        </p>
      </main>

      <footer className="site-footer">
        <div className="container">
          <BrandTagline />
          <DataSources locale={loc} collectedAt={Date.now()} />
          축제로 · Chukjero · <PrivacyLink />
        </div>
      </footer>
    </div>
  );
}
