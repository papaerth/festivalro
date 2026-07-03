import { NextResponse } from "next/server";
import { describeWeather } from "@/lib/weatherCodes";
import { describeMetSymbol } from "@/lib/metSymbols";

// ────────────────────────────────────────────────────────────────
//  날씨 중계소 (서버가 대신 날씨를 불러와 화면에 전달)
//
//  1순위: Open-Meteo (요구사항의 기본 날씨 API)
//  2순위: MET Norway (노르웨이 기상청) — 1순위가 다운/차단이면 자동 전환
//
//  두 서버의 응답을 '똑같은 모양'으로 정리해서 돌려주므로,
//  화면(WeatherPanel)은 어느 서버에서 왔는지 신경 쓸 필요가 없습니다.
//  반환 형태: { source, days: [{ date, max, min, emoji, text, rainText }] }
// ────────────────────────────────────────────────────────────────

// 지정한 시간(ms) 안에 응답이 없으면 중단하는 fetch
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 1순위 — Open-Meteo
async function fromOpenMeteo(lat, lng) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FSeoul&forecast_days=4`;

  const res = await fetchWithTimeout(url, { next: { revalidate: 1800 } }, 3500);
  if (!res.ok) throw new Error("open-meteo not ok");
  const d = (await res.json()).daily;
  if (!d || !Array.isArray(d.time)) throw new Error("open-meteo bad shape");

  const days = d.time.slice(0, 4).map((date, i) => {
    const w = describeWeather(d.weather_code[i]);
    const prob = d.precipitation_probability_max[i];
    return {
      date,
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      emoji: w.emoji,
      text: w.text,
      rainText: `💧 ${prob ?? 0}%`,
    };
  });
  return { source: "open-meteo", days };
}

// 2순위(백업) — MET Norway (시간별 데이터를 하루 단위로 정리)
async function fromMet(lat, lng) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`;
  const res = await fetchWithTimeout(
    url,
    {
      // MET Norway는 요청자를 식별할 User-Agent를 요구합니다.
      headers: { "User-Agent": "chukjero/1.0 (https://github.com/papaerth/festivalro)" },
      next: { revalidate: 1800 },
    },
    4500
  );
  if (!res.ok) throw new Error("met not ok");
  const series = (await res.json())?.properties?.timeseries;
  if (!Array.isArray(series) || series.length === 0) throw new Error("met bad shape");

  // 시간별 예보를 한국시간(KST) 기준 날짜별로 묶습니다.
  const byDay = {};
  for (const e of series) {
    const kst = new Date(new Date(e.time).getTime() + 9 * 3600 * 1000);
    const key = kst.toISOString().slice(0, 10);
    const hour = kst.getUTCHours();
    const temp = e.data?.instant?.details?.air_temperature;
    const sym =
      e.data?.next_6_hours?.summary?.symbol_code ||
      e.data?.next_1_hours?.summary?.symbol_code;
    const precip =
      e.data?.next_6_hours?.details?.precipitation_amount ??
      e.data?.next_1_hours?.details?.precipitation_amount;

    const b = (byDay[key] ||= { temps: [], precip: 0, sym: null, symDist: 99 });
    if (typeof temp === "number") b.temps.push(temp);
    if (typeof precip === "number") b.precip += precip;
    // 하늘 상태는 낮 시간(13시)에 가장 가까운 값을 대표로 사용
    if (sym && Math.abs(hour - 13) < b.symDist) {
      b.sym = sym;
      b.symDist = Math.abs(hour - 13);
    }
  }

  const days = Object.keys(byDay)
    .sort()
    .filter((k) => byDay[k].temps.length > 0)
    .slice(0, 4)
    .map((date) => {
      const b = byDay[date];
      const w = describeMetSymbol(b.sym);
      return {
        date,
        max: Math.round(Math.max(...b.temps)),
        min: Math.round(Math.min(...b.temps)),
        emoji: w.emoji,
        text: w.text,
        // MET는 강수'확률' 대신 강수'량(mm)'을 제공합니다.
        rainText: `💧 ${b.precip.toFixed(1)}mm`,
      };
    });
  return { source: "met.no", days };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "위도/경도가 필요합니다." }, { status: 400 });
  }

  // 1순위 → 2순위 순서로 시도, 먼저 성공하는 쪽 결과를 사용
  for (const provider of [fromOpenMeteo, fromMet]) {
    try {
      const result = await provider(lat, lng);
      if (result.days.length > 0) {
        return NextResponse.json(result, {
          headers: {
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
          },
        });
      }
    } catch (err) {
      console.warn(`[weather] ${provider.name} 실패 → 다음 제공자 시도:`, err.message);
    }
  }

  return NextResponse.json(
    { error: "날씨 서버에 연결할 수 없습니다." },
    { status: 504 }
  );
}
