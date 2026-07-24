"use client";

import Link from "next/link";
import { SEASONS, typeTheme } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getTypeLabel, getTagLabel, getSeasonText } from "@/lib/i18n";
import { shortSourceLabel } from "@/lib/dataSources";
import { TAG_DEFS } from "@/lib/tags";
import { getSeasonBadge, seasonBadgeLabel } from "@/lib/season";
import { useCardNews } from "./CardNewsProvider";
import CoverImage from "./CoverImage";
import FavoriteButton from "./FavoriteButton";

// 축제 하나를 카드 형태로 보여줍니다. (상단 대표 이미지 + 정보)
export default function FestivalCard({ festival, rating, highlight = false }) {
  const { t, href, locale } = useI18n();
  const { open: openCardNews } = useCardNews();

  // 카드 클릭 → 카드뉴스 뷰어 먼저 열기 (Ctrl/⌘·휠클릭·새 탭은 기존처럼 상세로)
  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    openCardNews(festival);
  };
  const season = SEASONS[festival.season] || SEASONS.spring;
  const ty = typeTheme(festival.type);
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const regionName = t.regions[festival.region] || "";
  // 예정은 D-day(언어 무관), 진행중/종료는 언어별 라벨
  const statusLabel =
    status.key === "upcoming" ? status.label : t.status[status.key];

  const badgeClass =
    `badge card-badge ${status.key}` + (status.soon ? " soon" : "");
  // 개화·단풍 시즌 배지(시즌 아니면 null). 날짜 기반이라 SSR/CSR 차이 대비 suppressHydrationWarning.
  const seasonBadge = getSeasonBadge(festival);
  const seasonLabel = seasonBadge ? seasonBadgeLabel(seasonBadge, getSeasonText(locale)) : null;
  // KOPIS·문화정보 등 출처 표기가 필요한 소스면 카드 하단에 작게 표기(그 외 null)
  const sourceCredit = shortSourceLabel(festival.source, locale);
  // 📍 내 주변 모드에서만 거리(_dist) 부여됨 → 거리 뱃지 표시
  const dist = Number.isFinite(festival._dist)
    ? festival._dist < 1
      ? `${Math.round(festival._dist * 1000)}m`
      : `${festival._dist.toFixed(1)}km`
    : null;

  return (
    <Link
      href={href(`/festival/${festival.id}`)}
      onClick={handleClick}
      className={`card card-${status.key}${highlight ? " card-highlight" : ""}`}
    >
      <CoverImage
        className="card-cover"
        src={festival.image}
        alt={festival.name}
        accent={season.color}
        emoji={season.emoji}
      />
      <span className={badgeClass} suppressHydrationWarning>
        {status.key === "ongoing" && <span className="live-dot" />}
        {statusLabel}
      </span>
      <span
        className="badge type-badge"
        style={{ background: ty.color }}
      >
        {ty.emoji} {getTypeLabel(festival.type || "festival", locale)}
      </span>
      {dist && <span className="badge dist-badge">📍 {dist}</span>}
      <FavoriteButton id={festival.id} />
      <div className="card-body">
        <p className="card-title">{festival.displayName || festival.name}</p>
        {rating && rating.count > 0 && (
          <p className="card-rating">
            ⭐ {rating.avg.toFixed(1)}
            <span className="card-rating-count">({rating.count})</span>
          </p>
        )}
        <p className="card-meta">{formatPeriod(festival.startDate, festival.endDate)}</p>
        <span className="card-region">
          {season.emoji} {regionName} · {festival.displaySigungu || festival.sigungu}
        </span>
        {seasonLabel && (
          <div
            className={`season-badge ${seasonBadge.kind} ${seasonBadge.phase}`}
            suppressHydrationWarning
          >
            {seasonLabel}
          </div>
        )}
        {festival.tags && festival.tags.length > 0 && (
          <div className="card-tags">
            {festival.tags.map((k) =>
              TAG_DEFS[k] ? (
                <span key={k} className="tag-chip">
                  {TAG_DEFS[k].emoji} {getTagLabel(k, locale)}
                </span>
              ) : null
            )}
          </div>
        )}
        {sourceCredit && <p className="card-source">{sourceCredit}</p>}
      </div>
    </Link>
  );
}
