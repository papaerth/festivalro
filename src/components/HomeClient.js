"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { SEASONS, SEASON_ORDER, REGIONS, REGION_ORDER } from "@/lib/seasons";
import { getStatusInfo, STATUS_ORDER } from "@/lib/format";
import { useFavorites } from "@/lib/useFavorites";
import { useReviewStats } from "@/lib/useReviewStats";
import { useI18n } from "@/lib/I18nProvider";
import FestivalCard from "./FestivalCard";
import FavoriteAlerts from "./FavoriteAlerts";
import AccountMenu from "./AccountMenu";
import LangSwitcher from "./LangSwitcher";

// 지도는 브라우저에서만 그려질 수 있어 ssr:false 로 불러옵니다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="skeleton skel-map" />,
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
  const [showFavorites, setShowFavorites] = useState(false);
  const theme = SEASONS[season];

  const { favorites, ready: favReady } = useFavorites();
  const ratings = useReviewStats();
  const { t } = useI18n();
  const periodLabel = period === "weekend" ? t.filters.weekend : t.filters.month;

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 우선순위: 검색 > 기간(주말/이번달) > 즐겨찾기 > 계절+지역
  // 앞의 모드들에서는 계절/지역을 무시하고 전국에서 찾습니다.
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
    if (showFavorites) {
      return festivals.filter((f) => favorites.includes(f.id));
    }
    return festivals
      .filter((f) => f.season === season)
      .filter((f) => (region === "all" ? true : f.region === region));
  }, [festivals, season, region, q, searching, period, showFavorites, favorites]);

  // 기간 바로가기 토글 (다시 누르면 해제). 다른 모드와는 상호배타적.
  const togglePeriod = (key) => {
    setPeriod((prev) => (prev === key ? null : key));
    setQuery("");
    setShowFavorites(false);
  };

  // 즐겨찾기만 보기 토글
  const toggleFavorites = () => {
    setShowFavorites((prev) => !prev);
    setQuery("");
    setPeriod(null);
  };

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

  // 목록은 한 번에 일부만 그려 성능 유지 ("더 보기"로 확장)
  const PAGE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [season, region, q, period, showFavorites, statusFilter]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <div
      className="season-root"
      style={{ "--accent": theme.color, "--accent-soft": theme.soft }}
    >
      <header className="site-header">
        <div className="container">
          <span className="brand">축제로</span>
          <div className="header-right">
            <LangSwitcher />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>
            {t.hero.titleA}
            <br />
            <span className="accent">{theme.emoji} {t.seasons[season]}</span>{" "}
            {t.hero.titleB}
          </h1>
          <p>{t.hero.subtitle}</p>

          {/* 검색창 (히어로 안에 통합) */}
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              className="search-input"
              placeholder={t.hero.searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim()) {
                  setPeriod(null);
                  setShowFavorites(false);
                }
              }}
              aria-label={t.hero.searchPlaceholder}
            />
            {searching && (
              <button
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="✕"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* 기간 바로가기 */}
        <div className="quick-filters">
          <button
            className={`quick-chip ${period === "weekend" ? "active" : ""}`}
            onClick={() => togglePeriod("weekend")}
          >
            {t.filters.weekend}
          </button>
          <button
            className={`quick-chip ${period === "month" ? "active" : ""}`}
            onClick={() => togglePeriod("month")}
          >
            {t.filters.month}
          </button>
          <button
            className={`quick-chip ${showFavorites ? "active" : ""}`}
            onClick={toggleFavorites}
            suppressHydrationWarning
          >
            ❤️ {t.filters.favorites}
            {favReady && favorites.length > 0 ? ` ${favorites.length}` : ""}
          </button>
        </div>

        {/* 즐겨찾기한 축제 중 곧 시작/진행중 알림 */}
        <FavoriteAlerts festivals={festivals} />

        {searching ? (
          /* 검색 중: 계절/지역 선택 대신 검색 결과 안내 */
          <div className="search-result-head">
            {t.list.searchResult(query.trim(), base.length)}
          </div>
        ) : period ? (
          /* 기간 바로가기: 계절/지역 대신 기간 결과 안내 */
          <div className="search-result-head">
            {t.list.periodResult(periodLabel, base.length)}
          </div>
        ) : showFavorites ? (
          /* 즐겨찾기: 계절/지역 대신 안내 */
          <div className="search-result-head" suppressHydrationWarning>
            {t.list.favResult(base.length)}
          </div>
        ) : (
          <>
            {/* 계절 선택 */}
            <div className="filter-group">
              <div className="filter-label">{t.filters.season}</div>
              <div className="chip-row">
                {SEASON_ORDER.map((key) => {
                  const s = SEASONS[key];
                  return (
                    <button
                      key={key}
                      className={`chip ${season === key ? "active" : ""}`}
                      onClick={() => setSeason(key)}
                    >
                      {s.emoji} {t.seasons[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 지역 선택 */}
            <div className="filter-group">
              <div className="filter-label">{t.filters.region}</div>
              <div className="chip-row">
                {REGION_ORDER.map((key) => (
                  <button
                    key={key}
                    className={`chip ${region === key ? "active" : ""}`}
                    onClick={() => setRegion(key)}
                  >
                    {t.regions[key]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 지도 */}
        <MapView festivals={filtered} ratings={ratings} />

        {/* 상태별 개수 요약 (누르면 해당 상태만 필터) */}
        <div className="status-summary" suppressHydrationWarning>
          <button
            className={`status-pill ongoing ${statusFilter === "ongoing" ? "active" : ""}`}
            onClick={() => toggleStatus("ongoing")}
            disabled={counts.ongoing === 0}
          >
            <span className="live-dot" />
            {t.status.ongoingShort} {counts.ongoing}
          </button>
          <span className="status-sep">·</span>
          <button
            className={`status-pill upcoming ${statusFilter === "upcoming" ? "active" : ""}`}
            onClick={() => toggleStatus("upcoming")}
            disabled={counts.upcoming === 0}
          >
            {t.status.upcoming} {counts.upcoming}
          </button>
          <span className="status-sep">·</span>
          <button
            className={`status-pill ended ${statusFilter === "ended" ? "active" : ""}`}
            onClick={() => toggleStatus("ended")}
            disabled={counts.ended === 0}
          >
            {t.status.ended} {counts.ended}
          </button>
          {statusFilter && (
            <button className="status-clear" onClick={() => setStatusFilter(null)}>
              {t.filters.clearAll}
            </button>
          )}
        </div>

        {/* 카드 목록 */}
        <div className="card-grid">
          {filtered.length === 0 ? (
            <div className="empty">
              {searching
                ? t.list.emptySearch
                : period
                ? t.list.emptyPeriod
                : showFavorites
                ? t.list.emptyFav
                : t.list.emptyDefault}
            </div>
          ) : (
            visible.map((f) => (
              <FestivalCard key={f.id} festival={f} rating={ratings[f.id]} />
            ))
          )}
        </div>

        {filtered.length > visibleCount && (
          <button
            className="load-more"
            onClick={() => setVisibleCount((c) => c + PAGE)}
          >
            {t.list.loadMore}{" "}
            <span>{t.list.remain(filtered.length - visibleCount)}</span>
          </button>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">{t.footer}</div>
      </footer>
    </div>
  );
}
