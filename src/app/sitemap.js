import { getFestivals } from "@/lib/festivals";
import { SITE_URL } from "@/lib/i18n";

// /sitemap.xml 자동 생성 — 구글 등 검색엔진에 사이트의 페이지 목록을 제출합니다.
//  - 홈 + 개인정보 + 모든 축제 상세페이지.
//  - 하루마다 갱신(축제 목록은 캐시되어 있어 빠름). 실패해도 기본 URL은 제출.
export const revalidate = 86400;

export default async function sitemap() {
  const now = new Date();
  const entries = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  try {
    const festivals = await getFestivals();
    for (const f of festivals) {
      if (!f || !f.id) continue;
      entries.push({
        url: `${SITE_URL}/festival/${encodeURIComponent(f.id)}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    /* 축제 목록을 못 불러와도 홈·개인정보는 제출됨 */
  }

  return entries;
}
