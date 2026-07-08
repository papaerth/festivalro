import "server-only"; // 이 파일은 서버에서만 — 실수로 클라이언트에 import하면 빌드 실패(키 보호)
// ────────────────────────────────────────────────────────────────
//  장소 상세페이지 데이터 (TourAPI detailCommon2/detailImage2/detailIntro2)
//   - 축제 상세와 동일한 TOUR_API_KEY 하나로 조회, 성공 결과만 24h 캐싱
//   - 값이 없으면 null/[] → 페이지에서 해당 부분 숨김
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { getStatusInfo } from "./format";

const HOST = "https://apis.data.go.kr/B551011";

function svcKey(apiKey) {
  try {
    return decodeURIComponent(apiKey);
  } catch {
    return apiKey;
  }
}
function itemsOf(data) {
  const raw = data?.response?.body?.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}
async function jget(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
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
function extractUrl(s = "") {
  const m = String(s).match(/href=["']?(https?:\/\/[^"'\s>]+)/i);
  if (m) return m[1];
  const m2 = String(s).match(/https?:\/\/[^\s"'<>]+/);
  return m2 ? m2[0] : null;
}
const COMMON = (key, extra = {}) =>
  new URLSearchParams({
    serviceKey: key,
    MobileOS: "ETC",
    MobileApp: "chukjero",
    _type: "json",
    ...extra,
  }).toString();
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

// TourAPI 다국어 서비스 (지원 언어만). 없는 언어(ko·ar·vi·id·th)는 국문 서비스.
//  ※ 현재 이 언어 서비스들은 활용신청 미승인(403)이라 자동으로 한국어 폴백됩니다.
const LANG_SERVICE = {
  en: "EngService2",
  ja: "JpnService2",
  zh: "ChsService2",
  "zh-TW": "ChtService2",
  de: "GerService2",
  fr: "FreService2",
  es: "SpnService2",
  ru: "RusService2",
};

// 유형별(contentTypeId) detailIntro2에서 뽑을 항목 [표시라벨키, API필드]
const INTRO_FIELDS = {
  32: [
    ["checkin", "checkintime"],
    ["checkout", "checkouttime"],
    ["roomcount", "roomcount"],
    ["parking", "parkinglodging"],
  ],
  39: [
    ["menu", "firstmenu"],
    ["hours", "opentimefood"],
    ["restday", "restdatefood"],
    ["parking", "parkingfood"],
  ],
  12: [
    ["usetime", "usetime"],
    ["restday", "restdate"],
    ["parking", "parking"],
    ["pet", "chkpet"],
  ],
};

async function fetchPlaceRaw(id, typeId, service = "KorService2") {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) return null;
  const key = svcKey(apiKey);
  const safeId = String(id).replace(/[^0-9]/g, "");
  if (!safeId) return null;
  let ctype = String(typeId || "").replace(/[^0-9]/g, "");

  // 속도 개선: 공통정보·사진·(유형 알면)유형별 상세를 '동시에' 조회(병렬).
  //  공통정보에 데이터가 없으면(예: 미승인 언어 서비스 403) null 반환 → 상위에서
  //  한국어 폴백. null도 캐시되어 같은 언어로는 재호출 안 함(호출 수 안 늘림).
  const commonP = jget(
    `${HOST}/${service}/detailCommon2?${COMMON(key, { contentId: safeId })}`
  );
  const imageP = jget(
    `${HOST}/${service}/detailImage2?${COMMON(key, { contentId: safeId, imageYN: "Y" })}`
  ).catch(() => null);
  // 유형(contentTypeId)을 카드에서 이미 넘겨받았으면 유형별 상세도 동시에 시작
  let introP =
    ctype && INTRO_FIELDS[Number(ctype)]
      ? jget(
          `${HOST}/${service}/detailIntro2?${COMMON(key, {
            contentId: safeId,
            contentTypeId: ctype,
          })}`
        ).catch(() => null)
      : null;

  let common;
  try {
    common = await commonP;
  } catch {
    return null;
  }
  const c = itemsOf(common)[0];
  if (!c || !c.title) return null;
  if (!ctype) ctype = String(c.contenttypeid || "");

  const addr = [c.addr1, c.addr2].filter(Boolean).join(" ").trim() || null;
  const place = {
    id: safeId,
    contentTypeId: ctype,
    name: c.title,
    addr,
    lat: Number(c.mapy) || null,
    lng: Number(c.mapx) || null,
    overview: c.overview ? cleanHtml(c.overview) : null,
    homepage: c.homepage ? extractUrl(c.homepage) : null,
    tel: c.tel ? cleanHtml(c.tel) : null,
    images: [],
    intro: [],
  };

  // 사진 (병렬 결과 수확)
  const imgData = await imageP;
  if (imgData) {
    place.images = itemsOf(imgData)
      .map((i) => i.originimgurl || i.smallimageurl)
      .filter(Boolean);
  }
  if (c.firstimage) place.images.unshift(c.firstimage);
  place.images = [...new Set(place.images)].slice(0, 8);

  // 유형별 상세 — 유형이 공통정보로 늦게 확정된 경우에만 지금 조회
  const fields = INTRO_FIELDS[Number(ctype)];
  if (fields) {
    if (!introP) {
      introP = jget(
        `${HOST}/${service}/detailIntro2?${COMMON(key, {
          contentId: safeId,
          contentTypeId: ctype,
        })}`
      ).catch(() => null);
    }
    const introData = await introP;
    if (introData) {
      const it = itemsOf(introData)[0];
      if (it) {
        for (const [labelKey, field] of fields) {
          const v = it[field] ? cleanHtml(it[field]) : "";
          if (v) place.intro.push({ key: labelKey, value: v });
        }
      }
    }
  }

  return place;
}

// 결과(성공·null 모두) 24시간 캐시 (id+type+서비스별) → 재호출 방지.
const placeCached = unstable_cache(fetchPlaceRaw, ["place-detail-v2"], {
  revalidate: 60 * 60 * 24,
});

// [공개] 장소 상세. 다국어 페이지는 해당 언어 서비스로 먼저 시도하고,
//  없으면(미승인/데이터 없음) 한국어로 폴백. 키 없으면 null.
export async function getPlaceById(id, typeId, locale) {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey || apiKey === "여기에_키를_붙여넣기") return null;
  try {
    const langSvc = LANG_SERVICE[locale];
    if (langSvc) {
      const r = await placeCached(id, typeId, langSvc);
      // 언어 서비스가 실제 내용을 주면 사용, 아니면 한국어로 폴백
      if (r && r.name && (r.overview || (r.images && r.images.length))) return r;
    }
    return await placeCached(id, typeId, "KorService2");
  } catch {
    return null;
  }
}

// [공개] 이 장소에서 가까운 축제 (거리순, 종료 제외) — 다시 축제로 돌아오는 동선
export function getNearbyFestivals(lat, lng, all, limit = 3) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(all)) {
    return [];
  }
  const now = new Date();
  return all
    .filter(
      (f) =>
        Number.isFinite(f.lat) &&
        Number.isFinite(f.lng) &&
        getStatusInfo(f.startDate, f.endDate, now).key !== "ended"
    )
    .map((f) => ({ f, d: haversineKm(lat, lng, f.lat, f.lng) }))
    .filter((x) => x.d <= 60)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.f);
}

