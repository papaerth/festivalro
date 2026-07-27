import { notFound } from "next/navigation";
import { getFestivals, localizeFestivals } from "@/lib/festivals";
import { SITE_URL, localeHref, HTML_LANG } from "@/lib/i18n";
import { SEO_LOCALES, festivalsInRange, sortForLanding, todayKst } from "@/lib/seoLanding";
import SeoLanding from "@/components/SeoLanding";

export const revalidate = 21600;
export const dynamicParams = true;
const CAP = 48;

export function generateStaticParams() {
  return SEO_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!SEO_LOCALES.includes(locale)) return {};
  const title = `Festivals in Korea — Live Map & Guide | Chukjero`;
  const description = `Discover festivals, performances and exhibitions across South Korea on a live, always-current map. Browse by month, by city, or this weekend — updated daily from official data.`;
  const url = `${SITE_URL}${localeHref(locale, "/festivals-in-korea")}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, locale: HTML_LANG[locale], images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function KoreaHubPage({ params }) {
  const { locale } = await params;
  if (!SEO_LOCALES.includes(locale)) notFound();

  const all = await getFestivals();
  const today = todayKst();
  const nowOn = sortForLanding(festivalsInRange(all, today, today), today).slice(0, CAP);
  const festivals = await localizeFestivals(nowOn, locale);

  return (
    <SeoLanding
      loc={locale}
      heading="Festivals in Korea — What's On Now"
      sub="A live map of festivals, shows & exhibitions across South Korea."
      intro="Chukjero maps every festival, performance and exhibition happening across South Korea right now — pulled from official Korean tourism and culture data and refreshed daily. Explore what's on today on the live map below, or jump to a specific month, a city, or this weekend using the links further down."
      festivals={festivals}
      currentKey="hub"
      collectedAt={Date.now()}
    />
  );
}
