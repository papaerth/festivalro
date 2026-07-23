// (임시 진단) 문화정보 커넥터가 실제로 몇 건 수집하는지 확인용.
//  https://chukjero.com/api/culture-debug?key=<CRON_SECRET>
import { fetchFromCulture } from "@/lib/culture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // cPage가 실제로 동작하는지 직접 비교(1페이지 vs 5페이지 vs 20페이지 첫 항목)
  let pageProbe = null;
  try {
    const skey = encodeURIComponent(decodeURIComponent(process.env.CULTURE_API_KEY || process.env.TOUR_API_KEY || ""));
    const now = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const from = ymd(now);
    const to = ymd(new Date(now.getTime() + 365 * 86400000));
    const base = "https://apis.data.go.kr/B553457/cultureinfo/period2";
    const g = (b, n) => (b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, "i")) || [])[1] || "";
    const firstOf = async (page) => {
      const r = await fetch(`${base}?serviceKey=${skey}&from=${from}&to=${to}&cPage=${page}&rows=10&sortStdr=1`, { signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      const b0 = (t.split("<item>")[1] || "").split("</item>")[0];
      return { page, title: g(b0, "title").slice(0, 20), seq: g(b0, "seq") };
    };
    pageProbe = await Promise.all([firstOf(1), firstOf(5), firstOf(20)]);
  } catch (e) { pageProbe = `err:${e.message}`; }

  try {
    const items = await fetchFromCulture();
    return Response.json({
      pageProbe,
      count: items.length,
      byType: items.reduce((a, x) => ((a[x.type] = (a[x.type] || 0) + 1), a), {}),
      byRegion: items.reduce((a, x) => ((a[x.region] = (a[x.region] || 0) + 1), a), {}),
      uniqueSeqIds: new Set(items.map((x) => x.id)).size,
    });
  } catch (e) {
    return Response.json({ pageProbe, error: String(e && e.message) });
  }
}
