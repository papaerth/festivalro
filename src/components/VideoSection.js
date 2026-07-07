"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import ShortsCard from "@/components/ShortsCard";

// 섹션 제목·버튼 문구 (13개 언어). 블로그 후기(BlogList)와 같은 방식으로
// 컴포넌트 안에 표를 두어 관리합니다.
const VL = {
  ko: { title: "🎬 영상으로 미리 보는 축제", loading: "영상 불러오는 중", tiktok: "TikTok에서 검색", instagram: (t) => `Instagram에서 #${t} 보기` },
  en: { title: "🎬 Watch the festival", loading: "Loading videos", tiktok: "Search on TikTok", instagram: (t) => `See #${t} on Instagram` },
  ja: { title: "🎬 動画で見るお祭り", loading: "動画を読み込み中", tiktok: "TikTokで検索", instagram: (t) => `Instagramで #${t} を見る` },
  zh: { title: "🎬 视频先睹为快", loading: "正在加载视频", tiktok: "在 TikTok 搜索", instagram: (t) => `在 Instagram 查看 #${t}` },
  "zh-TW": { title: "🎬 影片搶先看", loading: "正在載入影片", tiktok: "在 TikTok 搜尋", instagram: (t) => `在 Instagram 查看 #${t}` },
  es: { title: "🎬 El festival en vídeo", loading: "Cargando vídeos", tiktok: "Buscar en TikTok", instagram: (t) => `Ver #${t} en Instagram` },
  fr: { title: "🎬 Le festival en vidéo", loading: "Chargement des vidéos", tiktok: "Rechercher sur TikTok", instagram: (t) => `Voir #${t} sur Instagram` },
  ru: { title: "🎬 Фестиваль в видео", loading: "Загрузка видео", tiktok: "Искать в TikTok", instagram: (t) => `Смотреть #${t} в Instagram` },
  de: { title: "🎬 Das Fest im Video", loading: "Videos werden geladen", tiktok: "Auf TikTok suchen", instagram: (t) => `#${t} auf Instagram ansehen` },
  ar: { title: "🎬 المهرجان بالفيديو", loading: "جارٍ تحميل الفيديو", tiktok: "ابحث على TikTok", instagram: (t) => `شاهد #${t} على Instagram` },
  vi: { title: "🎬 Xem trước lễ hội qua video", loading: "Đang tải video", tiktok: "Tìm trên TikTok", instagram: (t) => `Xem #${t} trên Instagram` },
  id: { title: "🎬 Festival dalam video", loading: "Memuat video", tiktok: "Cari di TikTok", instagram: (t) => `Lihat #${t} di Instagram` },
  th: { title: "🎬 ดูเทศกาลผ่านวิดีโอ", loading: "กำลังโหลดวิดีโอ", tiktok: "ค้นหาบน TikTok", instagram: (t) => `ดู #${t} บน Instagram` },
};

// "유튜브에서 크게 보기" 문구 (13개 언어)
const WATCH = {
  ko: "유튜브에서 크게 보기", en: "Watch on YouTube", ja: "YouTubeで見る",
  zh: "在 YouTube 观看", "zh-TW": "在 YouTube 觀看", es: "Ver en YouTube",
  fr: "Voir sur YouTube", ru: "Смотреть на YouTube", de: "Auf YouTube ansehen",
  ar: "المشاهدة على YouTube", vi: "Xem trên YouTube", id: "Tonton di YouTube",
  th: "ดูบน YouTube",
};

// ── 게시물 주소에서 영상 ID 뽑기 (큐레이션 임베드용) ──
function youtubeId(url) {
  const m = String(url).match(
    /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}
function tiktokId(url) {
  const m = String(url).match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

// 인스타그램 공식 임베드 스크립트 (한 번만 로드)
let igPromise = null;
function loadInstagram() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.instgrm) return Promise.resolve();
  if (igPromise) return igPromise;
  igPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://www.instagram.com/embed.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("instagram embed.js load failed"));
    document.body.appendChild(s);
  });
  return igPromise;
}


