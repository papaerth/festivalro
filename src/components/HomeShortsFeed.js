"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 홈 화면 "메인 축제 쇼츠" 피드 문구 (13개 언어)
const HL = {
  ko: { title: "🎬 지금 뜨는 축제 쇼츠", loading: "쇼츠 불러오는 중", more: "자세히 보기", watch: "유튜브에서 크게 보기" },
  en: { title: "🎬 Festivals in Shorts", loading: "Loading shorts", more: "View details", watch: "Watch on YouTube" },
  ja: { title: "🎬 話題のお祭りショート", loading: "ショートを読み込み中", more: "詳しく見る", watch: "YouTubeで見る" },
  zh: { title: "🎬 热门庆典短视频", loading: "正在加载短视频", more: "查看详情", watch: "在 YouTube 观看" },
  "zh-TW": { title: "🎬 熱門慶典短影音", loading: "正在載入短影音", more: "查看詳情", watch: "在 YouTube 觀看" },
  es: { title: "🎬 Festivales en Shorts", loading: "Cargando shorts", more: "Ver detalles", watch: "Ver en YouTube" },
  fr: { title: "🎬 Festivals en Shorts", loading: "Chargement des shorts", more: "Voir les détails", watch: "Voir sur YouTube" },
  ru: { title: "🎬 Фестивали в Shorts", loading: "Загрузка роликов", more: "Подробнее", watch: "Смотреть на YouTube" },
  de: { title: "🎬 Feste in Shorts", loading: "Shorts werden geladen", more: "Details ansehen", watch: "Auf YouTube ansehen" },
  ar: { title: "🎬 المهرجانات في Shorts", loading: "جارٍ تحميل المقاطع", more: "عرض التفاصيل", watch: "المشاهدة على YouTube" },
  vi: { title: "🎬 Lễ hội qua Shorts", loading: "Đang tải shorts", more: "Xem chi tiết", watch: "Xem trên YouTube" },
  id: { title: "🎬 Festival dalam Shorts", loading: "Memuat shorts", more: "Lihat detail", watch: "Tonton di YouTube" },
  th: { title: "🎬 เทศกาลใน Shorts", loading: "กำลังโหลด Shorts", more: "ดูรายละเอียด", watch: "ดูบน YouTube" },
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

// 카드 한 장: 썸네일만 먼저, 클릭하면 그 자리에서 재생.
//  - 재생 중엔 "유튜브에서 크게 보기" 링크(새 탭)로 큰 화면 이동 가능
function ShortItem({ festival, video, moreLabel, watchLabel, hrefFn, onPlay }) {
  const [open, setOpen] = useState(false);
  const name = festival.displayName || festival.name;
  const ytUrl = `https://www.youtube.com/watch?v=${video.id}`;

  return (
    <div className="short-card">
      {open ? (
        <div className="short-thumb">
          <iframe
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        <button
          className="short-thumb short-thumb-btn"
          onClick={() => {
            setOpen(true);
            if (onPlay) onPlay();
          }}
          title={video.title}
        >
          {video.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.thumb} alt="" loading="lazy" />
          ) : (
            <span className="short-thumb-empty">🎬</span>
          )}
          <span className="short-play">▶</span>
          <span className="short-fest-name">{name}</span>
        </button>
      )}

      <div className="short-links">
        {open && (
          <a
            className="short-yt"
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ▶ {watchLabel}
          </a>
        )}
        <a className="short-more" href={hrefFn(`/festival/${festival.id}`)}>
          {moreLabel} ›
        </a>
      </div>
    </div>
  );
}

// 홈 화면: 진행중·예정 '메인 축제'의 유튜브 쇼츠를 지도 위에 피드로 보여줍니다.
//  - 축제당 쇼츠 1개(썸네일) → 클릭 시 지연 로딩 재생, 유튜브 크게보기 링크 제공
//  - 순서를 매번 섞고, 카드뉴스처럼 천천히 자동 스크롤로 순환(계속 바뀜)
//  - 마우스 올리거나 영상을 재생하면 자동 스크롤 멈춤
//  - 영상 없는 축제 카드는 숨기고, 하나도 없으면 피드 전체를 숨깁니다.
//  - 유튜브 키가 없거나 실패해도 홈 화면(지도·필터)은 정상 동작합니다.
export default function HomeShortsFeed({ festivals = [], accent = "#c2578a" }) {
  const { locale, href } = useI18n();
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
      const card = el.querySelector(".short-card");
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
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="short-card short-skel skeleton" />
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
      <div className="vid-scroll" ref={scrollRef}>
        {state.items.map(({ festival, video }) => (
          <ShortItem
            key={festival.id}
            festival={festival}
            video={video}
            moreLabel={h.more}
            watchLabel={h.watch}
            hrefFn={href}
            onPlay={() => setEngaged(true)}
          />
        ))}
      </div>
    </section>
  );
}
