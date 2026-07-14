"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "@/lib/I18nProvider";
import { MAP_GESTURE_TEXT } from "@/lib/i18n";
import { isTouchDevice } from "@/lib/mapGesture";

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
  const { locale } = useI18n();
  const touch = isTouchDevice();
  const gestureMsg = MAP_GESTURE_TEXT[locale] || MAP_GESTURE_TEXT.en;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      gestureHandling={touch}
      gestureHandlingOptions={
        touch
          ? { text: { touch: gestureMsg, scroll: gestureMsg, scrollMac: gestureMsg }, duration: 1600 }
          : undefined
      }
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
