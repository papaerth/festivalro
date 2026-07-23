// (임시 진단) 문화정보 커넥터가 실제로 몇 건 수집하는지 직접 확인용.
//  https://chukjero.com/api/culture-debug?key=<CRON_SECRET>
import { fetchFromCulture } from "@/lib/culture";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const env = {
    CULTURE_API_ENABLED: process.env.CULTURE_API_ENABLED || null,
    hasCultureKey: !!process.env.CULTURE_API_KEY,
    hasTourKey: !!process.env.TOUR_API_KEY,
    base: process.env.CULTURE_API_BASE || "(default cultureinfo/period2)",
  };
  // API의 총건수(totalCount) + 페이지1 실제 파싱 진단
  let totalCount = null;
  let diag = null;
  try {
    const key = encodeURIComponent(decodeURIComponent(process.env.CULTURE_API_KEY || process.env.TOUR_API_KEY || ""));
    const now = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const from = ymd(new Date(now.getTime() - 3 * 365 * 86400000));
    const to = ymd(new Date(now.getTime() + 365 * 86400000));
    const base = process.env.CULTURE_API_BASE || "https://apis.data.go.kr/B553457/cultureinfo/period2";
    const r = await fetch(`${base}?serviceKey=${key}&from=${from}&to=${to}&cPage=1&rows=100&sortStdr=1`, { signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    totalCount = (t.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || `(없음) ${t.slice(0, 80)}`;
    const wrap = t.includes("<perforList>") ? "perforList" : t.includes("<item>") ? "item" : null;
    let blocks = [];
    if (wrap) blocks = t.split(`<${wrap}>`).slice(1).map((b) => b.split(`</${wrap}>`)[0]);
    const g = (b, n) => (b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, "i")) || [])[1] || "";
    diag = {
      wrap,
      blockCount: blocks.length,
      rowsParam: (t.match(/<rows>(\d+)<\/rows>/) || [])[1] || null,
      sampleDates: blocks.slice(0, 5).map((b) => ({
        title: g(b, "title").slice(0, 20),
        start: g(b, "startDate"),
        end: g(b, "endDate"),
        realm: g(b, "realmName"),
      })),
      tagNames: (blocks[0] || "").match(/<([a-zA-Z]+)>/g)?.slice(0, 30) || [],
    };
  } catch (e) { totalCount = `err:${e.message}`; }

  try {
    const items = await fetchFromCulture();
    return Response.json({
      env,
      totalCount,
      diag,
      count: items.length,
      byType: items.reduce((a, x) => ((a[x.type] = (a[x.type] || 0) + 1), a), {}),
      sample: items.slice(0, 4).map((x) => ({
        name: x.name,
        type: x.type,
        region: x.region,
        sido: x.sido,
        start: x.startDate,
        end: x.endDate,
        lat: x.lat,
        lng: x.lng,
        image: !!x.image,
      })),
    });
  } catch (e) {
    return Response.json({ env, error: String(e && e.message) });
  }
}
