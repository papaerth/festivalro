import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import BrandTagline from "@/components/BrandTagline";
import DataSources from "@/components/DataSources";
import LangSwitcher from "@/components/LangSwitcher";
import AccountMenu from "@/components/AccountMenu";
import PrivacyLink from "@/components/PrivacyLink";
import MapDirections from "@/components/MapDirections";
import DetailMap from "@/components/DetailMap";
import FestivalCard from "@/components/FestivalCard";
import { getMarkets } from "@/lib/markets";
import { getFestivals, localizeFestivals } from "@/lib/festivals";
import { TYPES } from "@/lib/seasons";
import { getStatusInfo } from "@/lib/format";
import { nextMarketDay, formatMarketDate } from "@/lib/marketDay";
import {
  isLocale,
  DEFAULT_LOCALE,
  getDictionary,
  getMarketText,
  getTypeLabel,
  localeHref,
  SITE_NAME,
} from "@/lib/i18n";

export const revalidate = 21600; // 6시간

export async function generateMetadata({ params }) {
  const { locale, id } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const markets = await getMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) return { title: SITE_NAME };
  const mt = getMarketText(loc);
  return {
    title: `${m.name} · ${mt.typeLabel(m.marketType)} | ${SITE_NAME}`,
    description: `${m.name} — ${m.addr || ""}`,
  };
}

export default async function MarketPage({ params }) {
  const { locale, id } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);
  const mt = getMarketText(loc);

  const markets = await localizeFestivals(await getMarkets(), loc);
  const market = markets.find((m) => m.id === id);
  if (!market) notFound();

  const name = market.displayName || market.name;
  const theme = TYPES.market;
  const nd = nextMarketDay(market.openDays);
  const homeHref = localeHref("/", loc);

  // 주변 정보: 같은 권역의 다가오는/진행중 축제 최대 6개
  const all = await localizeFestivals(await getFestivals(), loc);
  const now = new Date();
  const nearby = all
    .filter(
      (f) =>
        f.type === "festival" &&
        f.region === market.region &&
        getStatusInfo(f.startDate, f.endDate, now).key !== "ended"
    )
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
    .slice(0, 6);

  return (
    <>
      <header className="site-header">
        <div className="container">
          <BrandLogo />
          <div className="header-right">
            <LangSwitcher />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container">
        <Link href={homeHref} className="back-link">
          {dict.detail.back}
        </Link>

        <section className="market-detail-head">
          <div className="detail-hero-badges">
            <span className="badge type-badge-inline" style={{ background: theme.color }}>
              {theme.emoji} {mt.typeLabel(market.marketType)}
            </span>
            {nd && nd.isToday && (
              <span className="badge market-today-badge">{mt.today}</span>
            )}
          </div>
          <h1>🏪 {name}</h1>
          {/* 장날 / 운영시간 */}
          {nd ? (
            <p className={`market-detail-day ${nd.isToday ? "today" : ""}`}>
              {nd.isToday
                ? `📅 ${mt.today}`
                : `📅 ${mt.next}: ${formatMarketDate(nd.date, mt.intl)}`}
            </p>
          ) : (
            market.hours && <p className="market-detail-day">🕕 {market.hours}</p>
          )}
          <p className="detail-place">
            📍 {market.sido} {market.sigungu}
            {market.addr ? ` · ${market.addr}` : ""}
          </p>
        </section>

        {/* 길찾기 */}
        <div className="detail-actions">
          <MapDirections name={name} lat={market.lat} lng={market.lng} />
        </div>

        {/* 위치 지도 */}
        {Number.isFinite(market.lat) && Number.isFinite(market.lng) && (
          <div className="market-detail-map">
            <DetailMap lat={market.lat} lng={market.lng} name={name} color={theme.color} />
          </div>
        )}

        {/* 주변 정보: 같은 권역 축제 */}
        {nearby.length > 0 && (
          <section className="market-nearby">
            <h2 className="market-nearby-title">
              🎉 {(dict.regions && dict.regions[market.region]) || ""} {getTypeLabel("festival", loc)}
            </h2>
            <div className="card-grid">
              {nearby.map((f) => (
                <FestivalCard key={f.id} festival={f} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <BrandTagline />
          <DataSources locale={loc} collectedAt={Date.now()} />
          {dict.footer} · <PrivacyLink />
        </div>
      </footer>
    </>
  );
}
