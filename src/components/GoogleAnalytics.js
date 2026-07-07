"use client";

import Script from "next/script";

// Google Analytics(GA4) 로더.
//  - 환경변수 NEXT_PUBLIC_GA_ID(G-로 시작하는 측정 ID)가 설정돼 있을 때만 로드.
//  - IP 익명화(anonymize_ip) 적용 → 개인 식별 방지.
//  - ID가 없으면 아무것도 로드하지 않음(설정 전에도 사이트 정상 동작).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
      </Script>
    </>
  );
}
