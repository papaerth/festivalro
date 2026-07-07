"use client";

import { useRef, useState } from "react";
import CoverImage from "./CoverImage";

// 장소 대표 사진 — 여러 장이면 좌우 스와이프(가로 스크롤 스냅) + 점 인디케이터.
//  사진이 없으면 계절색 자리표시(CoverImage 폴백).
export default function PlaceGallery({ images = [], name, accent = "#c2578a" }) {
  const imgs = images && images.length ? images : [null];
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };

  return (
    <div className="place-gallery">
      <div className="place-slides" ref={ref} onScroll={onScroll}>
        {imgs.map((src, i) => (
          <div className="place-slide" key={i}>
            <CoverImage
              className="place-slide-img"
              src={src}
              alt={name}
              accent={accent}
              emoji="📍"
            />
          </div>
        ))}
      </div>
      {imgs.length > 1 && (
        <div className="place-dots" aria-hidden="true">
          {imgs.map((_, i) => (
            <span key={i} className={`place-dot ${i === active ? "on" : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}
