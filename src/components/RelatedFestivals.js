"use client";

import { useI18n } from "@/lib/I18nProvider";
import { useReviewStats } from "@/lib/useReviewStats";
import FestivalCard from "./FestivalCard";

// "이 축제가 좋았다면" 섹션 제목 (13개 언어)
const RL = {
  ko: "💜 이 축제가 좋았다면",
  en: "💜 If you liked this festival",
  ja: "💜 このお祭りが気に入ったら",
  zh: "💜 喜欢这个庆典的话",
  "zh-TW": "💜 喜歡這個慶典的話",
  es: "💜 Si te gustó este festival",
  fr: "💜 Si vous avez aimé ce festival",
  ru: "💜 Если понравился этот фестиваль",
  de: "💜 Wenn dir dieses Fest gefiel",
  ar: "💜 إذا أعجبك هذا المهرجان",
  vi: "💜 Nếu bạn thích lễ hội này",
  id: "💜 Jika Anda menyukai festival ini",
  th: "💜 ถ้าคุณชอบเทศกาลนี้",
};

// 상세페이지 맨 아래 추천 섹션 — 다음 축제로 자연스럽게 이어지도록.
//  items는 서버에서 계산해 넘겨줍니다(같은 시군구→같은 계절 인기→비슷한 유형).
export default function RelatedFestivals({ items = [], title }) {
  const { locale } = useI18n();
  const ratings = useReviewStats();
  if (!items.length) return null;

  return (
    <section className="section related-section">
      <h2>{title || RL[locale] || RL.ko}</h2>
      <div className="card-grid">
        {items.map((f) => (
          <FestivalCard key={f.id} festival={f} rating={ratings[f.id]} />
        ))}
      </div>
    </section>
  );
}
