// (임시 진단) period2 페이징 파라미터 탐색.
//  https://chukjero.com/api/culture-debug?key=<CRON_SECRET>
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const skey = encodeURIComponent(decodeURIComponent(process.env.CULTURE_API_KEY || process.env.TOUR_API_KEY || ""));
  const now = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const from = ymd(now);
  const to = ymd(new Date(now.getTime() + 365 * 86400000));
  const base = "https://apis.data.go.kr/B553457/cultureinfo/period2";
  const g = (b, n) => (b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, "i")) || [])[1] || "";

  const test = async (label, extra) => {
    try {
      const r = await fetch(`${base}?serviceKey=${skey}&from=${from}&to=${to}&${extra}`, { signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const blocks = t.split("<item>").slice(1).map((b) => b.split("</item>")[0]);
      return {
        label,
        http: r.status,
        blocks: blocks.length,
        totalCount: (t.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || null,
        firstSeq: g(blocks[0] || "", "seq"),
        lastSeq: g(blocks[blocks.length - 1] || "", "seq"),
      };
    } catch (e) { return { label, err: String(e.message) }; }
  };

  const results = await Promise.all([
    test("cPage1", "cPage=1&rows=10&sortStdr=1"),
    test("cPage2", "cPage=2&rows=10&sortStdr=1"),
    test("pageNo2", "pageNo=2&numOfRows=10&sortStdr=1"),
    test("rows100", "cPage=1&rows=100&sortStdr=1"),
    test("numOfRows100", "numOfRows=100&sortStdr=1"),
    test("PageNo2_cap", "PageNo=2&sortStdr=1"),
    test("startPage2", "startPage=2&pageSize=10&sortStdr=1"),
    test("sortStdr2", "cPage=1&rows=10&sortStdr=2"),
  ]);
  return Response.json({ from, to, results });
}
