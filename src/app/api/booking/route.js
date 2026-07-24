import { cleanBookingUrl } from "@/lib/booking";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ────────────────────────────────────────────────────────────────
//  예매/홈페이지 링크 지연 조회 — 목록에 링크가 없는 소스만 상세 API로 그때그때 해결.
//   · KOPIS(공연): 공연상세(pblprfr/{mt20id})의 예매처 목록(relates) → [{name,url}] + 대표 url.
//   · TourAPI(축제·행사): detailCommon2의 homepage(HTML) → url 1개.
//   · 그 외(서울·문화 등)는 목록에 homepage가 있어 클라이언트가 바로 처리 → 여기선 빈 값.
//  요청: /api/booking?id=<festivalId>   (kopis…=KOPIS, 숫자=TourAPI contentId)
//  응답: { url: string|null, list: [{name,url}] }
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const unescapeXml = (s = "") =>
  String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .trim();

async function fetchText(url, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, next: { revalidate: 60 * 60 * 24 } });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

// KOPIS 공연상세 → 예매처 목록
async function resolveKopis(mt20id) {
  const key = process.env.KOPIS_API_KEY;
  if (!key || !/^PF\w+$/i.test(mt20id)) return { url: null, list: [] };
  const xml = await fetchText(`http://www.kopis.or.kr/openApi/restful/pblprfr/${mt20id}?service=${encodeURIComponent(key)}`);
  const relatesBlock = (xml.match(/<relates>([\s\S]*?)<\/relates>/) || [])[1] || "";
  const list = [...relatesBlock.matchAll(/<relate>([\s\S]*?)<\/relate>/g)]
    .map((m) => {
      const b = m[1];
      const name = unescapeXml((b.match(/<relatenm>([\s\S]*?)<\/relatenm>/) || [])[1] || "");
      const url = cleanBookingUrl(unescapeXml((b.match(/<relateurl>([\s\S]*?)<\/relateurl>/) || [])[1] || ""));
      return url ? { name: name || url, url } : null;
    })
    .filter(Boolean);
  // 같은 URL 중복 제거
  const seen = new Set();
  const uniq = list.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  return { url: uniq[0]?.url || null, list: uniq };
}

// TourAPI detailCommon2 → homepage(HTML에서 URL 추출)
async function resolveTour(contentId) {
  const key = process.env.TOUR_API_KEY;
  if (!key) return { url: null, list: [] };
  let serviceKey = key;
  try { serviceKey = decodeURIComponent(key); } catch { serviceKey = key; }
  const p = new URLSearchParams({
    serviceKey, MobileOS: "ETC", MobileApp: "chukjero", _type: "json", contentId,
  });
  const text = await fetchText(`https://apis.data.go.kr/B551011/KorService2/detailCommon2?${p.toString()}`);
  if (!text) return { url: null, list: [] };
  let hp = "";
  try {
    const item = JSON.parse(text)?.response?.body?.items?.item;
    hp = (Array.isArray(item) ? item[0] : item)?.homepage || "";
  } catch {
    hp = "";
  }
  return { url: cleanBookingUrl(hp), list: [] };
}

export async function GET(request) {
  const rl = rateLimit("booking", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const id = new URL(request.url).searchParams.get("id") || "";
  let out = { url: null, list: [] };
  try {
    if (/^kopis/i.test(id)) {
      out = await resolveKopis(id.replace(/^kopis/i, ""));
    } else if (/^\d+$/.test(id)) {
      out = await resolveTour(id);
    }
  } catch {
    out = { url: null, list: [] };
  }
  return Response.json(out, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
