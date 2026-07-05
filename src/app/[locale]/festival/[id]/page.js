import Link from "next/link";
import { notFound } from "next/navigation";
import { getFestivalById } from "@/lib/festivals";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  getDictionary,
  localeHref,
  HTML_LANG,
  SITE_URL,
} from "@/lib/i18n";
import WeatherPanel from "@/components/WeatherPanel";
import DirectionsButton from "@/components/DirectionsButton";
import DetailMap from "@/components/DetailMap";
import DetailTabs from "@/components/DetailTabs";
import BlogList from "@/components/BlogList";
import CoverImage from "@/components/CoverImage";
import ShareButton from "@/components/ShareButton";
import FavoriteButton from "@/components/FavoriteButton";
import AccountMenu from "@/components/AccountMenu";
import LangSwitcher from "@/components/LangSwitcher";
import Reviews from "@/components/Reviews";
import VisitButton from "@/components/VisitButton";

// 출처 이름(언어별)
const SOURCE = {
  tour: {
    ko: "한국관광공사 TourAPI",
    en: "Korea Tourism Organization",
    ja: "韓国観光公社 TourAPI",
    zh: "韩国观光公社 TourAPI",
  },
  standard: {
    ko: "전국문화축제표준데이터 (행정안전부)",
    en: "National Festival Standard Data (MOIS)",
    ja: "全国文化祭り標準データ(行政安全部)",
    zh: "全国文化庆典标准数据（行政安全部）",
  },
};

export async function generateMetadata({ params }) {
  const { id, locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);
  const festival = await getFestivalById(id, loc);
  if (!festival) return { title: dict.meta.homeTitle };

  const place = `${festival.sido} ${festival.sigungu}`.trim();
  const languages = {};
  for (const l of LOCALES) {
    languages[HTML_LANG[l]] = `${SITE_URL}${localeHref(l, `/festival/${id}`)}`;
  }
  languages["x-default"] = `${SITE_URL}/festival/${id}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: `${festival.name}${dict.meta.detailSuffix}`,
    description: `${festival.name} · ${place} · ${dict.meta.homeDesc}`,
    alternates: {
      canonical: `${SITE_URL}${localeHref(loc, `/festival/${id}`)}`,
      languages,
    },
    openGraph: {
      title: `${festival.name}${dict.meta.detailSuffix}`,
      description: `${festival.name} · ${place}`,
      images: festival.image ? [festival.image] : [],
      locale: HTML_LANG[loc],
    },
  };
}

// 축제 상세 화면 (서버에서 데이터를 불러온 뒤 렌더링)
export default async function FestivalDetailPage({ params }) {
  const { id, locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);
  const festival = await getFestivalById(id, loc);

  if (!festival) {
    notFound();
  }

  const theme = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const statusLabel =
    status.key === "upcoming" ? status.label : dict.status[status.key];
  const sourceLabel = festival.source
    ? SOURCE[festival.source]?.[loc] || SOURCE[festival.source]?.en
    : null;
  const homeHref = localeHref(loc, "/");

  return (
    <div style={{ "--accent": theme.color, "--accent-soft": theme.soft }}>
      <header className="site-header">
        <div className="container">
          <Link href={homeHref} className="brand">
            축제로
          </Link>
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

        {/* 상단 소개 (대표 이미지 배경 + 어둡게 덮어 글자 가독성 확보) */}
        <section className="detail-hero">
          <CoverImage
            className="detail-hero-bg"
            src={festival.image}
            alt={festival.name}
            accent={theme.color}
          />
          <div className="detail-hero-scrim" />
          <div className="detail-hero-content">
            <span
              className={`badge ${status.key}${status.soon ? " soon" : ""}`}
              suppressHydrationWarning
            >
              {status.key === "ongoing" && <span className="live-dot" />}
              {statusLabel}
            </span>
            <h1>
              {theme.emoji} {festival.name}
            </h1>
            <p className="detail-period">
              📅 {formatPeriod(festival.startDate, festival.endDate)}
            </p>
            <p className="detail-place">
              📍 {festival.sido} {festival.sigungu}
            </p>
          </div>
        </section>

        {/* 즐겨찾기 + 방문기록 + 공유 */}
        <div className="detail-actions">
          <FavoriteButton id={festival.id} variant="labeled" />
          <VisitButton festivalId={festival.id} />
          <ShareButton title={festival.name} />
        </div>

        {sourceLabel && (
          <p className="detail-source">
            {dict.detail.sourcePrefix}
            {sourceLabel}
          </p>
        )}

        {/* 탭: 정보 / 날씨 / 후기 / 블로그 */}
        <DetailTabs
          infoPanel={
            <>
              <section className="section">
                <h2>{dict.detail.about}</h2>
                <p className="desc">{festival.description}</p>
              </section>

              <section className="section">
                <h2>{dict.detail.directions}</h2>
                <DirectionsButton
                  name={festival.name}
                  lat={festival.lat}
                  lng={festival.lng}
                />
              </section>

              <section className="section">
                <h2>{dict.detail.location}</h2>
                <DetailMap
                  lat={festival.lat}
                  lng={festival.lng}
                  name={festival.name}
                  color={theme.color}
                />
              </section>
            </>
          }
          weatherPanel={
            <section className="section">
              <h2>{dict.detail.weather}</h2>
              <WeatherPanel
                lat={festival.lat}
                lng={festival.lng}
                place={`${festival.sido} ${festival.sigungu}`}
              />
            </section>
          }
          reviewsPanel={
            <section className="section">
              <h2>{dict.detail.reviews}</h2>
              <Reviews festivalId={festival.id} />
            </section>
          }
          blogPanel={
            <section className="section">
              <h2>{dict.detail.blog}</h2>
              <BlogList query={festival.name} accent={theme.color} />
            </section>
          }
        />
      </main>

      <footer className="site-footer">
        <div className="container">{dict.footer}</div>
      </footer>
    </div>
  );
}

// 상세 페이지는 방문 시점에 만들고 하루 동안 캐시(ISR)합니다.
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}
