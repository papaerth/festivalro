"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect } from "react";
import { SEASONS } from "@/lib/seasons";
import { formatPeriod } from "@/lib/format";

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

// 지도에 한 번에 그리는 마커 상한 (성능 유지 — 데이터가 많아도 지도가 느려지지 않게)
const MARKER_CAP = 500;

export default function MapView({ festivals, ratings = {} }) {
  // 좌표가 있는 축제만 마커로 (좌표 없는 축제는 목록에만 표시)
  const withCoords = festivals.filter(
    (f) => Number.isFinite(f.lat) && Number.isFinite(f.lng)
  );
  const shown = withCoords.slice(0, MARKER_CAP);
  const points = shown.map((f) => [f.lat, f.lng]);

  return (
    <MapContainer
      center={[36.5, 127.8]}
      zoom={7}
      scrollWheelZoom={false}
      className="map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {shown.map((f) => {
        const color = (SEASONS[f.season] || SEASONS.spring).color;
        const r = ratings[f.id];
        return (
          <Marker key={f.id} position={[f.lat, f.lng]} icon={makePin(color)}>
            <Popup>
              <strong>{f.name}</strong>
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
              <Link className="popup-link" href={`/festival/${f.id}`}>
                상세보기 →
              </Link>
            </Popup>
          </Marker>
        );
      })}
      <FitBounds points={points} />
    </MapContainer>
  );
}
