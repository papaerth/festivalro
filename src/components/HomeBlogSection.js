"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// "지금 뜨는 축제 블로그" — 홈 신규 섹션.
//  · 기본: 다가오는 인기 축제들(festivals 상위 몇 개)의 네이버 블로그 최신글 종합
//  · 축제 선택 시(마커/카드): 그 축제 것만 표시 + 제목 변경 + 돌아가기 버튼 + 하이라이트
//  · 저작권: API가 주는 요약(발췌) 범위만 표시, 출처·원문 링크 필수 (본문 크롤링 X)
//  · 축제별 캐싱(모듈 캐시) → 전환 시 재호출 최소화 (서버 캐시도 재사용)

const SRC = 3; // 종합에 쓸 축제 수
const PER = 2; // 축제당 카드 수
const MAX = 6; // 최종 카드 수

const L = {
  ko: { def: "지금 뜨는 축제 블로그", sel: (n) => `${n} 블로그 후기`, reset: "↩ 전체 축제 보기", source: "네이버 블로그" },
  en: { def: "Trending festival blogs", sel: (n) => `${n} · Blog reviews`, reset: "↩ All festivals", source: "Naver Blog" },
};

const CACHE = new Map(); // `${name}|${locale}` → items[]

async function fetchBlogFor(name, locale, signal) {
  const key = `${name}|${locale}`;
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const res = await fetch(
      `/api/blog?query=${encodeURIComponent(name)}&locale=${locale}`,
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

export default function HomeBlogSection({
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
        fetchBlogFor(f.name, locale, ctrl.signal).then((its) => its.slice(0, PER))
      )
    ).then((results) => {
      if (!alive) return;
      const seen = new Set();
      const merged = [];
      results.flat().forEach((it) => {
        if (it.link && !seen.has(it.link)) {
          seen.add(it.link);
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

  // 선택 전환 시 살짝 하이라이트 (초기 로드에는 안 함)
  useEffect(() => {
    if (!flashSignal) return;
    setFlash(true);
    const tm = setTimeout(() => setFlash(false), 950);
    return () => clearTimeout(tm);
  }, [flashSignal]);

  // 결과가 없고 종합(기본) 상태면 섹션 자체를 숨김
  if (state.status === "ok" && state.items.length === 0 && !selectedName) return null;

  const title = selectedName ? t.sel(selectedName) : t.def;

  return (
    <section
      className={`home-feed home-blog ${flash ? "feed-flash" : ""}`}
      style={accent ? { "--accent": accent } : undefined}
    >
      <div className="home-feed-head">
        <h2 className="home-feed-title">📝 {title}</h2>
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
          {state.items.map((it, i) => (
            <a
              key={it.link || i}
              className="blog-card"
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {it.image && (
                <span
                  className="blog-card-img"
                  style={{ backgroundImage: `url(${it.image})` }}
                  aria-hidden="true"
                />
              )}
              <span className="blog-card-body">
                <span className="blog-card-title">{it.title}</span>
                {it.description && (
                  <span className="blog-card-desc">{it.description}</span>
                )}
                <span className="blog-card-meta">
                  {it.blogger ? `${it.blogger} · ` : ""}
                  {t.source} ↗
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
