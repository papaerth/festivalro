"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod, getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import CoverImage from "./CoverImage";

// 확장 카드 "상세보기" 버튼 라벨 (13개 언어, 미지정은 영어)
const DETAIL = {
  ko: "상세보기", en: "View", ja: "詳細", zh: "查看", "zh-TW": "查看",
  es: "Ver", fr: "Voir", ru: "Подробнее", de: "Ansehen", ar: "عرض",
  vi: "Xem", id: "Lihat", th: "ดู",
};

// 대한민국 구석구석 메인 배너 스타일 — 사진이 꽉 찬 대형 카드 캐러셀 (독립 섹션).
export default function HeroCarousel({ festivals = [], onPick, onReset }) {
  const { t, locale, href } = useI18n();
  const ux = getUiExtra(locale);
  const detailLabel = DETAIL[locale] || DETAIL.en;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(null); // 클릭한 카드의 확장 팝업
  const scroller = useRef(null);
  const activeRef = useRef(0);
  const n = festivals.length;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const scrollToIndex = useCallback((i) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.children[i];
    if (!card) return;
    const left = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2;
    el.scrollTo({ left, behavior: "smooth" });
  }, []);

  // 스크롤 위치로 현재 중앙 카드 계산
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      const cc = c.offsetLeft + c.clientWidth / 2;
      const d = Math.abs(cc - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setActive(best);
  }, []);

  // 5초 자동 넘김 (일시정지·1장 이하면 멈춤)
  useEffect(() => {
    if (paused || n <= 1) return;
    const id = setInterval(() => {
      scrollToIndex((activeRef.current + 1) % n);
    }, 5000);
    return () => clearInterval(id);
  }, [paused, n, scrollToIndex]);

  // 필터로 목록이 바뀌면 처음으로 되돌림 + 확장 팝업 닫기
  useEffect(() => {
    setActive(0);
    setExpanded(null);
    const el = scroller.current;
    if (el) el.scrollTo({ left: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, festivals]);

  if (n === 0) return null;

  const prev = () => scrollToIndex(Math.max(0, active - 1));
  const next = () => scrollToIndex(Math.min(n - 1, active + 1));

  return (
    <section className="hero-carousel">
      <div className="hero-bar">
        <span className="hero-title">{ux.trending}</span>
        {n > 1 && (
          <div className="hero-bar-right">
            <span className="hero-count">
              {active + 1} / {n}
            </span>
            <button
              className="hero-pause"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "play" : "pause"}
            >
              {paused ? "▶" : "⏸"}
            </button>
          </div>
        )}
      </div>

      <div className="hero-stage">
        {n > 1 && (
          <button className="hero-arrow prev" onClick={prev} aria-label="‹">
            ‹
          </button>
        )}
        <div className="hero-scroller" ref={scroller} onScroll={onScroll}>
          {festivals.map((f) => {
            const season = SEASONS[f.season] || SEASONS.spring;
            const st = getStatusInfo(f.startDate, f.endDate);
            const name = f.displayName || f.name;
            const region = t.regions[f.region] || "";
            return (
              <button
                key={f.id}
                className="hero-card"
                style={{ "--accent": season.color }}
                onClick={() => {
                  setExpanded(f);
                  onPick && onPick(f);
                }}
              >
                <CoverImage
                  className="hero-card-bg"
                  src={f.image}
                  alt={name}
                  accent={season.color}
                  emoji={season.emoji}
                />
                <span className={`hero-badge ${st.key}`}>
                  {st.key === "ongoing" ? t.status.ongoingShort : st.label}
                </span>
                <div className="hero-card-veil" />
                <div className="hero-card-text">
                  <h2 className="hero-card-title">{name}</h2>
                  <p className="hero-card-sub">
                    {formatPeriod(f.startDate, f.endDate)} · {season.emoji} {region}
                    {f.sigungu ? " " + f.sigungu : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {n > 1 && (
          <button className="hero-arrow next" onClick={next} aria-label="›">
            ›
          </button>
        )}

        {n > 1 && (
          <div className="hero-dots">
            {festivals.map((_, i) => (
              <button
                key={i}
                className={`hero-dot ${i === active ? "active" : ""}`}
                onClick={() => scrollToIndex(i)}
                aria-label={`${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <div
          className="hero-expand"
          role="dialog"
          aria-label={expanded.displayName || expanded.name}
        >
          <span
            className="hero-expand-img"
            style={{
              backgroundImage: expanded.image ? `url(${expanded.image})` : undefined,
              "--accent": (SEASONS[expanded.season] || SEASONS.spring).color,
            }}
            aria-hidden="true"
          >
            {!expanded.image && (
              <span className="hero-expand-emoji">
                {(SEASONS[expanded.season] || SEASONS.spring).emoji}
              </span>
            )}
          </span>
          <div className="hero-expand-info">
            <h3 className="hero-expand-title">
              {expanded.displayName || expanded.name}
            </h3>
            <p className="hero-expand-sub">
              {formatPeriod(expanded.startDate, expanded.endDate)}
              {expanded.sigungu ? ` · ${expanded.sigungu}` : ""}
            </p>
            {expanded.description && (
              <p className="hero-expand-desc">{expanded.description}</p>
            )}
            <Link
              className="hero-expand-btn"
              href={href(`/festival/${expanded.id}`)}
            >
              {detailLabel} →
            </Link>
          </div>
          <button
            className="hero-expand-close"
            onClick={() => {
              setExpanded(null);
              onReset && onReset(); // 팝업 닫기 + 지도·블로그·영상 통합 복귀
            }}
            aria-label="✕"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
