"use client";

import { useEffect, useState } from "react";

// 요일 한글 (0=일 ~ 6=토)
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(dateStr, index) {
  if (index === 0) return "오늘";
  if (index === 1) return "내일";
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return `${DOW[d.getDay()]}요일`;
}

// 우리 서버의 '날씨 중계소'(/api/weather)에서 오늘~3일 날씨를 받아 보여줍니다.
// 서버가 Open-Meteo(1순위) 또는 백업 서버에서 이미 정리한 데이터를 주므로
// 화면은 받은 그대로 그리기만 하면 됩니다.
export default function WeatherPanel({ lat, lng }) {
  const [state, setState] = useState({ status: "loading", days: [] });

  useEffect(() => {
    let alive = true;
    // 10초 안에 응답이 없으면 요청을 중단하고 안내 문구를 띄웁니다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    fetch(`/api/weather?lat=${lat}&lng=${lng}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("weather fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        if (!Array.isArray(data.days) || data.days.length === 0) {
          throw new Error("no data");
        }
        clearTimeout(timer);
        setState({ status: "ok", days: data.days });
      })
      .catch(() => {
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
    return <div className="weather-error">날씨 정보를 잠시 불러올 수 없어요.</div>;
  }

  return (
    <div className="weather-row">
      {state.days.map((day, i) => (
        <div className="weather-cell" key={day.date}>
          <div className="w-day">{dayLabel(day.date, i)}</div>
          <div className="w-emoji">{day.emoji}</div>
          <div className="w-sky">{day.text}</div>
          <div className="w-temp">
            <span className="hi">{day.max}°</span> /{" "}
            <span className="lo">{day.min}°</span>
          </div>
          <div className="w-rain">{day.rainText}</div>
        </div>
      ))}
    </div>
  );
}
