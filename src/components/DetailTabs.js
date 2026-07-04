"use client";

import { useState } from "react";

// 축제 상세 화면의 탭 (정보 / 날씨 / 후기 / 블로그)
//  - 정보·날씨는 계속 살려두어(display 토글) 상태 유지
//  - 후기·블로그는 처음 눌렀을 때 불러오도록 지연 로딩
export default function DetailTabs({
  infoPanel,
  weatherPanel,
  reviewsPanel,
  blogPanel,
}) {
  const [active, setActive] = useState("info");
  // 처음부터 살려둘 탭(info/weather) + 방문한 탭 기록
  const [visited, setVisited] = useState({ info: true, weather: true });

  const go = (key) => {
    setActive(key);
    setVisited((v) => ({ ...v, [key]: true }));
  };

  const TABS = [
    { key: "info", label: "정보", icon: "🎪" },
    { key: "weather", label: "날씨", icon: "🌤️" },
    { key: "reviews", label: "후기", icon: "⭐" },
    { key: "blog", label: "블로그", icon: "📝" },
  ];
  const panels = {
    info: infoPanel,
    weather: weatherPanel,
    reviews: reviewsPanel,
    blog: blogPanel,
  };

  return (
    <div>
      <div className="tabbar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            className={`tab ${active === t.key ? "active" : ""}`}
            onClick={() => go(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => (
        <div key={t.key} style={{ display: active === t.key ? "block" : "none" }}>
          {visited[t.key] ? panels[t.key] : null}
        </div>
      ))}
    </div>
  );
}
