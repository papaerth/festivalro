"use client";

import { useEffect, useRef, useState } from "react";
import { SEASONS, SEASON_ORDER } from "@/lib/seasons";
import { SIDO_ORDER } from "@/lib/regionsKr";
import { getSidoLabel } from "@/lib/i18n";
import { useI18n } from "@/lib/I18nProvider";

// ────────────────────────────────────────────────────────────────
//  지도 위 오버레이 필터 (카카오/네이버맵 스타일 반투명 칩)
//   1줄: 🌸봄 🌊여름 🍁가을 ❄️겨울 (계절)
//   2줄: 전체 · 이번 주말 · 이번 달 · ❤️즐겨찾기 · 📍지역
//   · "지역" 칩 → 지도 위 작은 패널(시도 → 시군구, 기존 2단 로직 재사용)
//   · 선택 즉시 지도·카드뉴스·목록이 갱신되는 기존 전역 필터에 그대로 연결
//   · 반투명 흰 배경 + 블러, 선택 상태는 계절 테마색(var(--accent))
// ────────────────────────────────────────────────────────────────

export default function MapFilters({
  season,
  onSeason,
  period,
  onTogglePeriod,
  showFavorites,
  onToggleFavorites,
  sido,
  sigungu,
  sigunguList,
  onPickSido,
  onPickSigungu,
  onRegionAll,
  favorites = [],
  favReady = false,
  filtersActive,
  onReset,
}) {
  const { t, locale } = useI18n();
  const [regionOpen, setRegionOpen] = useState(false);
  const rootRef = useRef(null);

  // 지역 패널: Esc 또는 바깥(지도 등) 클릭 시 닫기
  useEffect(() => {
    if (!regionOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setRegionOpen(false);
    };
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setRegionOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [regionOpen]);

  const regionLabel = sido
    ? `📍 ${getSidoLabel(sido, locale)}${sigungu ? " " + sigungu : ""}`
    : `📍 ${t.filters.region}`;

  const chooseSido = (key) => {
    onPickSido(key); // 부모: sido 설정 + 시군구 초기화 (같은 걸 다시 누르면 해제)
    // 시군구가 없는 지역이면 바로 닫기, 있으면 패널 유지(시군구 선택 유도)
    // sigunguList는 다음 렌더에서 갱신되므로, '해제' 케이스만 즉시 닫음
    if (sido === key) setRegionOpen(false);
  };
  const chooseSigungu = (sg) => {
    onPickSigungu(sg);
    setRegionOpen(false);
  };
  const chooseRegionAll = () => {
    onRegionAll();
    setRegionOpen(false);
  };

  return (
    <div className="map-filters" ref={rootRef}>
      {/* 1줄: 계절 */}
      <div className="mf-row" role="group" aria-label={t.filters.season}>
        {SEASON_ORDER.map((key) => {
          const s = SEASONS[key];
          return (
            <button
              key={key}
              className={`mf-chip ${season === key ? "active" : ""}`}
              onClick={() => onSeason(key)}
            >
              {s.emoji} {t.seasons[key]}
            </button>
          );
        })}
      </div>

      {/* 2줄: 전체 · 기간 · 즐겨찾기 · 지역 */}
      <div className="mf-row">
        <button
          className={`mf-chip ${!filtersActive ? "active" : ""}`}
          onClick={onReset}
        >
          {t.filters.clearAll}
        </button>
        <button
          className={`mf-chip ${period === "weekend" ? "active" : ""}`}
          onClick={() => onTogglePeriod("weekend")}
        >
          {t.filters.weekend}
        </button>
        <button
          className={`mf-chip ${period === "month" ? "active" : ""}`}
          onClick={() => onTogglePeriod("month")}
        >
          {t.filters.month}
        </button>
        <button
          className={`mf-chip ${showFavorites ? "active" : ""}`}
          onClick={onToggleFavorites}
          suppressHydrationWarning
        >
          ❤️ {t.filters.favorites}
          {favReady && favorites.length > 0 ? ` ${favorites.length}` : ""}
        </button>
        <button
          className={`mf-chip ${sido ? "active" : ""} ${regionOpen ? "open" : ""}`}
          onClick={() => setRegionOpen((v) => !v)}
        >
          {regionLabel}
        </button>
      </div>

      {/* 지역 선택 패널 (지도 위에 떠서) */}
      {regionOpen && (
        <div className="mf-region" role="dialog" aria-label={t.filters.region}>
          <div className="mf-region-head">
            <span>{t.filters.region}</span>
            <button className="mf-region-x" onClick={() => setRegionOpen(false)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="mf-region-chips">
            <button
              className={`mf-rchip ${sido === null ? "active" : ""}`}
              onClick={chooseRegionAll}
            >
              {t.regions.all}
            </button>
            {SIDO_ORDER.map((key) => (
              <button
                key={key}
                className={`mf-rchip ${sido === key ? "active" : ""}`}
                onClick={() => chooseSido(key)}
              >
                {getSidoLabel(key, locale)}
              </button>
            ))}
          </div>

          {sido && sigunguList.length > 0 && (
            <div className="mf-region-chips mf-region-sub">
              <button
                className={`mf-rchip sm ${sigungu === null ? "active" : ""}`}
                onClick={() => chooseSigungu(null)}
              >
                {t.regions.all}
              </button>
              {sigunguList.map((sg) => (
                <button
                  key={sg}
                  className={`mf-rchip sm ${sigungu === sg ? "active" : ""}`}
                  onClick={() => chooseSigungu(sg)}
                >
                  {sg}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
