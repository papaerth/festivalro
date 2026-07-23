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
  try {
    const items = await fetchFromCulture();
    return Response.json({
      env,
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
