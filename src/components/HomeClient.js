"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { SEASONS, TYPES, TYPE_ORDER } from "@/lib/seasons";
import { getStatusInfo, STATUS_ORDER } from "@/lib/format";
import { matchSido } from "@/lib/regionsKr";
import { useFavorites } from "@/lib/useFavorites";
import { useReviewStats } from "@/lib/useReviewStats";
import { useI18n } from "@/lib/I18nProvider";
import { getTypeLabels, getCarouselTabs, getHeroButtonLabel, getTagLabels, getSeasonText } from "@/lib/i18n";
import { getSeasonBanner } from "@/lib/season";
import MapFilters from "./MapFilters";
import FestivalCard from "./FestivalCard";
import FavoriteAlerts from "./FavoriteAlerts";
import AccountMenu from "./AccountMenu";
import LangSwitcher from "./LangSwitcher";
import HeroCarousel from "./HeroCarousel";
import TopSearch from "./TopSearch";
import HomeBlogSection from "./HomeBlogSection";
import HomeVideoSection from "./HomeVideoSection";
import RecentViewed from "./RecentViewed";
import PrivacyLink from "./PrivacyLink";
import ReportLink from "./ReportLink";
import AboutLink from "./AboutLink";
import BrandLogo from "./BrandLogo";
import BrandTagline from "./BrandTagline";

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

// 행사 기간이 특정 '월'(1~12, 연도 무관)에 걸치는지.
//  예: 2026-06-26~2026-08-17 → 6·7·8월 모두 true (두 달에 걸쳐도 양쪽 다 잡힘)
function overlapsMonth(startDate, endDate, month) {
  if (!startDate) return false;
  const [sy, sm] = String(startDate).split("-").map(Number);
  const [ey, em] = String(endDate || startDate).split("-").map(Number);
  if (!sy || !sm) return false;
  const si = sy * 12 + (sm - 1);
  const ei = (ey || sy) * 12 + ((em || sm) - 1);
  if (ei - si >= 11) return true; // 12개월 이상 걸치면 모든 달 포함
  for (let i = si; i <= ei; i++) {
    if ((i % 12) + 1 === month) return true;
  }
  return false;
}

