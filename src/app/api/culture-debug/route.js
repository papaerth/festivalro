// (임시 진단) 문화정보 커넥터 실제 수집 결과 확인용.
//  https://chukjero.com/api/culture-debug?key=<CRON_SECRET>
import { fetchFromCulture } from "@/lib/culture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const items = await fetchFromCulture();
    return Response.json({
      count: items.length,
      uniqueIds: new Set(items.map((x) => x.id)).size,
      byType: items.reduce((a, x) => ((a[x.type] = (a[x.type] || 0) + 1), a), {}),
      byRegion: items.reduce((a, x) => ((a[x.region] = (a[x.region] || 0) + 1), a), {}),
      withCoords: items.filter((x) => x.lat && x.lng).length,
    });
  } catch (e) {
    return Response.json({ error: String(e && e.message) });
  }
}
