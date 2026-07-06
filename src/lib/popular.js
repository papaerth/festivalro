// ────────────────────────────────────────────────────────────────
//  '다가오는 인기 축제' 선정 (복합 점수)
//   점수 = 네이버 블로그 글 수(로그) + 대표이미지 유무 + 출처(tour) + 임박도
//   ※ 블로그 조회는 후보 상위 15개만(6~24h 캐시) → 서버 부담 최소화
//   ※ 이 점수는 홈의 대형 히어로 캐러셀(HeroCarousel) 정렬 힌트로 사용
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { getStatusInfo } from "./format";

// 네이버 블로그 '전체 글 수'를 인기 신호로 (키 없으면 0, 실패 시 throw → 캐시 안 됨)
async function fetchBlogCountRaw(query) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret || id.startsWith("여기에")) return 0;

  const url =
    `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}` +
    `&display=1&sort=sim`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`naver ${res.status}`);
    const data = await res.json();
    return Number(data.total) || 0;
  } finally {
    clearTimeout(timer);
  }
}

// 성공 결과만 24시간 캐시 (검색어별)
const blogCountCached = unstable_cache(fetchBlogCountRaw, ["blog-count-v1"], {
  revalidate: 60 * 60 * 24,
});

async function getBlogCount(query) {
  try {
    return await blogCountCached(query);
  } catch {
    return 0;
  }
}

// [공개] 다가오는 인기 축제 상위 목록 (기본 12개 반환 → 클라에서 후기 가점 후 8개)
export async function getPopularFestivals(festivals, limit = 12) {
  const now = new Date();

  // 후보: 진행중 또는 D-30 이내 시작
  const cands = [];
  for (const f of festivals) {
    const st = getStatusInfo(f.startDate, f.endDate, now);
    const ongoing = st.key === "ongoing";
    if (!ongoing && !(st.key === "upcoming" && st.dday <= 30)) continue;
    const dday = ongoing ? 0 : st.dday;
    const pre =
      (f.image ? 2 : 0) +
      (f.source === "tour" ? 1 : 0) +
      (ongoing ? 1.5 : ((30 - dday) / 30) * 1.5);
    cands.push({ f, dday, ongoing, pre });
  }
  if (cands.length === 0) return [];

  // 블로그 조회 비용을 아끼려고 사전 점수 상위 15개만 블로그 글 수 조회
  cands.sort((a, b) => b.pre - a.pre);
  const pool = cands.slice(0, 15);
  await Promise.all(
    pool.map(async (c) => {
      c.blogCount = await getBlogCount(c.f.name);
    })
  );

  for (const c of pool) {
    const blogScore = Math.log10((c.blogCount || 0) + 1) * 2.2;
    c.score = c.pre + blogScore;
  }
  pool.sort((a, b) => b.score - a.score);

  return pool.slice(0, limit).map((c) => ({
    ...c.f,
    popScore: Math.round(c.score * 100) / 100,
    blogCount: c.blogCount || 0,
    dday: c.dday,
    ongoing: c.ongoing,
  }));
}
