"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 언어별 요일/문구
const DOW = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

// 시간대(아침/낮/저녁/밤)·미세먼지 라벨은 서버(/api/weather)가 한국어로 보내므로 여기서 매핑
const SLOT = {
  아침: { en: "Morning", ja: "朝", zh: "早晨" },
  낮: { en: "Day", ja: "昼", zh: "白天" },
  저녁: { en: "Evening", ja: "夕方", zh: "傍晚" },
  밤: { en: "Night", ja: "夜", zh: "夜间" },
};

const WI = {
  ko: {
    today: "오늘", tomorrow: "내일", dowSuffix: "요일",
    error: "날씨 정보를 잠시 불러올 수 없어요.",
    hourly: "시간대별 날씨", humidity: "습도", wind: "바람",
    pm10: "미세먼지", pm25: "초미세먼지",
    slotEmpty: "이 날의 시간대별 상세 정보는 아직 없어요.",
    ctaLead: "더 자세하고 긴 날씨 예보가 궁금하신가요?",
    ctaMain: "네이버 날씨에서 상세 예보 보기",
  },
  en: {
    today: "Today", tomorrow: "Tomorrow", dowSuffix: "",
    error: "Weather info is unavailable right now.",
    hourly: "hourly forecast", humidity: "Humidity", wind: "Wind",
    pm10: "Fine dust", pm25: "Ultrafine dust",
    slotEmpty: "No hourly detail for this day yet.",
    ctaLead: "Want a longer, more detailed forecast?",
    ctaMain: "See the full forecast on Naver Weather",
  },
  ja: {
    today: "今日", tomorrow: "明日", dowSuffix: "曜日",
    error: "天気情報を読み込めませんでした。",
    hourly: "時間帯別の天気", humidity: "湿度", wind: "風",
    pm10: "PM10", pm25: "PM2.5",
    slotEmpty: "この日の時間帯別の詳細はまだありません。",
    ctaLead: "より詳しく長期の予報をご覧になりますか？",
    ctaMain: "NAVER天気で詳細予報を見る",
  },
  zh: {
    today: "今天", tomorrow: "明天", dowSuffix: "",
    error: "暂时无法获取天气信息。",
    hourly: "分时段天气", humidity: "湿度", wind: "风",
    pm10: "可吸入颗粒物", pm25: "细颗粒物",
    slotEmpty: "暂无当天的分时段详情。",
    ctaLead: "想查看更详细、更长期的天气预报吗？",
    ctaMain: "在 NAVER 天气查看详细预报",
  },
};

function dayLabel(dateStr, index, loc) {
  const w = WI[loc] || WI.ko;
  if (index === 0) return w.today;
  if (index === 1) return w.tomorrow;
  const dow = (DOW[loc] || DOW.ko)[new Date(`${dateStr}T00:00:00+09:00`).getDay()];
  return `${dow}${w.dowSuffix}`;
}

function prettyDate(dateStr, loc) {
  const [, m, d] = dateStr.split("-");
  if (loc === "en") return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)]} ${Number(d)}`;
  if (loc === "ja") return `${Number(m)}月${Number(d)}日`;
  if (loc === "zh") return `${Number(m)}月${Number(d)}日`;
  return `${Number(m)}월 ${Number(d)}일`;
}

function slotLabel(label, loc) {
  if (loc === "ko" || !SLOT[label]) return label;
  return SLOT[label][loc] || label;
}

// 우리 서버의 '날씨 중계소'(/api/weather)에서 오늘~3일 날씨를 받아 보여줍니다.
// 각 칸을 누르면 그날의 시간대별 상세(아침/낮/저녁/밤)가 펼쳐집니다.
export default function WeatherPanel({ lat, lng, place }) {
  const { locale } = useI18n();
  const w = WI[locale] || WI.ko;
  const [state, setState] = useState({ status: "loading", days: [] });
  const [openIndex, setOpenIndex] = useState(null); // 펼쳐진 날짜 (없으면 null)

  // 축제 위치 기준으로 네이버 날씨(상세)를 여는 주소
  const naverWeatherUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(
    `${place || ""} 날씨`.trim()
  )}`;

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
    return (
      <div className="skel-weather" aria-busy="true">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="weather-error">{w.error}</div>;
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
            <div className="w-day">{dayLabel(day.date, i, locale)}</div>
            <div className="w-emoji">{day.emoji}</div>
            <div className="w-sky">{day.text}</div>
            <div className="w-temp">
              <span className="hi">{day.max}°</span> /{" "}
              <span className="lo">{day.min}°</span>
            </div>
            <div className="w-rain">{day.rainText}</div>
            <div className="w-more">{openIndex === i ? "▲" : "▾"}</div>
          </button>
        ))}
      </div>

      {/* 선택한 날짜의 시간대별 상세 */}
      {openDay && (
        <div className="weather-detail">
          <div className="wd-head">
            {dayLabel(openDay.date, openIndex, locale)} · {prettyDate(openDay.date, locale)} {w.hourly}
          </div>

          {(openDay.humidity != null || openDay.wind != null) && (
            <div className="wd-extra">
              {openDay.humidity != null && <span>💧 {w.humidity} {openDay.humidity}%</span>}
              {openDay.wind != null && <span>🌬️ {w.wind} {openDay.wind}km/h</span>}
            </div>
          )}

          {openDay.air && (
            <div className="wd-air">
              {openDay.air.pm10 != null && (
                <span className="wd-air-item">
                  <span className="wd-air-name">{w.pm10}</span>
                  <span className="wd-air-val">PM10 {openDay.air.pm10}</span>
                  {openDay.air.pm10Grade && (
                    <span
                      className="air-badge"
                      style={{ background: openDay.air.pm10Grade.color }}
                    >
                      {openDay.air.pm10Grade.grade}
                    </span>
                  )}
                </span>
              )}
              {openDay.air.pm25 != null && (
                <span className="wd-air-item">
                  <span className="wd-air-name">{w.pm25}</span>
                  <span className="wd-air-val">PM2.5 {openDay.air.pm25}</span>
                  {openDay.air.pm25Grade && (
                    <span
                      className="air-badge"
                      style={{ background: openDay.air.pm25Grade.color }}
                    >
                      {openDay.air.pm25Grade.grade}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {openDay.slots && openDay.slots.length > 0 ? (
            <div className="wd-slots">
              {openDay.slots.map((s) => (
                <div className="wd-slot" key={s.label}>
                  <span className="wd-slot-label">{slotLabel(s.label, locale)}</span>
                  <span className="wd-slot-emoji">{s.emoji}</span>
                  <span className="wd-slot-sky">{s.text}</span>
                  <span className="wd-slot-temp">{s.temp}°</span>
                  <span className="wd-slot-rain">{s.rainText}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="wd-empty">{w.slotEmpty}</p>
          )}
        </div>
      )}

      {/* 더 상세한 날씨(미세먼지·주간예보·레이더 등)는 네이버 날씨로 바로 연결 */}
      <a
        className="weather-cta"
        href={naverWeatherUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="weather-cta-lead">
          {w.ctaLead}
        </span>
        <span className="weather-cta-main">
          <span>📡 {w.ctaMain}</span>
          <span className="weather-cta-arrow">→</span>
        </span>
      </a>
    </div>
  );
}
