"use client";

import { useMemo, useState } from "react";
import { SEASONS } from "@/lib/seasons";
import { getStatusInfo } from "@/lib/format";
import { useI18n } from "@/lib/I18nProvider";
import { getUiExtra } from "@/lib/i18n";
import CoverImage from "./CoverImage";

// 지도 위 하단 시트 — 다가오는 인기 축제 가로 캐러셀. 접기/펼치기 가능.
export default function PopularSheet({ festivals = [], ratings = {}, onPick }) {
  const { t, locale } = useI18n();
  const ux = getUiExtra(locale);
  const [open, setOpen] = useState(true);

  // 서버 인기점수 + 우리 후기 가점으로 최종 상위 8개
  const top = useMemo(() => {
    return [...festivals]
      .map((f) => {
        const r = ratings[f.id];
        const boost = r ? r.count * 0.4 + (r.avg || 0) * 0.2 : 0;
        return { f, score: (f.popScore || 0) + boost };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.f);
  }, [festivals, ratings]);

  if (top.length === 0) return null;

  return (
    <div className={`pop-sheet ${open ? "open" : "closed"}`}>
      <button className="pop-handle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="pop-title">{ux.trending}</span>
        <span className="pop-toggle">{open ? "▾" : "▴"}</span>
      </button>

      {open && (
        <div className="pop-carousel">
          {top.map((f) => {
            const season = SEASONS[f.season] || SEASONS.spring;
            const st = getStatusInfo(f.startDate, f.endDate);
            const name = f.displayName || f.name;
            const r = ratings[f.id];
            return (
              <button
                key={f.id}
                className="pop-card"
                style={{ "--accent": season.color }}
                onClick={() => onPick && onPick(f)}
              >
                <div className="pop-card-thumb">
                  <CoverImage
                    className="pop-thumb-img"
                    src={f.image}
                    alt={name}
                    accent={season.color}
                    emoji={season.emoji}
                  />
                  <span className={`pop-dday ${st.key}`}>
                    {st.key === "ongoing" ? t.status.ongoingShort : st.label}
                  </span>
                </div>
                <p className="pop-name">{name}</p>
                <p className="pop-meta">
                  {season.emoji} {t.regions[f.region]}
                  {r && r.count > 0 ? ` · ⭐ ${r.avg.toFixed(1)}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
