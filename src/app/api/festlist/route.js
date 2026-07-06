// 임시: 시즌별 축제 목록 확인용 (큐레이션 대상 선정 후 삭제 예정)
import { getFestivals } from "@/lib/festivals";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season"); // spring|summer|autumn|winter
  const tourOnly = searchParams.get("tour") !== "0";
  const all = await getFestivals();
  let list = all
    .filter((f) => (season ? f.season === season : true))
    .filter((f) => (tourOnly ? f.source === "tour" : true))
    .map((f) => ({ id: f.id, name: f.name, season: f.season, start: f.startDate }));
  list.sort((a, b) => a.start.localeCompare(b.start));
  return Response.json({ count: list.length, list });
}
