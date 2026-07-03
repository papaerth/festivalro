import { NextResponse } from "next/server";
import { describeWeather } from "@/lib/weatherCodes";
import { describeMetSymbol } from "@/lib/metSymbols";

// ────────────────────────────────────────────────────────────────
//  날씨 중계소 (서버가 대신 날씨를 불러와 화면에 전달)
//
//  1순위: Open-Meteo (요구사항의 기본 날씨 API)
//  2순위: MET Norway (노르웨이 기상청) — 1순위가 다운/차단이면 자동 전환
//
//  각 날짜마다 하루 요약 + '시간대별 상세(아침/낮/저녁/밤)'까지 담아
//  똑같은 모양으로 돌려줍니다. 화면은 받은 그대로 그리기만 하면 됩니다.
//
//  반환 형태:
//  { source, days: [{
//      date, max, min, emoji, text, rainText, humidity, wind,
//      slots: [{ label, temp, emoji, text, rainText }, ...]
//  }]}
// ────────────────────────────────────────────────────────────────

// 하루를 4개의 시간대로 나눕니다. center = 그 시간대를 대표하는 시각.
const SLOT_DEFS = [
  { key: "morning", label: "아침", center: 9 },
  { key: "day", label: "낮", center: 15 },
  { key: "evening", label: "저녁", center: 20 },
  { key: "night", label: "밤", center: 3 },
];

function hourToSlot(h) {
  if (h >= 6 && h <= 11) return "morning";
  if (h >= 12 && h <= 17) return "day";
  if (h >= 18 && h <= 23) return "evening";
  return "night";
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 시간대별 데이터를 화면용 slots 배열로 변환 (아침→낮→저녁→밤 순서)
function buildSlots(pdSlots, resolveSky, rainFmt) {
  const out = [];
  for (const def of SLOT_DEFS) {
    const s = pdSlots[def.key];
    if (!s || s.temps.length === 0) continue;
    const sky = resolveSky(s.sky);
    out.push({
      label: def.label,
      temp: Math.round(avg(s.temps)),
      emoji: sky.emoji,
      text: sky.text,
      rainText: rainFmt(s.rain),
    });
  }
  return out;
}

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
    `&hourly=temperature_2m,weather_code,precipitation_probability,relative_humidity_2m,wind_speed_10m` +
    `&timezone=Asia%2FSeoul&forecast_days=4`;

  const res = await fetchWithTimeout(url, { next: { revalidate: 1800 } }, 3500);
  if (!res.ok) throw new Error("open-meteo not ok");
  const j = await res.json();
  const d = j.daily;
  const h = j.hourly;
  if (!d || !Array.isArray(d.time)) throw new Error("open-meteo bad shape");

  // 시간별 데이터를 날짜+시간대별로 묶습니다.
  const perDay = {};
  if (h && Array.isArray(h.time)) {
    for (let i = 0; i < h.time.length; i++) {
      const t = h.time[i]; // "2026-07-03T09:00" (한국시간)
      const date = t.slice(0, 10);
      const hour = Number(t.slice(11, 13));
      const slotKey = hourToSlot(hour);
      const pd = (perDay[date] ||= { slots: {}, humid: [], wind: [] });
      const s = (pd.slots[slotKey] ||= { temps: [], rain: 0, sky: null, dist: 99 });

      const temp = h.temperature_2m?.[i];
      if (typeof temp === "number") s.temps.push(temp);
      const prob = h.precipitation_probability?.[i];
      if (typeof prob === "number") s.rain = Math.max(s.rain, prob);
      const code = h.weather_code?.[i];
      const center = SLOT_DEFS.find((x) => x.key === slotKey).center;
      if (typeof code === "number" && Math.abs(hour - center) < s.dist) {
        s.sky = code;
        s.dist = Math.abs(hour - center);
      }
      const hum = h.relative_humidity_2m?.[i];
      if (typeof hum === "number") pd.humid.push(hum);
      const wnd = h.wind_speed_10m?.[i];
      if (typeof wnd === "number") pd.wind.push(wnd);
    }
  }

  const days = d.time.slice(0, 4).map((date, i) => {
    const w = describeWeather(d.weather_code[i]);
    const prob = d.precipitation_probability_max[i];
    const pd = perDay[date];
    return {
      date,
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      emoji: w.emoji,
      text: w.text,
      rainText: `💧 ${prob ?? 0}%`,
      humidity: pd && pd.humid.length ? Math.round(avg(pd.humid)) : null,
      wind: pd && pd.wind.length ? Math.round(Math.max(...pd.wind)) : null,
      slots: pd
        ? buildSlots(pd.slots, describeWeather, (v) => `💧 ${v}%`)
        : [],
    };
  });
  return { source: "open-meteo", days };
}

