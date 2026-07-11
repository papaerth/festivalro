import "server-only"; // 이 파일은 서버에서만 — 실수로 클라이언트에 import하면 빌드 실패(키 보호)
// ────────────────────────────────────────────────────────────────
//  상세페이지 '자동 수집' 정보 (TourAPI 여러 조회를 한 번에)
//   - 전부 기존 TOUR_API_KEY 하나로 호출
//   - 각 호출을 try-catch로 감싸 하나가 실패해도 페이지가 죽지 않음
//   - 축제별로 24시간 캐싱(unstable_cache) → 재방문 시 재호출 안 함
//   - 값이 없으면 null/[] → 상세페이지에서 해당 섹션 숨김
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { translateText } from "./translate";

const HOST = "https://apis.data.go.kr/B551011";

function svcKey(apiKey) {
  try {
    return decodeURIComponent(apiKey);
  } catch {
    return apiKey;
  }
}

function cleanHtml(s = "") {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function itemsOf(data) {
  const raw = data?.response?.body?.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

async function jget(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 두 좌표 사이 거리(km)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// URL만 뽑기 (detailCommon2 homepage는 <a href='...'> 형태)
function extractUrl(s = "") {
  const m = String(s).match(/href=["']?(https?:\/\/[^"'\s>]+)/i);
  if (m) return m[1];
  const m2 = String(s).match(/https?:\/\/[^\s"'<>]+/);
  return m2 ? m2[0] : null;
}

const COMMON = (key, extra = {}) => {
  const p = new URLSearchParams({
    serviceKey: key,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    ...extra,
  });
  return p.toString();
};

// ── 개별 조회 (각각 실패해도 null/[] 반환) ──

// 프로그램 + 이용안내 (detailIntro2, 축제 contentTypeId=15)
async function getIntro(id, key) {
  try {
    const data = await jget(
      `${HOST}/KorService2/detailIntro2?${COMMON(key, { contentId: id, contentTypeId: "15" })}`
    );
    const it = itemsOf(data)[0];
    if (!it) return { program: null, usage: [] };
    const program = it.program ? cleanHtml(it.program) : null;
    const usage = [];
    const push = (label, v) => {
      const t = cleanHtml(v || "");
      if (t) usage.push({ label, value: t });
    };
    push("이용요금", it.usetimefestival);
    push("공연시간", it.playtime);
    push("관람소요시간", it.spendtimefestival);
    push("관람가능연령", it.agelimit);
    push("예매처", it.bookingplace);
    push("주최", it.sponsor1);
    push("주관", it.sponsor2);
    return { program, usage };
  } catch {
    return { program: null, usage: [] };
  }
}

// 공식 홈페이지 + 전화 (detailCommon2)
async function getHomepage(id, key) {
  try {
    const data = await jget(
      `${HOST}/KorService2/detailCommon2?${COMMON(key, { contentId: id })}`
    );
    const it = itemsOf(data)[0];
    if (!it) return { homepage: null, tel: null };
    return {
      homepage: it.homepage ? extractUrl(it.homepage) : null,
      tel: it.tel ? cleanHtml(it.tel) : null,
    };
  } catch {
    return { homepage: null, tel: null };
  }
}

// 위치기반 주변 목록 (contentTypeId: 12=관광지, 32=숙박, 39=음식점)
async function getNearby(lat, lng, key, contentTypeId, limit) {
  try {
    const data = await jget(
      `${HOST}/KorService2/locationBasedList2?${COMMON(key, {
        mapX: String(lng),
        mapY: String(lat),
        radius: "5000",
        contentTypeId: String(contentTypeId),
        arrange: "E", // 거리순
        numOfRows: String(limit + 5),
        pageNo: "1",
      })}`
    );
    return itemsOf(data)
      .filter((it) => it.title)
      .slice(0, limit)
      .map((it) => ({
        id: String(it.contentid),
        contentTypeId: String(contentTypeId), // 12=관광지 32=숙박 39=음식점
        name: it.title,
        image: it.firstimage || it.firstimage2 || null,
        distKm: it.dist ? Number(it.dist) / 1000 : null,
      }));
  } catch {
    return [];
  }
}

// 주변 캠핑장 (고캠핑 GoCamping)
async function getCamping(lat, lng, key) {
  try {
    const data = await jget(
      `${HOST}/GoCamping/locationBasedList?${COMMON(key, {
        mapX: String(lng),
        mapY: String(lat),
        radius: "10000",
        numOfRows: "10",
        pageNo: "1",
      })}`
    );
    return itemsOf(data)
      .filter((it) => it.facltNm)
      .map((it) => {
        const cy = Number(it.mapY);
        const cx = Number(it.mapX);
        const distKm =
          Number.isFinite(cy) && Number.isFinite(cx)
            ? haversineKm(lat, lng, cy, cx)
            : null;
        return {
          name: it.facltNm,
          type: it.induty || null,
          tel: it.tel || null,
          distKm,
        };
      })
      .sort((a, b) => (a.distKm ?? 99) - (b.distKm ?? 99))
      .slice(0, 3);
  } catch {
    return [];
  }
}

// 무장애 이용 정보 (KorWithService2, 개최 콘텐츠 기준)
async function getBarrierFree(id, key) {
  try {
    const data = await jget(
      `${HOST}/KorWithService2/detailWithTour2?${COMMON(key, { contentId: id })}`
    );
    const it = itemsOf(data)[0];
    if (!it) return null;
    const wheelchair = cleanHtml(it.wheelchair || "");
    const restroom = cleanHtml(it.restroom || "");
    const parking = cleanHtml(it.parking || "");
    if (!wheelchair && !restroom && !parking) return null;
    return {
      wheelchair: wheelchair || null,
      restroom: restroom || null,
      parking: parking || null,
    };
  } catch {
    return null;
  }
}

// 반려동물 동반 (detailPetTour2)
async function getPet(id, key) {
  try {
    const data = await jget(
      `${HOST}/KorService2/detailPetTour2?${COMMON(key, { contentId: id })}`
    );
    const it = itemsOf(data)[0];
    if (!it) return null;
    const info = cleanHtml(
      [it.etcAcmpyInfo, it.relaAcdcInfo, it.acmpyPsblCpam, it.relaPosblFacdone]
        .filter(Boolean)
        .join("\n")
    );
    if (!info && !it.acmpyTypeCd) return null;
    return { allowed: true, info: info || null };
  } catch {
    return null;
  }
}

// ── 종합: 축제별 24시간 캐싱 ──
async function fetchExtrasRaw(id, source, lat, lng) {
  const key = svcKey(process.env.TOUR_API_KEY);
  const isTour = source === "tour";
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const [intro, hp, tourSpots, stay, restaurants, camping, barrierFree, pet] =
    await Promise.all([
      isTour ? getIntro(id, key) : Promise.resolve({ program: null, usage: [] }),
      isTour ? getHomepage(id, key) : Promise.resolve({ homepage: null, tel: null }),
      hasCoords ? getNearby(lat, lng, key, 12, 5) : Promise.resolve([]),
      hasCoords ? getNearby(lat, lng, key, 32, 5) : Promise.resolve([]),
      hasCoords ? getNearby(lat, lng, key, 39, 5) : Promise.resolve([]),
      hasCoords ? getCamping(lat, lng, key) : Promise.resolve([]),
      isTour ? getBarrierFree(id, key) : Promise.resolve(null),
      isTour ? getPet(id, key) : Promise.resolve(null),
    ]);

  return {
    program: intro.program,
    usage: intro.usage,
    homepage: hp.homepage,
    tel: hp.tel,
    tourSpots,
    stay,
    restaurants,
    camping,
    barrierFree,
    pet,
  };
}

const extrasCached = unstable_cache(fetchExtrasRaw, ["festival-extras-v1"], {
  revalidate: 60 * 60 * 24,
});

// [공개] 상세페이지에서 사용. 키 없거나 실패하면 {} (모든 섹션 숨김).
//  한국어 원본을 한 번만(언어 무관) 캐시로 받고, 프로그램 텍스트는
//  한국어 외 언어에서 Google 번역으로 대체(실패 시 한국어 원문 유지).
export async function getFestivalExtras(festival, locale = "ko") {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey || apiKey === "여기에_키를_붙여넣기" || !festival) return {};
  let extras;
  try {
    extras = await extrasCached(
      festival.id,
      festival.source,
      festival.lat,
      festival.lng
    );
  } catch {
    return {};
  }

  // 행사 프로그램 안내(한국어)를 언어별로 번역
  if (extras.program && locale !== "ko") {
    extras = { ...extras, program: await translateText(extras.program, locale) };
  }
  return extras;
}