// ── 장소 페이지 다국어 라벨 ──
//  주요 언어(ko/en/ja/zh/zh-TW)는 번역, 그 외는 영어로 폴백(기존 사이트 규칙과 동일).
const PLACE_I18N = {
  ko: {
    cat32: "숙소", cat39: "음식점", cat12: "관광지", catDefault: "장소",
    back: "← 축제로 돌아가기", backHome: "← 축제 목록으로",
    about: "🏷️ 소개", details: "ℹ️ 이용 정보", directions: "🧭 길찾기",
    address: "📍 주소", phone: "📞 전화", homepage: "🌐 홈페이지",
    nearby: "🎪 이 장소에서 가까운 축제",
    checkin: "체크인", checkout: "체크아웃", roomcount: "객실 수",
    parking: "주차", menu: "대표 메뉴", hours: "영업시간",
    restday: "휴무일", usetime: "이용시간", pet: "반려동물",
  },
  en: {
    cat32: "Stay", cat39: "Restaurant", cat12: "Attraction", catDefault: "Place",
    back: "← Back to festival", backHome: "← All festivals",
    about: "🏷️ About", details: "ℹ️ Details", directions: "🧭 Directions",
    address: "📍 Address", phone: "📞 Phone", homepage: "🌐 Website",
    nearby: "🎪 Festivals near here",
    checkin: "Check-in", checkout: "Check-out", roomcount: "Rooms",
    parking: "Parking", menu: "Signature menu", hours: "Hours",
    restday: "Closed", usetime: "Hours", pet: "Pets",
  },
  ja: {
    cat32: "宿泊", cat39: "飲食店", cat12: "観光地", catDefault: "スポット",
    back: "← お祭りに戻る", backHome: "← お祭り一覧へ",
    about: "🏷️ 紹介", details: "ℹ️ 利用案内", directions: "🧭 ルート案内",
    address: "📍 住所", phone: "📞 電話", homepage: "🌐 ホームページ",
    nearby: "🎪 この場所に近いお祭り",
    checkin: "チェックイン", checkout: "チェックアウト", roomcount: "客室数",
    parking: "駐車", menu: "代表メニュー", hours: "営業時間",
    restday: "定休日", usetime: "利用時間", pet: "ペット",
  },
  zh: {
    cat32: "住宿", cat39: "餐厅", cat12: "景点", catDefault: "地点",
    back: "← 返回庆典", backHome: "← 庆典列表",
    about: "🏷️ 介绍", details: "ℹ️ 使用信息", directions: "🧭 导航",
    address: "📍 地址", phone: "📞 电话", homepage: "🌐 主页",
    nearby: "🎪 附近的庆典",
    checkin: "入住", checkout: "退房", roomcount: "客房数",
    parking: "停车", menu: "招牌菜", hours: "营业时间",
    restday: "休息日", usetime: "开放时间", pet: "宠物",
  },
  "zh-TW": {
    cat32: "住宿", cat39: "餐廳", cat12: "景點", catDefault: "地點",
    back: "← 返回慶典", backHome: "← 慶典列表",
    about: "🏷️ 介紹", details: "ℹ️ 使用資訊", directions: "🧭 導航",
    address: "📍 地址", phone: "📞 電話", homepage: "🌐 首頁",
    nearby: "🎪 附近的慶典",
    checkin: "入住", checkout: "退房", roomcount: "客房數",
    parking: "停車", menu: "招牌菜", hours: "營業時間",
    restday: "休息日", usetime: "開放時間", pet: "寵物",
  },
};

export function getPlaceLabels(locale) {
  return PLACE_I18N[locale] || PLACE_I18N.en;
}

// contentTypeId → 분류 라벨
export function categoryLabel(contentTypeId, labels) {
  const t = String(contentTypeId);
  if (t === "32") return labels.cat32;
  if (t === "39") return labels.cat39;
  if (t === "12") return labels.cat12;
  return labels.catDefault;
}
