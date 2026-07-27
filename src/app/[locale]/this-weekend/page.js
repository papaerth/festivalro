import { notFound } from "next/navigation";
import { getFestivals, localizeFestivals } from "@/lib/festivals";
import { SITE_URL, localeHref, HTML_LANG } from "@/lib/i18n";
import { SEO_LOCALES, weekendRange, festivalsInRange, sortForLanding, todayKst } from "@/lib/seoLanding";
import SeoLanding from "@/components/SeoLanding";

export const revalidate = 3600; // 1h ISR — 주말 계산이 날짜에 민감(크론·방문으로 자동 갱신)
export const dynamicParams = true;

const CAP = 60;

export function generateStaticParams() {
  return SEO_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!SEO_LOCALES.includes(locale)) return {};
  const title = `Festivals in Korea This Weekend | Chukjero`;
  const description = `What's on in South Korea this weekend — festivals, performances and exhibitions happening this Saturday and Sunday. Live map, dates and directions, updated automatically.`;
  const url = `${SITE_URL}${localeHref(locale, "/this-weekend")}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, locale: HTML_LANG[locale], images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function WeekendPage({ params }) {
  const { locale } = await params;
  if (!SEO_LOCALES.includes(locale)) notFound();

  const all = await getFestivals();
  const [rs, re] = weekendRange();
  const subset = sortForLanding(festivalsInRange(all, rs, re), todayKst()).slice(0, CAP);
  const festivals = await localizeFestivals(subset, locale);

  return (
    <SeoLanding
      loc={locale}
      heading="Festivals in Korea — This Weekend"
      sub="Happening this Saturday & Sunday across South Korea."
      intro="What's on in Korea this weekend? These festivals, performances and exhibitions are running or opening this Saturday and Sunday. Explore them on the live map with real dates and one-tap directions. This page recalculates the weekend automatically and refreshes from official data every day — so it's always up to date."
      festivals={festivals}
      currentKey="weekend"
      collectedAt={Date.now()}
    />
  );
}
