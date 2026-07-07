"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import { useReviewStats } from "@/lib/useReviewStats";
import { getRecent } from "@/lib/recentFestivals";
import FestivalCard from "./FestivalCard";

// "최근 본 축제" 제목 (13개 언어)
const TL = {
  ko: "🕘 최근 본 축제",
  en: "🕘 Recently viewed",
  ja: "🕘 最近見たお祭り",
  zh: "🕘 最近查看的庆典",
  "zh-TW": "🕘 最近查看的慶典",
  es: "🕘 Vistos recientemente",
  fr: "🕘 Vus récemment",
  ru: "🕘 Недавно просмотренные",
  de: "🕘 Zuletzt angesehen",
  ar: "🕘 شوهدت مؤخرًا",
  vi: "🕘 Đã xem gần đây",
  id: "🕘 Baru dilihat",
  th: "🕘 ดูล่าสุด",
};

// 메인 하단 "최근 본 축제" 줄 — 이어보기 동선. 브라우저 기록만 사용(회원가입 X).
//  가로 스크롤 줄로 표시. 기록이 없으면 아무것도 안 보임.
export default function RecentViewed() {
  const { locale } = useI18n();
  const ratings = useReviewStats();
  const [items, setItems] = useState([]);

  // localStorage는 클라이언트에서만 → 마운트 후 읽기(하이드레이션 안전)
  useEffect(() => {
    setItems(getRecent());
  }, []);

  if (!items.length) return null;

  return (
    <section className="section recent-section">
      <h2>{TL[locale] || TL.ko}</h2>
      <div className="recent-row">
        {items.map((f) => (
          <div className="recent-item" key={f.id}>
            <FestivalCard festival={f} rating={ratings[f.id]} />
          </div>
        ))}
      </div>
    </section>
  );
}
