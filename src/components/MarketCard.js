"use client";

import Link from "next/link";
import { TYPES } from "@/lib/seasons";
import { useI18n } from "@/lib/I18nProvider";
import { getMarketText } from "@/lib/i18n";
import { nextMarketDay, formatMarketDate } from "@/lib/marketDay";
import MapDirections from "./MapDirections";

// 전통시장(장터·야시장) 카드 — 축제 카드와 달리 기간 대신 '장날/운영시간'을 보여줍니다.
export default function MarketCard({ market, highlight = false }) {
  const { locale, href } = useI18n();
  const mt = getMarketText(locale);
  const theme = TYPES.market;
  const name = market.displayName || market.name;
  const region = market.displaySigungu || market.sigungu || "";

  // 5일장이면 다음 장날 계산, 야시장이면 운영시간 표시
  const nd = nextMarketDay(market.openDays);
  const isNight = market.marketType === "야시장";

  return (
    <Link
      href={href(`/market/${market.id}`)}
      className={`card card-market${highlight ? " card-highlight" : ""}`}
    >
      <div className="market-cover" style={{ background: theme.soft, color: theme.color }}>
        <span className="market-cover-emoji">{isNight ? "🌙" : "🏪"}</span>
        {nd && nd.isToday && (
          <span className="badge market-today-badge">{mt.today}</span>
        )}
      </div>
      <span className="badge type-badge" style={{ background: theme.color }}>
        {theme.emoji} {mt.typeLabel(market.marketType)}
      </span>
      <div className="card-body">
        <p className="card-title">{name}</p>
        <span className="card-region">🏪 {region}</span>
        {nd ? (
          <p className={`market-day ${nd.isToday ? "today" : ""}`}>
            {nd.isToday ? mt.today : `${mt.next}: ${formatMarketDate(nd.date, mt.intl)}`}
          </p>
        ) : (
          market.hours && <p className="market-day">🕕 {market.hours}</p>
        )}
        <div className="market-card-actions" onClick={(e) => e.preventDefault()}>
          <MapDirections name={name} lat={market.lat} lng={market.lng} compact />
        </div>
      </div>
    </Link>
  );
}
