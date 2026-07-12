"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// "영상으로 만나는 축제" — 홈 하단 롱폼 영상 섹션(기존 쇼츠 피드 대체).
//  · 기본: 다가오는 인기 축제들의 유튜브 롱폼 종합
//  · 축제 선택 시: 그 축제 것만 + 제목 변경 + 돌아가기 + 하이라이트
//  · 축제별 캐싱 → 전환 시 재호출 최소화(유튜브 할당량 보호, 서버 캐시 재사용)

const SRC = 2; // 종합에 쓸 축제 수 (유튜브 할당량 고려해 적게)
const PER = 3;
const MAX = 6;

const L = {
  ko: { def: "영상으로 만나는 축제", sel: (n) => `${n} 영상`, reset: "↩ 전체 축제 보기", watch: "▶ 유튜브에서 보기" },
  en: { def: "Festivals in video", sel: (n) => `${n} · Videos`, reset: "↩ All festivals", watch: "▶ Watch on YouTube" },
};

const CACHE = new Map(); // `${name}|${locale}` → items[]

async function fetchVideoFor(name, locale, signal) {
  const key = `${name}|${locale}`;
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const res = await fetch(
      `/api/videos?query=${encodeURIComponent(name)}&locale=${locale}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.configured && Array.isArray(data.items) ? data.items : [];
    CACHE.set(key, items);
    return items;
  } catch {
    return [];
  }
}

export default function HomeVideoSection({
  festivals = [],
  selectedName = null,
  onReset = null,
  flashSignal = 0,
  accent,
}) {
  const { locale } = useI18n();
  const t = L[locale] || L.en;
  const [state, setState] = useState({ status: "loading", items: [] });
  const [flash, setFlash] = useState(false);

  const festRef = useRef(festivals);
  festRef.current = festivals;
  const ids = (festivals || []).slice(0, SRC).map((f) => f.id).join(",");

  useEffect(() => {
    const list = (festRef.current || []).slice(0, SRC);
    if (!list.length) {
      setState({ status: "ok", items: [] });
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    setState((s) => ({ status: "loading", items: s.items }));
    Promise.all(
      list.map((f) =>
        fetchVideoFor(f.name, locale, ctrl.signal).then((its) => its.slice(0, PER))
      )
    ).then((results) => {
      if (!alive) return;
      const seen = new Set();
      const merged = [];
      results.flat().forEach((it) => {
        if (it.id && !seen.has(it.id)) {
          seen.add(it.id);
          merged.push(it);
        }
      });
      setState({ status: "ok", items: merged.slice(0, MAX) });
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, locale]);

  useEffect(() => {
    if (!flashSignal) return;
    setFlash(true);
    const tm = setTimeout(() => setFlash(false), 950);
    return () => clearTimeout(tm);
  }, [flashSignal]);

  if (state.status === "ok" && state.items.length === 0 && !selectedName) return null;

  const title = selectedName ? t.sel(selectedName) : t.def;

  return (
    <section
      className={`home-feed home-video ${flash ? "feed-flash" : ""}`}
      style={accent ? { "--accent": accent } : undefined}
    >
      <div className="home-feed-head">
        <h2 className="home-feed-title">🎬 {title}</h2>
        {selectedName && onReset && (
          <button className="feed-reset" onClick={onReset}>
            {t.reset}
          </button>
        )}
      </div>

      {state.status === "loading" && state.items.length === 0 ? (
        <div className="feed-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skel-card" />
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <p className="feed-empty">—</p>
      ) : (
        <div className="feed-row">
          {state.items.map((v) => (
            <a
              key={v.id}
              className="vid-card"
              href={`https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="vid-thumb" style={{ backgroundImage: v.thumb ? `url(${v.thumb})` : undefined }}>
                <span className="vid-play" aria-hidden="true">▶</span>
              </span>
              <span className="vid-body">
                <span className="vid-title">{v.title}</span>
                <span className="vid-meta">{v.channel || t.watch}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
