import { getFooterSources, formatCollectedDate } from "@/lib/dataSources";

// 푸터의 '데이터 출처' 안내 블록 — 공공 오픈API 이용조건에 따른 출처 명시.
//  · KOPIS 고지문(집계 방식 안내 포함) + 타 공공API 출처 목록 + 최종집계 일자.
//  · 순수 표시 컴포넌트(훅 없음) — 서버·클라이언트 어느 쪽에서 써도 동작.
//  · collectedAt: 데이터 최종 수집(캐시 갱신) 시각(ms 또는 ISO). 있으면 "최종집계 YYYY.MM.DD" 표시.
export default function DataSources({ locale = "ko", collectedAt }) {
  const s = getFooterSources(locale);
  const dateStr = formatCollectedDate(collectedAt);
  return (
    <div className="data-sources">
      <div className="data-sources-head">
        <span className="data-sources-title">{s.heading}</span>
        {dateStr && (
          <span className="data-sources-date" suppressHydrationWarning>
            {s.lastAggregated(dateStr)}
          </span>
        )}
      </div>
      <p className="data-sources-note">{s.kopis}</p>
      <ul className="data-sources-list">
        {s.sources.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
