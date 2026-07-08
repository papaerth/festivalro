"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";

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

// 계절 색으로 물방울 모양 핀 아이콘을 만듭니다.
function makePin(color) {
  return L.divIcon({
    className: "festival-pin-wrap",
    html: `<span class="festival-pin" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

// 마커들이 모두 보이도록 지도 범위를 자동으로 맞춰줍니다.
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
  }, [points, map]);
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

// 지도에 한 번에 그리는 마커 상한 (성능 유지 — 데이터가 많아도 지도가 느려지지 않게)
const MARKER_CAP = 500;

export default function MapView({ festivals, ratings = {}, focus = null }) {
  const { locale, href } = useI18n();
  const viewDetail = VIEW_DETAIL[locale] || VIEW_DETAIL.ko;
  // 좌표가 있는 축제만 마커로 (좌표 없는 축제는 목록에만 표시)
  const withCoords = festivals.filter(
    (f) => Number.isFinite(f.lat) && Number.isFinite(f.lng)
  );
  const shown = withCoords.slice(0, MARKER_CAP);
  const points = shown.map((f) => [f.lat, f.lng]);
  const markerRefs = useRef({}); // 축제 id → 마커 인스턴스(팝업 열기용)

  return (
    <MapContainer
      center={[36.5, 127.8]}
      zoom={7}
      scrollWheelZoom={false}
      maxBounds={KOREA_BOUNDS}
      maxBoundsViscosity={1.0}
      className="map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <KoreaLock />
      {shown.map((f) => {
        const color = (SEASONS[f.season] || SEASONS.spring).color;
        const r = ratings[f.id];
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={makePin(color)}
            ref={(m) => {
              if (m) markerRefs.current[f.id] = m;
            }}
          >
            <Popup>
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
            </Popup>
          </Marker>
        );
      })}
      <FitBounds points={points} />
      <FocusFly focus={focus} markerRefs={markerRefs} />
    </MapContainer>
  );
}
