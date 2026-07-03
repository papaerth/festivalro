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

export default function MapView({ festivals }) {
  const points = festivals.map((f) => [f.lat, f.lng]);

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
      {festivals.map((f) => {
        const color = (SEASONS[f.season] || SEASONS.spring).color;
        return (
          <Marker key={f.id} position={[f.lat, f.lng]} icon={makePin(color)}>
            <Popup>
              <strong>{f.name}</strong>
              <br />
              <span>{formatPeriod(f.startDate, f.endDate)}</span>
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