// 2순위(백업) — MET Norway (시간별 데이터를 하루/시간대 단위로 정리)
async function fromMet(lat, lng) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: { "User-Agent": "chukjero/1.0 (https://github.com/papaerth/festivalro)" },
      next: { revalidate: 1800 },
    },
    4500
  );
  if (!res.ok) throw new Error("met not ok");
  const series = (await res.json())?.properties?.timeseries;
  if (!Array.isArray(series) || series.length === 0) throw new Error("met bad shape");

  const perDay = {};
  for (const e of series) {
    const kst = new Date(new Date(e.time).getTime() + 9 * 3600 * 1000);
    const date = kst.toISOString().slice(0, 10);
    const hour = kst.getUTCHours();
    const slotKey = hourToSlot(hour);
    const det = e.data?.instant?.details || {};
    const sym =
      e.data?.next_1_hours?.summary?.symbol_code ||
      e.data?.next_6_hours?.summary?.symbol_code;
    const precip =
      e.data?.next_1_hours?.details?.precipitation_amount ??
      e.data?.next_6_hours?.details?.precipitation_amount;

    const pd = (perDay[date] ||= { slots: {}, humid: [], wind: [], all: [] });
    const s = (pd.slots[slotKey] ||= { temps: [], rain: 0, sky: null, dist: 99 });

    const temp = det.air_temperature;
    if (typeof temp === "number") {
      s.temps.push(temp);
      pd.all.push(temp);
    }
    if (typeof precip === "number") s.rain += precip;
    const center = SLOT_DEFS.find((x) => x.key === slotKey).center;
    if (sym && Math.abs(hour - center) < s.dist) {
      s.sky = sym;
      s.dist = Math.abs(hour - center);
    }
    if (typeof det.relative_humidity === "number") pd.humid.push(det.relative_humidity);
    if (typeof det.wind_speed === "number") pd.wind.push(det.wind_speed * 3.6); // m/s → km/h
  }

  const days = Object.keys(perDay)
    .sort()
    .filter((k) => perDay[k].all.length > 0)
    .slice(0, 4)
    .map((date) => {
      const pd = perDay[date];
      // 대표 하늘 상태: 낮 시간대(있으면) 우선
      const daySlot = pd.slots.day || pd.slots.morning || pd.slots.evening || pd.slots.night;
      const w = describeMetSymbol(daySlot?.sky);
      return {
        date,
        max: Math.round(Math.max(...pd.all)),
        min: Math.round(Math.min(...pd.all)),
        emoji: w.emoji,
        text: w.text,
        rainText: `💧 ${pd.all.length ? sumPrecip(pd).toFixed(1) : 0}mm`,
        humidity: pd.humid.length ? Math.round(avg(pd.humid)) : null,
        wind: pd.wind.length ? Math.round(Math.max(...pd.wind)) : null,
        slots: buildSlots(pd.slots, describeMetSymbol, (v) => `💧 ${v.toFixed(1)}mm`),
      };
    });
  return { source: "met.no", days };
}

// MET: 하루 총 강수량(시간대 합산)
function sumPrecip(pd) {
  return Object.values(pd.slots).reduce((sum, s) => sum + (s.rain || 0), 0);
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
