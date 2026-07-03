import { NextResponse } from "next/server";

// [임시 진단용] TourAPI 실제 응답을 확인하기 위한 엔드포인트.
// 키 자체는 노출하지 않고, 호출 결과(상태/본문 앞부분)만 보여줍니다.
// 진단이 끝나면 삭제할 예정.
export async function GET() {
  const apiKey = process.env.TOUR_API_KEY || "";
  const base =
    process.env.TOUR_API_BASE ||
    "https://apis.data.go.kr/B551011/KorService2/searchFestival2";

  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }

  const params = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    listYN: "Y",
    arrange: "A",
    numOfRows: "3",
    pageNo: "1",
    eventStartDate: "20260101",
  });

  const info = {
    keyPresent: Boolean(apiKey) && apiKey !== "여기에_키를_붙여넣기",
    rawKeyLength: apiKey.length,
    decodedKeyLength: serviceKey.length,
    looksUrlEncoded: apiKey.includes("%2B") || apiKey.includes("%2F") || apiKey.includes("%3D"),
    base,
  };

  try {
    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    const text = await res.text();
    return NextResponse.json({
      ...info,
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      bodyPreview: text.slice(0, 700),
    });
  } catch (err) {
    return NextResponse.json({ ...info, fetchError: err.message });
  }
}
