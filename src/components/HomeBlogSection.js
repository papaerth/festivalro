"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import BlogThumb from "./BlogThumb";

// "지금 뜨는 축제 블로그" — 홈 신규 섹션 (+ 상세검색 + 자동완성).
//  · 기본: 다가오는 인기 축제들의 네이버 블로그 최신글 종합
//  · 축제 선택(마커/카드): 그 축제 것만 + 제목 변경 + 돌아가기 + 하이라이트
//  · 상세검색: 검색창 입력 → (엔터/버튼) 네이버 블로그 검색 → 카드 교체
//  · 자동완성: 우리 축제 데이터 기반(브라우저 즉시, API 호출 없음) + 의도 키워드 칩
//  · 저작권: API 요약(발췌) 범위만, 출처·원문 링크 필수 (본문 크롤링 X)

const SRC = 3; // 종합에 쓸 축제 수
const PER = 2; // 축제당 카드 수
const MAX = 6; // 종합 최종 카드 수 (2열 그리드 × 3행 = 6개)

// ▼▼▼ 의도 키워드 칩 — 여기 목록만 바꾸면 됩니다 (q=실제 검색어(한국어), en=외국어 라벨) ▼▼▼
const INTENT_KEYWORDS = [
  { q: "주차", en: "Parking" },
  { q: "셔틀버스", en: "Shuttle" },
  { q: "숙소", en: "Lodging" },
  { q: "맛집", en: "Food" },
  { q: "후기", en: "Reviews" },
  { q: "준비물", en: "What to bring" },
  { q: "아이랑", en: "With kids" },
  { q: "포토스팟", en: "Photo spots" },
];
// ▲▲▲ 여기까지 ▲▲▲

const L = {
  ko: {
    def: "지금 뜨는 축제 블로그",
    sel: (n) => `${n} 블로그 후기`,
    reset: "↩ 전체 축제 보기",
    source: "네이버 블로그",
    ph: "축제 이름이나 궁금한 것을 검색해보세요 (예: 보령머드축제 주차)",
    btn: "검색",
    back: "↩ 추천 글로 돌아가기",
    none: "검색 결과가 없어요. 다른 검색어를 시도해보세요.",
    result: (q) => `'${q}' 검색 결과`,
    koNote: null,
  },
  en: {
    def: "Trending festival blogs",
    sel: (n) => `${n} · Blog reviews`,
    reset: "↩ All festivals",
    source: "Naver Blog",
    ph: "Search a festival or anything (e.g. Boryeong Mud Festival parking)",
    btn: "Search",
    back: "↩ Back to recommended",
    none: "No results. Try a different search term.",
    result: (q) => `Results for '${q}'`,
    koNote: "Searches Korean blog reviews",
  },
};

// ── 초성 매칭 도우미 (우리 데이터 기반 자동완성용) ──
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function toCho(str) {
  let out = "";
  for (const ch of String(str)) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}
const isChoQuery = (q) => /^[ㄱ-ㅎ]+$/.test(q);

const CACHE = new Map(); // `${query}|${locale}` → items[]
async function fetchBlogFor(query, locale, signal) {
  const key = `${query}|${locale}`;
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const res = await fetch(
      `/api/blog?query=${encodeURIComponent(query)}&locale=${locale}`,
      { signal }
    );
    if (!res.ok) throw new Error("blog fetch " + res.status);
    const data = await res.json();
    const items = data.configured && Array.isArray(data.items) ? data.items : [];
    CACHE.set(key, items);
    return items;
  } catch {
    return null; // null = 실패(안내 문구용). [] = 정상인데 결과 없음
  }
}

// 입력어와 일치하는 부분을 굵게
function highlight(display, q) {
  const idx = display.toLowerCase().indexOf(q.toLowerCase());
  if (q.length === 0 || idx < 0) return display;
  return (
    <>
      {display.slice(0, idx)}
      <strong>{display.slice(idx, idx + q.length)}</strong>
      {display.slice(idx + q.length)}
    </>
  );
}

