"use client";

import { useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

const DIR = {
  ko: { locating: "내 위치 확인 중…", hint: "위치 권한을 허용하면 내 위치에서 출발하는 길찾기가 열려요." },
  en: { locating: "Locating…", hint: "Allow location to start directions from where you are." },
  ja: { locating: "現在地を確認中…", hint: "位置情報を許可すると、現在地からのルート案内が開きます。" },
  zh: { locating: "正在定位…", hint: "允许定位后，将从你的位置开始导航。" },
};

// 카카오맵 길찾기 링크를 새 창으로 엽니다.
//  - 브라우저 위치 권한을 허용하면: 내 위치 → 축제 (출발지 자동 설정)
//  - 거부/미지원이면: 축제를 도착지로 하는 기본 길찾기 링크
export default function DirectionsButton({ name, lat, lng }) {
  const [loading, setLoading] = useState(false);
  const { t, locale } = useI18n();
  const d = DIR[locale] || DIR.ko;

  const openKakao = (fromCoords) => {
    const dest = `${encodeURIComponent(name)},${lat},${lng}`;
    const url = fromCoords
      ? `https://map.kakao.com/link/from/내위치,${fromCoords.lat},${fromCoords.lng}/to/${dest}`
      : `https://map.kakao.com/link/to/${dest}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleClick = () => {
    if (!("geolocation" in navigator)) {
      openKakao(null);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        openKakao({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // 권한 거부 등 실패 시에도 축제 도착지 길찾기는 열어줍니다.
        setLoading(false);
        openKakao(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <>
      <button className="directions-btn" onClick={handleClick} disabled={loading}>
        {loading ? `🧭 ${d.locating}` : t.detail.directionsBtn}
      </button>
      <p className="directions-hint">{d.hint}</p>
    </>
  );
}
