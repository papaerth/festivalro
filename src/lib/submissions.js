import "server-only";

// ────────────────────────────────────────────────────────────────
//  게시된 등록/제보 읽기 (상세페이지 자동 반영 + 새 축제 자동 추가)
//
//  · anon(공개) 키 + RLS("published 행만 조회 허용")로 읽습니다.
//    → service_role(쓰기 전용)에 의존하지 않아, 서버에 그 키가 없어도 동작.
//  · getPublishedForFestival(id):
//      - 일반 축제 id  → 그 축제에 '보충'된 게시글(담당자 등록/주민 제보) 모음
//      - "sub-<제출id>" → 그 제출 자체(= 새 축제)의 내용
//  · getPublishedNewFestivals(): 기존 축제와 연결되지 않은(=새 축제) 게시 등록을
//      홈/목록/상세가 쓰는 '축제 객체'로 합성해 돌려줌 (festivals.js가 병합).
// ────────────────────────────────────────────────────────────────

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const READY = () =>
  !!URL_BASE && !!ANON && !URL_BASE.includes("여기에") && !ANON.includes("여기에");

const AUTH = () => ({ apikey: ANON, Authorization: `Bearer ${ANON}` });

const COLS =
  "id,type,category,festival_name,period_start,period_end,place,intro,timetable,lineup,parking,shuttle,food,experience,etc,organizer,message,photos,created_at";

// ── 새 축제 합성용 소도구 (festivals.js와 동일 규칙, 순환 import 방지 위해 최소 복제) ──
function sidoToRegion(sido = "") {
  if (sido.includes("서울")) return "seoul";
  if (sido.includes("경기") || sido.includes("인천")) return "gyeonggi";
  if (sido.includes("강원")) return "gangwon";
  if (sido.includes("충청") || sido.includes("대전") || sido.includes("세종")) return "chungcheong";
  if (sido.includes("전라") || sido.includes("전북") || sido.includes("전남") || sido.includes("광주")) return "jeolla";
  if (sido.includes("경상") || sido.includes("경북") || sido.includes("경남") || sido.includes("대구") || sido.includes("부산") || sido.includes("울산")) return "gyeongsang";
  if (sido.includes("제주")) return "jeju";
  return "seoul";
}
function seasonOf(startDate = "") {
  const m = Number(String(startDate).slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// 제출 행 → 화면용 필드/사진/메모로 정리
function shape(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const organizerRow = rows.find((r) => r.type === "organizer") || null;
  const notes = rows
    .filter((r) => r.type === "resident" && r.message)
    .map((r) => ({ category: r.category || "", message: String(r.message) }));

  const photos = [];
  const seen = new Set();
  for (const r of rows) {
    if (!Array.isArray(r.photos)) continue;
    for (const p of r.photos) {
      if (typeof p === "string" && p.startsWith("http") && !seen.has(p)) {
        seen.add(p);
        photos.push(p);
      }
    }
    if (photos.length >= 12) break;
  }

  const f = organizerRow || {};
  const fields = {
    intro: f.intro || "",
    timetable: f.timetable || "",
    lineup: f.lineup || "",
    parking: f.parking || "",
    shuttle: f.shuttle || "",
    food: f.food || "",
    experience: f.experience || "",
    etc: f.etc || "",
    organizer: f.organizer || "",
    place: f.place || "",
  };
  const hasFields = Object.values(fields).some((v) => String(v).trim());
  if (!hasFields && notes.length === 0 && photos.length === 0) return null;

  return { hasOrganizer: !!organizerRow, fields, notes, photos: photos.slice(0, 12) };
}

// [공개] 축제 상세페이지용 게시 내용. 없으면 null.
//   id가 "sub-<제출id>"면 그 제출 자체(새 축제)를, 아니면 그 축제에 보충된 게시글을 반환.
export async function getPublishedForFestival(festivalId) {
  if (!READY()) return null;
  const raw = String(festivalId || "");

  try {
    let url;
    if (raw.startsWith("sub-")) {
      const sid = raw.slice(4).replace(/[^A-Za-z0-9-]/g, "");
      if (!sid) return null;
      url = `${URL_BASE}/rest/v1/submissions?id=eq.${sid}&status=eq.published&select=${COLS}`;
    } else {
      const id = raw.replace(/[^A-Za-z0-9_-]/g, "");
      if (!id) return null;
      url = `${URL_BASE}/rest/v1/submissions?festival_id=eq.${encodeURIComponent(id)}&status=eq.published&order=created_at.desc&select=${COLS}`;
    }
    const res = await fetch(url, { headers: AUTH(), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return shape(await res.json());
  } catch {
    return null;
  }
}

// [공개] 기존 축제와 연결되지 않은(새) 게시 등록 → 축제 객체 목록으로 합성.
//   festivals.js가 이 결과를 전체 목록에 병합해 홈/지도/상세에 노출합니다.
export async function getPublishedNewFestivals() {
  if (!READY()) return [];
  try {
    const url =
      `${URL_BASE}/rest/v1/submissions` +
      `?type=eq.organizer&status=eq.published&festival_id=is.null` +
      `&order=created_at.desc&select=${COLS}`;
    const res = await fetch(url, { headers: AUTH(), next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    return rows
      .filter((r) => r.festival_name && r.period_start)
      .map((r) => {
        const addr = String(r.place || "").trim();
        const parts = addr.split(/\s+/);
        const sido = parts[0] || "";
        const sigungu = parts[1] || "";
        const startDate = r.period_start;
        const endDate = r.period_end || r.period_start;
        const firstPhoto = Array.isArray(r.photos) && r.photos.find((p) => typeof p === "string" && p.startsWith("http") && !/\.pdf($|\?)/i.test(p));
        // 등록 시 고른 행사 유형(category 컬럼에 저장됨) → type. 없으면 축제 기본.
        const type = ["festival", "exhibition", "performance"].includes(r.category)
          ? r.category
          : "festival";
        return {
          id: `sub-${r.id}`,
          name: r.festival_name,
          sido,
          sigungu,
          region: sidoToRegion(sido),
          lat: null,
          lng: null,
          season: seasonOf(startDate),
          startDate,
          endDate,
          description: r.intro || "",
          image: firstPhoto || null,
          source: "submission", // 출처: 방문자/담당자 제출
          type,
          addr,
          homepage: null,
          tel: null,
        };
      });
  } catch {
    return [];
  }
}
