"use client";

import { useEffect, useState } from "react";
import { describeWeather } from "@/lib/weatherCodes";

// 요일 한글 (0=일 ~ 6=토)
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(dateStr, index) {
  if (index === 0) return "오늘";
  if (index === 1) return "내일";
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return `${DOW[d.getDay()]}요일`;
}

// 축제 좌표의 오늘~3일 날씨를 Open-Meteo에서 가져와 보여줍니다.
export default function WeatherPanel({ lat, lng }) {
  const [state, setState] = useState({ status: "loading", days: [] });

  useEffect(() => {
    // 우리 서버의 '날씨 중계소'를 호출 (해외 API 직접 호출로 인한 멈춤 방지)
    const url = `/api/weather?lat=${lat}&lng=${lng}`;

    let alive = true;
    // 10초 안에 응답이 없으면 요청을 중단하고 안내 문구를 띄웁니다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("weather fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        const d = data.daily;
        if (!d || !Array.isArray(d.time)) throw new Error("no data");
        const days = d.time.map((date, i) => ({
          date,
          code: d.weather_code[i],
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
          rain: d.precipitation_probability_max[i],
        }));
        clearTimeout(timer);
        setState({ status: "ok", days });
      })
      .catch(() => {
        // 시간 초과, 연결 실패, 데이터 오류 등 모든 경우 → 안내 문구
        if (alive) setState({ status: "error", days: [] });
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lng]);

  if (state.status === "loading") {
    return <div className="weather-loading">날씨 정보를 불러오는 중…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="weather-error">
        날씨 정보를 잠시 불러올 수 없어요.
      </div>
    );
  }

  return (
    <div className="weather-row">
      {state.days.map((day, i) => {
        const w = describeWeather(day.code);
        return (
          <div className="weather-cell" key={day.date}>
            <div className="w-day">{dayLabel(day.date, i)}</div>
            <div className="w-emoji">{w.emoji}</div>
            <div className="w-sky">{w.text}</div>
            <div className="w-temp">
              <span className="hi">{day.max}°</span> /{" "}
              <span className="lo">{day.min}°</span>
            </div>
            <div className="w-rain">💧 {day.rain ?? 0}%</div>
          </div>
        );
      })}
    </div>
  );
}
