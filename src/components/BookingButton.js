"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import { cleanBookingUrl, bookingLabel, bookingPickLabel, bookingIcon } from "@/lib/booking";
import { trackEvent } from "@/lib/analytics";

// 예매하기 / 홈페이지 버튼 (지도 팝업·카드 팝업·캐러셀 상세 공용).
//  · 즉시 URL(서울·문화 등 homepage/bookingUrl)이 있으면 바로 링크 렌더(조회 없음).
//  · KOPIS(공연)·TourAPI(축제)는 목록에 링크가 없어 /api/booking으로 지연 조회:
//      - eager=true(모달·캐러셀 상세: 한 번에 하나만 열림): 마운트 시 조회 → 링크 있으면 표시.
//      - eager=false(지도 팝업: 마커 최대 500개): 마운트 조회 금지.
//          · KOPIS는 '예매하기' 낙관 표시 후 클릭 시 조회(있으면 이동/여러 곳이면 목록, 없으면 숨김).
//          · TourAPI(축제)는 지도 팝업에선 생략(홈페이지 없는 경우가 많아 죽은 버튼 방지).
//  · bookingUrl 없으면 아무것도 렌더하지 않음(레이아웃 영향 0).
export default function BookingButton({ festival, compact = false, eager = false }) {
  const { locale } = useI18n();
  const [resolved, setResolved] = useState(null); // { url, list } — 지연 조회 결과
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fetchedRef = useRef(false);
  const rootRef = useRef(null);

  const source = festival?.source;
  const type = festival?.type;
  const immediate = cleanBookingUrl(festival?.bookingUrl || festival?.homepage);
  const lazyKopis = !immediate && source === "kopis";
  const lazyTour = !immediate && source === "tour" && type === "festival";
  const canLazy = lazyKopis || lazyTour;

  const doFetch = () => {
    if (fetchedRef.current) return Promise.resolve(resolved);
    fetchedRef.current = true;
    setLoading(true);
    return fetch(`/api/booking?id=${encodeURIComponent(festival.id)}`)
      .then((r) => r.json())
      .then((d) => {
        const url = cleanBookingUrl(d && d.url);
        const list = Array.isArray(d && d.list) ? d.list.filter((v) => v && v.url) : [];
        const res = { url, list };
        setResolved(res);
        if (!url) setFailed(true);
        return res;
      })
      .catch(() => {
        setFailed(true);
        return null;
      })
      .finally(() => setLoading(false));
  };

  // eager: 마운트 시 조회(모달·캐러셀 상세). 지도 팝업(eager=false)은 조회 안 함.
  useEffect(() => {
    let alive = true;
    if (eager && canLazy) {
      doFetch().then(() => {
        if (!alive) return;
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [festival?.id, eager, canLazy]);

  // 메뉴 바깥 클릭 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const label = bookingLabel(type, locale);
  const icon = bookingIcon(type);
  const track = (svc) => trackEvent("booking_click", { source, type, service: svc || "direct", festival_name: festival?.name });

  // 조회 결과의 대표 url / 예매처 목록
  const url = immediate || resolved?.url || null;
  const vendors = !immediate && resolved?.list && resolved.list.length > 1 ? resolved.list : null;

  // ── 렌더 판단 ──
  // 조회로 실패 확정 → 숨김. eager 조회 중(아직 결과 없음) → 숨김(깜빡임 방지).
  if (immediate == null && failed) return null;
  if (immediate == null && !resolved && !canLazy) return null; // 즉시 URL 없고 지연대상도 아님
  if (immediate == null && eager && !resolved) return null; // eager 조회 아직 → 확정 후 표시

  // 여러 예매처(KOPIS) → 드롭다운
  if (vendors) {
    return (
      <div className={`booking${compact ? " booking-compact" : ""}`} ref={rootRef}>
        <button
          type="button"
          className="booking-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {icon} {label} ▾
        </button>
        {menuOpen && (
          <div className="booking-menu" role="menu" aria-label={bookingPickLabel(locale)}>
            {vendors.map((v, i) => (
              <a
                key={i}
                role="menuitem"
                className="booking-menu-item"
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  track(v.name);
                  setMenuOpen(false);
                }}
              >
                {v.name || v.url}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 즉시/단일 URL 있음 → 바로 링크
  if (url) {
    return (
      <div className={`booking${compact ? " booking-compact" : ""}`}>
        <a
          className="booking-btn"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track()}
        >
          {icon} {label}
        </a>
      </div>
    );
  }

  // 지연대상(주로 지도 팝업 KOPIS): 낙관 버튼 → 클릭 시 조회 후 이동/목록
  if (canLazy) {
    const onOptimisticClick = async () => {
      const res = await doFetch();
      const u = res && res.url;
      if (!u) return; // 예매처 없음 → 이후 렌더에서 숨김
      const many = res.list && res.list.length > 1;
      if (many) {
        setMenuOpen(true); // 여러 곳 → 드롭다운(다음 렌더에서 vendors 분기)
      } else {
        track();
        window.open(u, "_blank", "noopener,noreferrer");
      }
    };
    return (
      <div className={`booking${compact ? " booking-compact" : ""}`} ref={rootRef}>
        <button type="button" className="booking-btn" onClick={onOptimisticClick} disabled={loading}>
          {icon} {label}{loading ? " …" : ""}
        </button>
      </div>
    );
  }

  return null;
}
