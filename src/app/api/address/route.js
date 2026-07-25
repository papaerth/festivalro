import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ────────────────────────────────────────────────────────────────
//  주소 조회 — 카카오 로컬 API '키워드 검색'(v2/local/search/keyword).
//   · 공연장·행사장 이름(또는 축제명)으로 검색해 도로명 주소를 반환.
//   · 인증: REST API 키(Authorization: KakaoAK <KAKAO_REST_API_KEY>) — 서버에서만 사용(키 비노출).
//   · 키 없거나 결과 없으면 { address: null } — 카드가 기존 소개문으로 폴백(사이트 정상).
//  요청: /api/address?q=<검색어>
//  응답: { address, place, lat, lng }
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request) {
  const rl = rateLimit("address", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  const empty = Response.json({ address: null });
  if (!key || !q) return empty;

  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=1`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 60 * 60 * 24 * 7 }, // 주소는 잘 안 바뀜 → 7일 캐시
      }
    );
    if (!r.ok) return empty;
    const doc = (await r.json())?.documents?.[0];
    if (!doc) return empty;
    return Response.json(
      {
        address: doc.road_address_name || doc.address_name || null,
        place: doc.place_name || null,
        lat: Number(doc.y) || null,
        lng: Number(doc.x) || null,
      },
      { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } }
    );
  } catch {
    return empty;
  }
}
