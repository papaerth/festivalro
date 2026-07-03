import Link from "next/link";
import { notFound } from "next/navigation";
import { getFestivalById, getFestivals } from "@/lib/festivals";
import { SEASONS, REGIONS } from "@/lib/seasons";
import { formatPeriod, getStatus } from "@/lib/format";
import WeatherPanel from "@/components/WeatherPanel";
import DirectionsButton from "@/components/DirectionsButton";
import DetailMap from "@/components/DetailMap";

// 축제 상세 화면 (서버에서 데이터를 불러온 뒤 렌더링)
export default async function FestivalDetailPage({ params }) {
  const { id } = await params;
  const festival = await getFestivalById(id);

  if (!festival) {
    notFound();
  }

  const theme = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatus(festival.startDate, festival.endDate);
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

        {/* 상단 소개 */}
        <section
          className="detail-hero"
          style={{
            background: `linear-gradient(135deg, ${theme.color}, ${theme.color}cc)`,
          }}
        >
          <span className={`badge ${status.key}`}>{status.label}</span>
          <h1>
            {theme.emoji} {festival.name}
          </h1>
          <p className="detail-period">
            📅 {formatPeriod(festival.startDate, festival.endDate)}
          </p>
          <p className="detail-place">
            📍 {festival.sido} {festival.sigungu}
          </p>
        </section>

        {/* 축제 소개 */}
        <section className="section">
          <h2>🎪 축제 소개</h2>
          <p className="desc">{festival.description}</p>
        </section>

        {/* 날씨 */}
        <section className="section">
          <h2>🌤️ 오늘부터 3일 날씨</h2>
          <WeatherPanel
            lat={festival.lat}
            lng={festival.lng}
            place={`${festival.sido} ${festival.sigungu}`}
          />
        </section>

        {/* 길찾기 */}
        <section className="section">
          <h2>🧭 길찾기</h2>
          <DirectionsButton
            name={festival.name}
            lat={festival.lat}
            lng={festival.lng}
          />
        </section>

        {/* 미니 지도 */}
        <section className="section">
          <h2>🗺️ 축제 위치</h2>
          <DetailMap
            lat={festival.lat}
            lng={festival.lng}
            name={festival.name}
            color={theme.color}
          />
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          축제로 · 지도 © OpenStreetMap · 날씨 © Open-Meteo
        </div>
      </footer>
    </div>
  );
}

// 샘플 데이터의 축제들은 미리 정적 페이지로 만들어 둡니다(더 빠른 로딩).
export async function generateStaticParams() {
  const festivals = await getFestivals();
  return festivals.map((f) => ({ id: f.id }));
}
