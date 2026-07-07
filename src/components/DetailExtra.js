// 상세페이지 '자동 수집' 섹션들의 표시 컴포넌트 (서버 렌더).
//  - 값이 없으면 각 컴포넌트가 null 반환 → 섹션 숨김
import Link from "next/link";
import { getSections, localeHref } from "@/lib/i18n";
import CoverImage from "./CoverImage";

function KoTag({ loc }) {
  return loc !== "ko" ? <span className="ko-tag">(Korean)</span> : null;
}

function distText(km, loc) {
  if (km == null || !Number.isFinite(km)) return "";
  const label = getSections(loc).labels.distanceApprox;
  return label.replace("{km}", km < 1 ? km.toFixed(1) : Math.round(km * 10) / 10);
}

// 핵심 요약 바 — 기간·장소·전화·홈페이지 한눈에
export function SummaryBar({ festival, extras, loc }) {
  const S = getSections(loc);
  const items = [];
  if (festival.startDate)
    items.push({ icon: "📅", text: `${festival.startDate} ~ ${festival.endDate}` });
  const place = [festival.sido, festival.sigungu].filter(Boolean).join(" ");
  if (place) items.push({ icon: "📍", text: place });
  if (extras?.tel) items.push({ icon: "📞", text: extras.tel });
  if (items.length === 0) return null;
  return (
    <div className="summary-bar">
      {items.map((it, i) => (
        <span className="summary-item" key={i}>
          <span className="summary-ic">{it.icon}</span>
          {it.text}
        </span>
      ))}
    </div>
  );
}

// 주변 목록 (관광지·숙소·맛집 공용)
export function NearbyList({ title, icon, items, loc, festivalId }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="section">
      <h2>{icon} {title}</h2>
      <div className="nearby-grid">
        {items.map((it) => {
          const inner = (
            <>
              <CoverImage
                className="nearby-thumb"
                src={it.image}
                alt={it.name}
                accent="#c2578a"
                emoji="📍"
              />
              <p className="nearby-name">{it.name}</p>
              {it.distKm != null && (
                <p className="nearby-dist">{distText(it.distKm, loc)}</p>
              )}
            </>
          );

          // 데이터 유무로 자동 판단:
          //  - 사진이 있는(=상세가 채워질) 장소 → 사이트 안 장소 상세페이지(/place)
          //  - 사진도 없는(=빈약한) 장소 → 빈 페이지 대신 카카오맵 검색 결과를 새 탭으로
          if (it.image) {
            const q = new URLSearchParams({
              ...(it.contentTypeId ? { type: it.contentTypeId } : {}),
              ...(festivalId ? { from: String(festivalId) } : {}),
            }).toString();
            const href = localeHref(loc, `/place/${it.id}${q ? `?${q}` : ""}`);
            return (
              <Link className="nearby-card" key={it.id} href={href}>
                {inner}
              </Link>
            );
          }

          const kakao = `https://map.kakao.com/link/search/${encodeURIComponent(
            it.name
          )}`;
          return (
            <a
              className="nearby-card"
              key={it.id}
              href={kakao}
              target="_blank"
              rel="noopener noreferrer"
            >
              {inner}
            </a>
          );
        })}
      </div>
    </section>
  );
}

// 주변 캠핑장
export function CampingList({ items, loc }) {
  if (!items || items.length === 0) return null;
  const S = getSections(loc);
  return (
    <section className="section">
      <h2>⛺ {S.titles.camping}</h2>
      <ul className="camp-list">
        {items.map((c, i) => (
          <li key={i}>
            <span className="camp-name">{c.name}</span>
            <span className="camp-meta">
              {c.type ? `${S.labels.campType}: ${c.type}` : ""}
              {c.tel ? ` · ${S.labels.tel} ${c.tel}` : ""}
              {c.distKm != null ? ` · ${distText(c.distKm, loc)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 무장애 이용 정보
export function BarrierFree({ data, loc }) {
  if (!data) return null;
  const S = getSections(loc);
  const rows = [
    { icon: "♿", label: S.labels.wheelchair, value: data.wheelchair },
    { icon: "🚻", label: S.labels.accToilet, value: data.restroom },
    { icon: "🅿️", label: S.labels.accParking, value: data.parking },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <section className="section">
      <h2>♿ {S.titles.barrierFree} <KoTag loc={loc} /></h2>
      <dl className="bf-list">
        {rows.map((r, i) => (
          <div className="bf-row" key={i}>
            <dt>{r.icon} {r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// 반려동물 동반
export function PetInfo({ data, loc }) {
  if (!data) return null;
  const S = getSections(loc);
  return (
    <section className="section">
      <h2>🐕 {S.titles.pet} <KoTag loc={loc} /></h2>
      <p className="pet-allowed">✅ {S.labels.petAllowed}</p>
      {data.info && <p className="desc">{data.info}</p>}
    </section>
  );
}

// 프로그램 (API detailIntro2)
export function ProgramSection({ text, loc }) {
  if (!text) return null;
  const S = getSections(loc);
  return (
    <section className="section">
      <h2>📋 {S.titles.program} <KoTag loc={loc} /></h2>
      <p className="desc">{text}</p>
    </section>
  );
}

// 이용 안내 (label:value 목록)
export function UsageSection({ items, loc }) {
  if (!items || items.length === 0) return null;
  const S = getSections(loc);
  return (
    <section className="section">
      <h2>ℹ️ {S.titles.usage} <KoTag loc={loc} /></h2>
      <dl className="usage-list">
        {items.map((u, i) => (
          <div className="usage-row" key={i}>
            <dt>{u.label}</dt>
            <dd>{u.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// 공식 홈페이지
export function HomepageSection({ url, loc }) {
  if (!url) return null;
  const S = getSections(loc);
  return (
    <section className="section">
      <h2>🔗 {S.titles.homepage}</h2>
      <a className="homepage-btn" href={url} target="_blank" rel="noopener noreferrer">
        {S.labels.visitSite} →
      </a>
    </section>
  );
}
