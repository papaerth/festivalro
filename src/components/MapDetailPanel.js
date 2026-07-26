"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import { shortSourceLabel } from "@/lib/dataSources";
import CoverImage from "./CoverImage";
import MapDirections from "./MapDirections";
import BookingButton from "./BookingButton";

// 지도 옆 '사이드 패널형' 상세 카드 — 지도를 가리지 않아(왼쪽 카드뉴스 영역만 덮음)
//  패널이 열린 채로 지도의 다른 마커를 눌러 내용이 교체됩니다. (festival prop이 바뀌면 갱신)
export default function MapDetailPanel({ festival, onClose }) {
  const { t, locale, href } = useI18n();
  const ux = getUiExtra(locale);
  const router = useRouter();

  const season = SEASONS[festival.season] || SEASONS.spring;
  const name = festival.displayName || festival.name;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const region = t.regions[festival.region] || "";
  const sigungu = festival.displaySigungu || festival.sigungu || "";
  const statusLabel = status.key === "upcoming" ? status.label : t.status[status.key];

  const [overview, setOverview] = useState(festival.description || "");
  const [address, setAddress] = useState(festival.addr || "");

  // ESC로 닫기 (스크롤 잠금은 하지 않음 — 지도는 계속 조작 가능해야 함)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 소개문 보강 (TourAPI 축제)
  useEffect(() => {
    let alive = true;
    setOverview(festival.description || "");
    if (festival.source === "tour") {
      fetch(`/api/overview?id=${encodeURIComponent(festival.id)}&locale=${locale}`)
        .then((r) => r.json())
        .then((d) => { if (alive && d && d.description) setOverview(d.description); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [festival.id, festival.source, festival.description, locale]);

  // 주소 보강 — 카카오 로컬 키워드 검색
  useEffect(() => {
    let alive = true;
    setAddress(festival.addr || "");
    const venue = festival.eventplace || festival.displayName || festival.name;
    const q = [venue, festival.sido].filter(Boolean).join(" ").trim();
    if (q) {
      fetch(`/api/address?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { if (alive && d && d.address) setAddress(d.address); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [festival.id, festival.eventplace, festival.name, festival.displayName, festival.sido, festival.addr]);

  const intro = overview
    ? overview.length > 160 ? overview.slice(0, 160) + "…" : overview
    : `${name} — ${[region, sigungu].filter(Boolean).join(" ")}`;
  const goDetail = () => router.push(href(`/festival/${festival.id}`));

  return (
    <div className="mdp" role="dialog" aria-label={name} style={{ "--accent": season.color, "--accent-soft": season.soft }}>
      <button className="mdp-close" onClick={onClose} aria-label="✕">✕</button>
      <div className="mdp-cover">
        <CoverImage className="mdp-cover-bg" src={festival.image} alt={name} accent={season.color} emoji={season.emoji} />
        <div className="mdp-cover-veil" />
        <div className="mdp-cover-text">
          <span className={`mdp-status ${status.key}`}>
            {status.key === "ongoing" && <span className="live-dot" />}
            {statusLabel}
          </span>
          <h2 className="mdp-title">{name}</h2>
          <p className="mdp-sub">{season.emoji} {region}{sigungu ? " · " + sigungu : ""}</p>
        </div>
      </div>
      <div className="mdp-body">
        <p className="mdp-period">📅 {formatPeriod(festival.startDate, festival.endDate)}</p>
        {address && <p className="mdp-addr">📍 {address}</p>}
        <p className="mdp-intro">{intro}</p>
        {Number.isFinite(festival.lat) && Number.isFinite(festival.lng) && (
          <MapDirections name={name} lat={festival.lat} lng={festival.lng} />
        )}
        <BookingButton festival={festival} eager />
        <button className="mdp-cta" onClick={goDetail}>{ux.detailCta} →</button>
        {shortSourceLabel(festival.source, locale) && (
          <p className="mdp-source">{shortSourceLabel(festival.source, locale)}</p>
        )}
      </div>
    </div>
  );
}
