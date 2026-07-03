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

function prettyDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

// 우리 서버의 '날씨 중계소'(/api/weather)에서 오늘~3일 날씨를 받아 보여줍니다.
// 각 칸을 누르면 그날의 시간대별 상세(아침/낮/저녁/밤)가 펼쳐집니다.
export default function WeatherPanel({ lat, lng }) {
  const [state, setState] = useState({ status: "loading", days: [] });
  const [openIndex, setOpenIndex] = useState(null); // 펼쳐진 날짜 (없으면 null)

  useEffect(() => {
    let alive = true;
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

  const openDay = openIndex !== null ? state.days[openIndex] : null;

  return (
    <div>
      <div className="weather-row">
        {state.days.map((day, i) => (
          <button
            type="button"
            className={`weather-cell ${openIndex === i ? "active" : ""}`}
            key={day.date}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <div className="w-day">{dayLabel(day.date, i)}</div>
            <div className="w-emoji">{day.emoji}</div>
            <div className="w-sky">{day.text}</div>
            <div className="w-temp">
              <span className="hi">{day.max}°</span> /{" "}
              <span className="lo">{day.min}°</span>
            </div>
            <div className="w-rain">{day.rainText}</div>
            <div className="w-more">{openIndex === i ? "▲ 닫기" : "▾ 상세"}</div>
          </button>
        ))}
      </div>

      {/* 선택한 날짜의 시간대별 상세 */}
      {openDay && (
        <div className="weather-detail">
          <div className="wd-head">
            {dayLabel(openDay.date, openIndex)} · {prettyDate(openDay.date)} 시간대별 날씨
          </div>

          {(openDay.humidity != null || openDay.wind != null) && (
            <div className="wd-extra">
              {openDay.humidity != null && <span>💧 습도 {openDay.humidity}%</span>}
              {openDay.wind != null && <span>🌬️ 바람 {openDay.wind}km/h</span>}
            </div>
          )}

          {openDay.slots && openDay.slots.length > 0 ? (
            <div className="wd-slots">
              {openDay.slots.map((s) => (
                <div className="wd-slot" key={s.label}>
                  <span className="wd-slot-label">{s.label}</span>
                  <span className="wd-slot-emoji">{s.emoji}</span>
                  <span className="wd-slot-sky">{s.text}</span>
                  <span className="wd-slot-temp">{s.temp}°</span>
                  <span className="wd-slot-rain">{s.rainText}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="wd-empty">이 날의 시간대별 상세 정보는 아직 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
