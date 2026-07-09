"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import { getStatusInfo } from "@/lib/format";
import ShortsCard from "@/components/ShortsCard";

// 홈 화면 "메인 축제 쇼츠" 피드 문구 (13개 언어)
const HL = {
  ko: { title: "🎬 영상으로 만나는 축제", loading: "영상 불러오는 중", more: "자세히 보기", watch: "유튜브에서 크게 보기" },
  en: { title: "🎬 Festivals in Video", loading: "Loading videos", more: "View details", watch: "Watch on YouTube" },
  ja: { title: "🎬 動画で出会うお祭り", loading: "動画を読み込み中", more: "詳しく見る", watch: "YouTubeで見る" },
  zh: { title: "🎬 视频里的热门庆典", loading: "正在加载视频", more: "查看详情", watch: "在 YouTube 观看" },
  "zh-TW": { title: "🎬 影片裡的熱門慶典", loading: "正在載入影片", more: "查看詳情", watch: "在 YouTube 觀看" },
  es: { title: "🎬 Festivales en vídeo", loading: "Cargando vídeos", more: "Ver detalles", watch: "Ver en YouTube" },
  fr: { title: "🎬 Festivals en vidéo", loading: "Chargement des vidéos", more: "Voir les détails", watch: "Voir sur YouTube" },
  ru: { title: "🎬 Фестивали в видео", loading: "Загрузка видео", more: "Подробнее", watch: "Смотреть на YouTube" },
  de: { title: "🎬 Feste im Video", loading: "Videos werden geladen", more: "Details ansehen", watch: "Auf YouTube ansehen" },
  ar: { title: "🎬 المهرجانات بالفيديو", loading: "جارٍ تحميل الفيديو", more: "عرض التفاصيل", watch: "المشاهدة على YouTube" },
  vi: { title: "🎬 Lễ hội qua video", loading: "Đang tải video", more: "Xem chi tiết", watch: "Xem trên YouTube" },
  id: { title: "🎬 Festival dalam video", loading: "Memuat video", more: "Lihat detail", watch: "Tonton di YouTube" },
  th: { title: "🎬 เทศกาลผ่านวิดีโอ", loading: "กำลังโหลดวิดีโอ", more: "ดูรายละเอียด", watch: "ดูบน YouTube" },
};

// 배열을 무작위로 섞어 매번 다른 순서로 보여줍니다.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 썸네일 좌상단에 얹을 축제명 + D-day 배지 (우리 사이트 고유 정보)
function FestivalBadge({ festival, ongoingLabel }) {
  const st = getStatusInfo(festival.startDate, festival.endDate);
  const dday = st.key === "ongoing" ? ongoingLabel : st.label;
  return (
    <span className="sf-badge">
      <span className={`sf-badge-dday ${st.key}`}>{dday}</span>
      <span className="sf-badge-name">
        {festival.displayName || festival.name}
      </span>
    </span>
  );
}

// 홈 화면: 진행중·예정 '메인 축제'의 유튜브 쇼츠를 지도 위에 피드로 보여줍니다.
//  - 축제당 쇼츠 1개(썸네일) → 클릭 시 지연 로딩 재생, 유튜브 크게보기 링크 제공
//  - 순서를 매번 섞고, 카드뉴스처럼 천천히 자동 스크롤로 순환(계속 바뀜)
//  - 마우스 올리거나 영상을 재생하면 자동 스크롤 멈춤
//  - 영상 없는 축제 카드는 숨기고, 하나도 없으면 피드 전체를 숨깁니다.
//  - 유튜브 키가 없거나 실패해도 홈 화면(지도·필터)은 정상 동작합니다.
export default function HomeShortsFeed({ festivals = [], accent = "#c2578a" }) {
  const { locale, href, t } = useI18n();
  const h = HL[locale] || HL.ko;
  // 메인 축제가 없으면 처음부터 조용히(스켈레톤 깜빡임 없이) 숨김
  const [state, setState] = useState(() =>
    festivals.length ? { status: "loading", items: [] } : { status: "ok", items: [] }
  );
  const [engaged, setEngaged] = useState(false); // 사용자가 재생을 누르면 자동스크롤 정지
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!festivals.length) {
      setState({ status: "ok", items: [] });
      return;
    }
    let alive = true;
    const en = locale === "en" ? "&en=1" : "";
    const controllers = [];

    Promise.all(
      festivals.map((f) => {
        const c = new AbortController();
        controllers.push(c);
        const timer = setTimeout(() => c.abort(), 12000);
        return fetch(`/api/videos?query=${encodeURIComponent(f.name)}${en}`, {
          signal: c.signal,
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            clearTimeout(timer);
            const it = j && (j.items || [])[0];
            return it ? { festival: f, video: it } : null;
          })
          .catch(() => null);
      })
    ).then((results) => {
      if (!alive) return;
      // 영상이 있는 것만, 순서를 섞어서(매번 다르게) 표시
      setState({ status: "ok", items: shuffle(results.filter(Boolean)) });
    });

    return () => {
      alive = false;
      controllers.forEach((c) => c.abort());
    };
  }, [festivals, locale]);

  // 카드뉴스처럼 천천히 자동 스크롤(순환). 재생 중·마우스 오버·모션최소화면 정지.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || state.items.length <= 2 || engaged) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let hover = false;
    const enter = () => {
      hover = true;
    };
    const leave = () => {
      hover = false;
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);

    const id = setInterval(() => {
      if (hover) return;
      const card = el.querySelector(".sf-card");
      const step = (card ? card.offsetWidth : 150) + 12; // 카드폭 + gap
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
        el.scrollTo({ left: 0, behavior: "smooth" }); // 끝에 닿으면 처음으로
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    }, 4500);

    return () => {
      clearInterval(id);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [state.items.length, engaged]);

  // 로딩 중: 제목 + 스켈레톤
  if (state.status === "loading") {
    return (
      <section className="home-shorts" style={{ "--accent": accent }}>
        <h2 className="home-shorts-title">{h.title}</h2>
        <div className="vid-scroll" aria-label={h.loading}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sf-skel skeleton" />
          ))}
        </div>
      </section>
    );
  }

  // 영상이 하나도 없으면 피드 전체 숨김 (홈은 정상)
  if (!state.items.length) return null;

  return (
    <section className="home-shorts" style={{ "--accent": accent }}>
      <h2 className="home-shorts-title">{h.title}</h2>
      <div className="vid-scroll fade-in" ref={scrollRef}>
        {state.items.map(({ festival, video }) => (
          <ShortsCard
            key={festival.id}
            video={video}
            locale={locale}
            watchLabel={h.watch}
            badge={
              <FestivalBadge
                festival={festival}
                ongoingLabel={t.status.ongoingShort}
              />
            }
            moreHref={href(`/festival/${festival.id}`)}
            moreLabel={h.more}
            onPlay={() => setEngaged(true)}
          />
        ))}
      </div>
    </section>
  );
}
