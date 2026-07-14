import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { translateMany } from "@/lib/translate";

// ────────────────────────────────────────────────────────────────
//  축제 영상 검색 중계소 (YouTube Data API v3)
//
//  개선(2026-07):
//   1) 검색어 = "지역명(시군구) + 축제명" — 흔한 이름(물놀이/벚꽃/불꽃…)이면 연도까지
//   2) 결과 검증 — 각 영상의 제목·설명에 '축제명' 또는 '지역명'이 실제로 있는지 확인,
//      둘 다 없으면 제외. 검증 통과 3개 미만이면 축제명만으로 1회 재시도.
//   3) 검증 통과 0개면 빈 목록 → 화면에서 영상 섹션을 숨김(엉뚱한 영상 노출 방지).
//   4) 큐레이션(수동 지정) 영상은 상세페이지 컴포넌트에서 검색 결과보다 우선 표시.
//
//  ⚠️ 유튜브 무료 한도(하루 10,000유닛, 검색 1회=100유닛)를 아끼려 24시간 캐싱.
//     검색어 구성이 바뀌면 URL(캐시 키)도 바뀌므로 기존 캐시는 자동 무효화됨.
//  키가 없으면 { configured:false }. (키를 넣으면 자동 전환)
// ────────────────────────────────────────────────────────────────

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const YT_CHANNELS = "https://www.googleapis.com/youtube/v3/channels";
const DAY = 60 * 60 * 24;

const NEWS_RE = /news|뉴스|kbs|mbc|sbs|ytn|jtbc|mbn|연합뉴스|채널a|tv조선|tvchosun|tbc|obs|보도|앵커|뉴스데스크/i;

// 흔한 축제 주제어(단독으로 아무 영상에나 걸림) — 이런 이름은 '지역+전체이름'으로만 검증
const COMMON_WORDS = new Set([
  "물놀이","벚꽃","불꽃","단풍","연꽃","장미","눈꽃","해맞이","억새","유채","철쭉",
  "코스모스","라벤더","맥주","커피","한우","인삼","대게","딸기","포도","사과","곶감",
  "송어","산천어","빙어","머드","반딧불","반딧불이","해변","해수욕","캠핑","트로트",
]);

function pickThumb(thumbs) {
  if (!thumbs) return null;
  const t = thumbs.high || thumbs.medium || thumbs.default;
  return t ? t.url : null;
}

function isoToSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
const MIN_LONGFORM_SEC = 60;
const MAX_LONGFORM_SEC = 3600;

function normText(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

// 시군구에서 행정 접미사를 떼어 검색·검증용 지역 핵심어를 만듭니다. (예: 함평군→함평)
function regionCore(sigungu) {
  const s = String(sigungu || "").trim();
  if (!s) return "";
  const stripped = s.replace(/(특별자치시|특별자치도|특별시|광역시|자치시|자치구|시|군|구)$/, "");
  return stripped.length >= 2 ? stripped : s;
}

// 축제명에서 '영상 제목/설명에 있어야 하는' 핵심 키워드.
//  - 정식 이름(공백제거) + 꼬리말(축제/페스타…) 뗀 이름(3자↑).
//  - dropGeneric(흔한 이름)일 땐 '뗀 이름(흔한 단어)'은 제외하고 정식 전체 이름만 사용.
function nameKeywords(q, dropGeneric) {
  const base = normText(q);
  const stripped = normText((q || "").replace(/축제|페스티벌|페스타|문화제|대축제|festival/gi, ""));
  const kws = new Set();
  if (base.length >= 2) kws.add(base);
  if (!dropGeneric && stripped.length >= 3) kws.add(stripped);
  return [...kws].filter(Boolean);
}

// 제목이 축제명을 '비유/과장'으로만 쓴 경우 제외 (예: "…축제급 꾸덕함").
const METAPHOR_RE = /^(급|같|만큼|처럼|수준|뺨|보다|이상|버금)/;
const SUFFIX_RE = /^(축제|페스티벌|페스타|문화제)/;

// 이름 매칭: 채널명에 있거나, 제목/설명에 (비유 아닌) 축제명이 있으면 true.
function matchesName(nt, nd, nc, keywords) {
  for (const k of keywords) {
    if (nc.includes(k)) return true;
    for (const hay of [nt, nd]) {
      let idx = hay.indexOf(k);
      while (idx !== -1) {
        let after = hay.slice(idx + k.length);
        const m = after.match(SUFFIX_RE);
        if (m) after = after.slice(m[0].length);
        if (!METAPHOR_RE.test(after)) return true;
        idx = hay.indexOf(k, idx + 1);
      }
    }
  }
  return false;
}

async function fetchWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, next: { revalidate: DAY } });
  } finally {
    clearTimeout(timer);
  }
}

async function searchIds(key, q, max) {
  const url =
    `${YT_SEARCH}?key=${key}&part=snippet&type=video` +
    `&order=relevance&maxResults=${max}&regionCode=KR&safeSearch=moderate` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`yt search ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => it.id && it.id.videoId).filter(Boolean);
}

async function fetchSubscribers(key, channelIds) {
  const map = {};
  const ids = channelIds.filter(Boolean).slice(0, 50);
  if (ids.length === 0) return map;
  try {
    const url = `${YT_CHANNELS}?key=${key}&part=statistics&id=${ids.join(",")}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return map;
    const data = await res.json();
    (data.items || []).forEach((ch) => {
      const st = ch.statistics || {};
      map[ch.id] = st.hiddenSubscriberCount ? 0 : Number(st.subscriberCount || 0);
    });
  } catch {
    /* 실패해도 0으로 진행 */
  }
  return map;
}

