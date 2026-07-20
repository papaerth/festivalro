import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { notFound } from "next/navigation";
import { getFestivalById, getFestivals, localizeFestivals } from "@/lib/festivals";
import { getFestivalExtras } from "@/lib/festivalExtra";
import { getCurated } from "@/lib/curated";
import { getPublishedForFestival } from "@/lib/submissions";
import SubmittedInfo from "@/components/SubmittedInfo";
import { getRelatedFestivals } from "@/lib/related";
import RelatedFestivals from "@/components/RelatedFestivals";
import RecordView from "@/components/RecordView";
import PrivacyLink from "@/components/PrivacyLink";
import BrandTagline from "@/components/BrandTagline";
import { SEASONS, typeTheme } from "@/lib/seasons";
import { TAG_DEFS } from "@/lib/tags";
import { getSeasonBadge, seasonBadgeLabel } from "@/lib/season";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  getDictionary,
  getSections,
  getTypeLabel,
  getTagLabel,
  getSeasonText,
  localeHref,
  HTML_LANG,
  SITE_URL,
  SITE_NAME,
} from "@/lib/i18n";
import WeatherPanel from "@/components/WeatherPanel";
import MapDirections from "@/components/MapDirections";
import DetailMap from "@/components/DetailMap";
import DetailTabs from "@/components/DetailTabs";
import BlogList from "@/components/BlogList";
import VideoSection from "@/components/VideoSection";
import CoverImage from "@/components/CoverImage";
import ShareButton from "@/components/ShareButton";
import FavoriteButton from "@/components/FavoriteButton";
import AccountMenu from "@/components/AccountMenu";
import LangSwitcher from "@/components/LangSwitcher";
import Reviews from "@/components/Reviews";
import VisitButton from "@/components/VisitButton";
import CuratedSections from "@/components/CuratedSections";
import {
  SummaryBar,
  NearbyList,
  CampingList,
  BarrierFree,
  PetInfo,
  ProgramSection,
  UsageSection,
  HomepageSection,
} from "@/components/DetailExtra";

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
  kintex: {
    ko: "킨텍스(KINTEX) · 경기데이터드림",
    en: "KINTEX · Gyeonggi Data Dream",
    ja: "KINTEX · 京畿データドリーム",
    zh: "KINTEX · 京畿数据梦",
  },
};

// "같은 장소의 다른 행사" 섹션 제목 (13개 언어)
const SAME_VENUE = {
  ko: "📍 같은 장소의 다른 행사",
  en: "📍 More events at this venue",
  ja: "📍 同じ会場の他のイベント",
  zh: "📍 同一场馆的其他活动",
  "zh-TW": "📍 同一場館的其他活動",
  es: "📍 Más eventos en este lugar",
  fr: "📍 Autres événements sur ce lieu",
  ru: "📍 Другие события в этом месте",
  de: "📍 Weitere Veranstaltungen an diesem Ort",
  ar: "📍 فعاليات أخرى في نفس المكان",
  vi: "📍 Sự kiện khác tại địa điểm này",
  id: "📍 Acara lain di tempat ini",
  th: "📍 กิจกรรมอื่นที่สถานที่นี้",
};

// schema.org Event 하위 유형 매핑 (전시=ExhibitionEvent, 축제=Festival)
const TYPE_SCHEMA = {
  festival: "Festival",
  exhibition: "ExhibitionEvent",
  performance: "Event",
};

