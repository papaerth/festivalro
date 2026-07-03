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

// Date → "YYYY-MM-DD"
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 이번 주말(토~일) 범위. 평일이면 다가오는 주말, 주말이면 이번 주말.
function weekendRange(now = new Date()) {
  const dow = now.getDay(); // 0=일 ~ 6=토
  const sat = new Date(now);
  if (dow === 0) sat.setDate(now.getDate() - 1); // 일요일이면 어제(토)가 주말 시작
  else sat.setDate(now.getDate() + (6 - dow)); // 그 외엔 이번 주 토요일로
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [ymd(sat), ymd(sun)];
}

// 이번 달 1일 ~ 말일 범위
function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [ymd(start), ymd(end)];
}

// 축제 기간이 주어진 범위와 겹치는지
function overlaps(startDate, endDate, rangeStart, rangeEnd) {
  return startDate <= rangeEnd && endDate >= rangeStart;
}

export default function HomeClient({ festivals, usingSample }) {
  const [season, setSeason] = useState(currentSeason());
  const [region, setRegion] = useState("all");
  const [statusFilter, setStatusFilter] = useState(null); // null=전체
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState(null); // null | "weekend" | "month"
  const theme = SEASONS[season];

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 우선순위: 검색 > 기간(주말/이번달) > 계절+지역
  // 검색·기간 모드에서는 계절/지역을 무시하고 전국에서 찾습니다.
  const base = useMemo(() => {
    if (searching) {
      return festivals.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.sido || "").toLowerCase().includes(q) ||
          (f.sigungu || "").toLowerCase().includes(q)
      );
    }
    if (period) {
      const [rs, re] = period === "weekend" ? weekendRange() : monthRange();
      return festivals.filter((f) => overlaps(f.startDate, f.endDate, rs, re));
    }
    return festivals
      .filter((f) => f.season === season)
      .filter((f) => (region === "all" ? true : f.region === region));
  }, [festivals, season, region, q, searching, period]);

  // 기간 바로가기 토글 (다시 누르면 해제). 검색과는 상호배타적.
  const togglePeriod = (key) => {
    setPeriod((prev) => (prev === key ? null : key));
    setQuery("");
  };
  const periodLabel = period === "weekend" ? "📅 이번 주말" : "🗓️ 이번 달";

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

        {/* 검색창 */}
        <div className="search-box">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="search-input"
            placeholder="축제 이름·지역으로 검색 (예: 머드, 부산)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) setPeriod(null);
            }}
            aria-label="축제 검색"
          />
          {searching && (
            <button
              className="search-clear"
              onClick={() => setQuery("")}
              aria-label="검색 지우기"
            >
              ✕
            </button>
          )}
        </div>

        {/* 기간 바로가기 */}
        <div className="quick-filters">
          <button
            className={`quick-chip ${period === "weekend" ? "active" : ""}`}
            onClick={() => togglePeriod("weekend")}
          >
            📅 이번 주말
          </button>
          <button
            className={`quick-chip ${period === "month" ? "active" : ""}`}
            onClick={() => togglePeriod("month")}
          >
            🗓️ 이번 달
          </button>
        </div>

        {searching ? (
          /* 검색 중: 계절/지역 선택 대신 검색 결과 안내 */
          <div className="search-result-head">
            🔍 전국에서 <b>“{query.trim()}”</b> 검색 결과 <b>{base.length}</b>곳
          </div>
        ) : period ? (
          /* 기간 바로가기: 계절/지역 대신 기간 결과 안내 */
          <div className="search-result-head">
            {periodLabel}에 열리는 축제 <b>{base.length}</b>곳
          </div>
        ) : (
          <>
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
          </>
        )}

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
              {searching ? (
                <>
                  “{query.trim()}” 검색 결과가 없어요.
                  <br />
                  다른 이름이나 지역으로 검색해 보세요!
                </>
              ) : period ? (
                <>
                  {periodLabel}에 열리는 축제가 없어요.
                  <br />
                  다른 기간이나 계절을 살펴보세요!
                </>
              ) : (
                <>
                  선택하신 조건에 맞는 축제가 아직 없어요.
                  <br />
                  다른 계절이나 지역을 선택해 보세요!
                </>
              )}
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
