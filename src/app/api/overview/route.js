// 카드뉴스 '소개 요약' 슬라이드용 — 축제 소개문(+지원 언어 번역)을 가볍게 반환
import { getFestivalById } from "@/lib/festivals";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const locale = searchParams.get("locale") || "ko";
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  try {
    const f = await getFestivalById(id, locale);
    if (!f) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(
      { name: f.name, description: f.description || "" },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return Response.json({ name: null, description: "" });
  }
}
