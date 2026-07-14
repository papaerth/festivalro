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
import sharp from "sharp";

// 이미지 리사이즈에 sharp(네이티브 모듈)를 쓰므로 Node.js 런타임 고정
export const runtime = "nodejs";

// 썸네일 최대 변(px). 카드가 84px 정사각형이라 고해상도(3x)까지 넉넉히 커버.
const THUMB_MAX = 360;

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

    const input = Buffer.from(await res.arrayBuffer());

    // 썸네일 크기로 리사이즈 + webp 변환 (네이버 원본이 ~1MB라 대폭 축소).
    //  실패하면(지원 안 되는 포맷 등) 원본을 그대로 돌려줌 → 이미지가 사라지지 않게.
    let outBuf = input;
    let outType = contentType;
    try {
      outBuf = await sharp(input)
        .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 74 })
        .toBuffer();
      outType = "image/webp";
    } catch {
      outBuf = input;
      outType = contentType;
    }

    return new Response(outBuf, {
      headers: {
        "Content-Type": outType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    clearTimeout(timer);
    return new Response("proxy failed", { status: 502 });
  }
}
