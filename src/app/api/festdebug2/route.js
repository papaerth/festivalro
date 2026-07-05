// [임시 진단용] 요청 시점 getFestivals() 결과 요약. 확인 후 삭제.
import { getFestivals } from "@/lib/festivals";

export const dynamic = "force-dynamic";

export async function GET() {
  const all = await getFestivals();
  const bySource = {};
  for (const f of all) {
    const s = f.source || "sample";
    bySource[s] = (bySource[s] || 0) + 1;
  }
  const std = all.find((f) => f.source === "standard");
  return Response.json({
    total: all.length,
    bySource,
    sampleStandardId: std ? std.id : null,
    sampleStandardName: std ? std.name : null,
  });
}
