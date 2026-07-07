"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

// 주변 장소 카드 링크 (클릭 집계용 클라이언트 래퍼).
//  - external=true면 카카오맵 새 탭(외부), 아니면 사이트 내부 /place 로 이동.
//  - 클릭 시 nearby_click 이벤트 전송(category=stay/restaurant/tourspot).
export default function NearbyCardLink({
  href,
  external = false,
  category,
  placeId,
  placeName,
  children,
}) {
  const onClick = () =>
    trackEvent("nearby_click", {
      category,
      place_id: placeId,
      place_name: placeName,
    });

  if (external) {
    return (
      <a
        className="nearby-card"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <Link className="nearby-card" href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
