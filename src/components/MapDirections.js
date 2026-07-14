"use client";

import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

// 카카오맵 / 네이버지도 길찾기 버튼 2개 (축제가 지도에 표시되는 모든 곳에 공용).
//  · 목적지 = 축제 좌표 + 축제명. 출발지는 비워둠 → 지도 앱에서 '내 위치'로 시작.
//    (우리는 위치 권한을 요구하지 않음)
//  · 각 서비스의 표준 링크(map.kakao.com / map.naver.com)를 새 탭으로 열기 →
//    모바일에서 앱이 설치돼 있으면 앱(App/Universal Link)으로, 없으면 웹으로.
export default function MapDirections({ name = "", lat, lng, compact = false }) {
  const { locale } = useI18n();
  const ux = getUiExtra(locale);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const dir = ux.directions || "길찾기";
  const kakaoBrand = locale === "ko" ? "카카오맵" : "KakaoMap";
  const naverBrand = locale === "ko" ? "네이버 지도" : "Naver Map";
  const enc = encodeURIComponent(name);

  // 표준 링크(목적지만) — 출발지 비움
  const kakaoUrl = `https://map.kakao.com/link/to/${enc},${lat},${lng}`;
  const naverUrl = `https://map.naver.com/p/directions/-/${lng},${lat},${enc},,/-/car`;

  return (
    <div className={`mapdir${compact ? " mapdir-compact" : ""}`}>
      <a
        className="mapdir-btn kakao"
        href={kakaoUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${dir} (${kakaoBrand})`}
        onClick={() => trackEvent("directions_click", { service: "kakao", festival_name: name })}
      >
        <span className="mapdir-mark k" aria-hidden="true">K</span>
        <span className="mapdir-txt"><span className="mapdir-dir">{dir} · </span>{kakaoBrand}</span>
      </a>
      <a
        className="mapdir-btn naver"
        href={naverUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${dir} (${naverBrand})`}
        onClick={() => trackEvent("directions_click", { service: "naver", festival_name: name })}
      >
        <span className="mapdir-mark n" aria-hidden="true">N</span>
        <span className="mapdir-txt"><span className="mapdir-dir">{dir} · </span>{naverBrand}</span>
      </a>
    </div>
  );
}
