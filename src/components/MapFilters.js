"use client";

import { useEffect, useRef, useState } from "react";
import { SEASONS, SEASON_ORDER, SEASON_MONTHS, TYPES, TYPE_ORDER } from "@/lib/seasons";
import { TAG_DEFS, TAG_ORDER } from "@/lib/tags";
import { SIDO_ORDER } from "@/lib/regionsKr";
import { getSidoLabel, getMonthLabel } from "@/lib/i18n";
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
  month,
  onPickMonth,
  type,
  onPickType,
  typeLabels = {},
  tags = [],
  onToggleTag,
  tagLabels = {},
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
  collapsed = false, // 마커 팝업이 열리면 true → 한 줄 요약 모드로 접어 겹침 방지
}) {
  const { t, locale } = useI18n();
  const [regionOpen, setRegionOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(!!month); // 월 세분화 서브행 펼침 여부(평소 접힘)
  const [userExpanded, setUserExpanded] = useState(false); // 접힘 중 사용자가 다시 펼침
  const rootRef = useRef(null);

  // 팝업이 닫히면(collapsed=false) 사용자 펼침 상태 초기화 → 원래대로 펼쳐짐
  useEffect(() => {
    if (!collapsed) setUserExpanded(false);
  }, [collapsed]);
  const showSummary = collapsed && !userExpanded;

  // 접힘 요약 문구: 유형 · 계절(월) · 기간 · 즐겨찾기 · 지역 중 활성인 것만
  const stripEmoji = (s = "") => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const summaryParts = [
    type ? typeLabels[type] || (TYPES[type] && TYPES[type].label) : typeLabels.all || t.filters.clearAll,
    month ? `${t.seasons[season]} ${getMonthLabel(month, locale)}` : t.seasons[season],
  ];
  for (const k of tags) summaryParts.push(`${TAG_DEFS[k].emoji} ${tagLabels[k] || k}`);
  if (period === "weekend") summaryParts.push(stripEmoji(t.filters.weekend));
  if (period === "month") summaryParts.push(stripEmoji(t.filters.month));
  if (showFavorites) summaryParts.push("❤️");
  if (sido) summaryParts.push(getSidoLabel(sido, locale) + (sigungu ? " " + sigungu : ""));
  const summaryText = summaryParts.filter(Boolean).join(" · ");

  // 계절 칩 탭: 다른 계절이면 그 계절로 전환(+월 초기화) 후 월 펼침,
  //  같은 계절을 다시 탭하면 월 서브행만 접기/펼치기(선택은 유지).
  const tapSeason = (key) => {
    if (key !== season) {
      onSeason(key);
      setMonthOpen(true);
    } else {
      setMonthOpen((v) => !v);
    }
  };

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

  // 팝업 열림 → 한 줄 요약(누르면 다시 펼침)
  if (showSummary) {
    return (
      <div className="map-filters map-filters-collapsed" ref={rootRef}>
        <button
          type="button"
          className="mf-summary"
          onClick={() => setUserExpanded(true)}
          aria-label={summaryText}
        >
          <span className="mf-summary-text">{summaryText}</span>
          <span className="mf-summary-caret" aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="map-filters" ref={rootRef}>
      {/* 0줄: 유형 (전체 · 축제 · 전시·박람회 · 공연) */}
      <div className="mf-row" role="group" aria-label={typeLabels.all || "유형"}>
        <button
          className={`mf-chip ${!type ? "active" : ""}`}
          onClick={() => onPickType(null)}
        >
          {typeLabels.all || "전체"}
        </button>
        {TYPE_ORDER.map((key) => {
          const ty = TYPES[key];
          return (
            <button
              key={key}
              className={`mf-chip mf-type ${type === key ? "active" : ""}`}
              style={{ "--accent": ty.color, "--accent-soft": ty.soft }}
              onClick={() => onPickType(key)}
            >
              {ty.emoji} {typeLabels[key] || ty.label}
            </button>
          );
        })}
      </div>

      {/* 0.5줄: 세부 태그 (🎆 불꽃놀이 · 🌙 야간 · 💧 물놀이) — 다중 선택, 유형과 조합 */}
      <div className="mf-row mf-tag-row" role="group" aria-label={t.filters.tags || "태그"}>
        {TAG_ORDER.map((k) => (
          <button
            key={k}
            className={`mf-chip mf-tag ${tags.includes(k) ? "active" : ""}`}
            onClick={() => onToggleTag && onToggleTag(k)}
            aria-pressed={tags.includes(k)}
          >
            {TAG_DEFS[k].emoji} {tagLabels[k] || k}
          </button>
        ))}
      </div>

      {/* 1줄: 계절 (활성 계절 탭 시 아래 월 서브행 펼침/접기) */}
      <div className="mf-row" role="group" aria-label={t.filters.season}>
        {SEASON_ORDER.map((key) => {
          const s = SEASONS[key];
          const active = season === key;
          return (
            <button
              key={key}
              className={`mf-chip ${active ? "active" : ""}`}
              onClick={() => tapSeason(key)}
              aria-expanded={active ? monthOpen : undefined}
            >
              {s.emoji} {t.seasons[key]}
              {active && <span className="mf-caret" aria-hidden="true">{monthOpen ? " ▴" : " ▾"}</span>}
            </button>
          );
        })}
      </div>

      {/* 1.5줄: 월 세분화 (계절 탭으로 펼쳤을 때만 · 가로 스크롤) */}
      {monthOpen && (
        <div className="mf-row mf-month-row" role="group" aria-label="월">
          {(SEASON_MONTHS[season] || []).map((m) => (
            <button
              key={m}
              className={`mf-chip mf-month ${month === m ? "active" : ""}`}
              onClick={() => onPickMonth(m)}
            >
              {getMonthLabel(m, locale)}
            </button>
          ))}
        </div>
      )}

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