export default function HomeBlogSection({
  festivals = [],
  allFestivals = [],
  selectedName = null,
  selectedKoName = null,
  onReset = null,
  flashSignal = 0,
  accent,
}) {
  const { locale } = useI18n();
  const t = L[locale] || L.en;

  const [state, setState] = useState({ status: "loading", items: [] }); // 기본/선택 종합
  const [flash, setFlash] = useState(false);

  // 검색 상태
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState(null); // 자동완성에서 고른 축제(축제명 = 한국어)
  const [showAuto, setShowAuto] = useState(false);
  const [hi, setHi] = useState(-1); // 자동완성 하이라이트 인덱스
  const [search, setSearch] = useState(null); // {query, status, items} — null=검색 아님

  const festRef = useRef(festivals);
  festRef.current = festivals;
  const ids = (festivals || []).slice(0, SRC).map((f) => f.id).join(",");

  // 기본/선택 종합 로드
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
        fetchBlogFor(f.name, locale, ctrl.signal).then((its) => (its || []).slice(0, PER))
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

  useEffect(() => {
    if (!flashSignal) return;
    setFlash(true);
    const tm = setTimeout(() => setFlash(false), 950);
    return () => clearTimeout(tm);
  }, [flashSignal]);

  // 축제 선택이 바뀌면 진행 중이던 검색은 해제
  useEffect(() => {
    setSearch(null);
    setInput("");
    setPicked(null);
  }, [ids]);

  // 자동완성 후보 (브라우저에서 즉시 — API 호출 없음)
  const suggestions = useMemo(() => {
    const q = input.trim();
    if (q.length < 1) return [];
    const cho = isChoQuery(q);
    const seen = new Set();
    const out = [];
    for (const f of allFestivals) {
      if (out.length >= 5) break;
      const disp = f.displayName || f.name;
      const ko = f.name || "";
      if (!disp || seen.has(disp)) continue;
      const sub =
        disp.toLowerCase().includes(q.toLowerCase()) ||
        ko.toLowerCase().includes(q.toLowerCase());
      const choHit = cho && (toCho(ko).includes(q) || toCho(disp).includes(q));
      if (sub || choHit) {
        seen.add(disp);
        out.push(f);
      }
    }
    return out;
  }, [input, allFestivals]);

  // 검색 실행 (엔터/버튼/칩에서만 호출 → 타이핑 중 API 호출 없음)
  const runSearch = (fullQuery) => {
    const q = fullQuery.trim();
    if (!q) return;
    setShowAuto(false);
    setSearch({ query: q, status: "loading", items: [] });
    fetchBlogFor(q, locale).then((items) => {
      setSearch({
        query: q,
        status: items === null ? "error" : "ok",
        items: items || [],
      });
    });
  };

  // 입력창 제출: 선택 연동 모드면 축제명 자동 prepend
  const submitInput = () => {
    const text = input.trim();
    const base = picked ? "" : selectedKoName ? `${selectedKoName} ` : "";
    const full = `${base}${text}`.trim();
    if (!full) return;
    runSearch(full);
  };

  // 키워드 칩: 현재 축제 맥락(고른 축제 or 선택 연동 축제) + 키워드
  const ctxKo = picked?.name || selectedKoName || null;
  const onChip = (kw) => runSearch(`${ctxKo} ${kw}`.trim());

  const pickFestival = (f) => {
    setInput(f.name); // 검색은 한국어 축제명으로
    setPicked(f);
    setShowAuto(false);
    setHi(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowAuto(true);
      setHi((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showAuto && hi >= 0 && suggestions[hi]) pickFestival(suggestions[hi]);
      else submitInput();
    } else if (e.key === "Escape") {
      setShowAuto(false);
    }
  };

  const searching = search !== null;

  // 결과가 없고 종합(기본)·검색 아님이면 섹션 숨김
  if (
    !searching &&
    state.status === "ok" &&
    state.items.length === 0 &&
    !selectedName
  )
    return null;

  const title = searching
    ? t.result(search.query)
    : selectedName
    ? t.sel(selectedName)
    : t.def;

  // 화면에 그릴 카드 목록
  const cards = searching ? search.items : state.items;
  const loading = searching ? search.status === "loading" : state.status === "loading";
  const failed = searching && search.status === "error";

  return (
    <section
      className={`home-feed home-blog ${flash ? "feed-flash" : ""}`}
      style={accent ? { "--accent": accent } : undefined}
    >
      <div className="home-feed-head">
        <h2 className="home-feed-title">📝 {title}</h2>
        {searching ? (
          <button className="feed-reset" onClick={() => { setSearch(null); setInput(""); setPicked(null); }}>
            {t.back}
          </button>
        ) : selectedName && onReset ? (
          <button className="feed-reset" onClick={onReset}>
            {t.reset}
          </button>
        ) : null}
      </div>

      {/* 검색창 + 자동완성 */}
      <div className="blog-search">
        <div className="blog-search-box">
          <span className="blog-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="blog-search-input"
            placeholder={t.ph}
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              setShowAuto(true);
              setHi(-1);
              if (picked && v !== picked.name) setPicked(null);
            }}
            onFocus={() => setShowAuto(true)}
            onBlur={() => setTimeout(() => setShowAuto(false), 150)}
            onKeyDown={onKeyDown}
            aria-label={t.ph}
          />
          <button className="blog-search-btn" onClick={submitInput}>
            {t.btn}
          </button>

          {showAuto && suggestions.length > 0 && (
            <ul className="blog-auto" role="listbox">
              {suggestions.map((f, i) => (
                <li
                  key={f.id}
                  role="option"
                  aria-selected={i === hi}
                  className={`blog-auto-item ${i === hi ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickFestival(f);
                  }}
                  onMouseEnter={() => setHi(i)}
                >
                  <span className="blog-auto-pin" aria-hidden="true">📍</span>
                  {highlight(f.displayName || f.name, input.trim())}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 의도 키워드 칩 (축제 맥락이 있을 때만) */}
        {ctxKo && (
          <div className="blog-chips">
            {INTENT_KEYWORDS.map((k) => (
              <button key={k.q} className="blog-chip" onClick={() => onChip(k.q)}>
                {locale === "ko" ? k.q : k.en}
              </button>
            ))}
          </div>
        )}

        {t.koNote && <p className="blog-search-note">🇰🇷 {t.koNote}</p>}
      </div>

      {/* 카드 목록 */}
      {loading && cards.length === 0 ? (
        <div className="feed-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skel-card" />
          ))}
        </div>
      ) : failed || (searching && cards.length === 0) ? (
        <p className="feed-empty">{t.none}</p>
      ) : cards.length === 0 ? (
        <p className="feed-empty">—</p>
      ) : (
        <div className="feed-row">
          {cards.map((it, i) => (
            <a
              key={it.link || i}
              className="blog-card"
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <BlogThumb src={it.image} blogger={it.blogger} accent={accent} />
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
