"use client";

import Link from "next/link";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import CoverImage from "./CoverImage";
import FavoriteButton from "./FavoriteButton";

// 축제 하나를 카드 형태로 보여줍니다. (상단 대표 이미지 + 정보)
export default function FestivalCard({ festival, rating }) {
  const { t, href } = useI18n();
  const season = SEASONS[festival.season] || SEASONS.spring;
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
      <FavoriteButton id={festival.id} />
      <div className="card-body">
        <p className="card-title">{festival.name}</p>
        {rating && rating.count > 0 && (
          <p className="card-rating">
            ⭐ {rating.avg.toFixed(1)}
            <span className="card-rating-count">({rating.count})</span>
          </p>
        )}
        <p className="card-meta">{formatPeriod(festival.startDate, festival.endDate)}</p>
        <span className="card-region">
          {season.emoji} {regionName} · {festival.sigungu}
        </span>
      </div>
    </Link>
  );
}
