"use client";

import { useI18n } from "@/lib/I18nProvider";
import { getFireworksText } from "@/lib/i18n";
import MapDirections from "./MapDirections";

// 상설(수시) 불꽃놀이 명소 카드 — 기간/상태 대신 '상설' 배지 + 운영 안내(scheduleText).
export default function FireworksSpotCard({ spot, highlight = false }) {
  const { locale } = useI18n();
  const fw = getFireworksText(locale);
  const name = spot.displayName || spot.name;
  const region = spot.displaySigungu || spot.sigungu || "";
  const homeUrl = String(spot.homepage || "").match(/https?:\/\/[^\s"'<>]+/);

  return (
    <div className={`card card-spot${highlight ? " card-highlight" : ""}`}>
      <div className="market-cover spot-cover">
        <span className="market-cover-emoji">🎆</span>
        <span className="badge permanent-badge">{fw.permanent}</span>
      </div>
      <div className="card-body">
        <p className="card-title">{name}</p>
        <span className="card-region">📍 {region}</span>
        {spot.scheduleText && <p className="market-day">🎇 {spot.scheduleText}</p>}
        <div className="market-card-actions">
          <MapDirections name={name} lat={spot.lat} lng={spot.lng} compact />
          {homeUrl && (
            <a
              className="spot-home-link"
              href={homeUrl[0]}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              🔗 ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
