"use client";

import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useMemo } from "react";
import { markerColor, typeTheme } from "@/lib/seasons";
import { formatPeriod } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { MAP_GESTURE_TEXT, getMarketText, getFireworksText } from "@/lib/i18n";
import { nextMarketDay, formatMarketDate } from "@/lib/marketDay";
import { isTouchDevice } from "@/lib/mapGesture";
import MapDirections from "./MapDirections";

const VIEW_DETAIL = {
  "zh-TW": "查看 →",
  es: "Ver →",
  fr: "Voir →",
  ru: "Подробнее →",
  de: "Ansehen →",
  ar: "عرض →",
  vi: "Xem →",
  id: "Lihat →",
  th: "ดู →", ko: "상세보기 →", en: "View →", ja: "詳細 →", zh: "查看 →" };

// 물방울 모양 핀 아이콘. 축제는 계절색(기존 그대로), 전시·공연은 유형색 + 작은 글리프로 살짝 구분.
function makePin(color, glyph = "") {
  const inner = glyph ? `<span class="festival-pin-glyph">${glyph}</span>` : "";
  return L.divIcon({
    className: "festival-pin-wrap",
    html: `<span class="festival-pin" style="--pin:${color}">${inner}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

// 좌표 안전검사: 한국 범위(위도33~39, 경도124~132) 안이면 그대로, 위경도가 뒤바뀌었으면 교정,
//  범위 밖(0,0·깨진 값 등)이면 null → 지도에서 제외(엉뚱한 좌표가 fitBounds를 끌어당기지 않게).
function safeLatLng(f) {
  const a = Number(f.lat);
  const b = Number(f.lng);
  const ok = (lat, lng) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
  if (ok(a, b)) return [a, b];
  if (ok(b, a)) return [b, a]; // 위/경도 뒤바뀜 교정
  return null;
}

// 지도 초기(전국) 뷰 — 남한 전체가 보이는 기본 center/zoom. 지역 해제 시 이 값으로 복귀.
export const DEFAULT_CENTER = [36.5, 127.8];
export const DEFAULT_ZOOM = 7;

// 마커들이 모두 보이도록 지도 범위를 자동으로 맞춥니다.
//  첫 렌더는 즉시, 이후(유형/지역/계절 전환 등 마커 집합 변경)는 부드럽게(flyToBounds).
//  points는 상위에서 메모이즈되어 마커 집합이 바뀔 때만 갱신됨 → 카드 클릭엔 재실행 안 됨.
//  regionCenter: 지역 선택 시 그 지역 중심([위도,경도]) — 마커가 없을 때 이 좌표로 이동.
//  homeSignal: 지역 필터 해제 시 +1 → 마커 fit 대신 기본 전국 뷰로 flyTo(부드럽게).
function FitBounds({ points, regionCenter, homeSignal = 0 }) {
  const map = useMap();
  const first = useRef(true);
  const prevHome = useRef(homeSignal);
  useEffect(() => {
    // 컨테이너 크기 변화(카드뉴스 유무로 지도 폭이 40%↔100% 바뀜 등)를 Leaflet에 먼저 반영.
    //  → 바뀐 크기 기준으로 bounds를 계산해야 중심이 틀어지지 않고, 오른쪽 절반 회색(타일 미로딩) 방지.
    map.invalidateSize({ animate: false });
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 지역 해제 신호가 올라오면: 마커 fit보다 우선해서 기본 전국 뷰로 복귀(flyTo).
    if (homeSignal !== prevHome.current) {
      prevHome.current = homeSignal;
      first.current = false;
      if (reduce) map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      else map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
      return;
    }
    const instant = first.current || reduce;
    first.current = false;
    // 마커가 없으면 빈 bounds로 fitBounds하지 않고, 지역 중심으로 이동(있을 때만).
    if (!points.length) {
      if (regionCenter) {
        if (instant) map.setView(regionCenter, 11);
        else map.flyTo(regionCenter, 11, { duration: 0.5 });
      }
      return;
    }
    if (points.length === 1) {
      if (instant) map.setView(points[0], 12);
      else map.flyTo(points[0], 12, { duration: 0.5 });
      return;
    }
    if (instant) map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
    else map.flyToBounds(points, { padding: [40, 40], maxZoom: 12, duration: 0.5 });
  }, [points, regionCenter, homeSignal, map]);
  return null;
}

// 지도 컨테이너 크기가 바뀌면(카드뉴스 유무로 지도 폭 변화, 창 크기 등) Leaflet에 알려
//  타일을 다시 그리게 함(오른쪽 절반 회색 방지). Leaflet 자체 resize 이벤트는 '창' 리사이즈만
//  잡으므로, 컨테이너 자체 크기 변화는 ResizeObserver로 직접 감지.
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [map]);
  return null;
}

// 마커 팝업 열림/닫힘 처리:
//  ① 상위(HomeClient)에 알림 → 필터 접힘 연동
//  ② 상단부 마커면 지도를 살짝 아래로(팝업이 필터에 안 가리게). Leaflet 기본 autoPan은
//     maxBounds+viscosity와 충돌해 무한재귀 크래시 → 끄고 단일 panBy 사용.
//  ③ 팝업 '열기 직전' 지도 뷰(중심+줌)를 저장 → 팝업이 닫히면(X·빈곳 클릭·ESC 등) 그 뷰로 복귀.
//     · 팝업 열린 채 사용자가 직접 드래그/줌하면 복귀하지 않고 현재 위치 유지.
//     · 마커를 연달아 클릭해도 '최초 열기 직전' 뷰를 유지(중간 마커로 덮어쓰지 않음).
function PopupEvents({ onOpen, onClose }) {
  const map = useMap();
  const saved = useRef(null); // 팝업 열기 직전 { center, zoom }
  const active = useRef(false); // 팝업 세션 진행 중(하나라도 열려 있음)
  const openCount = useRef(0); // 열린 팝업 수(마커 전환 시 close→open 연달아 대비)
  const userMoved = useRef(false); // 세션 중 사용자가 직접 이동/줌했는지
  const flyingUntil = useRef(0); // 이 시각 이전의 줌 변화는 프로그램(마커 flyTo)로 간주

  useMapEvents({
    popupopen: (e) => {
      openCount.current += 1;
      // 마커 클릭 뒤엔 그 마커로 flyTo(프로그램 이동)가 따라오므로, 그 구간의 줌은 사용자조작으로 안 침.
      flyingUntil.current = Date.now() + 900;
      if (!active.current) {
        // 첫 팝업: 지금이 '열기 직전' 뷰(아직 마커로 안 날아감) → 저장. 이후 마커 전환에선 덮어쓰지 않음.
        saved.current = { center: map.getCenter(), zoom: map.getZoom() };
        userMoved.current = false;
        active.current = true;
      }
      onOpen && onOpen();
      try {
        const ll = e.popup && e.popup.getLatLng && e.popup.getLatLng();
        if (!ll) return;
        const y = map.latLngToContainerPoint(ll).y;
        const RESERVE = 150; // 상단 필터/요약 + 팝업 높이 여유
        if (y < RESERVE) map.panBy([0, y - RESERVE], { animate: true, duration: 0.4 });
      } catch {
        /* 팝업 위치 보정 실패는 무시 */
      }
    },
    // 드래그는 항상 사용자(프로그램 이동은 dragstart 없음). 줌은 flyTo 구간만 제외.
    dragstart: () => {
      if (active.current) userMoved.current = true;
    },
    zoomstart: () => {
      if (active.current && Date.now() > flyingUntil.current) userMoved.current = true;
    },
    popupclose: () => {
      openCount.current = Math.max(0, openCount.current - 1);
      onClose && onClose();
      // 다른 마커로 전환하면 close 직후 open이 오므로, 다음 프레임에 '정말 다 닫혔는지' 확인.
      requestAnimationFrame(() => {
        if (openCount.current > 0 || !active.current) return; // 다른 팝업 열림 → 세션 유지
        const target = saved.current;
        const shouldReturn = target && !userMoved.current;
        active.current = false;
        saved.current = null;
        userMoved.current = false;
        // 사용자가 직접 안 움직였으면 '열기 직전' 뷰로 부드럽게 복귀
        if (shouldReturn) map.flyTo(target.center, target.zoom, { duration: 0.5 });
      });
    },
  });
  return null;
}

// 지도를 한국(남한)으로 고정 — 아무리 축소·이동해도 중국·일본이 화면을 채우지 않게.
//  - maxBounds(아래 MapContainer): 이동 가능 범위를 한반도 주변으로 제한
//  - minZoom: 남한 전체가 보이는 줌보다 더 축소 불가 (컨테이너 크기에 맞춰 자동 계산)
const KOREA_BOUNDS = [
  [33.0, 125.2], // 남서(제주 포함)
  [38.7, 130.0], // 북동
];
function KoreaLock() {
  const map = useMap();
  useEffect(() => {
    const applyMinZoom = () => {
      const z = map.getBoundsZoom(KOREA_BOUNDS); // 남한 전체가 들어가는 줌
      map.setMinZoom(z);
      if (map.getZoom() < z) map.setView(map.getCenter(), z);
    };
    applyMinZoom();
    // flex 레이아웃이 확정된 뒤 지도 크기 재계산 + 최소줌 다시 적용
    const t = setTimeout(() => {
      map.invalidateSize();
      applyMinZoom();
    }, 80);
    map.on("resize", applyMinZoom); // 반응형으로 지도 크기가 바뀌면 최소줌 재계산
    return () => {
      clearTimeout(t);
      map.off("resize", applyMinZoom);
    };
  }, [map]);
  return null;
}

// 카드에서 축제를 고르면 그 위치로 부드럽게 이동(flyTo)하고,
// 이동이 끝나는 타이밍에 해당 마커 팝업을 엽니다.
//  - '동작 줄이기' 설정이면 비행 없이 즉시 이동 + 즉시 팝업
function FocusFly({ focus, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!focus || !Number.isFinite(focus.lat) || !Number.isFinite(focus.lng)) return;
    const openPopup = () => {
      const m =
        markerRefs && markerRefs.current && focus.id
          ? markerRefs.current[focus.id]
          : null;
      if (m && m.openPopup) m.openPopup();
    };
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      map.setView([focus.lat, focus.lng], 12);
      openPopup();
    } else {
      map.flyTo([focus.lat, focus.lng], 12, { duration: 0.6 });
      map.once("moveend", openPopup);
    }
  }, [focus, map, markerRefs]);
  return null;
}

// 선택 해제(리셋) 시: 열린 마커 팝업을 닫고, 전체 축제가 보이도록 부드럽게 줌아웃(0.3초).
//  ※ 첫 렌더(signal=0)는 무시하고, signal이 바뀔 때만 동작. '동작 줄이기' 설정이면 즉시 이동.
function ResetView({ signal, points }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.closePopup();
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
    else map.flyToBounds(points, { padding: [40, 40], maxZoom: 12, duration: 0.3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
  return null;
}

// 전통시장 마커 팝업 — 기간 대신 장날/운영시간을 보여줍니다.
function MarketPopup({ f, locale, href, viewDetail }) {
  const mt = getMarketText(locale);
  const nd = nextMarketDay(f.openDays);
  const name = f.displayName || f.name;
  return (
    <>
      <strong>{name}</strong>
      <br />
      <span>
        {nd
          ? nd.isToday
            ? `🏪 ${mt.today}`
            : `🏪 ${mt.next}: ${formatMarketDate(nd.date, mt.intl)}`
          : f.hours
          ? `🕕 ${f.hours}`
          : mt.typeLabel(f.marketType)}
      </span>
      <br />
      <Link className="popup-link" href={href(`/market/${f.id}`)}>
        {viewDetail}
      </Link>
      <MapDirections name={name} lat={f.lat} lng={f.lng} compact />
    </>
  );
}

// 상설 불꽃놀이 명소 팝업 — 기간 대신 '상설' + 운영 안내.
function SpotPopup({ f, locale }) {
  const fw = getFireworksText(locale);
  const name = f.displayName || f.name;
  return (
    <>
      <strong>🎆 {name}</strong>
      <br />
      <span>[{fw.permanent}] {f.scheduleText || ""}</span>
      <MapDirections name={name} lat={f.lat} lng={f.lng} compact />
    </>
  );
}

// 지도에 한 번에 그리는 마커 상한 (성능 유지 — 데이터가 많아도 지도가 느려지지 않게)
const MARKER_CAP = 500;

export default function MapView({ festivals, ratings = {}, focus = null, onSelect = null, resetSignal = 0, onPopupOpen = null, onPopupClose = null, regionCenter = null, homeSignal = 0 }) {
  const { locale, href } = useI18n();
  const viewDetail = VIEW_DETAIL[locale] || VIEW_DETAIL.ko;
  // 터치 기기에서만 제스처 핸들링 활성화 (한 손가락 스크롤 / 두 손가락 지도 조작 + 안내)
  const touch = isTouchDevice();
  const gestureMsg = MAP_GESTURE_TEXT[locale] || MAP_GESTURE_TEXT.en;
  // 좌표가 '한국 범위 안'으로 유효한 축제만 마커로. 뒤바뀐 좌표는 교정, 범위 밖은 제외.
  //  (좌표 없는/이상한 축제는 목록에만 표시 — 엉뚱한 좌표가 지도 중심을 끌어당기지 않게)
  const withCoords = festivals
    .map((f) => ({ ...f, _ll: safeLatLng(f) }))
    .filter((f) => f._ll);
  const shown = withCoords.slice(0, MARKER_CAP);
  // 마커 집합(id)이 실제로 바뀔 때만 points 참조가 바뀌도록 메모이즈.
  //  → 카드 클릭(포커스)처럼 마커가 그대로면 FitBounds가 재실행되지 않음(부드러운 줌이 튀지 않게).
  const pointsKey = shown.map((f) => f.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => shown.map((f) => f._ll), [pointsKey]);
  const markerRefs = useRef({}); // 축제 id → 마커 인스턴스(팝업 열기용)

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={false}
      zoomControl={false}
      gestureHandling={touch}
      gestureHandlingOptions={
        touch
          ? { text: { touch: gestureMsg, scroll: gestureMsg, scrollMac: gestureMsg }, duration: 1000 }
          : undefined
      }
      maxBounds={KOREA_BOUNDS}
      maxBoundsViscosity={1.0}
      className="map"
    >
      {/* 줌 버튼을 우하단으로 — 상단 오버레이 필터 칩과 겹치지 않게 */}
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <KoreaLock />
      {shown.map((f) => {
        // 상설 불꽃놀이 명소는 전용 색·🎆 글리프로 구분
        const color = f.permanent ? "#B5427A" : markerColor(f);
        const glyph = f.permanent
          ? "🎆"
          : f.type === "exhibition" || f.type === "performance" || f.type === "market"
          ? typeTheme(f.type).emoji
          : "";
        const r = ratings[f.id];
        return (
          <Marker
            key={f.id}
            position={f._ll}
            icon={makePin(color, glyph)}
            eventHandlers={{
              click: () => onSelect && onSelect(f),
            }}
            ref={(m) => {
              // 마커 언마운트(카테고리 전환 등) 시 참조를 지워 stale 참조·메모리 누적 방지
              if (m) markerRefs.current[f.id] = m;
              else delete markerRefs.current[f.id];
            }}
          >
            <Popup autoPan={false}>
              {f.permanent ? (
                <SpotPopup f={f} locale={locale} />
              ) : f.type === "market" ? (
                <MarketPopup f={f} locale={locale} href={href} viewDetail={viewDetail} />
              ) : (
                <>
                  <strong>{f.displayName || f.name}</strong>
                  <br />
                  <span>{formatPeriod(f.startDate, f.endDate)}</span>
                  {r && r.count > 0 && (
                    <>
                      <br />
                      <span>
                        ⭐ {r.avg.toFixed(1)} ({r.count})
                      </span>
                    </>
                  )}
                  <br />
                  <Link className="popup-link" href={href(`/festival/${f.id}`)}>
                    {viewDetail}
                  </Link>
                  <MapDirections name={f.displayName || f.name} lat={f.lat} lng={f.lng} compact />
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
      <FitBounds points={points} regionCenter={regionCenter} homeSignal={homeSignal} />
      <FocusFly focus={focus} markerRefs={markerRefs} />
      <ResetView signal={resetSignal} points={points} />
      <PopupEvents onOpen={onPopupOpen} onClose={onPopupClose} />
      <InvalidateOnResize />
    </MapContainer>
  );
}