// 검색어들 → 롱폼 + '축제명 또는 지역명이 실제로 들어간' 검증 통과 후보만 반환.
async function gather(key, queries, nameKws, regionKw) {
  const lists = await Promise.all(queries.map((q) => searchIds(key, q, 40).catch(() => [])));
  const rank = new Map();
  lists.forEach((ids) => ids.forEach((id, i) => {
    if (!rank.has(id) || i < rank.get(id)) rank.set(id, i);
  }));
  const ids = [...rank.keys()].slice(0, 50);
  if (ids.length === 0) return [];

  const vurl = `${YT_VIDEOS}?key=${key}&part=snippet,statistics,contentDetails&id=${ids.join(",")}`;
  const vres = await fetchWithTimeout(vurl);
  if (!vres.ok) throw new Error(`yt videos ${vres.status}`);
  const vdata = await vres.json();

  const out = [];
  for (const v of vdata.items || []) {
    const sn = v.snippet || {};
    const sec = isoToSeconds(v.contentDetails && v.contentDetails.duration);
    if (!(sec > MIN_LONGFORM_SEC && sec <= MAX_LONGFORM_SEC)) continue; // 쇼츠·장시간 라이브 제외
    const title = sn.title || "";
    const desc = sn.description || "";
    const channel = sn.channelTitle || "";
    const nt = normText(title);
    const nd = normText(desc);
    const nc = normText(channel);
    const nameOk = matchesName(nt, nd, nc, nameKws);
    const regionOk = !!regionKw && (nt.includes(regionKw) || nd.includes(regionKw));
    if (!nameOk && !regionOk) continue; // 축제명·지역명 둘 다 없으면 제외(핵심 검증)
    out.push({
      id: v.id,
      title,
      channel,
      channelId: sn.channelId || null,
      views: Number((v.statistics && v.statistics.viewCount) || 0),
      publishedAt: sn.publishedAt || null,
      thumb: pickThumb(sn.thumbnails),
      sec,
    });
  }
  return out;
}

export async function GET(request) {
  const rl = rateLimit("videos", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const region = searchParams.get("region") || ""; // 시군구(한국어) — 선택
  const en = searchParams.get("en") === "1";
  const locale = searchParams.get("locale") || "ko";
  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key || key.startsWith("여기에")) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const cacheHeaders = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
  };

  try {
    const rc = regionCore(region);
    const regionKw = rc ? normText(rc) : "";
    const strippedCore = normText((query || "").replace(/축제|페스티벌|페스타|문화제|대축제|festival/gi, ""));
    const isCommon = COMMON_WORDS.has(strippedCore) || strippedCore.length <= 2;
    const nameKws = nameKeywords(query, isCommon);
    const short = isCommon || strippedCore.length <= 3;
    const year = new Date().getFullYear();

    // 이름에 지역이 이미 들어있으면 중복 안 붙임
    const nameHasRegion = rc && normText(query).includes(regionKw);
    const base = rc && !nameHasRegion ? `${rc} ${query}` : query;

    // 1차 검색어(지역+축제명). 흔한/짧은 이름이면 연도 추가.
    const primary = [base, `${base} 브이로그`];
    if (short && rc) primary.push(`${base} ${year}`);
    if (en) {
      primary.push(`${base} korea festival`);
      primary.push(`${query} korea vlog`);
    }

    let valid = await gather(key, primary, nameKws, regionKw);

    // 검증 통과 3개 미만이면 축제명만으로 1회 완화 재시도
    if (valid.length < 3) {
      const relaxed = [`${query} 축제`, `${query} 브이로그`];
      const more = await gather(key, relaxed, nameKws, regionKw);
      const seen = new Set(valid.map((v) => v.id));
      for (const m of more) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          valid.push(m);
        }
      }
    }

    // 검증 통과 0개 → 섹션 숨김(엉뚱한 영상 노출 방지)
    if (valid.length === 0) {
      return NextResponse.json({ configured: true, items: [] }, { headers: cacheHeaders });
    }

    // 구독자수 + 정렬(뉴스 뒤로, 최신묶음→조회수→구독자수)
    const channelIds = [...new Set(valid.map((c) => c.channelId).filter(Boolean))];
    const subsByChannel = await fetchSubscribers(key, channelIds);
    const now = Date.now();
    const enriched = valid.map((v) => {
      const isNews = NEWS_RE.test(v.channel);
      const publishedMs = v.publishedAt ? Date.parse(v.publishedAt) : 0;
      const daysAgo = publishedMs ? (now - publishedMs) / 86400000 : 1e9;
      const bucket = Math.floor(daysAgo / 30);
      return { v, isNews, bucket, views: v.views, subs: subsByChannel[v.channelId] || 0 };
    });
    const nonNews = enriched.filter((x) => !x.isNews);
    const pool = nonNews.length > 0 ? nonNews : enriched;
    pool.sort((a, b) => a.bucket - b.bucket || b.views - a.views || b.subs - a.subs);
    const items = pool.slice(0, 6).map((x) => x.v);

    // 영상 제목 번역 (한국어 외)
    if (locale !== "ko" && items.length > 0) {
      const titles = await translateMany(items.map((it) => it.title), locale);
      items.forEach((it, i) => {
        if (titles[i]) it.title = titles[i];
      });
    }

    return NextResponse.json({ configured: true, items }, { headers: cacheHeaders });
  } catch (err) {
    console.warn("[videos] 유튜브 검색 실패:", err.message);
    return NextResponse.json({ configured: true, items: [], error: true }, { status: 502 });
  }
}
