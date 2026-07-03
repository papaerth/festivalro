"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function makePin(color) {
  return L.divIcon({
    className: "festival-pin-wrap",
    html: `<span class="festival-pin" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

// 상세 화면의 작은 지도 — 축제 한 곳만 표시합니다.
export default function MiniMap({ lat, lng, name, color }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      className="mini-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={makePin(color)}>
        <Popup>
          <strong>{name}</strong>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
