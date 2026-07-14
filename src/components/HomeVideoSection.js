"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// "영상으로 만나는 축제" — 홈 하단 롱폼 영상 섹션 (+ 상세검색 + 자동완성).
//  · 기본: 다가오는 인기 축제들의 유튜브 롱폼 종합
//  · 축제 선택 시: 그 축제 것만 + 제목 변경 + 돌아가기 + 하이라이트
//  · 상세검색: 검색창 입력 → (엔터/버튼) 유튜브 검색 → 카드 교체
//  · 자동완성: 우리 축제 데이터 기반(브라우저 즉시, API 호출 없음) + 의도 키워드 칩
//  · 축제별 캐싱 → 전환/재검색 시 재호출 최소화(유튜브 할당량 보호)

const SRC = 2; // 종합에 쓸 축제 수 (유튜브 할당량 고려해 적게)
const PER = 3;
const MAX = 3; // 피드에 띄우는 개수

// ▼▼▼ 영상 검색 의도 키워드 칩 — 여기 목록만 바꾸면 됩니다 (q=검색어(한국어), en=외국어 라벨) ▼▼▼
const INTENT_KEYWORDS = [
  { q: "브이로그", en: "Vlog" },
  { q: "직캠", en: "Fancam" },
  { q: "공연", en: "Performance" },
  { q: "불꽃놀이", en: "Fireworks" },
  { q: "하이라이트", en: "Highlights" },
  { q: "먹방", en: "Food" },
  { q: "야경", en: "Night view" },
  { q: "후기", en: "Review" },
];
// ▲▲▲ 여기까지 ▲▲▲

const L = {
  ko: {
    def: "영상으로 만나는 축제",
    sel: (n) => `${n} 영상`,
    reset: "↩ 전체 축제 보기",
    ph: "축제 이름이나 궁금한 것을 검색해보세요 (예: 진해군항제 불꽃놀이)",
    btn: "검색",
    back: "↩ 추천 영상으로 돌아가기",
    none: "검색 결과가 없어요. 다른 검색어를 시도해보세요.",
    result: (q) => `'${q}' 영상`,
    koNote: null,
  },
  en: {
    def: "Festivals in video",
    sel: (n) => `${n} · Videos`,
    reset: "↩ All festivals",
    ph: "Search a festival or topic (e.g. Jinhae fireworks)",
    btn: "Search",
    back: "↩ Back to recommended",
    none: "No results. Try a different search term.",
    result: (q) => `Videos for '${q}'`,
    koNote: "Searches Korean festival videos",
  },
};

// ── 초성 매칭 도우미 (자동완성용) ──
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
async function fetchVideoFor(query, locale, signal) {
  const key = `${query}|${locale}`;
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const res = await fetch(
      `/api/videos?query=${encodeURIComponent(query)}&locale=${locale}`,
      { signal }
    );
    if (!res.ok) throw new Error("videos " + res.status);
    const data = await res.json();
    const items = data.configured && Array.isArray(data.items) ? data.items : [];
    CACHE.set(key, items);
    return items;
  } catch {
    return null; // null=실패(안내용), []=정상인데 결과 없음
  }
}

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

export default function HomeVideoSection({
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

  const [state, setState] = useState({ status: "loading", items: [] });
  const [flash, setFlash] = useState(false);

  const [input, setInput] = useState("");
  const [picked, setPicked] = useState(null);
  const [showAuto, setShowAuto] = useState(false);
  const [hi, setHi] = useState(-1);
  const [search, setSearch] = useState(null);

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
        fetchVideoFor(f.name, locale, ctrl.signal).then((its) => (its || []).slice(0, PER))
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

  useEffect(() => {
    setSearch(null);
    setInput("");
    setPicked(null);
  }, [ids]);

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

  const runSearch = (fullQuery) => {
    const q = fullQuery.trim();
    if (!q) return;
    setShowAuto(false);
    setSearch({ query: q, status: "loading", items: [] });
    fetchVideoFor(q, locale).then((items) => {
      setSearch({
        query: q,
        status: items === null ? "error" : "ok",
        items: items || [],
      });
    });
  };

  const submitInput = () => {
    const text = input.trim();
    const base = picked ? "" : selectedKoName ? `${selectedKoName} ` : "";
    const full = `${base}${text}`.trim();
    if (!full) return;
    runSearch(full);
  };

  const ctxKo = picked?.name || selectedKoName || null;
  const onChip = (kw) => runSearch(`${ctxKo} ${kw}`.trim());

  const pickFestival = (f) => {
    setInput(f.name);
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

  const cards = searching ? search.items : state.items;
  const loading = searching ? search.status === "loading" : state.status === "loading";
  const failed = searching && search.status === "error";

  return (
    <section
      className={`home-feed home-video ${flash ? "feed-flash" : ""}`}
      style={accent ? { "--accent": accent } : undefined}
    >
      <div className="home-feed-head">
        <h2 className="home-feed-title">🎬 {title}</h2>
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
          {cards.map((v) => (
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
                <span className="vid-meta">{v.channel || ""}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
