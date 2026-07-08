// ────────────────────────────────────────────────────────────────
//  이미지 프록시
//
//  네이버 블로그 썸네일(pstatic.net)은 외부 사이트에서 직접 표시하면
//  Referer 검사로 403 차단됩니다. 그래서 서버가 대신 이미지를 받아와
//  우리 사이트(같은 출처)에서 보여줍니다.
//
//  보안: 아무 주소나 대신 받아오면 위험하므로 네이버/pstatic 호스트만 허용.
// ────────────────────────────────────────────────────────────────

import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

// 허용 호스트인지 검사 (pstatic.net, naver.com, naver.net 계열만)
function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === "pstatic.net" ||
    h.endsWith(".pstatic.net") ||
    h.endsWith(".naver.com") ||
    h.endsWith(".naver.net")
  );
}

export async function GET(request) {
  const rl = rateLimit("img", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target) {
    return new Response("missing url", { status: 400 });
  }

  let u;
  try {
    u = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (u.protocol !== "https:" || !isAllowedHost(u.hostname)) {
    return new Response("host not allowed", { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // 네이버 Referer로 요청하면 차단 없이 이미지를 받아올 수 있음
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Referer: "https://m.blog.naver.com/",
      },
      next: { revalidate: 60 * 60 * 24 * 7 }, // 7일 캐시
    });
    clearTimeout(timer);

    if (!res.ok) return new Response("upstream error", { status: 502 });
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response("not an image", { status: 415 });
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    clearTimeout(timer);
    return new Response("proxy failed", { status: 502 });
  }
}
