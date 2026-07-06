"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import CoverImage from "./CoverImage";

const SLIDES = 5;

// 축제 카드뉴스 뷰어 — 데이터로 5장 슬라이드를 자동 생성해 전체화면으로 보여줍니다.
export default function CardNewsModal({ festival, onClose }) {
  const { t, locale, href } = useI18n();
  const ux = getUiExtra(locale);
  const router = useRouter();

  const season = SEASONS[festival.season] || SEASONS.spring;
  const name = festival.displayName || festival.name;
  const status = getStatusInfo(festival.startDate, festival.endDate);
  const place = [festival.sido, festival.sigungu].filter(Boolean).join(" ");
  const hasCoords = Number.isFinite(festival.lat) && Number.isFinite(festival.lng);

  const [idx, setIdx] = useState(0);
  const [overview, setOverview] = useState(festival.description || "");
  const [weather, setWeather] = useState({ status: "idle", days: [] });
  const touchX = useRef(null);

  const next = useCallback(() => setIdx((i) => Math.min(SLIDES - 1, i + 1)), []);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // 스크롤 잠금 + 키보드 조작
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, next, prev]);

  // 소개문 보강 (TourAPI 축제는 목록엔 주소만 있어 상세 소개문을 살짝 불러옴)
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

  // 날씨 미리보기 (날씨 슬라이드를 처음 볼 때만 로드)
  useEffect(() => {
    if (idx !== 3 || weather.status !== "idle" || !hasCoords) return;
    setWeather({ status: "loading", days: [] });
    fetch(`/api/weather?lat=${festival.lat}&lng=${festival.lng}`)
      .then((r) => r.json())
      .then((d) => setWeather({ status: "ok", days: (d.days || []).slice(0, 3) }))
      .catch(() => setWeather({ status: "error", days: [] }));
  }, [idx, weather.status, hasCoords, festival.lat, festival.lng]);

  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 45) prev();
    else if (dx < -45) next();
    touchX.current = null;
  };

  const goDetail = () => {
    onClose();
    router.push(href(`/festival/${festival.id}`));
  };

  const statusLabel =
    status.key === "upcoming" ? status.label : t.status[status.key];

  return (
    <div
      className="cn-backdrop"
      onClick={onClose}
      style={{ "--accent": season.color, "--accent-soft": season.soft }}
    >
      <div
        className="cn-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <button className="cn-close" onClick={onClose} aria-label="✕">
          ✕
        </button>

        <div
          className="cn-track"
          style={{ transform: `translateX(-${idx * 100}%)` }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* ① 대표 이미지 + 축제명 */}
          <section className="cn-slide cn-slide-cover">
            <CoverImage
              className="cn-cover"
              src={festival.image}
              alt={name}
              accent={season.color}
              emoji={season.emoji}
            />
            <div className="cn-cover-veil" />
            <div className="cn-cover-text">
              <span className={`cn-status ${status.key}`}>
                {status.key === "ongoing" && <span className="live-dot" />}
                {statusLabel}
              </span>
              <h2 className="cn-title">{name}</h2>
              <p className="cn-sub">{season.emoji} {t.regions[festival.region]} · {festival.sigungu}</p>
            </div>
          </section>

          {/* ② 기간 · 장소 · D-day */}
          <section className="cn-slide cn-slide-info">
            <div className="cn-emoji-big">📅</div>
            <p className="cn-info-line">{formatPeriod(festival.startDate, festival.endDate)}</p>
            {place && <p className="cn-info-line">📍 {place}</p>}
            {status.key === "upcoming" && (
              <p className="cn-dday">{status.label}</p>
            )}
            {status.key === "ongoing" && (
              <p className="cn-dday ongoing">{t.status.ongoingShort}</p>
            )}
          </section>

          {/* ③ 소개 요약 */}
          <section className="cn-slide cn-slide-about">
            <h3 className="cn-h">🎪 {ux.summary}</h3>
            <p className="cn-about-text">
              {overview
                ? overview.length > 220
                  ? overview.slice(0, 220) + "…"
                  : overview
                : `${name} — ${place}`}
            </p>
          </section>

          {/* ④ 날씨 미리보기 */}
          <section className="cn-slide cn-slide-weather">
            <h3 className="cn-h">{t.detail.weather}</h3>
            {!hasCoords ? (
              <p className="cn-about-text">{ux.noWeather}</p>
            ) : weather.status === "ok" && weather.days.length ? (
              <div className="cn-weather-row">
                {weather.days.map((d) => (
                  <div className="cn-weather-cell" key={d.date}>
                    <span className="cn-w-emoji">{d.emoji}</span>
                    <span className="cn-w-temp">
                      {d.max}° / {d.min}°
                    </span>
                  </div>
                ))}
              </div>
            ) : weather.status === "error" ? (
              <p className="cn-about-text">{ux.noWeather}</p>
            ) : (
              <p className="cn-about-text">···</p>
            )}
          </section>

          {/* ⑤ 자세히 보기 CTA */}
          <section className="cn-slide cn-slide-cta">
            <div className="cn-emoji-big">✨</div>
            <h3 className="cn-title" style={{ color: "var(--accent)" }}>{name}</h3>
            <button className="cn-cta-btn" onClick={goDetail}>
              {ux.detailCta} →
            </button>
          </section>
        </div>

        {/* PC 화살표 */}
        {idx > 0 && (
          <button className="cn-arrow cn-arrow-prev" onClick={prev} aria-label="←">‹</button>
        )}
        {idx < SLIDES - 1 && (
          <button className="cn-arrow cn-arrow-next" onClick={next} aria-label="→">›</button>
        )}

        {/* 진행 인디케이터(점) */}
        <div className="cn-dots">
          {Array.from({ length: SLIDES }).map((_, i) => (
            <button
              key={i}
              className={`cn-dot ${i === idx ? "active" : ""}`}
              onClick={() => setIdx(i)}
              aria-label={`${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