// 큐레이션 임베드 카드(선택 축제만): 인스타/틱톡/유튜브 공식 플레이어.
//  - 클릭하는 순간에만 임베드를 불러오는 지연 로딩
//  - 주소에서 ID를 못 뽑거나 임베드가 실패하면 이 카드만 조용히 숨김
function CuratedEmbed({ item, watchLabel }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const platform = item && item.platform;
  const url = (item && item.url) || "";
  const ytId = platform === "youtube" ? youtubeId(url) : null;
  const ttId = platform === "tiktok" ? tiktokId(url) : null;
  const embeddable =
    platform === "instagram" ||
    (platform === "youtube" && !!ytId) ||
    (platform === "tiktok" && !!ttId);

  useEffect(() => {
    if (!open || platform !== "instagram") return;
    let alive = true;
    loadInstagram()
      .then(() => {
        if (alive && window.instgrm) window.instgrm.Embeds.process();
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, platform]);

  if (!embeddable || failed) return null;

  if (!open) {
    const icon =
      platform === "instagram" ? "📸" : platform === "tiktok" ? "🎵" : "▶️";
    const label = platform.charAt(0).toUpperCase() + platform.slice(1);
    return (
      <button className="vid-embed-card" onClick={() => setOpen(true)}>
        <span className="vid-embed-icon">{icon}</span>
        <span className="vid-embed-plat">{label}</span>
        <span className="vid-play-btn">▶</span>
      </button>
    );
  }

  if (platform === "youtube") {
    return (
      <div className="vid-embed-open">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1`}
          title="YouTube"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
        <a
          className="vid-yt"
          href={`https://www.youtube.com/watch?v=${ytId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          ▶ {watchLabel}
        </a>
      </div>
    );
  }
  if (platform === "tiktok") {
    return (
      <div className="vid-embed-open vid-embed-tiktok">
        <iframe
          src={`https://www.tiktok.com/embed/v2/${ttId}`}
          title="TikTok"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  // instagram — 공식 블록쿼트 임베드 (embed.js가 iframe으로 교체)
  return (
    <div className="vid-embed-open vid-embed-ig">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ margin: 0, width: "100%", minWidth: 0 }}
      />
    </div>
  );
}

// 축제 상세페이지 "영상으로 미리 보는 축제" 섹션.
//  - 유튜브 쇼츠는 썸네일만 먼저, 플레이어는 클릭 시 지연 로딩
//  - 유튜브 실패/한도초과/키없음 → 영상 목록만 조용히 숨김 (섹션·버튼은 정상)
//  - 인스타/틱톡 바로가기 버튼은 전 축제 공통
export default function VideoSection({ query, curatedVideos, accent = "#c2578a" }) {
  const { locale } = useI18n();
  const v = VL[locale] || VL.ko;
  const watch = WATCH[locale] || WATCH.ko;
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const en = locale === "en" ? "&en=1" : "";

    fetch(`/api/videos?query=${encodeURIComponent(query)}${en}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("videos fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        clearTimeout(timer);
        setState({ status: "ok", items: data.items || [] });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  const tag = String(query).replace(/\s+/g, "");
  const igUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
  const ttUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
  const curated = Array.isArray(curatedVideos) ? curatedVideos : [];
  const hasVideos = state.status === "ok" && state.items.length > 0;

  return (
    <section className="section video-section" style={{ "--accent": accent }}>
      <h2>{v.title}</h2>

      {/* 큐레이션 임베드(선택 축제) — 있으면 맨 위 */}
      {curated.length > 0 && (
        <div className="vid-scroll vid-embed-row">
          {curated.map((it, i) => (
            <CuratedEmbed key={i} item={it} watchLabel={watch} />
          ))}
        </div>
      )}

      {/* 유튜브 쇼츠: 로딩 중엔 스켈레톤, 결과 있으면 가로 스크롤 카드 */}
      {state.status === "loading" && (
        <div className="vid-scroll" aria-label={v.loading}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sf-skel skeleton" />
          ))}
        </div>
      )}
      {hasVideos && (
        <div className="vid-scroll">
          {state.items.map((it) => (
            <ShortsCard key={it.id} video={it} locale={locale} watchLabel={watch} />
          ))}
        </div>
      )}

      {/* 인스타 · 틱톡 바로가기 (전 축제 공통) */}
      <div className="vid-social">
        <a
          className="vid-social-btn ig"
          href={igUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="vid-social-ic">📸</span>
          {v.instagram(tag)}
        </a>
        <a
          className="vid-social-btn tt"
          href={ttUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="vid-social-ic">🎵</span>
          {v.tiktok}
        </a>
      </div>
    </section>
  );
}