// 행사 장소 문자열에서 '전시장 이름' 핵심만 추출 (예: "코엑스(COEX) 1층 A홀" → "코엑스")
function venueKey(place = "") {
  const s = String(place).trim();
  if (!s) return "";
  return s
    .split(/[(（]/)[0]
    .split(/\s+/)[0]
    .replace(/[^가-힣A-Za-z0-9]/g, "")
    .slice(0, 24);
}

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
      type: "website",
      siteName: SITE_NAME,
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

  // 제출로 등록된 새 축제(source="submission")는 좌표·자동수집 정보가 없음 → 지도/날씨/주변 생략
  const isSubmitted = festival.source === "submission";

  // 자동 수집(API) + 큐레이션(직접 입력) + 추천용 전체 목록 — 각각 실패/없으면 빈 값
  const [extras, curated, allFestivals, submitted] = await Promise.all([
    isSubmitted ? Promise.resolve({}) : getFestivalExtras(festival, loc),
    getCurated(festival.id),
    getFestivals(),
    getPublishedForFestival(festival.id),
  ]);
  // "이 축제가 좋았다면" 추천 (같은 시군구→같은 계절 인기→비슷한 유형, 종료·현재 축제 제외)
  const related = await localizeFestivals(getRelatedFestivals(festival, allFestivals, 6), loc);

  // 같은 장소(전시장)의 다른 행사 — 행사장소(eventplace)가 있는 경우(주로 전시·공연)만.
  //  코엑스·벡스코처럼 한 장소에서 여러 행사가 열리는 경우를 위해 종료되지 않은 행사 최대 6개.
  const myVenue = venueKey(festival.eventplace);
  const sameVenue = myVenue
    ? await localizeFestivals(
        allFestivals
          .filter((f) => f.id !== festival.id && venueKey(f.eventplace) === myVenue)
          .filter((f) => getStatusInfo(f.startDate, f.endDate).key !== "ended")
          .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
          .slice(0, 6),
        loc
      )
    : [];

  const S = getSections(loc);
  const fYear = festival.startDate ? festival.startDate.slice(0, 4) : null;

  const ty = typeTheme(festival.type);
  const typeLabel = getTypeLabel(festival.type || "festival", loc);
  const seasonBadge = getSeasonBadge(festival);
  const seasonLabel = seasonBadge ? seasonBadgeLabel(seasonBadge, getSeasonText(loc)) : null;
  const theme = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const statusLabel =
    status.key === "upcoming" ? status.label : dict.status[status.key];
  const sourceLabel = festival.source
    ? SOURCE[festival.source]?.[loc] || SOURCE[festival.source]?.en
    : null;
  const homeHref = localeHref(loc, "/");

  // ── Event 구조화 데이터(JSON-LD) — 구글 '이벤트' 리치결과용 ──
  //  데이터가 있는 필드만 포함. 종료 축제도 실제 날짜 그대로. 다국어는 번역된 name/description 사용.
  const eventLd = festival.startDate
    ? (() => {
        // 장소명: 행사장소(코엑스 등)가 있으면 우선, 없으면 지역명
        const placeName =
          festival.eventplace ||
          [dict.regions[festival.region] || festival.sido, festival.sigungu]
            .filter(Boolean)
            .join(" ") ||
          festival.name;
        const ld = {
          "@context": "https://schema.org",
          "@type": TYPE_SCHEMA[festival.type] || "Event",
          name: festival.name,
          startDate: festival.startDate,
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: { "@type": "Place", name: placeName },
          url: `${SITE_URL}${localeHref(loc, `/festival/${id}`)}`,
        };
        if (festival.endDate) ld.endDate = festival.endDate;
        if (festival.addr) ld.location.address = festival.addr;
        if (Number.isFinite(festival.lat) && Number.isFinite(festival.lng)) {
          ld.location.geo = {
            "@type": "GeoCoordinates",
            latitude: festival.lat,
            longitude: festival.lng,
          };
        }
        if (festival.image) ld.image = [festival.image];
        const desc = (festival.description || "").trim();
        if (desc) ld.description = desc.length > 500 ? desc.slice(0, 500) : desc;
        const org = submitted && submitted.fields && submitted.fields.organizer;
        if (org) ld.organizer = { "@type": "Organization", name: org };
        return ld;
      })()
    : null;

  return (
    <div style={{ "--accent": theme.color, "--accent-soft": theme.soft }}>
      {eventLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventLd) }}
        />
      )}
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
            <div className="detail-hero-badges">
              <span
                className={`badge ${status.key}${status.soon ? " soon" : ""}`}
                suppressHydrationWarning
              >
                {status.key === "ongoing" && <span className="live-dot" />}
                {statusLabel}
              </span>
              <span className="badge type-badge-inline" style={{ background: ty.color }}>
                {ty.emoji} {typeLabel}
              </span>
              {(festival.tags || []).map((k) =>
                TAG_DEFS[k] ? (
                  <span key={k} className="badge tag-badge-inline">
                    {TAG_DEFS[k].emoji} {getTagLabel(k, loc)}
                  </span>
                ) : null
              )}
              {seasonLabel && (
                <span className={`badge season-badge-inline ${seasonBadge.kind} ${seasonBadge.phase}`}>
                  {seasonLabel}
                </span>
              )}
            </div>
            <h1>
              {theme.emoji} {festival.name}
            </h1>
            <p className="detail-period">
              📅 {formatPeriod(festival.startDate, festival.endDate)}
            </p>
            <p className="detail-place">
              📍 {festival.sido} {festival.sigungu}
              {festival.eventplace ? ` · ${festival.eventplace}` : ""}
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
              {/* 소개 */}
              {festival.description && (
                <section className="section">
                  <h2>{dict.detail.about}</h2>
                  <p className="desc">{festival.description}</p>
                </section>
              )}

              {/* 영상으로 미리 보는 축제 — 유튜브 쇼츠(지연 로딩) + 인스타/틱톡 바로가기.
                  유튜브 실패·한도초과·키없음이면 영상 목록만 조용히 숨고 페이지는 정상.
                  제목·버튼 문구는 컴포넌트 내부에서 다국어 처리됨. */}
              <VideoSection
                query={festival.nameKo || festival.name}
                region={festival.sigungu}
                curatedVideos={curated && curated.videos}
                accent={theme.color}
              />

              {/* 방문자 블로그 후기 (소개 바로 아래). 블로그는 클라이언트에서
                  스켈레톤 → 로드되므로 정보 탭 표시를 늦추지 않음. 실패 시 안내 문구. */}
              <section className="section">
                <h2>{dict.detail.blog}</h2>
                <BlogList query={festival.nameKo || festival.name} accent={theme.color} />
              </section>

              {/* 핵심 요약 바 */}
              <SummaryBar festival={festival} extras={extras} loc={loc} />

              {/* 주최측/방문자 제공 정보 (게시된 등록·제보 자동 반영) */}
              <SubmittedInfo data={submitted} />

              {/* 타임테이블 · 라인업 (큐레이션) */}
              <CuratedSections curated={curated} only="top" festivalYear={fYear} />

              {/* 프로그램 (API) */}
              <ProgramSection text={extras.program} loc={loc} />

              {/* 셔틀 · 주차 (큐레이션) */}
              <CuratedSections curated={curated} only="mid" festivalYear={fYear} />

              {/* 오시는 길 · 위치 (좌표가 있는 축제만) */}
              {!isSubmitted && (
                <>
                  <section className="section">
                    <h2>{dict.detail.directions}</h2>
                    <MapDirections
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
              )}

              {/* 먹거리 (큐레이션) */}
              <CuratedSections curated={curated} only="food" festivalYear={fYear} />

              {/* 주변 숙소 · 맛집 · 관광지 (API) */}
              <NearbyList title={S.titles.stay} icon="🏨" items={extras.stay} loc={loc} festivalId={festival.id} />
              <NearbyList title={S.titles.restaurants} icon="🍽️" items={extras.restaurants} loc={loc} festivalId={festival.id} />
              <NearbyList title={S.titles.tourSpots} icon="🏞️" items={extras.tourSpots} loc={loc} festivalId={festival.id} />

              {/* 주변 캠핑장 (API) */}
              <CampingList items={extras.camping} loc={loc} />

              {/* 무장애 · 반려동물 (API) */}
              <BarrierFree data={extras.barrierFree} loc={loc} />
              <PetInfo data={extras.pet} loc={loc} />

              {/* 현장 시설 · 꿀팁 (큐레이션) */}
              <CuratedSections curated={curated} only="bottom" festivalYear={fYear} />

              {/* 외국인 방문객 안내 (큐레이션) */}
              <CuratedSections curated={curated} only="foreigner" festivalYear={fYear} />

              {/* 이용 안내 (API) */}
              <UsageSection items={extras.usage} loc={loc} />

              {/* 공식 홈페이지 (API) */}
              <HomepageSection url={extras.homepage} loc={loc} />
            </>
          }
          weatherPanel={
            isSubmitted ? null : (
              <section className="section">
                <h2>{dict.detail.weather}</h2>
                <WeatherPanel
                  lat={festival.lat}
                  lng={festival.lng}
                  place={`${festival.sido} ${festival.sigungu}`}
                />
              </section>
            )
          }
          reviewsPanel={
            <section className="section">
              <h2>{dict.detail.reviews}</h2>
              <Reviews festivalId={festival.id} />
            </section>
          }
        />

        {/* 같은 장소(전시장)의 다른 행사 — 코엑스·벡스코 등 한 장소 여러 행사 동선 */}
        {sameVenue.length > 0 && (
          <RelatedFestivals items={sameVenue} title={SAME_VENUE[loc] || SAME_VENUE.en} />
        )}

        {/* 페이지 맨 아래 추천 — 다음 축제로 자연스럽게 이어지는 동선 */}
        <RelatedFestivals items={related} />
      </main>

      {/* 최근 본 축제에 조용히 기록(회원가입 없이, 브라우저 저장) */}
      <RecordView
        festival={{
          id: festival.id,
          name: festival.name,
          image: festival.image,
          startDate: festival.startDate,
          endDate: festival.endDate,
          sido: festival.sido,
          sigungu: festival.sigungu,
          season: festival.season,
          region: festival.region,
          source: festival.source,
          type: festival.type,
        }}
      />

      <footer className="site-footer">
        <div className="container">
          <BrandTagline />
          {dict.footer} · <PrivacyLink />
        </div>
      </footer>
    </div>
  );
}

// 상세 페이지는 방문 시점에 만들고 하루 동안 캐시(ISR)합니다.
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}
