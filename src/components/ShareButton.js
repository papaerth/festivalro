"use client";

import { useState } from "react";

// 축제 공유 버튼.
//  - 모바일/지원 브라우저: 기본 공유 시트(카카오톡·메시지 등) 열기 (navigator.share)
//  - 그 외(데스크톱 등): 링크를 클립보드에 복사
//  - 둘 다 안 되면: 주소를 보여주는 창으로 대체
export default function ShareButton({ title }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = {
      title: `축제로 · ${title}`,
      text: `${title} 축제 정보를 축제로에서 확인해보세요!`,
      url,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // 사용자가 공유를 취소한 경우 등 — 아무 처리 안 함
      }
      return;
    }

    // 공유 시트 미지원 → 링크 복사
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 주소를 복사하세요", url);
    }
  };

  return (
    <button className="share-btn" onClick={handleShare} aria-label="이 축제 공유하기">
      {copied ? "✅ 링크가 복사됐어요" : "🔗 공유하기"}
    </button>
  );
}
