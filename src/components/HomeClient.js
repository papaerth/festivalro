"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { SEASONS, SEASON_ORDER } from "@/lib/seasons";
import { getStatusInfo, STATUS_ORDER } from "@/lib/format";
import { SIDO_ORDER, matchSido } from "@/lib/regionsKr";
import { useFavorites } from "@/lib/useFavorites";
import { useReviewStats } from "@/lib/useReviewStats";
import { useI18n } from "@/lib/I18nProvider";
import { getSidoLabel } from "@/lib/i18n";
import FestivalCard from "./FestivalCard";
import FavoriteAlerts from "./FavoriteAlerts";
import AccountMenu from "./AccountMenu";
import LangSwitcher from "./LangSwitcher";
import HeroCarousel from "./HeroCarousel";
import HomeBlogSection from "./HomeBlogSection";
import HomeVideoSection from "./HomeVideoSection";
import RecentViewed from "./RecentViewed";
import PrivacyLink from "./PrivacyLink";
import ReportLink from "./ReportLink";
import BrandLogo from "./BrandLogo";

// 상단 배지 문구 (13개 언어). today=오늘 진행중 / week=이번 주 진행 축제(작은 숫자 방지용)
const TODAY = {
  ko: { today: (n) => `오늘 진행중 ${n}개 · 지금 바로 보기`, week: (n) => `이번 주 진행 축제 ${n}개 · 지금 보기` },
  en: { today: (n) => `${n} happening today · see now`, week: (n) => `${n} festivals this week · see now` },
  ja: { today: (n) => `本日開催中 ${n}件 · 今すぐ見る`, week: (n) => `今週のお祭り ${n}件 · 見る` },
  zh: { today: (n) => `今日进行中 ${n}个 · 立即查看`, week: (n) => `本周庆典 ${n}个 · 查看` },
  "zh-TW": { today: (n) => `今日進行中 ${n}個 · 立即查看`, week: (n) => `本週慶典 ${n}個 · 查看` },
  es: { today: (n) => `${n} hoy · ver ahora`, week: (n) => `${n} esta semana · ver` },
  fr: { today: (n) => `${n} aujourd'hui · voir`, week: (n) => `${n} cette semaine · voir` },
  ru: { today: (n) => `Сегодня: ${n} · смотреть`, week: (n) => `На неделе: ${n} · смотреть` },
  de: { today: (n) => `Heute ${n} live · ansehen`, week: (n) => `Diese Woche ${n} · ansehen` },
  ar: { today: (n) => `${n} اليوم · شاهد الآن`, week: (n) => `${n} هذا الأسبوع · شاهد` },
  vi: { today: (n) => `${n} hôm nay · xem ngay`, week: (n) => `${n} tuần này · xem` },
  id: { today: (n) => `${n} hari ini · lihat`, week: (n) => `${n} minggu ini · lihat` },
  th: { today: (n) => `วันนี้ ${n} · ดูเลย`, week: (n) => `สัปดาห์นี้ ${n} · ดู` },
};

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

