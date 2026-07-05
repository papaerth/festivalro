// [임시 진단용] 요청 시점의 getFestivals() 결과를 요약. 확인 후 삭제.
import { getFestivals } from "@/lib/festivals";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const findId = searchParams.get("id");

  const all = await getFestivals();
  const bySource = {};
  for (const f of all) {
    const s = f.source || "sample";
    bySource[s] = (bySource[s] || 0) + 1;
  }
  const sampleStd = all.find((f) => f.source === "standard");

  return Response.json({
    total: all.length,
    bySource,
    firstStandardId: sampleStd ? sampleStd.id : null,
    firstStandardName: sampleStd ? sampleStd.name : null,
    findId,
    findIdExists: findId ? all.some((f) => f.id === findId) : null,
  });
}
