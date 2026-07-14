"use client";

import { useEffect, useMemo, useState } from "react";
import { SIDO } from "@/lib/regionsKr";

// ────────────────────────────────────────────────────────────────
//  상단 통합 검색바 (헤더 바로 아래, 카드뉴스·지도 위)
//   · 축제명 자동완성(부분일치·초성, 최대 5개, 일치부분 굵게) — 홈 블로그 검색과 동일 로직
//   · 축제 선택 → 지도 줌인+팝업+블로그/영상 전환(마커 클릭과 동일 연동)
//   · 지역명(시도/시군구) 검색 → 해당 지역 필터 적용 + 지도 이동
//   · X → 전체 복귀 (카드뉴스 팝업 닫기와 동일)
//   · 모바일: 스크롤 시 살짝 축소되어 상단 고정
// ────────────────────────────────────────────────────────────────

const PH = {
  ko: "축제 이름이나 지역을 검색해보세요",
  en: "Search a festival or region",
};

// 초성 매칭 (홈 블로그 검색과 동일)
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

export default function TopSearch({
  festivals = [],
  value,
  onChange,
  onSelectFestival,
  onSelectRegion,
  onClear,
  onSubmit,
  locale = "ko",
}) {
  const [show, setShow] = useState(false);
  const [hi, setHi] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  const ph = PH[locale] || PH.en;

  // 모바일: 스크롤하면 살짝 축소
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 자동완성 후보: 지역(시도·시군구) 먼저, 그다음 축제명 (브라우저 즉시, API 없음)
  const suggestions = useMemo(() => {
    const q = value.trim();
    if (q.length < 1) return [];
    const lower = q.toLowerCase();
    const cho = isChoQuery(q);
    const out = [];

    // 1) 시도(광역) 매칭 — 최대 2
    let regionN = 0;
    for (const s of SIDO) {
      if (regionN >= 2) break;
      if (s.ko.includes(q) || q.includes(s.ko) || s.kw.some((k) => k.includes(q) || q.includes(k))) {
        out.push({ type: "region", key: `sido-${s.key}`, sidoKey: s.key, sigungu: null, label: `${s.ko} 지역 전체` });
        regionN++;
      }
    }
    // 2) 시군구 매칭 (실제 축제 데이터) — 지역 후보 최대 4까지
    const seenSg = new Set();
    for (const f of festivals) {
      if (regionN >= 4) break;
      const sg = f.sigungu || "";
      if (sg && sg.includes(q) && !seenSg.has(sg)) {
        seenSg.add(sg);
        out.push({ type: "region", key: `sg-${sg}`, sidoKey: f._sido || null, sigungu: sg, label: `${sg}${f.sido ? ` · ${f.sido}` : ""}` });
        regionN++;
      }
    }
    // 3) 축제명 매칭 — 최대 5
    const seenF = new Set();
    let fN = 0;
    for (const f of festivals) {
      if (fN >= 5) break;
      const disp = f.displayName || f.name;
      const ko = f.name || "";
      if (!disp || seenF.has(f.id)) continue;
      const sub = disp.toLowerCase().includes(lower) || ko.toLowerCase().includes(lower);
      const choHit = cho && (toCho(ko).includes(q) || toCho(disp).includes(q));
      if (sub || choHit) {
        seenF.add(f.id);
        out.push({ type: "festival", key: `f-${f.id}`, f, label: disp });
        fN++;
      }
    }
    return out;
  }, [value, festivals]);

  const pick = (s) => {
    if (!s) return;
    if (s.type === "festival") onSelectFestival(s.f);
    else onSelectRegion({ sidoKey: s.sidoKey, sigungu: s.sigungu, label: s.label });
    setShow(false);
    setHi(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShow(true);
      setHi((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (show && hi >= 0 && suggestions[hi]) pick(suggestions[hi]);
      else if (suggestions.length > 0) pick(suggestions[0]);
      else onSubmit && onSubmit(value);
    } else if (e.key === "Escape") {
      setShow(false);
    }
  };

  return (
    <div className={`top-search ${scrolled ? "scrolled" : ""}`}>
      <div className="top-search-inner">
        <div className="top-search-box">
          <span className="top-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="top-search-input"
            placeholder={ph}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setShow(true);
              setHi(-1);
            }}
            onFocus={() => setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 150)}
            onKeyDown={onKeyDown}
            aria-label={ph}
          />
          {value && (
            <button className="top-search-clear" onClick={onClear} aria-label="검색 지우기">
              ✕
            </button>
          )}

          {show && suggestions.length > 0 && (
            <ul className="top-search-auto" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s.key}
                  role="option"
                  aria-selected={i === hi}
                  className={`top-search-auto-item ${i === hi ? "active" : ""} ${s.type === "region" ? "is-region" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setHi(i)}
                >
                  <span className="tsa-ic" aria-hidden="true">{s.type === "region" ? "📍" : "🎪"}</span>
                  <span className="tsa-label">
                    {s.type === "festival" ? highlight(s.label, value.trim()) : s.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
