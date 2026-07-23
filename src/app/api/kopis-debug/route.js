// (임시 진단) KOPIS 커넥터 실제 수집 결과 확인용. 검증 후 제거.
//  https://chukjero.com/api/kopis-debug?key=<CRON_SECRET>
import { fetchFromKopis } from "@/lib/kopis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const items = await fetchFromKopis();
    return Response.json({
      hasKey: !!process.env.KOPIS_API_KEY,
      count: items.length,
      uniqueIds: new Set(items.map((x) => x.id)).size,
      byRegion: items.reduce((a, x) => ((a[x.region] = (a[x.region] || 0) + 1), a), {}),
      withCoords: items.filter((x) => x.lat && x.lng).length,
      sample: items.slice(0, 3).map((x) => ({ name: x.name, sido: x.sido, start: x.startDate, end: x.endDate })),
    });
  } catch (e) {
    return Response.json({ hasKey: !!process.env.KOPIS_API_KEY, error: String(e && e.message) });
  }
}
