"use client";

import dynamic from "next/dynamic";

// SEO 랜딩용 지도 — 기존 MapView(마커·클러스터·팝업) 재사용. 읽기 전용(필터 없음).
//  · 팝업의 '상세보기'는 onOpenDetail 미제공 → 상세 페이지 링크로 동작(크롤 가능한 내부 링크).
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="skeleton skel-map" />,
});

export default function LandingMap({ festivals = [], center = null }) {
  return (
    <div className="landing-map">
      <MapView festivals={festivals} regionCenter={center} />
    </div>
  );
}
