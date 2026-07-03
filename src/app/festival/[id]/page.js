import Link from "next/link";
import { notFound } from "next/navigation";
import { getFestivalById } from "@/lib/festivals";
import { SEASONS, REGIONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import WeatherPanel from "@/components/WeatherPanel";
import DirectionsButton from "@/components/DirectionsButton";
import DetailMap from "@/components/DetailMap";
import DetailTabs from "@/components/DetailTabs";
import BlogList from "@/components/BlogList";
import CoverImage from "@/components/CoverImage";
import ShareButton from "@/components/ShareButton";
import FavoriteButton from "@/components/FavoriteButton";

// 축제 상세 화면 (서버에서 데이터를 불러온 뒤 렌더링)
export default async function FestivalDetailPage({ params }) {
  const { id } = await params;
  const festival = await getFestivalById(id);

  if (!festival) {
    notFound();
  }

  const theme = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const regionName = REGIONS[festival.region] || "";

  return (
    <div style={{ "--accent": theme.color, "--accent-soft": theme.soft }}>
      <header className="site-header">
        <div className="container">
          <Link href="/" className="brand">
            축제로
          </Link>
          <span className="brand-sub">전국 사계절 축제 지도</span>
        </div>
      </header>

      <main className="container">
        <Link href="/" className="back-link">
          ← 전체 축제 목록으로
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
              {status.label}
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

        {/* 즐겨찾기 + 공유 */}
        <div className="detail-actions">
          <FavoriteButton id={festival.id} variant="labeled" />
          <ShareButton title={festival.name} />
        </div>

        {/* 탭: 정보 / 날씨 / 블로그 */}
        <DetailTabs
          infoPanel={
            <>
              <section className="section">
                <h2>🎪 축제 소개</h2>
                <p className="desc">{festival.description}</p>
              </section>

              <section className="section">
                <h2>🧭 길찾기</h2>
                <DirectionsButton
                  name={festival.name}
                  lat={festival.lat}
                  lng={festival.lng}
                />
              </section>

              <section className="section">
                <h2>🗺️ 축제 위치</h2>
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
              <h2>🌤️ 오늘부터 3일 날씨</h2>
              <WeatherPanel
                lat={festival.lat}
                lng={festival.lng}
                place={`${festival.sido} ${festival.sigungu}`}
              />
            </section>
          }
          blogPanel={
            <section className="section">
              <h2>📝 블로그 후기</h2>
              <BlogList query={festival.name} accent={theme.color} />
            </section>
          }
        />
      </main>

      <footer className="site-footer">
        <div className="container">
          축제로 · 지도 © OpenStreetMap · 날씨 © Open-Meteo
        </div>
      </footer>
    </div>
  );
}

// 상세 페이지는 방문 시점에 만들고 하루 동안 캐시(ISR)합니다.
// (실데이터 연동 시 빌드 때 수백 개 소개문을 미리 호출하지 않도록)
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}
