"use client";

import { useEffect } from "react";

// 섹션·주요 블록이 화면에 들어올 때 아주 살짝 아래에서 떠오르며 나타나게 (한 번만).
//  - IntersectionObserver로 감시(스크롤 이벤트 폴링 X → 저사양에서도 가볍게)
//  - 한 번 나타나면 감시 해제(반복 애니메이션 없음)
//  - '동작 줄이기'(prefers-reduced-motion)면 아무것도 하지 않음(콘텐츠 항상 표시)
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (!("IntersectionObserver" in window)) return;

    const els = Array.from(
      document.querySelectorAll(".section, .hero-carousel, .home-shorts")
    );
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.remove("reveal-init");
            e.target.classList.add("reveal-in");
            obs.unobserve(e.target); // 한 번만
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );

    for (const el of els) {
      // 이미 화면에 보이는(상단) 요소는 숨기지 않음 → 로드 시 깜빡임 방지
      const rect = el.getBoundingClientRect();
      const alreadyVisible = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
      if (alreadyVisible) continue;
      el.classList.add("reveal-init");
      io.observe(el);
    }

    return () => io.disconnect();
  }, []);

  return null;
}
