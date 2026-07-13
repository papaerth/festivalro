"use client";

import { useI18n } from "@/lib/I18nProvider";

// ────────────────────────────────────────────────────────────────
//  주최측/방문자 제공 정보 (게시된 등록·제보 → 상세페이지 자동 반영)
//   · 담당자 등록의 자유 텍스트 필드를 섹션별로 표시(값이 있는 것만)
//   · 게시된 주민 제보 메모 표시
//   · 현장 사진 스와이프 갤러리(가로 스크롤·스냅, 모바일 터치 지원)
//   · 출처를 분명히 표기 (자동 수집/큐레이션과 구분)
// ────────────────────────────────────────────────────────────────

const L = {
  ko: {
    srcOrg: "주최측 제공 정보",
    srcNote: "직접 등록·검토된 정보예요",
    intro: "🎪 주최측 소개",
    timetable: "🗓️ 프로그램·일정",
    lineup: "🎤 초대가수·공연",
    parking: "🅿️ 주차 안내",
    shuttle: "🚌 교통·셔틀",
    food: "🍢 먹을거리",
    experience: "🎨 체험·포토존",
    etc: "📌 기타 안내",
    photos: "📷 현장 사진",
    notes: "📣 방문자가 남긴 정보",
  },
  en: {
    srcOrg: "From the organizer",
    srcNote: "Submitted and reviewed",
    intro: "🎪 Organizer's introduction",
    timetable: "🗓️ Program & schedule",
    lineup: "🎤 Performers",
    parking: "🅿️ Parking",
    shuttle: "🚌 Transport & shuttle",
    food: "🍢 Food",
    experience: "🎨 Activities & photo spots",
    etc: "📌 Other notes",
    photos: "📷 Photos",
    notes: "📣 From visitors",
  },
};

// 텍스트 섹션 순서(있는 것만 렌더)
const TEXT_FIELDS = ["timetable", "lineup", "parking", "shuttle", "food", "experience", "etc"];

export default function SubmittedInfo({ data }) {
  const { locale } = useI18n();
  const t = L[locale] || L.en;

  if (!data) return null;
  const { fields = {}, notes = [], photos = [], hasOrganizer } = data;

  const textSecs = TEXT_FIELDS.filter((k) => String(fields[k] || "").trim());
  const hasIntro = String(fields.intro || "").trim();
  const nothing = !hasIntro && textSecs.length === 0 && notes.length === 0 && photos.length === 0;
  if (nothing) return null;

  return (
    <>
      {hasOrganizer && (hasIntro || textSecs.length > 0) && (
        <p className="submitted-src">✅ {t.srcOrg} · <span className="submitted-src-note">{t.srcNote}</span></p>
      )}

      {hasIntro && (
        <section className="section">
          <h2>{t.intro}</h2>
          <p className="desc" style={{ whiteSpace: "pre-wrap" }}>{fields.intro}</p>
        </section>
      )}

      {textSecs.map((k) => (
        <section className="section" key={k}>
          <h2>{t[k]}</h2>
          <p className="desc" style={{ whiteSpace: "pre-wrap" }}>{fields[k]}</p>
        </section>
      ))}

      {photos.length > 0 && (
        <section className="section">
          <h2>{t.photos}</h2>
          <PhotoGallery photos={photos} />
        </section>
      )}

      {notes.length > 0 && (
        <section className="section">
          <h2>{t.notes}</h2>
          <ul className="submitted-notes">
            {notes.map((n, i) => (
              <li key={i}>
                {n.category && <span className="submitted-note-cat">{n.category}</span>}
                <span style={{ whiteSpace: "pre-wrap" }}>{n.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// 가로 스크롤·스냅 사진 갤러리 (모바일 스와이프 자연 지원). 클릭 시 원본 새 탭.
function PhotoGallery({ photos }) {
  const isPdf = (u) => /\.pdf($|\?)/i.test(u);
  return (
    <div className="submitted-gallery">
      {photos.map((url, i) =>
        isPdf(url) ? (
          <a key={i} className="submitted-gallery-pdf" href={url} target="_blank" rel="noopener noreferrer">
            📄 PDF {i + 1}
          </a>
        ) : (
          <a key={i} className="submitted-gallery-item" href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`photo ${i + 1}`} loading="lazy" />
          </a>
        )
      )}
    </div>
  );
}
