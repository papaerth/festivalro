"use client";

import { useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 축제 상세 화면의 탭 (정보 / 날씨 / 후기)
//  - 정보·날씨는 계속 살려두어(display 토글) 상태 유지
//  - 후기는 처음 눌렀을 때 불러오도록 지연 로딩
//  - 블로그 후기는 별도 탭 대신 '정보' 탭 안(축제 소개 아래)에 표시
export default function DetailTabs({
  infoPanel,
  weatherPanel,
  reviewsPanel,
}) {
  const { t } = useI18n();
  const [active, setActive] = useState("info");
  // 처음부터 살려둘 탭(info/weather) + 방문한 탭 기록
  const [visited, setVisited] = useState({ info: true, weather: true });

  const go = (key) => {
    setActive(key);
    setVisited((v) => ({ ...v, [key]: true }));
  };

  const panels = {
    info: infoPanel,
    weather: weatherPanel,
    reviews: reviewsPanel,
  };
  // 패널이 없는 탭(예: 좌표 없는 제출 축제의 날씨)은 숨김
  const TABS = [
    { key: "info", label: t.detail.tabs.info, icon: "🎪" },
    { key: "weather", label: t.detail.tabs.weather, icon: "🌤️" },
    { key: "reviews", label: t.detail.tabs.reviews, icon: "⭐" },
  ].filter((tab) => panels[tab.key]);

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
