import { notFound } from "next/navigation";
import { getFestivals, localizeFestivals } from "@/lib/festivals";
import { SITE_URL, localeHref, HTML_LANG } from "@/lib/i18n";
import { SEO_LOCALES, CITIES, findCity, festivalsInCity, sortForLanding, todayKst } from "@/lib/seoLanding";
import SeoLanding from "@/components/SeoLanding";

// ⚠️ 도시 페이지 URL은 한 세그먼트(/en/festivals-in-seoul)라 부분 동적세그먼트가 불가 →
//  전체 동적세그먼트 [cityRoute]로 받되, dynamicParams=false + generateStaticParams로
//  등록된 슬러그만 허용(나머지 404). 기존 static 폴더(festival·about 등)가 우선이라 충돌 없음.
export const revalidate = 21600; // 6h ISR
export const dynamicParams = false; // 등록된 도시 슬러그만 렌더, 그 외 404

const CAP = 60;

export function generateStaticParams() {
  const params = [];
  for (const loc of SEO_LOCALES) {
    for (const c of CITIES) params.push({ locale: loc, cityRoute: `festivals-in-${c.slug}` });
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { locale, cityRoute } = await params;
  const city = findCity(String(cityRoute || "").replace(/^festivals-in-/, ""));
  if (!SEO_LOCALES.includes(locale) || !city) return {};
  const title = `Festivals in ${city.en}, Korea | Chukjero`;
  const description = `Things to do in ${city.en}, South Korea — festivals, performances and exhibitions on a live map with dates and directions. Updated daily from official data.`;
  const url = `${SITE_URL}${localeHref(locale, `/festivals-in-${city.slug}`)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, locale: HTML_LANG[locale], images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function CityPage({ params }) {
  const { locale, cityRoute } = await params;
  if (!SEO_LOCALES.includes(locale)) notFound();
  const city = findCity(String(cityRoute || "").replace(/^festivals-in-/, ""));
  if (!city || cityRoute !== `festivals-in-${city.slug}`) notFound();

  const all = await getFestivals();
  const inCity = sortForLanding(festivalsInCity(all, city.sido), todayKst()).slice(0, CAP);
  const festivals = await localizeFestivals(inCity, locale);

  return (
    <SeoLanding
      loc={locale}
      heading={`Festivals in ${city.en}, Korea`}
      sub={`Festivals, shows & exhibitions in and around ${city.en}.`}
      intro={`Looking for things to do in ${city.en}? Explore the festivals, performances and exhibitions happening in and around ${city.en} on the live map below — with real dates and one-tap directions. It's generated from official Korean tourism and culture data and refreshes automatically, so it stays current instead of going stale like a hand-written list.`}
      festivals={festivals}
      center={city.center}
      currentKey={`city:${city.slug}`}
      collectedAt={Date.now()}
    />
  );
}