export default function HomeClient({ festivals, usingSample, popScoreById = {} }) {
  const [season, setSeason] = useState(currentSeason());
  const [sido, setSido] = useState(null); // null = 전체(전국)
  const [sigungu, setSigungu] = useState(null); // null = 시도 전체
  const [statusFilter, setStatusFilter] = useState(null); // null=전체
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState(null); // null | "weekend" | "month"
  const [showFavorites, setShowFavorites] = useState(false);
  const [mapFocus, setMapFocus] = useState(null); // 카드/마커에서 고른 축제 위치
  const [selected, setSelected] = useState(null); // 블로그·영상 섹션 연동 대상(축제) — null=인기축제 종합
  const [flashSignal, setFlashSignal] = useState(0); // 선택 시마다 +1 → 섹션 하이라이트
  const theme = SEASONS[season];
  const mapRef = useRef(null); // 카드/필터 조작 시 스크롤할 지도 영역

  const { favorites, ready: favReady } = useFavorites();
  const ratings = useReviewStats();
  const { t, locale } = useI18n();

  // 축제마다 시도 key(_sido)를 한 번만 계산해 필터를 가볍게 유지
  const withSido = useMemo(
    () => festivals.map((f) => ({ ...f, _sido: matchSido(f.sido || "") })),
    [festivals]
  );

  // 지도 영역으로 부드럽게 스크롤 (필터가 아래로 내려가서, 조작 시 변화가 보이게)
  const scrollToMap = () => {
    if (mapRef.current) {
      mapRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // 블로그·영상 섹션 연동 대상 지정 / 해제
  const selectFestival = (f) => {
    setSelected(f);
    setFlashSignal((n) => n + 1);
  };
  const resetSelection = () => {
    setSelected(null);
    setFlashSignal((n) => n + 1);
  };

  // 카드뉴스 클릭 → 지도 줌인 + 아래 섹션 전환 + (모바일이면) 지도로 스크롤
  const handleHeroPick = (f) => {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      setMapFocus({ id: f.id, lat: f.lat, lng: f.lng, ts: Date.now() });
    }
    selectFestival(f);
    // 지도가 이미 화면에 보이면(PC 좌우 배치) 스크롤하지 않음.
    const el = mapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const visible =
        r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15;
      if (!visible) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // 지도 마커 클릭 → 그 축제로 줌인 + 아래 섹션 전환
  const handleMapSelect = (f) => {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      setMapFocus({ id: f.id, lat: f.lat, lng: f.lng, ts: Date.now() });
    }
    selectFestival(f);
  };

  // 오늘(현재 계절) 진행중인 축제 수 — 상단 배지용
  const todayOngoing = useMemo(() => {
    const now = new Date();
    const cs = currentSeason();
    return withSido.filter(
      (f) =>
        f.season === cs && getStatusInfo(f.startDate, f.endDate, now).key === "ongoing"
    ).length;
  }, [withSido]);

  // 이번 주말에 열리는(겹치는) 축제 수 — 진행중이 적을 때 배지 대체용
  const weekendCount = useMemo(() => {
    const [rs, re] = weekendRange();
    return withSido.filter((f) => overlaps(f.startDate, f.endDate, rs, re)).length;
  }, [withSido]);

  // 배지 클릭 → 진행중만 보기 (현재 계절, 전국). 결과가 있는 지도/목록으로 스크롤.
  const showOngoing = () => {
    setQuery("");
    setPeriod(null);
    setShowFavorites(false);
    setSido(null);
    setSigungu(null);
    setSeason(currentSeason());
    setStatusFilter("ongoing");
    scrollToMap();
  };

  // 배지 클릭 → 이번 주말 축제 보기
  const showThisWeek = () => {
    setQuery("");
    setShowFavorites(false);
    setStatusFilter(null);
    setSido(null);
    setSigungu(null);
    setPeriod("weekend");
    scrollToMap();
  };

  // 상단 배지: 진행중 3개 이상이면 '오늘 진행중', 그 미만이면 '이번 주 진행 축제'
  const badgeT = TODAY[locale] || TODAY.ko;
  const badge =
    todayOngoing >= 3
      ? { text: badgeT.today(todayOngoing), onClick: showOngoing }
      : weekendCount >= 1
      ? { text: badgeT.week(weekendCount), onClick: showThisWeek }
      : todayOngoing >= 1
      ? { text: badgeT.today(todayOngoing), onClick: showOngoing }
      : null;

  // 시도를 바꾸면 시군구 선택 초기화 + 지도로 스크롤
  const pickSido = (key) => {
    setSido((prev) => (prev === key ? null : key));
    setSigungu(null);
    scrollToMap();
  };
  const periodLabel = period === "weekend" ? t.filters.weekend : t.filters.month;

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 우선순위: 검색 > 기간(주말/이번달) > 즐겨찾기 > 계절+지역
  const base = useMemo(() => {
    if (searching) {
      return withSido.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.displayName || "").toLowerCase().includes(q) ||
          (f.sido || "").toLowerCase().includes(q) ||
          (f.sigungu || "").toLowerCase().includes(q)
      );
    }
    if (period) {
      const [rs, re] = period === "weekend" ? weekendRange() : monthRange();
      return withSido.filter((f) => overlaps(f.startDate, f.endDate, rs, re));
    }
    if (showFavorites) {
      return withSido.filter((f) => favorites.includes(f.id));
    }
    return withSido
      .filter((f) => f.season === season)
      .filter((f) => (sido ? f._sido === sido : true))
      .filter((f) => (sigungu ? f.sigungu === sigungu : true));
  }, [withSido, season, sido, sigungu, q, searching, period, showFavorites, favorites]);

  // 현재 선택한 시도의 시군구 목록(실제 축제가 있는 곳만) — 2단계 칩
  const sigunguList = useMemo(() => {
    if (!sido) return [];
    const set = new Set();
    withSido.forEach((f) => {
      if (f._sido === sido && f.sigungu) set.add(f.sigungu);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [withSido, sido]);

  // 히어로 캐러셀: 현재 계절/시도/시군구 필터에 맞는 '다가오는 인기 축제' 상위 10개
  const carousel = useMemo(() => {
    const now = new Date();
    const scored = withSido
      .filter((f) => f.season === season)
      .filter((f) => (sido ? f._sido === sido : true))
      .filter((f) => (sigungu ? f.sigungu === sigungu : true))
      .map((f) => ({ f, st: getStatusInfo(f.startDate, f.endDate, now) }))
      .filter((x) => x.st.key !== "ended")
      .map(({ f, st }) => {
        const ongoing = st.key === "ongoing";
        const dday = ongoing ? 0 : st.dday;
        const cheap =
          (f.image ? 2 : 0) +
          (f.source === "tour" ? 1 : 0) +
          (ongoing ? 3 : Math.max(0, (90 - dday) / 90) * 2);
        const recency = ongoing ? 1 : Math.max(0, (30 - dday) / 30);
        return { f, score: (popScoreById[f.id] ?? cheap) + recency };
      });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map((x) => x.f);
  }, [withSido, season, sido, sigungu, popScoreById]);

  // 블로그·영상 종합용 '메인 축제 후보' — 필터와 무관하게 전국 인기+임박 순 상위.
  const mainShorts = useMemo(() => {
    const now = new Date();
    const scored = withSido
      .map((f) => ({ f, st: getStatusInfo(f.startDate, f.endDate, now) }))
      .filter((x) => x.st.key === "ongoing" || x.st.key === "upcoming")
      .map(({ f, st }) => {
        const ongoing = st.key === "ongoing";
        const dday = ongoing ? 0 : st.dday;
        const cheap =
          (f.image ? 2 : 0) +
          (f.source === "tour" ? 1 : 0) +
          (ongoing ? 3 : Math.max(0, (90 - dday) / 90) * 2);
        const recency = ongoing ? 1 : Math.max(0, (30 - dday) / 30);
        return { f, score: (popScoreById[f.id] ?? cheap) + recency };
      });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map((x) => x.f);
  }, [withSido, popScoreById]);

  // 기간 바로가기 토글 (다시 누르면 해제). 다른 모드와는 상호배타적.
  const togglePeriod = (key) => {
    setPeriod((prev) => (prev === key ? null : key));
    setQuery("");
    setShowFavorites(false);
    scrollToMap();
  };

  // 즐겨찾기만 보기 토글
  const toggleFavorites = () => {
    setShowFavorites((prev) => !prev);
    setQuery("");
    setPeriod(null);
    scrollToMap();
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
  }, [season, sido, sigungu, q, period, showFavorites, statusFilter]);
  const visible = filtered.slice(0, visibleCount);

  // 블로그·영상 섹션 소스: 선택 축제가 있으면 그 축제, 없으면 인기축제 종합
  const feedSource = selected ? [selected] : mainShorts;
  const selName = selected ? selected.displayName || selected.name : null;

  return (
    <div
      className="season-root"
      style={{ "--accent": theme.color, "--accent-soft": theme.soft }}
    >
      <header className="site-header">
        <div className="container container-wide">
          <BrandLogo />
          <div className="header-right">
            <LangSwitcher />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="home-main">
        {/* ① 다가오는 인기 축제 카드뉴스 + 세로 지도 (최상단) */}
        <div className="carousel-map-row">
          <div className="cmr-carousel">
            <HeroCarousel festivals={carousel} onPick={handleHeroPick} />
          </div>
          <div className="cmr-map" ref={mapRef}>
            <MapView
              festivals={filtered}
              ratings={ratings}
              focus={mapFocus}
              onSelect={handleMapSelect}
            />
          </div>
        </div>

        {/* 즐겨찾기 알림 — 얇은 배너 (즐겨찾기 있을 때만) */}
        <FavoriteAlerts festivals={festivals} />

        {/* ② 축제 목록 — 상태 요약(=필터) + 카드 그리드 */}
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

        {/* ③ 검색 · 필터 묶음 (한 구역) */}
        <section className="filters-block">
          <div className="hero">
            <h1>
              {t.hero.titleA}{" "}
              <span className="accent">{theme.emoji} {t.seasons[season]}</span>{" "}
              {t.hero.titleB}
            </h1>

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

            {badge && (
              <button
                className="today-badge"
                onClick={badge.onClick}
                suppressHydrationWarning
              >
                <span className="today-dot" aria-hidden="true" />
                {badge.text}
                <span className="today-arrow" aria-hidden="true"> →</span>
              </button>
            )}
          </div>

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

          {searching ? (
            <div className="search-result-head">
              {t.list.searchResult(query.trim(), base.length)}
            </div>
          ) : period ? (
            <div className="search-result-head">
              {t.list.periodResult(periodLabel, base.length)}
            </div>
          ) : showFavorites ? (
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
                        onClick={() => {
                          setSeason(key);
                          scrollToMap();
                        }}
                      >
                        {s.emoji} {t.seasons[key]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 지역 선택 — 1단계: 시도 */}
              <div className="filter-group">
                <div className="filter-label">{t.filters.region}</div>
                <div className="chip-row">
                  <button
                    className={`chip ${sido === null ? "active" : ""}`}
                    onClick={() => {
                      setSido(null);
                      setSigungu(null);
                      scrollToMap();
                    }}
                  >
                    {t.regions.all}
                  </button>
                  {SIDO_ORDER.map((key) => (
                    <button
                      key={key}
                      className={`chip ${sido === key ? "active" : ""}`}
                      onClick={() => pickSido(key)}
                    >
                      {getSidoLabel(key, locale)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 지역 선택 — 2단계: 시군구 (시도 선택 시 펼쳐짐) */}
              {sido && sigunguList.length > 0 && (
                <div className="filter-group filter-sigungu">
                  <div className="chip-row">
                    <button
                      className={`chip chip-sm ${sigungu === null ? "active" : ""}`}
                      onClick={() => setSigungu(null)}
                    >
                      {t.regions.all}
                    </button>
                    {sigunguList.map((sg) => (
                      <button
                        key={sg}
                        className={`chip chip-sm ${sigungu === sg ? "active" : ""}`}
                        onClick={() => {
                          setSigungu((prev) => (prev === sg ? null : sg));
                          scrollToMap();
                        }}
                      >
                        {sg}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ④ 지금 뜨는 축제 블로그 (신규) */}
        <HomeBlogSection
          festivals={feedSource}
          selectedName={selName}
          onReset={resetSelection}
          flashSignal={flashSignal}
          accent={theme.color}
        />

        {/* ⑤ 영상으로 만나는 축제 (유튜브 롱폼) */}
        <HomeVideoSection
          festivals={feedSource}
          selectedName={selName}
          onReset={resetSelection}
          flashSignal={flashSignal}
          accent={theme.color}
        />

        {/* 최근 본 축제 — 이어보기 동선 (브라우저 기록, 회원가입 X) */}
        <RecentViewed />
      </main>

      <footer className="site-footer">
        <div className="container">
          {t.footer} · <PrivacyLink /> · <ReportLink />
        </div>
      </footer>
    </div>
  );
}
