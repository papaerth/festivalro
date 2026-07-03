"use client";

import { useState } from "react";

// 축제 상세 화면의 탭 (정보 / 날씨 / 블로그)
//  - 정보·날씨 패널은 계속 살려두어(display 토글) 상태(예: 펼친 날씨)를 유지
//  - 블로그 패널은 처음 눌렀을 때 불러오도록 지연 로딩(불필요한 API 호출 방지)
export default function DetailTabs({ infoPanel, weatherPanel, blogPanel }) {
  const [active, setActive] = useState("info");
  const [blogVisited, setBlogVisited] = useState(false);

  const go = (key) => {
    setActive(key);
    if (key === "blog") setBlogVisited(true);
  };

  const TABS = [
    { key: "info", label: "정보", icon: "🎪" },
    { key: "weather", label: "날씨", icon: "🌤️" },
    { key: "blog", label: "블로그", icon: "📝" },
  ];

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

      <div style={{ display: active === "info" ? "block" : "none" }}>{infoPanel}</div>
      <div style={{ display: active === "weather" ? "block" : "none" }}>
        {weatherPanel}
      </div>
      <div style={{ display: active === "blog" ? "block" : "none" }}>
        {blogVisited ? blogPanel : null}
      </div>
    </div>
  );
}
