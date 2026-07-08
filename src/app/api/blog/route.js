import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ────────────────────────────────────────────────────────────────
//  블로그 검색 중계소 (네이버 검색 API)
//
//  .env.local 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 가 있으면
//  축제 이름으로 네이버 블로그를 검색해 '정확도순(상위노출 근사)'으로,
//  '최근 3년' 글 5개를 돌려줍니다. 각 글의 대표 이미지(og:image)도 함께.
//
//  키가 없으면 { configured:false } 를 돌려주고, 화면은 '네이버에서
//  블로그 검색' 링크로 자동 대체됩니다. (키 발급 후 자동 전환)
// ────────────────────────────────────────────────────────────────

// 네이버 응답의 <b> 강조태그·HTML 특수문자를 깔끔한 텍스트로 정리
function clean(s = "") {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// 3년 전 날짜를 "YYYYMMDD" 문자열로 (네이버 postdate와 같은 형식)
function threeYearsAgo() {
  const now = new Date();
  const c = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const y = c.getFullYear();
  const m = String(c.getMonth() + 1).padStart(2, "0");
  const d = String(c.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 블로그 글의 대표 이미지(og:image)를 가져옵니다. 실패하면 null.
//  - 네이버 블로그는 og:image가 '모바일 페이지(m.blog.naver.com)'에만 있어서
//    PC 링크를 모바일 링크로 바꿔서 조회합니다.
//  - 3초 안에 못 가져오면 null (목록 전체가 느려지지 않도록).
//  - next.revalidate 로 같은 글은 하루 동안 캐시(매번 재추출 방지).
async function fetchOgImage(link) {
  try {
    const mobile = link.replace("://blog.naver.com", "://m.blog.naver.com");
    const res = await fetchWithTimeout(
      mobile,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        },
        next: { revalidate: 60 * 60 * 24 }, // 24시간 캐시
      },
      3000
    );
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const rl = rateLimit("blog", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
  }

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;

  // 키가 없으면 화면이 링크아웃으로 대체되도록 알려줌
  if (!id || !secret || id.startsWith("여기에")) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const url =
    `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}` +
    `&display=100&sort=sim`; // sim = 정확도순(상위노출 근사), 넉넉히 100개

  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "X-Naver-Client-Id": id,
          "X-Naver-Client-Secret": secret,
        },
        next: { revalidate: 60 * 60 * 6 }, // 6시간 캐시
      },
      5000
    );
    if (!res.ok) throw new Error(`naver ${res.status}`);

    const data = await res.json();
    const cutoff = threeYearsAgo();

    // 최근 3년 글만, 정확도순 유지, 상위 5개
    const items = (data.items || [])
      .map((it) => ({
        title: clean(it.title),
        link: it.link,
        blogger: it.bloggername,
        postdate: it.postdate, // "YYYYMMDD"
      }))
      .filter((it) => it.postdate && it.postdate >= cutoff)
      .slice(0, 5);

    // 각 글의 대표 이미지를 병렬로 가져와 붙임 (실패해도 진행)
    await Promise.all(
      items.map(async (it) => {
        it.image = await fetchOgImage(it.link);
      })
    );

    return NextResponse.json(
      { configured: true, items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.warn("[blog] 네이버 검색 실패:", err.message);
    return NextResponse.json(
      { configured: true, items: [], error: true },
      { status: 502 }
    );
  }
}
