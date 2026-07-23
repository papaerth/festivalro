"use client";

import { useEffect, useRef, useState } from "react";
import { SEASONS, SEASON_ORDER, SEASON_MONTHS, TYPES, TYPE_ORDER } from "@/lib/seasons";
import { TAG_DEFS, TAG_ORDER } from "@/lib/tags";
import { SIDO_ORDER } from "@/lib/regionsKr";
import { getSidoLabel, getMonthLabel } from "@/lib/i18n";
import { useI18n } from "@/lib/I18nProvider";

// ────────────────────────────────────────────────────────────────
//  지도 위 오버레이 필터 — 단계형(카테고리 → 하위필터 펼침) 구조
//   · 초기: 카테고리 탭 한 줄만 (전체 · 축제 · 전시·박람회 · 공연 · 장터·야시장).
//   · 카테고리를 누르면 그 아래로 관련 하위필터가 슬라이드 다운으로 펼쳐짐.
//       - 축제: 테마(불꽃/야간/물놀이) + 계절 + 월 + 기간 + 즐겨찾기 + 지역
//       - 전시·공연·장터: 테마 제외 나머지 (filterVis.tags 매핑 그대로 사용)
//   · 같은 카테고리를 다시 누르면 접힘(토글). 접혀도 필터는 유지되고,
//     적용 중인 하위필터는 요약 칩("여름 · 이번 주말 · 부산")으로 표시(칩 ✕로 개별 해제).
//   · 마커 팝업이 열리면(collapsed) 패널을 자동으로 접어 지도 가림 최소화.
//   · ⚠️ 상태/필터 로직은 부모(HomeClient)가 그대로 소유 — 여기선 '표시 방식'만 담당.
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
  filterVis = { tags: true, season: true, period: true },
  showMarkets = false,
  onToggleMarkets,
  marketChipLabel = "장터·야시장",
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
  collapsed = false, // 마커 팝업이 열리면 true → 하위필터 패널 자동 접힘
}) {
  const { t, locale } = useI18n();
  const [regionOpen, setRegionOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(!!month); // 월 세분화 서브행 펼침 여부(평소 접힘)
  const [expandedCat, setExpandedCat] = useState(null); // 하위필터를 펼친 카테고리(null=모두 접힘)
  const rootRef = useRef(null);

  // 현재 활성 카테고리: 장터모드면 market, 아니면 유형(없으면 all)
  const activeCat = showMarkets ? "market" : type || "all";
  // 하위필터 패널 실제 펼침 여부(팝업이 열리면 강제로 접음)
  const panelOpen = expandedCat === activeCat && !collapsed;

  // 카테고리(유형/장터) 전환 시 지역 팝업 자동 닫기(전환 후 화면 정리)
  useEffect(() => {
    setRegionOpen(false);
  }, [type, showMarkets]);

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

  // ── 카테고리 탭 클릭: 다른 카테고리면 '전환 + 펼침', 같은 카테고리면 '펼침 토글(필터 유지)' ──
  const selectCategory = (cat) => {
    if (cat === "market") {
      if (!showMarkets) onToggleMarkets && onToggleMarkets();
    } else {
      onPickType(cat === "all" ? null : cat); // pickType이 장터모드 해제·무효필터 정리까지 담당
    }
  };
  const onTabClick = (cat) => {
    if (cat === activeCat) {
      setExpandedCat((prev) => (prev === cat ? null : cat)); // 토글(필터는 그대로 유지)
    } else {
      selectCategory(cat);
      setExpandedCat(cat); // 새 카테고리의 하위필터 펼침
    }
  };

  // 계절 칩 탭: 다른 계절이면 전환(+월 초기화) 후 월 펼침, 같은 계절 재탭이면 월 서브행만 토글
  const tapSeason = (key) => {
    if (key !== season) {
      onSeason(key);
      setMonthOpen(true);
    } else {
      setMonthOpen((v) => !v);
    }
  };

  const chooseSido = (key) => {
    onPickSido(key);
    if (sido === key) setRegionOpen(false); // 해제(같은 지역 재클릭)면 즉시 닫기
  };
  const chooseSigungu = (sg) => {
    onPickSigungu(sg);
    setRegionOpen(false);
  };
  const chooseRegionAll = () => {
    onRegionAll();
    setRegionOpen(false);
  };

  const regionLabel = sido
    ? `📍 ${getSidoLabel(sido, locale)}${sigungu ? " " + sigungu : ""}`
    : `📍 ${t.filters.region}`;

  // 카테고리 탭 정의(전체 · 축제 · 전시·박람회 · 공연 · 장터·야시장)
  const CATS = [
    { key: "all", label: typeLabels.all || "전체" },
    ...TYPE_ORDER.map((k) => ({
      key: k,
      label: `${TYPES[k].emoji} ${typeLabels[k] || TYPES[k].label}`,
      accent: TYPES[k],
    })),
    { key: "market", label: `${TYPES.market.emoji} ${marketChipLabel}`, accent: TYPES.market },
  ];

  // ── 접힘 상태 요약 칩: 적용 중인 하위필터만(카테고리는 탭으로 표시되므로 제외) ──
  const stripEmoji = (s = "") => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const subActive = !!(month || tags.length || period || showFavorites || sido || sigungu);
  const summaryChips = [];
  if (subActive) {
    summaryChips.push({ key: "season", label: `${SEASONS[season]?.emoji || ""} ${t.seasons[season]}`.trim() }); // 계절(기본 컨텍스트) — ✕ 없음
    if (month) summaryChips.push({ key: "month", label: getMonthLabel(month, locale), onX: () => onPickMonth(month) });
    for (const k of tags) summaryChips.push({ key: "tag-" + k, label: `${TAG_DEFS[k].emoji} ${tagLabels[k] || k}`, onX: () => onToggleTag(k) });
    if (period === "weekend") summaryChips.push({ key: "period", label: stripEmoji(t.filters.weekend), onX: () => onTogglePeriod("weekend") });
    if (period === "month") summaryChips.push({ key: "period", label: stripEmoji(t.filters.month), onX: () => onTogglePeriod("month") });
    if (showFavorites) summaryChips.push({ key: "fav", label: "❤️", onX: () => onToggleFavorites() });
    if (sido) summaryChips.push({ key: "region", label: `📍 ${getSidoLabel(sido, locale)}${sigungu ? " " + sigungu : ""}`, onX: () => chooseRegionAll() });
  }

  return (
    <div className="map-filters mf-staged" ref={rootRef}>
      {/* ── 카테고리 탭 (항상 표시) ── */}
      <div className="mf-row mf-cats" role="tablist" aria-label={typeLabels.all || "유형"}>
        {CATS.map((cat) => {
          const active = cat.key === activeCat;
          const isOpen = active && panelOpen;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-expanded={isOpen}
              className={`mf-chip mf-cat ${cat.accent ? "mf-type" : ""} ${active ? "active" : ""} ${isOpen ? "open" : ""}`}
              style={cat.accent ? { "--accent": cat.accent.color, "--accent-soft": cat.accent.soft } : undefined}
              onClick={() => onTabClick(cat.key)}
            >
              {cat.label}
              {active && <span className="mf-caret" aria-hidden="true">{isOpen ? " ▴" : " ▾"}</span>}
            </button>
          );
        })}
      </div>

      {/* ── 요약 칩 (패널 접힘 + 적용 중 필터 있을 때) ── */}
      {!panelOpen && summaryChips.length > 0 && (
        <div className="mf-row mf-summary-chips" aria-label={t.filters.clearAll}>
          {summaryChips.map((c) => (
            <span key={c.key} className="mf-chip mf-sumchip">
              {c.label}
              {c.onX && (
                <span
                  className="mf-chip-x"
                  role="button"
                  tabIndex={0}
                  aria-label="✕"
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onX();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      c.onX();
                    }
                  }}
                >
                  {" ✕"}
                </span>
              )}
            </span>
          ))}
          {filtersActive && (
            <button type="button" className="mf-chip mf-sum-clear" onClick={onReset}>
              ✕ {t.filters.clearAll}
            </button>
          )}
        </div>
      )}

      {/* ── 하위필터 패널 (슬라이드 다운) ── */}
      <div className={`mf-panel ${panelOpen ? "open" : ""}`} aria-hidden={!panelOpen}>
        <div className="mf-panel-inner">
          {/* 테마 태그 (🎆 불꽃 · 🌙 야간 · 💧 물놀이) — filterVis.tags 인 카테고리에서만 */}
          {filterVis.tags && (
            <div className="mf-row mf-tag-row" role="group" aria-label={t.filters.tags || "태그"}>
              {TAG_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`mf-chip mf-tag ${tags.includes(k) ? "active" : ""}`}
                  onClick={() => onToggleTag && onToggleTag(k)}
                  aria-pressed={tags.includes(k)}
                >
                  {TAG_DEFS[k].emoji} {tagLabels[k] || k}
                </button>
              ))}
            </div>
          )}

          {/* 계절 */}
          <div className="mf-row" role="group" aria-label={t.filters.season}>
            {SEASON_ORDER.map((key) => {
              const s = SEASONS[key];
              const active = season === key;
              return (
                <button
                  key={key}
                  type="button"
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

          {/* 월 세분화 (계절 탭으로 펼쳤을 때만) */}
          {monthOpen && (
            <div className="mf-row mf-month-row" role="group" aria-label="월">
              {(SEASON_MONTHS[season] || []).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mf-chip mf-month ${month === m ? "active" : ""}`}
                  onClick={() => onPickMonth(m)}
                >
                  {getMonthLabel(m, locale)}
                </button>
              ))}
            </div>
          )}

          {/* 전체 · 기간 · 즐겨찾기 · 지역 */}
          <div className="mf-row">
            <button type="button" className={`mf-chip ${!filtersActive ? "active" : ""}`} onClick={onReset}>
              {t.filters.clearAll}
            </button>
            <button type="button" className={`mf-chip ${period === "weekend" ? "active" : ""}`} onClick={() => onTogglePeriod("weekend")}>
              {t.filters.weekend}
            </button>
            <button type="button" className={`mf-chip ${period === "month" ? "active" : ""}`} onClick={() => onTogglePeriod("month")}>
              {t.filters.month}
            </button>
            <button type="button" className={`mf-chip ${showFavorites ? "active" : ""}`} onClick={onToggleFavorites} suppressHydrationWarning>
              ❤️ {t.filters.favorites}
              {favReady && favorites.length > 0 ? ` ${favorites.length}` : ""}
            </button>
            <button
              type="button"
              className={`mf-chip ${sido ? "active" : ""} ${regionOpen ? "open" : ""}`}
              onClick={() => setRegionOpen((v) => !v)}
            >
              {regionLabel}
              {sido && (
                <span
                  className="mf-chip-x"
                  role="button"
                  tabIndex={0}
                  aria-label={t.regions.all}
                  onClick={(e) => {
                    e.stopPropagation();
                    chooseRegionAll();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      e.preventDefault();
                      chooseRegionAll();
                    }
                  }}
                >
                  {" ✕"}
                </span>
              )}
            </button>
          </div>

          {/* 지역 선택 패널 */}
          {regionOpen && (
            <div className="mf-region" role="dialog" aria-label={t.filters.region}>
              <div className="mf-region-head">
                <span>{t.filters.region}</span>
                <button className="mf-region-x" onClick={() => setRegionOpen(false)} aria-label="닫기">
                  ✕
                </button>
              </div>
              <div className="mf-region-chips">
                <button className={`mf-rchip ${sido === null ? "active" : ""}`} onClick={chooseRegionAll}>
                  {t.regions.all}
                </button>
                {SIDO_ORDER.map((key) => (
                  <button key={key} className={`mf-rchip ${sido === key ? "active" : ""}`} onClick={() => chooseSido(key)}>
                    {getSidoLabel(key, locale)}
                  </button>
                ))}
              </div>

              {sido && sigunguList.length > 0 && (
                <div className="mf-region-chips mf-region-sub">
                  <button className={`mf-rchip sm ${sigungu === null ? "active" : ""}`} onClick={() => chooseSigungu(null)}>
                    {t.regions.all}
                  </button>
                  {sigunguList.map((sg) => (
                    <button key={sg} className={`mf-rchip sm ${sigungu === sg ? "active" : ""}`} onClick={() => chooseSigungu(sg)}>
                      {sg}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
