"use client";

import { useState } from "react";

// 블로그 카드 대표 썸네일 (정사각형).
//  · 네이버 블로그 이미지(pstatic.net)는 외부에서 직접 표시하면 Referer 검사로 403 →
//    우리 서버(/api/img)를 경유해 표시.
//  · og:image가 없거나 로딩 실패하면 → 계절 테마색 그라데이션 + 블로그명 이니셜로 대체
//    (깨진 이미지 대신, 썸네일이 없어도 카드 레이아웃이 안 깨지게).
export default function BlogThumb({ src, blogger, accent = "#c2578a" }) {
  const [failed, setFailed] = useState(false);
  const initial = String(blogger || "블").trim().charAt(0).toUpperCase() || "블";

  if (!src || failed) {
    return (
      <div
        className="blog-thumb blog-thumb-empty"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
        aria-hidden="true"
      >
        {initial}
      </div>
    );
  }

  return (
    <div className="blog-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/img?url=${encodeURIComponent(src)}`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
