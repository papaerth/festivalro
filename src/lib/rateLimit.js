import "server-only"; // 서버에서만 사용 (실수로 클라이언트에 import 시 빌드 실패)

// ────────────────────────────────────────────────────────────────
//  API 남용 방지 (호출 횟수 제한 / rate limiting)
//
//  같은 방문자(IP)가 아주 짧은 시간에 비정상적으로 많이 호출하면
//  잠깐 동안 429(요청이 너무 많음) 응답으로 막고, 안내 메시지를 줍니다.
//
//  ▸ 방식: 서버 '메모리'에 IP별 횟수만 세는 방식 → Vercel 무료 플랜에서
//    동작하고 외부 유료 서비스가 필요 없습니다.
//    (서버 인스턴스마다 메모리가 따로라 완벽한 전역 집계는 아니지만,
//     한 명이 한 서버를 두드리는 전형적인 남용은 충분히 막습니다.
//     API 한도 고갈의 근본 방어는 각 라우트의 '캐싱'이 담당합니다.)
//
//  ▸ 정상 사용자는 절대 안 걸리게 넉넉히 잡았습니다.
//    참고: 홈 화면 한 번 열면 /api/videos 가 최대 10회(메인 쇼츠) 호출되므로,
//    새로고침을 여러 번 해도 안 걸리도록 그 몇 배로 설정했습니다.
// ────────────────────────────────────────────────────────────────

// ▼▼▼ 기준값 — 여기 숫자만 바꾸면 조정됩니다 ▼▼▼
export const RATE_WINDOW_MS = 60_000; // 집계 창: 1분

// 라우트별 '1분당 허용 횟수' (초과하면 잠시 차단)
export const RATE_LIMITS = {
  videos: 90, // 유튜브 검색 — 홈에서 최대 10회 버스트 → 넉넉히
  blog: 90, // 네이버 블로그 검색
  overview: 120, // 축제 개요(카드뉴스)
  weather: 120, // 날씨
  img: 240, // 이미지 프록시 (블로그 썸네일 여러 장)
  default: 120,
};
// ▲▲▲ 여기까지 ▲▲▲

// IP → { start(창 시작 시각), count(창 안에서의 호출 수) }
// 키는 `라우트이름:IP` 형태라 라우트별로 따로 셉니다.
const buckets = new Map();

// Vercel/프록시 뒤에서 진짜 방문자 IP 얻기
export function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// 호출을 1회 기록하고 허용 여부를 반환.
//  - 허용:  { ok: true }
//  - 초과:  { ok: false, retryAfter: 초 }
export function rateLimit(name, request) {
  const ip = getClientIp(request);
  const max = RATE_LIMITS[name] ?? RATE_LIMITS.default;
  const now = Date.now();
  const key = `${name}:${ip}`;

  let b = buckets.get(key);
  // 창이 없거나 1분이 지났으면 새 창 시작
  if (!b || now - b.start >= RATE_WINDOW_MS) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;

  // 메모리 누수 방지: 항목이 많이 쌓이면 만료된 것들 청소
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.start >= RATE_WINDOW_MS) buckets.delete(k);
    }
  }

  if (b.count > max) {
    const retryAfter = Math.max(1, Math.ceil((b.start + RATE_WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

// 429 응답 (친절한 안내 + Retry-After 헤더). 캐시되지 않도록 no-store.
export function rateLimitResponse(retryAfter) {
  return Response.json(
    {
      error: "rate_limited",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    }
  );
}
