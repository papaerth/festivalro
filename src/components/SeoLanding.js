import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import BrandTagline from "@/components/BrandTagline";
import LangSwitcher from "@/components/LangSwitcher";
import AccountMenu from "@/components/AccountMenu";
import PrivacyLink from "@/components/PrivacyLink";
import DataSources from "@/components/DataSources";
import FestivalCard from "@/components/FestivalCard";
import LandingMap from "@/components/LandingMap";
import { localeHref, SITE_URL } from "@/lib/i18n";
import { CITIES, currentMonths } from "@/lib/seoLanding";
import { formatPeriod } from "@/lib/format";

// TYPE_SCHEMA (상세페이지와 동일 매핑)
const TYPE_SCHEMA = { festival: "Festival", exhibition: "ExhibitionEvent", performance: "Event" };

// 프로그래매틱 SEO 랜딩 공용 셸(서버 컴포넌트).
//  · 상단 소개 문단 + 실시간 배지 + 지도 + 이벤트 카드 목록 + 내부 링크(탐색) + JSON-LD.
//  · '리스티클'이 아니라 실시간 데이터 페이지임을 배지·문구로 드러냄.
export default function SeoLanding({
  loc = "en",
  heading,
  sub,
  intro,
  festivals = [],
  center = null,
  currentKey = "", // 탐색 링크에서 자기 자신 제외용 키
  collectedAt,
}) {
  const homeHref = localeHref(loc, "/");
  const months = currentMonths(new Date(), 12);

  // JSON-LD: ItemList of Event (구조화 데이터)
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    numberOfItems: festivals.length,
    itemListElement: festivals.slice(0, 40).map((f, i) => {
      const place =
        f.eventplace || [f.sido, f.sigungu].filter(Boolean).join(" ") || "South Korea";
      const ev = {
        "@type": TYPE_SCHEMA[f.type] || "Event",
        name: f.displayName || f.name,
        startDate: f.startDate || undefined,
        endDate: f.endDate || undefined,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: place },
        url: `${SITE_URL}${localeHref(loc, `/festival/${f.id}`)}`,
      };
      if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
        ev.location.geo = { "@type": "GeoCoordinates", latitude: f.lat, longitude: f.lng };
      }
      if (f.image) ev.image = [f.image];
      return { "@type": "ListItem", position: i + 1, item: ev };
    }),
  };

  // 탐색(내부 링크): 이번 주말 · 다음 달들 · 도시들 (자기 자신 제외)
  const monthLinks = months
    .filter((m) => `month:${m.slug}` !== currentKey)
    .slice(0, 8)
    .map((m) => ({ href: localeHref(loc, `/festivals-in-korea/${m.slug}`), label: m.label }));
  const cityLinks = CITIES.filter((c) => `city:${c.slug}` !== currentKey).map((c) => ({
    href: localeHref(loc, `/festivals-in-${c.slug}`),
    label: `Festivals in ${c.en}`,
  }));
  const weekendLink = currentKey === "weekend" ? null : { href: localeHref(loc, "/this-weekend"), label: "This weekend" };

  return (
    <div className="season-root seo-landing" style={{ "--accent": "#C2578A", "--accent-soft": "#f7e6ef" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <header className="site-header">
        <div className="container container-wide">
          <BrandLogo />
          <div className="header-right">
            <LangSwitcher />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container container-wide">
        <Link href={homeHref} className="back-link">← Chukjero home</Link>

        <section className="seo-hero">
          <span className="seo-live-badge">🔄 Live data · updated daily</span>
          <h1>{heading}</h1>
          {sub && <p className="seo-sub">{sub}</p>}
          <p className="seo-intro">{intro}</p>
          <p className="seo-count">
            <strong>{festivals.length}</strong> events · shown on the live map below (not a static list — pulled from official Korean tourism &amp; culture data).
          </p>
        </section>

        {/* 실시간 지도 */}
        <LandingMap festivals={festivals} center={center} />

        {/* 이벤트 카드 목록 */}
        {festivals.length === 0 ? (
          <div className="empty">No events found for this selection right now. Try another month or city.</div>
        ) : (
          <div className="card-grid seo-grid">
            {festivals.map((f) => (
              <FestivalCard key={f.id} festival={f} />
            ))}
          </div>
        )}

        {/* 탐색(내부 링크) */}
        <nav className="seo-explore" aria-label="Explore more">
          <h2>Explore more</h2>
          <div className="seo-links">
            {weekendLink && (
              <Link className="seo-link" href={weekendLink.href}>{weekendLink.label}</Link>
            )}
            {monthLinks.map((l) => (
              <Link key={l.href} className="seo-link" href={l.href}>{l.label}</Link>
            ))}
            {cityLinks.map((l) => (
              <Link key={l.href} className="seo-link" href={l.href}>{l.label}</Link>
            ))}
          </div>
        </nav>
      </main>

      <footer className="site-footer">
        <div className="container">
          <BrandTagline />
          <DataSources locale={loc} collectedAt={collectedAt} />
          Chukjero · <PrivacyLink />
        </div>
      </footer>
    </div>
  );
}
