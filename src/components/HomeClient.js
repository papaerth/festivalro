"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SEASONS, SEASON_ORDER, REGIONS, REGION_ORDER } from "@/lib/seasons";
import { getStatusInfo, STATUS_ORDER } from "@/lib/format";
import FestivalCard from "./FestivalCard";

// 지도는 브라우저에서만 그려질 수 있어 ssr:false 로 불러옵니다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading">지도를 불러오는 중…</div>,
});

// 오늘 날짜로 현재 계절을 계산 (첫 화면 기본값)
function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export default function HomeClient({ festivals, usingSample }) {
  const [season, setSeason] = useState(currentSeason());
  const [region, setRegion] = useState("all");
  const [statusFilter, setStatusFilter] = useState(null); // null=전체
  const theme = SEASONS[season];

  // 계절 + 지역으로 먼저 거른 목록 (상태 요약 개수의 기준)
  const base = useMemo(() => {
    return festivals
      .filter((f) => f.season === season)
      .filter((f) => (region === "all" ? true : f.region === region));
  }, [festivals, season, region]);

  // 상태별 개수 요약 (진행중 / 예정 / 종료)
  const counts = useMemo(() => {
    const c = { ongoing: 0, upcoming: 0, ended: 0 };
    base.forEach((f) => {
      c[getStatusInfo(f.startDate, f.endDate).key]++;
    });
    return c;
  }, [base]);

  // 상태 필터 적용 후, 진행중 → 예정 → 종료 순(종료는 맨 뒤)으로 정렬
  const filtered = useMemo(() => {
    const list = statusFilter
      ? base.filter((f) => getStatusInfo(f.startDate, f.endDate).key === statusFilter)
      : base;
    return [...list].sort((a, b) => {
      const sa = getStatusInfo(a.startDate, a.endDate).key;
      const sb = getStatusInfo(b.startDate, b.endDate).key;
      if (STATUS_ORDER[sa] !== STATUS_ORDER[sb]) {
        return STATUS_ORDER[sa] - STATUS_ORDER[sb];
      }
      return a.startDate.localeCompare(b.startDate);
    });
  }, [base, statusFilter]);

  // 상태 요약 칩 클릭 → 해당 상태만 필터 (다시 누르면 해제)
  const toggleStatus = (key) =>
    setStatusFilter((prev) => (prev === key ? null : key));

  return (
    <div style={{ "--accent": theme.color, "--accent-soft": theme.soft }}>
      <header className="site-header">
        <div className="container">
          <span className="brand">축제로</span>
          <span className="brand-sub">전국 사계절 축제 지도</span>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>
            지금 가장 예쁜 <span className="accent">{theme.emoji} {theme.label}</span> 축제,
            <br />
            지도에서 한눈에 보세요
          </h1>
          <p>계절과 지역을 골라 전국 축제를 찾아보고, 날씨와 길찾기까지 확인하세요.</p>
        </section>

        {/* 계절 선택 */}
        <div className="filter-group">
          <div className="filter-label">계절</div>
          <div className="chip-row">
            {SEASON_ORDER.map((key) => {
              const s = SEASONS[key];
              return (
                <button
                  key={key}
                  className={`chip ${season === key ? "active" : ""}`}
                  onClick={() => setSeason(key)}
                >
                  {s.emoji} {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 지역 선택 */}
        <div className="filter-group">
          <div className="filter-label">지역</div>
          <div className="chip-row">
            {REGION_ORDER.map((key) => (
              <button
                key={key}
                className={`chip ${region === key ? "active" : ""}`}
                onClick={() => setRegion(key)}
              >
                {REGIONS[key]}
              </button>
            ))}
          </div>
        </div>

        {/* 지도 */}
        <MapView festivals={filtered} />

        {/* 상태별 개수 요약 (누르면 해당 상태만 필터) */}
        <div className="status-summary" suppressHydrationWarning>
          <button
            className={`status-pill ongoing ${statusFilter === "ongoing" ? "active" : ""}`}
            onClick={() => toggleStatus("ongoing")}
            disabled={counts.ongoing === 0}
          >
            <span className="live-dot" />
            진행중 {counts.ongoing}
          </button>
          <span className="status-sep">·</span>
          <button
            className={`status-pill upcoming ${statusFilter === "upcoming" ? "active" : ""}`}
            onClick={() => toggleStatus("upcoming")}
            disabled={counts.upcoming === 0}
          >
            예정 {counts.upcoming}
          </button>
          <span className="status-sep">·</span>
          <button
            className={`status-pill ended ${statusFilter === "ended" ? "active" : ""}`}
            onClick={() => toggleStatus("ended")}
            disabled={counts.ended === 0}
          >
            종료 {counts.ended}
          </button>
          {statusFilter && (
            <button className="status-clear" onClick={() => setStatusFilter(null)}>
              전체 보기 ✕
            </button>
          )}
        </div>

        {/* 카드 목록 */}
        <div className="card-grid">
          {filtered.length === 0 ? (
            <div className="empty">
              선택하신 조건에 맞는 축제가 아직 없어요.
              <br />
              다른 계절이나 지역을 선택해 보세요!
            </div>
          ) : (
            filtered.map((f) => <FestivalCard key={f.id} festival={f} />)
          )}
        </div>

        {usingSample && (
          <p className="notice">
            💡 지금은 <b>내장 샘플 축제 데이터</b>로 보고 있어요. 한국관광공사 TourAPI 키를
            등록하면 전국 실시간 축제 정보로 자동 전환됩니다.
          </p>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          축제로 · 지도 © OpenStreetMap · 날씨 © Open-Meteo
          <br />
          축제에 놀러 가려는 모두를 위한 서비스
        </div>
      </footer>
    </div>
  );
}
