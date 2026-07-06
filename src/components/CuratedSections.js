"use client";

import { useState } from "react";
import { useI18n } from "@/lib/I18nProvider";
import { getSections } from "@/lib/i18n";

// 날짜 문자열 → 짧은 라벨(MM.DD)
function shortDate(d = "") {
  const p = String(d).split("-");
  return p.length === 3 ? `${Number(p[1])}.${Number(p[2])}` : d;
}

// 큐레이션(직접 입력) 정보 섹션들. 데이터가 있는 것만 렌더링합니다.
export default function CuratedSections({ curated, only }) {
  const { locale } = useI18n();
  const S = getSections(locale);
  const T = S.titles;
  const koTag = locale !== "ko";

  if (!curated) return null;

  const Tag = () => (koTag ? <span className="ko-tag">(Korean)</span> : null);

  // 어떤 섹션 묶음을 그릴지: "top"=타임테이블·라인업, "mid"=셔틀·주차, "food"=먹거리,
  // "bottom"=현장시설·꿀팁, "foreigner"=외국인 안내
  const show = (k) => !only || only === k;

  const timetable = Array.isArray(curated.timetable) ? curated.timetable : [];
  const dates = [...new Set(timetable.map((x) => x.date).filter(Boolean))].sort();

  return (
    <>
      {/* 🗓️ 타임테이블 (날짜별 탭) */}
      {show("top") && timetable.length > 0 && (
        <TimetableSection
          timetable={timetable}
          dates={dates}
          title={T.timetable}
          tag={<Tag />}
        />
      )}

      {/* 🎤 라인업 */}
      {show("top") && Array.isArray(curated.lineup) && curated.lineup.length > 0 && (
        <section className="section">
          <h2>🎤 {T.lineup} <Tag /></h2>
          <ul className="cur-lineup">
            {curated.lineup.map((a, i) => (
              <li key={i}>
                <span className="cur-lineup-name">{a.name}</span>
                {(a.date || a.time) && (
                  <span className="cur-lineup-when">
                    {a.date ? shortDate(a.date) : ""} {a.time || ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 🚌 셔틀버스 */}
      {show("mid") && curated.shuttle && (
        <section className="section">
          <h2>🚌 {T.shuttle} <Tag /></h2>
          <p className="desc">{curated.shuttle}</p>
        </section>
      )}

      {/* 🅿️ 주차 안내 */}
      {show("mid") && curated.parking && (
        <section className="section">
          <h2>🅿️ {T.parking} <Tag /></h2>
          <p className="desc">{curated.parking}</p>
        </section>
      )}

      {/* 🍢 먹거리 */}
      {show("food") && Array.isArray(curated.food) && curated.food.length > 0 && (
        <section className="section">
          <h2>🍢 {T.food} <Tag /></h2>
          <ul className="cur-food">
            {curated.food.map((f, i) => (
              <li key={i}>
                <span className="cur-food-name">{f.name}</span>
                {f.desc && <span className="cur-food-desc">{f.desc}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 🚻 현장 시설 */}
      {show("bottom") && curated.facilities && (
        <section className="section">
          <h2>🚻 {T.facilities} <Tag /></h2>
          <p className="desc">{curated.facilities}</p>
        </section>
      )}

      {/* 💡 방문 꿀팁 */}
      {show("bottom") && Array.isArray(curated.tips) && curated.tips.length > 0 && (
        <section className="section">
          <h2>💡 {T.tips} <Tag /></h2>
          <ul className="cur-tips">
            {curated.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 🌏 외국인 방문객 안내 */}
      {show("foreigner") && curated.foreigner &&
        (curated.foreigner.interpretation ||
          curated.foreigner.halal ||
          curated.foreigner.payment) && (
          <section className="section">
            <h2>🌏 {T.foreigner} <Tag /></h2>
            <dl className="cur-foreigner">
              {curated.foreigner.interpretation && (
                <>
                  <dt>🗣️ {S.labels.interpretation}</dt>
                  <dd>{curated.foreigner.interpretation}</dd>
                </>
              )}
              {curated.foreigner.halal && (
                <>
                  <dt>🥗 {S.labels.halal}</dt>
                  <dd>{curated.foreigner.halal}</dd>
                </>
              )}
              {curated.foreigner.payment && (
                <>
                  <dt>💳 {S.labels.payment}</dt>
                  <dd>{curated.foreigner.payment}</dd>
                </>
              )}
            </dl>
          </section>
        )}
    </>
  );
}

// 타임테이블 — 날짜별 탭
function TimetableSection({ timetable, dates, title, tag }) {
  const [active, setActive] = useState(dates[0] || null);
  const rows = timetable
    .filter((x) => (active ? x.date === active : true))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return (
    <section className="section">
      <h2>🗓️ {title} {tag}</h2>
      {dates.length > 1 && (
        <div className="tt-tabs">
          {dates.map((d) => (
            <button
              key={d}
              className={`tt-tab ${active === d ? "active" : ""}`}
              onClick={() => setActive(d)}
            >
              {shortDate(d)}
            </button>
          ))}
        </div>
      )}
      <ul className="tt-list">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="tt-time">{r.time}</span>
            <span className="tt-title">{r.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
