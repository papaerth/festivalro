import { notFound } from "next/navigation";
import { getFestivals, localizeFestivals } from "@/lib/festivals";
import { SITE_URL, localeHref, HTML_LANG } from "@/lib/i18n";
import {
  SEO_LOCALES,
  parseMonthYear,
  isMonthInWindow,
  festivalsInMonth,
  currentMonths,
  sortForLanding,
  todayKst,
} from "@/lib/seoLanding";
import SeoLanding from "@/components/SeoLanding";

export const revalidate = 21600; // 6h ISR — '현재 월~+12개월' 창이 시간에 따라 자동으로 밀림
export const dynamicParams = true; // 창 안으로 새로 들어온 달은 온디맨드 생성

const CAP = 60; // 페이지당 표시(번역·렌더 비용 관리)

export function generateStaticParams() {
  const params = [];
  for (const loc of SEO_LOCALES) {
    for (const m of currentMonths(new Date(), 12)) params.push({ locale: loc, monthYear: m.slug });
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { locale, monthYear } = await params;
  if (!SEO_LOCALES.includes(locale)) return {};
  const my = parseMonthYear(monthYear);
  if (!my) return {};
  const inWindow = isMonthInWindow(my.year, my.month);
  const title = `Festivals in Korea — ${my.label} | Chukjero`;
  const description = `Festivals, performances & exhibitions across South Korea in ${my.label}. Live interactive map with dates and directions, updated daily from official data.`;
  const url = `${SITE_URL}${localeHref(locale, `/festivals-in-korea/${monthYear}`)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, locale: HTML_LANG[locale], images: [{ url: "/og.png", width: 1200, height: 630 }] },
    // 창 밖(과거/먼 미래)의 월은 색인 제외
    robots: inWindow ? undefined : { index: false, follow: true },
  };
}

export default async function MonthPage({ params }) {
  const { locale, monthYear } = await params;
  if (!SEO_LOCALES.includes(locale)) notFound();
  const my = parseMonthYear(monthYear);
  if (!my || !isMonthInWindow(my.year, my.month)) notFound();

  const all = await getFestivals();
  const inMonth = sortForLanding(festivalsInMonth(all, my.year, my.month), todayKst()).slice(0, CAP);
  const festivals = await localizeFestivals(inMonth, locale);

  return (
    <SeoLanding
      loc={locale}
      heading={`Festivals in Korea — ${my.label}`}
      sub={`Everything happening across South Korea in ${my.label}.`}
      intro={`Planning a trip to Korea in ${my.label}? These festivals, performances and exhibitions are taking place — or opening — across the country that month. Explore them on the live map below with real dates and one-tap directions. This page is generated from official Korean tourism and culture data and refreshes automatically, so it always reflects what's actually on.`}
      festivals={festivals}
      currentKey={`month:${monthYear}`}
      collectedAt={Date.now()}
    />
  );
}
