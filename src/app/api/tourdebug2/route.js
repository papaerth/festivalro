import { NextResponse } from "next/server";

// [임시 진단용] detailCommon2 응답 확인 (소개문 연동 검증 후 삭제)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contentId = searchParams.get("id") || "1007868";
  const apiKey = process.env.TOUR_API_KEY || "";

  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  const base =
    "https://apis.data.go.kr/B551011/KorService2/detailCommon2";
  const params = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    contentId,
  });

  try {
    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    const text = await res.text();
    let overviewFound = false;
    try {
      const j = JSON.parse(text);
      const raw = j?.response?.body?.items?.item;
      const item = Array.isArray(raw) ? raw[0] : raw;
      overviewFound = Boolean(item?.overview);
    } catch {}
    return NextResponse.json({
      contentId,
      httpStatus: res.status,
      overviewFound,
      bodyPreview: text.slice(0, 900),
    });
  } catch (err) {
    return NextResponse.json({ contentId, fetchError: err.message });
  }
}
