"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import { shortSourceLabel } from "@/lib/dataSources";
import CoverImage from "./CoverImage";
import MapDirections from "./MapDirections";
import BookingButton from "./BookingButton";

// 미니 지도는 브라우저 전용(leaflet) — 팝업이 열릴 때만 로드되고, 닫히면(모달 언마운트)
//  leaflet 인스턴스가 정리됩니다. ssr:false + 조건부 렌더로 메모리·성능 부담 없음.
const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="skeleton lcm-map-skel" />,
});

// 목록 카드 전용 독립 팝업 — 왼쪽: 카드뉴스식 요약 / 오른쪽: 그 축제로 줌인된 미니 지도.
//  · 딤 배경, X·배경클릭·ESC로 닫기. 닫으면 흔적 없이 목록 그대로.
//  · 상단 카드뉴스(HeroCarousel)·메인 지도·블로그/영상 상태와 완전 독립.
export default function CardNewsModal({ festival, onClose }) {
  const { t, locale, href } = useI18n();
  const ux = getUiExtra(locale);
  const router = useRouter();

  const season = SEASONS[festival.season] || SEASONS.spring;
  const name = festival.displayName || festival.name;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const region = t.regions[festival.region] || "";
  const sigungu = festival.displaySigungu || festival.sigungu || "";
  const hasCoords = Number.isFinite(festival.lat) && Number.isFinite(festival.lng);
  const statusLabel =
    status.key === "upcoming" ? status.label : t.status[status.key];

  const [overview, setOverview] = useState(festival.description || "");

  // 스크롤 잠금 + ESC로 닫기
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 한 줄 소개 보강 (TourAPI 축제는 목록에 주소만 있어 소개문을 살짝 불러옴)
  useEffect(() => {
    let alive = true;
    if (festival.source === "tour") {
      fetch(`/api/overview?id=${encodeURIComponent(festival.id)}&locale=${locale}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive && d && d.description) setOverview(d.description);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [festival.id, festival.source, locale]);

  const goDetail = () => {
    onClose();
    router.push(href(`/festival/${festival.id}`));
  };

  const intro = overview
    ? overview.length > 160
      ? overview.slice(0, 160) + "…"
      : overview
    : `${name} — ${[region, sigungu].filter(Boolean).join(" ")}`;

  return (
    <div
      className="lcm-backdrop"
      onClick={onClose}
      style={{ "--accent": season.color, "--accent-soft": season.soft }}
    >
      <div
        className="lcm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <button className="lcm-close" onClick={onClose} aria-label="✕">
          ✕
        </button>

        {/* 왼쪽(모바일: 위): 카드뉴스식 요약 */}
        <div className="lcm-card">
          <div className="lcm-cover">
            <CoverImage
              className="lcm-cover-bg"
              src={festival.image}
              alt={name}
              accent={season.color}
              emoji={season.emoji}
            />
            <div className="lcm-cover-veil" />
            <div className="lcm-cover-text">
              <span className={`lcm-status ${status.key}`}>
                {status.key === "ongoing" && <span className="live-dot" />}
                {statusLabel}
              </span>
              <h2 className="lcm-title">{name}</h2>
              <p className="lcm-sub">
                {season.emoji} {region}
                {sigungu ? " · " + sigungu : ""}
              </p>
            </div>
          </div>
          <div className="lcm-body">
            <p className="lcm-period">
              📅 {formatPeriod(festival.startDate, festival.endDate)}
            </p>
            <p className="lcm-intro">{intro}</p>
            <button className="lcm-cta" onClick={goDetail}>
              {ux.detailCta} →
            </button>
            {/* 예매하기 / 홈페이지 — 단일 팝업이라 eager 조회(있을 때만 표시) */}
            <BookingButton festival={festival} eager />
            {shortSourceLabel(festival.source, locale) && (
              <p className="lcm-source">{shortSourceLabel(festival.source, locale)}</p>
            )}
          </div>
        </div>

        {/* 오른쪽(모바일: 아래): 미니 지도 + 하단 길찾기 버튼 (좌표 있을 때만) */}
        <div className="lcm-map-pane">
          {hasCoords ? (
            <>
              <div className="lcm-map-wrap">
                <MiniMap
                  lat={festival.lat}
                  lng={festival.lng}
                  name={name}
                  color={season.color}
                />
              </div>
              <div className="lcm-dir">
                <MapDirections name={name} lat={festival.lat} lng={festival.lng} />
              </div>
            </>
          ) : (
            <div className="lcm-nomap">🗺️ {t.detail.location}</div>
          )}
        </div>
      </div>
    </div>
  );
}