export default function HomeClient({ festivals, usingSample, popScoreById = {} }) {
  const [season, setSeason] = useState(currentSeason());
  const [month, setMonth] = useState(null); // null = 계절 전체 / 1~12 = 그 달에 걸치는 행사만
  const [type, setType] = useState(null); // null = 전체 유형(축제+전시+공연)
  const [tags, setTags] = useState([]); // 세부 태그(불꽃놀이/야간/물놀이) — 다중 선택, 선택한 태그를 '모두' 가진 축제만
  const [sido, setSido] = useState(null); // null = 전체(전국)
  const [sigungu, setSigungu] = useState(null); // null = 시도 전체
  const [statusFilter, setStatusFilter] = useState(null); // null=전체
  const [query, setQuery] = useState(""); // 그리드 텍스트필터(상단 검색 Enter 폴백)
  const [searchText, setSearchText] = useState(""); // 상단 검색바 입력값(자동완성 표시)
  const [period, setPeriod] = useState(null); // null | "weekend" | "month"
  const [showFavorites, setShowFavorites] = useState(false);
  const [mapFocus, setMapFocus] = useState(null); // 카드/마커에서 고른 축제 위치
  const [popupOpen, setPopupOpen] = useState(false); // 마커 팝업 열림 → 필터 접힘
  const [selected, setSelected] = useState(null); // 블로그·영상 섹션 연동 대상(축제) — null=인기축제 종합
  const [flashSignal, setFlashSignal] = useState(0); // 선택 시마다 +1 → 섹션 하이라이트
  const [resetSignal, setResetSignal] = useState(0); // 선택 해제 시 +1 → 지도 줌아웃 + 마커 팝업 닫기
  const [mounted, setMounted] = useState(false); // 시즌 배너: 날짜 기반이라 마운트 후에만(SSR 불일치 방지)
  const theme = SEASONS[season];
  const mapRef = useRef(null); // 카드뉴스 클릭 시 스크롤할 지도 영역
  const listRef = useRef(null); // 배지 CTA에서 스크롤할 축제 목록 영역

  const { favorites, ready: favReady } = useFavorites();
  const ratings = useReviewStats();
  const { t, locale } = useI18n();
  const typeLabels = getTypeLabels(locale); // { all, festival, exhibition, performance }
  const tagLabels = getTagLabels(locale); // { fireworks, night, water }
  const carouselTabs = getCarouselTabs(locale); // { festival, performance, exhibition }

  // 축제마다 시도 key(_sido)를 한 번만 계산해 필터를 가볍게 유지
  const withSido = useMemo(
    () => festivals.map((f) => ({ ...f, _sido: matchSido(f.sido || "") })),
    [festivals]
  );

  // 축제 목록으로 부드럽게 스크롤 (배지 CTA에서만 — 필터가 목록 바로 위라
  //  일반 필터 조작은 스크롤 없이 아래 목록이 갱신됩니다)
  const scrollToList = () => {
    if (listRef.current) {
      listRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // 블로그·영상 섹션 연동 대상 지정 / 해제
  const selectFestival = (f) => {
    setSelected(f);
    setFlashSignal((n) => n + 1);
  };
  // 통합 복귀: '축제 선택'으로 생긴 변화만 한꺼번에 원위치.
  //  ① 블로그·영상 섹션 기본 복귀(selected 해제) ② 지도 줌아웃 + 열린 팝업 닫기.
  //  ※ 사용자가 필터(계절/지역)로 설정한 상태는 건드리지 않음.
  const resetSelection = () => {
    setSelected(null);
    setFlashSignal((n) => n + 1);
    setMapFocus(null);
    setResetSignal((n) => n + 1);
  };

  // 지도가 화면에 안 보이면(모바일 스택) 지도로 부드럽게 스크롤
  const scrollMapIntoView = () => {
    const el = mapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const visible =
        r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15;
      if (!visible) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // 카드뉴스 클릭 → 지도 줌인 + 아래 섹션 전환 + (모바일이면) 지도로 스크롤
  const handleHeroPick = (f) => {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      setMapFocus({ id: f.id, lat: f.lat, lng: f.lng, ts: Date.now() });
    }
    selectFestival(f);
    scrollMapIntoView();
  };

  // 지도 마커 클릭 → 그 축제로 줌인 + 아래 섹션 전환
  const handleMapSelect = (f) => {
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      setMapFocus({ id: f.id, lat: f.lat, lng: f.lng, ts: Date.now() });
    }
    selectFestival(f);
  };

  // ── 상단 검색바 동작 ──
  // ① 자동완성에서 축제 선택 → 마커 클릭과 동일(줌인+팝업+블로그·영상 전환)
  const handleSearchSelectFestival = (f) => {
    setSearchText(f.displayName || f.name);
    setQuery("");
    handleMapSelect(f);
    scrollMapIntoView();
  };
  // ② 지역 선택 → 해당 지역 필터 적용 + 지도 그 지역으로 이동
  const handleSearchRegion = ({ sidoKey, sigungu, label }) => {
    setSearchText(label || "");
    setQuery("");
    setPeriod(null);
    setShowFavorites(false);
    setStatusFilter(null);
    setSelected(null);
    setFlashSignal((n) => n + 1); // 블로그·영상 기본 복귀
    setMapFocus(null);
    setSido(sidoKey || null);
    setSigungu(sigungu || null);
    setResetSignal((n) => n + 1); // 지도: 팝업 닫고 새 지역으로 부드럽게 맞춤
    scrollMapIntoView();
  };
  // ③ Enter 폴백(후보 없음) → 자유 텍스트로 그리드 검색
  const handleSearchSubmit = (text) => {
    const tt = text.trim();
    if (!tt) return;
    setQuery(tt);
    setPeriod(null);
    setShowFavorites(false);
    setSelected(null);
    setMapFocus(null);
  };
  // ④ X(지우기) → 전체 복귀 (선택·지도·검색·필터 모두 초기화)
  const clearSearch = () => {
    setSearchText("");
    setQuery("");
    setPeriod(null);
    setShowFavorites(false);
    setStatusFilter(null);
    setMonth(null);
    setSido(null);
    setSigungu(null);
    setSelected(null);
    setFlashSignal((n) => n + 1);
    setMapFocus(null);
    setResetSignal((n) => n + 1);
  };

  // 사이트링크 검색창(SearchAction) 진입: /?q=검색어 → 상단 검색에 자동 반영
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      setSearchText(q);
      setQuery(q.trim());
    }
  }, []);

  useEffect(() => setMounted(true), []);
  // 메인 상단 시즌 배너: 지금 개화/단풍 '절정'인 권역이 있으면 표시, 없으면 숨김.
  const seasonBanner = mounted ? getSeasonBanner() : null;
  const seasonText = getSeasonText(locale);

  // 오늘(현재 계절) 진행중인 건수를 '유형별'로 — 히어로 바로가기 버튼 3개의 숫자.
  //  클릭 시 목록도 (그 유형 + 현재 계절 + 진행중)으로 필터되므로 목록 카운트와 정확히 일치.
  const todayByType = useMemo(() => {
    const now = new Date();
    const cs = currentSeason();
    const cnt = (ty) =>
      withSido.filter(
        (f) =>
          f.type === ty &&
          f.season === cs &&
          getStatusInfo(f.startDate, f.endDate, now).key === "ongoing"
      ).length;
    return { festival: cnt("festival"), performance: cnt("performance"), exhibition: cnt("exhibition") };
  }, [withSido]);
  const todayOngoing = todayByType.festival; // 축제 버튼 · 배지 폴백 판단용

  // 이번 주말에 열리는(겹치는) '축제' 수 — 진행중이 적을 때 배지 대체용
  const weekendCount = useMemo(() => {
    const [rs, re] = weekendRange();
    return withSido.filter(
      (f) => f.type === "festival" && overlaps(f.startDate, f.endDate, rs, re)
    ).length;
  }, [withSido]);

  // 히어로 버튼 클릭 → 그 유형의 진행중만 보기 (현재 계절, 전국).
  //  유형·계절·상태 필터를 한꺼번에 맞춰 지도·캐러셀·목록 탭이 모두 그 유형으로 동기화됨.
  const showOngoingType = (ty) => {
    setQuery("");
    setPeriod(null);
    setShowFavorites(false);
    setSido(null);
    setSigungu(null);
    setMonth(null);
    setSeason(currentSeason());
    setType(ty);
    setStatusFilter("ongoing");
    scrollToList();
  };

  // 배지 클릭 → 이번 주말 '축제' 보기
  const showThisWeek = () => {
    setQuery("");
    setShowFavorites(false);
    setStatusFilter(null);
    setSido(null);
    setSigungu(null);
    setMonth(null);
    setType("festival");
    setPeriod("weekend");
    scrollToList();
  };

  // 히어로 유형별 바로가기 버튼 3개 (축제=주인공, 공연·전시=반 톤). 0개인 유형은 숨김.
  //  · 축제: 오늘 진행중이 있으면 그 수, 없으면 이번 주말 진행 축제로 폴백(축제 우선 — 항상 노출)
  //  · 공연·전시: 오늘(현재 계절) 진행중 건수 (0이면 버튼 자체를 숨김)
  const heroButtons = [];
  if (todayByType.festival >= 1) {
    heroButtons.push({
      key: "festival", primary: true, emoji: TYPES.festival.emoji,
      label: getHeroButtonLabel("festival", todayByType.festival, locale),
      onClick: () => showOngoingType("festival"),
    });
  } else if (weekendCount >= 1) {
    heroButtons.push({
      key: "festival", primary: true, emoji: TYPES.festival.emoji,
      label: getHeroButtonLabel("festivalWeek", weekendCount, locale),
      onClick: showThisWeek,
    });
  }
  ["performance", "exhibition"].forEach((ty) => {
    if (todayByType[ty] >= 1) {
      heroButtons.push({
        key: ty, primary: false, emoji: TYPES[ty].emoji, accent: TYPES[ty].color,
        label: getHeroButtonLabel(ty, todayByType[ty], locale),
        onClick: () => showOngoingType(ty),
      });
    }
  });

  // 시도를 바꾸면 시군구 선택 초기화 + 지도로 스크롤
  const pickSido = (key) => {
    setSido((prev) => (prev === key ? null : key));
    setSigungu(null);
  };
  const pickSigungu = (sg) => setSigungu((prev) => (prev === sg ? null : sg));
  const clearRegion = () => {
    setSido(null);
    setSigungu(null);
  };
  const periodLabel = period === "weekend" ? t.filters.weekend : t.filters.month;

  // 유형 칩 토글 (다시 누르면 전체). 계절·지역 선택은 유지(직교 필터).
  const pickType = (key) => setType((prev) => (prev === key ? null : key));
  // 세부 태그 칩 토글 (다시 누르면 해제). 다중 선택 가능.
  const toggleTag = (key) =>
    setTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  // 캐러셀 탭 선택 → 지도 유형 필터를 그 유형으로 '설정'(토글 아님).
  //  → 지도 마커 집합이 그 유형으로 바뀌며 부드럽게 줌 조정됨(지역·계절·월 필터는 유지).
  const selectType = (key) => setType(key);

  // 목록 유형 탭 클릭: 유형 변경으로 목록 길이가 바뀌어 화면이 위로 튀지 않도록,
  //  목록 탭(listRef)의 화면상 위치를 변경 전후로 유지(스크롤 보정).
  const changeListType = (key) => {
    const before = listRef.current ? listRef.current.getBoundingClientRect().top : null;
    if (key === null) setType(null);
    else selectType(key);
    if (before != null) {
      requestAnimationFrame(() => {
        const after = listRef.current ? listRef.current.getBoundingClientRect().top : null;
        if (after != null) {
          const delta = after - before;
          if (Math.abs(delta) > 1) window.scrollBy(0, delta);
        }
      });
    }
  };

  // 계절을 바꾸면 월 선택 초기화 (계절 안 월 칩이 새 계절 기준으로 다시 펼쳐지게)
  const pickSeason = (key) => {
    setSeason(key);
    setMonth(null);
  };
  // 월 칩 토글 (다시 누르면 계절 전체로). 계절/지역/유형 선택은 유지.
  const pickMonth = (m) => setMonth((prev) => (prev === m ? null : m));

  // 지도 오버레이 필터 상태 — 부가필터(월/유형/지역/기간/즐겨찾기)가 하나라도 켜졌는지
  const filtersActive = !!(month || type || tags.length || sido || sigungu || period || showFavorites);
  // 지도 위 '전체' 칩 — 선택·지도·부가필터·검색 초기화 (계절 선택은 유지)
  const resetFilters = () => {
    setMonth(null);
    setType(null);
    setTags([]);
    setSido(null);
    setSigungu(null);
    setPeriod(null);
    setShowFavorites(false);
    setStatusFilter(null);
    setQuery("");
    setSearchText("");
    resetSelection();
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 우선순위: 검색 > 기간(주말/이번달) > 즐겨찾기 > 계절+지역
  //  유형(type) 필터는 어떤 모드에서든 마지막에 공통 적용 (선택 시에만).
  const base = useMemo(() => {
    let list;
    if (searching) {
      list = withSido.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.displayName || "").toLowerCase().includes(q) ||
          (f.sido || "").toLowerCase().includes(q) ||
          (f.sigungu || "").toLowerCase().includes(q)
      );
    } else if (period) {
      const [rs, re] = period === "weekend" ? weekendRange() : monthRange();
      list = withSido.filter((f) => overlaps(f.startDate, f.endDate, rs, re));
    } else if (showFavorites) {
      list = withSido.filter((f) => favorites.includes(f.id));
    } else {
      list = withSido
        // 월 선택 시: 그 달에 걸치는 행사만(계절 분류 무관). 미선택 시: 계절 전체.
        .filter((f) => (month ? overlapsMonth(f.startDate, f.endDate, month) : f.season === season))
        .filter((f) => (sido ? f._sido === sido : true))
        .filter((f) => (sigungu ? f.sigungu === sigungu : true));
    }
    if (type) list = list.filter((f) => f.type === type);
    // 세부 태그: 선택한 태그를 '모두' 가진 축제만(유형 필터와 조합). 미선택이면 통과.
    if (tags.length) list = list.filter((f) => tags.every((tg) => (f.tags || []).includes(tg)));
    return list;
  }, [withSido, season, month, type, tags, sido, sigungu, q, searching, period, showFavorites, favorites]);

  // 현재 선택한 시도의 시군구 목록(실제 축제가 있는 곳만) — 2단계 칩
  const sigunguList = useMemo(() => {
    if (!sido) return [];
    const set = new Set();
    withSido.forEach((f) => {
      if (f._sido === sido && f.sigungu) set.add(f.sigungu);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [withSido, sido]);

  // 히어로 캐러셀: 현재 계절/월/지역 필터에 맞는 상위 목록을 '유형별'로 산출.
  //  선정 기준은 모두 동일(진행중 우선 → 개막 임박 순), 유형만 다름. 탭 UI가 이걸 전환.
  const carousels = useMemo(() => {
    const now = new Date();
    const base = withSido
      .filter((f) => (month ? overlapsMonth(f.startDate, f.endDate, month) : f.season === season))
      .filter((f) => (sido ? f._sido === sido : true))
      .filter((f) => (sigungu ? f.sigungu === sigungu : true));
    const scoreTop = (list) => {
      const scored = list
        .map((f) => ({ f, st: getStatusInfo(f.startDate, f.endDate, now) }))
        .filter((x) => x.st.key !== "ended") // 진행중/예정만
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
    };
    return {
      festival: scoreTop(base.filter((f) => f.type === "festival")),
      performance: scoreTop(base.filter((f) => f.type === "performance")),
      exhibition: scoreTop(base.filter((f) => f.type === "exhibition")),
    };
  }, [withSido, season, month, sido, sigungu, popScoreById]);

  // 블로그·영상 종합용 '메인 축제 후보' — 전국 인기+임박 순 상위.
  //  축제 우선: 유형 미선택 시 축제만 노출(메인 구성 유지), 유형 선택 시 그 유형.
  const mainShorts = useMemo(() => {
    const now = new Date();
    const typed = type
      ? withSido.filter((f) => f.type === type)
      : withSido.filter((f) => f.type === "festival");
    const pool = typed.length > 0 ? typed : withSido;
    const scored = pool
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
  }, [withSido, type, popScoreById]);

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
  }, [season, month, type, tags, sido, sigungu, q, period, showFavorites, statusFilter]);
  const visible = filtered.slice(0, visibleCount);

  // 지도용 목록: 필터 결과 + (검색으로 고른 축제가 필터 밖이면) 그 축제도 포함
  //  → 검색으로 선택한 축제의 마커/팝업이 항상 뜨도록 보장
  const mapFestivals = useMemo(() => {
    if (
      selected &&
      Number.isFinite(selected.lat) &&
      Number.isFinite(selected.lng) &&
      !filtered.some((f) => f.id === selected.id)
    ) {
      return [...filtered, selected];
    }
    return filtered;
  }, [filtered, selected]);

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

      {/* ⓪ 상단 통합 검색바 (헤더 아래 · 카드뉴스·지도 위, 가로 전체) */}
      <TopSearch
        festivals={withSido}
        value={searchText}
        onChange={setSearchText}
        onSelectFestival={handleSearchSelectFestival}
        onSelectRegion={handleSearchRegion}
        onClear={clearSearch}
        onSubmit={handleSearchSubmit}
        locale={locale}
      />

      <main className="home-main">
        {/* 시즌 배너: 지금 벚꽃/단풍 절정인 권역 (시즌 아니면 자동 숨김) */}
        {seasonBanner && (
          <div className={`season-banner ${seasonBanner.kind}`}>
            <span className="season-banner-emoji" aria-hidden="true">
              {seasonBanner.kind === "bloom" ? "🌸" : "🍁"}
            </span>
            <strong className="season-banner-title">
              {seasonBanner.kind === "bloom" ? seasonText.bannerBloom : seasonText.bannerFoliage}
            </strong>
            <span className="season-banner-regions">
              {seasonBanner.regions.map((r) => t.regions[r] || r).join(" · ")}
            </span>
            <span className="season-banner-note">{seasonText.note}</span>
          </div>
        )}

        {/* ① 다가오는 인기 축제 카드뉴스 + 세로 지도 (최상단) */}
        <div className="carousel-map-row">
          <div className="cmr-carousel">
            <HeroCarousel
              carousels={carousels}
              tabLabels={carouselTabs}
              activeType={type}
              onSelectType={selectType}
              onPick={handleHeroPick}
              onReset={resetSelection}
            />
          </div>
          <div className="cmr-map" ref={mapRef}>
            {/* 지도 위 오버레이 필터 (계절/기간/즐겨찾기/지역) */}
            <MapFilters
              season={season}
              onSeason={pickSeason}
              month={month}
              onPickMonth={pickMonth}
              type={type}
              onPickType={pickType}
              typeLabels={typeLabels}
              tags={tags}
              onToggleTag={toggleTag}
              tagLabels={tagLabels}
              period={period}
              onTogglePeriod={togglePeriod}
              showFavorites={showFavorites}
              onToggleFavorites={toggleFavorites}
              sido={sido}
              sigungu={sigungu}
              sigunguList={sigunguList}
              onPickSido={pickSido}
              onPickSigungu={pickSigungu}
              onRegionAll={clearRegion}
              favorites={favorites}
              favReady={favReady}
              filtersActive={filtersActive}
              onReset={resetFilters}
              collapsed={popupOpen}
            />
            <MapView
              festivals={mapFestivals}
              ratings={ratings}
              focus={mapFocus}
              onSelect={handleMapSelect}
              resetSignal={resetSignal}
              onPopupOpen={() => setPopupOpen(true)}
              onPopupClose={() => setPopupOpen(false)}
            />
          </div>
        </div>

        {/* ② 지금 뜨는 축제 블로그 (신규 · 상세검색+자동완성) */}
        <HomeBlogSection
          festivals={feedSource}
          allFestivals={festivals}
          selectedName={selName}
          selectedKoName={selected ? selected.name : null}
          onReset={resetSelection}
          flashSignal={flashSignal}
          accent={theme.color}
        />

        {/* ③ 영상으로 만나는 축제 (유튜브 롱폼 · 상세검색+자동완성) */}
        <HomeVideoSection
          festivals={feedSource}
          allFestivals={festivals}
          selectedName={selName}
          selectedKoName={selected ? selected.name : null}
          onReset={resetSelection}
          flashSignal={flashSignal}
          accent={theme.color}
        />

        {/* ④ 목록 헤더 — 캐치프레이즈 + 상태 배지 + (필터 적용 시) 결과 요약.
             계절/기간/즐겨찾기/지역 필터는 지도 위 오버레이(MapFilters)로 이동됨. */}
        <section className="filters-block">
          <div className="hero">
            <h1>
              {t.hero.titleA}{" "}
              <span className="accent">{theme.emoji} {t.seasons[season]}</span>{" "}
              {t.hero.titleB}
            </h1>

            {heroButtons.length > 0 && (
              <div className="hero-cta-row" suppressHydrationWarning>
                {heroButtons.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`hero-cta ${b.primary ? "primary" : "sub"}`}
                    style={b.accent ? { "--cta": b.accent } : undefined}
                    onClick={b.onClick}
                  >
                    <span className="hero-cta-emoji" aria-hidden="true">{b.emoji}</span>
                    <span className="hero-cta-text">{b.label}</span>
                    <span className="hero-cta-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {(searching || period || showFavorites) && (
            <div className="search-result-head" suppressHydrationWarning>
              {searching
                ? t.list.searchResult(query.trim(), base.length)
                : period
                ? t.list.periodResult(periodLabel, base.length)
                : t.list.favResult(base.length)}
            </div>
          )}
        </section>

        {/* 즐겨찾기 알림 — 얇은 배너 (즐겨찾기 있을 때만) */}
        <FavoriteAlerts festivals={festivals} />

        {/* ⑤ 축제 목록 — 유형 탭 + 상태 요약(=필터) + 카드 그리드 */}
        {/* 유형 탭: 지도 유형 칩·캐러셀 탭과 같은 type 상태를 공유(양방향 동기화) */}
        <div className="list-type-tabs" role="tablist" ref={listRef}>
          <button
            type="button"
            className={`ltab ${!type ? "active" : ""}`}
            onClick={() => changeListType(null)}
          >
            {typeLabels.all}
          </button>
          {TYPE_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className={`ltab ${type === k ? "active" : ""}`}
              style={{ "--tab": TYPES[k].color }}
              onClick={() => changeListType(k)}
            >
              {TYPES[k].emoji} {typeLabels[k]}
            </button>
          ))}
        </div>
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

        {/* 최근 본 축제 — 이어보기 동선 (브라우저 기록, 회원가입 X) */}
        <RecentViewed />
      </main>

      <footer className="site-footer">
        <div className="container">
          <BrandTagline />
          {t.footer} · <AboutLink /> · <PrivacyLink /> · <ReportLink />
        </div>
      </footer>
    </div>
  );
}
