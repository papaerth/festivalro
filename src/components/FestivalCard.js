"use client";

import Link from "next/link";
import { SEASONS, typeTheme } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getTypeLabel } from "@/lib/i18n";
import { useCardNews } from "./CardNewsProvider";
import CoverImage from "./CoverImage";
import FavoriteButton from "./FavoriteButton";

// 축제 하나를 카드 형태로 보여줍니다. (상단 대표 이미지 + 정보)
export default function FestivalCard({ festival, rating }) {
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

  return (
    <Link
      href={href(`/festival/${festival.id}`)}
      onClick={handleClick}
      className={`card card-${status.key}`}
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
      </div>
    </Link>
  );
}
