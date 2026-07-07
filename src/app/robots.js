import { SITE_URL } from "@/lib/i18n";

// /robots.txt 자동 생성 — 검색봇에게 크롤 규칙과 사이트맵 위치를 알려줍니다.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API·계정 관련 페이지는 크롤 제외(검색 노출 불필요)
      disallow: ["/api/", "/login", "/mypage", "/profile"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
