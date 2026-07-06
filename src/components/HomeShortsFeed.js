"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 홈 화면 "메인 축제 쇼츠" 피드 문구 (13개 언어)
const HL = {
  ko: { title: "🎬 지금 뜨는 축제 쇼츠", loading: "쇼츠 불러오는 중", more: "자세히 보기" },
  en: { title: "🎬 Festivals in Shorts", loading: "Loading shorts", more: "View details" },
  ja: { title: "🎬 話題のお祭りショート", loading: "ショートを読み込み中", more: "詳しく見る" },
  zh: { title: "🎬 热门庆典短视频", loading: "正在加载短视频", more: "查看详情" },
  "zh-TW": { title: "🎬 熱門慶典短影音", loading: "正在載入短影音", more: "查看詳情" },
  es: { title: "🎬 Festivales en Shorts", loading: "Cargando shorts", more: "Ver detalles" },
  fr: { title: "🎬 Festivals en Shorts", loading: "Chargement des shorts", more: "Voir les détails" },
  ru: { title: "🎬 Фестивали в Shorts", loading: "Загрузка роликов", more: "Подробнее" },
  de: { title: "🎬 Feste in Shorts", loading: "Shorts werden geladen", more: "Details ansehen" },
  ar: { title: "🎬 المهرجانات في Shorts", loading: "جارٍ تحميل المقاطع", more: "عرض التفاصيل" },
  vi: { title: "🎬 Lễ hội qua Shorts", loading: "Đang tải shorts", more: "Xem chi tiết" },
  id: { title: "🎬 Festival dalam Shorts", loading: "Memuat shorts", more: "Lihat detail" },
  th: { title: "🎬 เทศกาลใน Shorts", loading: "กำลังโหลด Shorts", more: "ดูรายละเอียด" },
};

// 카드 한 장: 썸네일만 먼저, 클릭하면 그 자리에서 공식 플레이어 재생.
function ShortItem({ festival, video, moreLabel, hrefFn }) {
  const [open, setOpen] = useState(false);
  const name = festival.displayName || festival.name;

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
          onClick={() => setOpen(true)}
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
      <a className="short-more" href={hrefFn(`/festival/${festival.id}`)}>
        {moreLabel} ›
      </a>
    </div>
  );
}

// 홈 화면: 진행중·예정 '메인 축제 5개'의 유튜브 쇼츠를 지도 위에 피드로 보여줍니다.
//  - 축제당 쇼츠 1개(썸네일) → 클릭 시 지연 로딩 재생
//  - 영상이 없는 축제 카드는 숨기고, 5개 모두 없으면 피드 전체를 숨깁니다.
//  - 유튜브 키가 없거나 실패해도 홈 화면(지도·필터)은 정상 동작합니다.
export default function HomeShortsFeed({ festivals = [], accent = "#c2578a" }) {
  const { locale, href } = useI18n();
  const h = HL[locale] || HL.ko;
  // 메인 축제가 없으면 처음부터 조용히(스켈레톤 깜빡임 없이) 숨김
  const [state, setState] = useState(() =>
    festivals.length ? { status: "loading", items: [] } : { status: "ok", items: [] }
  );

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
      setState({ status: "ok", items: results.filter(Boolean) });
    });

    return () => {
      alive = false;
      controllers.forEach((c) => c.abort());
    };
  }, [festivals, locale]);

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
      <div className="vid-scroll">
        {state.items.map(({ festival, video }) => (
          <ShortItem
            key={festival.id}
            festival={festival}
            video={video}
            moreLabel={h.more}
            hrefFn={href}
          />
        ))}
      </div>
    </section>
  );
}
