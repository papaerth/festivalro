"use client";

import { useState } from "react";

// 대표 이미지 표시 부품.
//  - 이미지가 있으면 사진을 보여주고
//  - 이미지가 없거나 불러오기 실패하면 계절색 배경(+선택 이모지)으로 대체합니다.
//  => 깨진 이미지 아이콘이 절대 보이지 않습니다.
export default function CoverImage({ src, alt = "", accent, emoji = "", className = "" }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} cover-fallback`}
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
        aria-hidden={emoji ? undefined : true}
      >
        {emoji && <span className="cover-emoji">{emoji}</span>}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
