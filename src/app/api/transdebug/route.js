// 임시 진단용 — TourAPI 다국어 서비스 응답 확인. 확인 후 삭제 예정.
export const dynamic = "force-dynamic";

const LANG_SERVICE = {
  en: "EngService2", ja: "JpnService2", zh: "ChsService2", "zh-TW": "ChtService2",
  de: "GerService2", fr: "FreService2", es: "SpnService2", ru: "RusService2",
};
const HOST = "https://apis.data.go.kr/B551011";

function svcKey(k) { try { return decodeURIComponent(k); } catch { return k; } }

async function hit(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      status: res.status,
      resultCode: json?.response?.header?.resultCode ?? null,
      resultMsg: json?.response?.header?.resultMsg ?? null,
      // 오류면 본문 앞부분(키는 URL에만 있으니 본문엔 없음)
      bodySnippet: json ? null : text.slice(0, 300),
      totalCount: json?.response?.body?.totalCount ?? null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "142064";
  const locale = searchParams.get("locale") || "en";
  const service = LANG_SERVICE[locale];
  const apiKey = process.env.TOUR_API_KEY;
  const key = svcKey(apiKey);
  if (!apiKey) return Response.json({ error: "no TOUR_API_KEY" });
  if (!service) return Response.json({ error: "unsupported locale " + locale });

  const common = new URLSearchParams({
    serviceKey: key, MobileOS: "ETC", MobileApp: "chukjero", _type: "json", contentId: String(id),
  });
  const search = new URLSearchParams({
    serviceKey: key, MobileOS: "ETC", MobileApp: "chukjero", _type: "json",
    arrange: "A", numOfRows: "10", pageNo: "1", eventStartDate: "20260101",
  });

  // detailCommon2 원문 title/overview도 직접 확인
  let detailItem = null;
  try {
    const r = await fetch(`${HOST}/${service}/detailCommon2?${common}`, { cache: "no-store" });
    const j = await r.json();
    const raw = j?.response?.body?.items?.item;
    const it = Array.isArray(raw) ? raw[0] : raw;
    detailItem = it ? { title: it.title ?? null, hasOverview: !!it.overview, overviewLen: (it.overview || "").length } : "no item";
  } catch (e) { detailItem = "err: " + e.message; }

  // searchFestival2로 목록 몇 개 제목 확인 (엔드포인트 존재 여부 파악)
  let searchTitles = null;
  try {
    const r = await fetch(`${HOST}/${service}/searchFestival2?${search}`, { cache: "no-store" });
    const j = await r.json();
    const raw = j?.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    searchTitles = { count: items.length, sample: items.slice(0, 5).map((x) => ({ contentid: x.contentid, title: x.title })) };
  } catch (e) { searchTitles = "err: " + e.message; }

  return Response.json({
    id, locale, service,
    detailCommon2_head: await hit(`${HOST}/${service}/detailCommon2?${common}`),
    detailCommon2_item: detailItem,
    searchFestival2_head: await hit(`${HOST}/${service}/searchFestival2?${search}`),
    searchFestival2_titles: searchTitles,
  });
}
