import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPlaceById,
  getNearbyFestivals,
  getPlaceLabels,
  categoryLabel,
} from "@/lib/place";
import { getFestivals } from "@/lib/festivals";
import {
  DEFAULT_LOCALE,
  isLocale,
  getDictionary,
  localeHref,
  HTML_LANG,
  SITE_URL,
} from "@/lib/i18n";
import DirectionsButton from "@/components/DirectionsButton";
import PlaceGallery from "@/components/PlaceGallery";
import RelatedFestivals from "@/components/RelatedFestivals";
import AccountMenu from "@/components/AccountMenu";
import LangSwitcher from "@/components/LangSwitcher";

export async function generateMetadata({ params }) {
  const { id, locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);
  const place = await getPlaceById(id);
  if (!place) return { title: dict.meta.homeTitle };
  return {
    title: `${place.name}${dict.meta.detailSuffix}`,
    description: place.overview ? place.overview.slice(0, 120) : place.name,
    openGraph: {
      title: place.name,
      images: place.images && place.images.length ? [place.images[0]] : [],
      locale: HTML_LANG[loc],
    },
  };
}

// 장소 상세 화면 — 축제 상세의 축소판(같은 디자인 시스템). 사이트 안에서 해결.
export default async function PlaceDetailPage({ params, searchParams }) {
  const { id, locale } = await params;
  const sp = (await searchParams) || {};
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);
  const L = getPlaceLabels(loc);

  const place = await getPlaceById(id, sp.type);
  if (!place) notFound();

  const allFestivals = await getFestivals();
  const nearby = getNearbyFestivals(place.lat, place.lng, allFestivals, 3);

  const homeHref = localeHref(loc, "/");
  const backHref = sp.from
    ? localeHref(loc, `/festival/${sp.from}`)
    : homeHref;
  const hasCoords =
    Number.isFinite(place.lat) && Number.isFinite(place.lng);
  const telDigits = place.tel ? place.tel.replace(/[^0-9+]/g, "") : "";

  return (
    <div>
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
        {/* 보던 축제 상세로 한 번에 복귀 (없으면 목록으로) */}
        <Link href={backHref} className="back-link">
          {sp.from ? L.back : L.backHome}
        </Link>

        {/* 대표 사진 (여러 장이면 스와이프) */}
        <PlaceGallery images={place.images} name={place.name} />

        {/* 이름 · 분류 */}
        <div className="place-head">
          <span className="place-cat">
            {categoryLabel(place.contentTypeId, L)}
          </span>
          <h1 className="place-name">{place.name}</h1>
        </div>

        {/* 소개 */}
        {place.overview && (
          <section className="section">
            <h2>{L.about}</h2>
            <p className="desc">{place.overview}</p>
          </section>
        )}

        {/* 주소 + 길찾기 (기존 카카오맵 길찾기 재사용) */}
        {place.addr && (
          <section className="section">
            <h2>{L.address}</h2>
            <p className="desc">{place.addr}</p>
            {hasCoords && (
              <DirectionsButton
                name={place.name}
                lat={place.lat}
                lng={place.lng}
              />
            )}
          </section>
        )}

        {/* 전화 · 홈페이지 */}
        {(telDigits || place.homepage) && (
          <section className="section place-contact">
            {telDigits && (
              <a className="place-tel" href={`tel:${telDigits}`}>
                {L.phone} · {place.tel}
              </a>
            )}
            {place.homepage && (
              <a
                className="homepage-btn"
                href={place.homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                {L.homepage}
              </a>
            )}
          </section>
        )}

        {/* 유형별 이용 정보 (값 있는 것만) */}
        {place.intro.length > 0 && (
          <section className="section">
            <h2>{L.details}</h2>
            <dl className="place-intro">
              {place.intro.map((row) => (
                <div className="place-intro-row" key={row.key}>
                  <dt>{L[row.key] || row.key}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* 이 장소에서 가까운 축제 (다시 축제로 돌아오는 동선) */}
        <RelatedFestivals items={nearby} title={L.nearby} />
      </main>

      <footer className="site-footer">
        <div className="container">{dict.footer}</div>
      </footer>
    </div>
  );
}

// 장소 상세도 방문 시 만들고 하루 캐시(ISR).
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}
