import { NextResponse } from "next/server";

// ────────────────────────────────────────────────────────────────
//  날씨 중계소 (서버에서 Open-Meteo를 대신 호출)
//
//  왜 이렇게 하나요?
//   • 일부 네트워크(예: 특정 국내망)에서는 브라우저가 Open-Meteo의
//     해외 서버로 직접 연결하지 못하고 멈추는 경우가 있습니다.
//   • 그래서 브라우저는 '같은 사이트 주소'인 /api/weather 만 부르고,
//     실제 해외 API 호출은 이 서버 코드가 대신 처리합니다.
//   • Vercel 등에 배포하면 이 호출을 Vercel 서버가 수행하므로
//     차단 없이 날씨가 정상적으로 표시됩니다.
// ────────────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "위도/경도가 필요합니다." }, { status: 400 });
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FSeoul&forecast_days=4`;

  // 서버에서도 9초 안에 응답이 없으면 포기하고 오류를 돌려줍니다.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // 같은 좌표는 30분 동안 캐시해서 매번 외부 API를 부르지 않도록
      next: { revalidate: 1800 },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: "날씨 서버 응답 오류" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    clearTimeout(timer);
    // 시간 초과(abort) 또는 연결 실패
    return NextResponse.json({ error: "날씨 서버에 연결할 수 없습니다." }, { status: 504 });
  }
}
