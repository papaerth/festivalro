import { getFestivals } from "@/lib/festivals";
import { SITE_URL, localeHref } from "@/lib/i18n";
import { SEO_LOCALES, CITIES, currentMonths } from "@/lib/seoLanding";

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

  // 프로그래매틱 SEO 랜딩(영문 우선) — 허브·월별(현재~+12개월)·도시별·이번 주말.
  //  currentMonths()가 오늘 기준이라 크론/ISR 갱신 때 월 범위가 자동으로 밀림.
  for (const loc of SEO_LOCALES) {
    entries.push({ url: `${SITE_URL}${localeHref(loc, "/festivals-in-korea")}`, lastModified: now, changeFrequency: "daily", priority: 0.8 });
    entries.push({ url: `${SITE_URL}${localeHref(loc, "/this-weekend")}`, lastModified: now, changeFrequency: "daily", priority: 0.8 });
    for (const m of currentMonths(now, 12)) {
      entries.push({ url: `${SITE_URL}${localeHref(loc, `/festivals-in-korea/${m.slug}`)}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
    }
    for (const c of CITIES) {
      entries.push({ url: `${SITE_URL}${localeHref(loc, `/festivals-in-${c.slug}`)}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
    }
  }

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
