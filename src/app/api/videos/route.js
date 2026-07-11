import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { translateMany } from "@/lib/translate";

// ────────────────────────────────────────────────────────────────
//  축제 영상 검색 중계소 (YouTube Data API v3)
//
//  .env.local 에 YOUTUBE_API_KEY 가 있으면 축제 이름으로 유튜브에서
//  '관련 롱폼(가로) 영상'을 관련성순으로 찾아 6개를 돌려줍니다. (쇼츠는 제외)
//  각 영상의 채널명·조회수·썸네일도 함께.
//
//  ⚠️ 유튜브 무료 한도(하루 10,000유닛, 검색 1회 = 100유닛)를 아끼려고
//     결과를 24시간 캐싱합니다(next.revalidate). 한도 초과·오류가 나면
//     빈 목록을 돌려주고, 화면에서는 영상 영역만 조용히 사라집니다.
//
//  키가 없으면 { configured:false } 를 돌려줍니다. (키를 넣으면 자동 전환)
// ────────────────────────────────────────────────────────────────

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const YT_CHANNELS = "https://www.googleapis.com/youtube/v3/channels";
const DAY = 60 * 60 * 24;

// 뉴스/방송 클립은 목록 뒤로 밀기(우선순위 제외) 위한 채널 판별용 패턴.
const NEWS_RE = /news|뉴스|kbs|mbc|sbs|ytn|jtbc|mbn|연합뉴스|채널a|tv조선|tvchosun|tbc|obs|보도|앵커|뉴스데스크/i;

// 썸네일 중 큰 것 우선으로 URL 하나 고르기
function pickThumb(thumbs) {
  if (!thumbs) return null;
  const t = thumbs.high || thumbs.medium || thumbs.default;
  return t ? t.url : null;
}

// ISO8601 재생시간("PT1M5S") → 초. 파싱 실패 시 0.
function isoToSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
// 롱폼 중심 — 이 길이(초) 이하인 '쇼츠(짧은 세로영상)'는 제외하고 일반 롱폼만 남깁니다.
//  (검색에서 videoDuration=short 조건을 없앴고, 혹시 섞여 들어온 쇼츠는 길이로 걸러냄)
const MIN_LONGFORM_SEC = 60; // 60초 이하면 쇼츠로 보고 제외
// 너무 긴 라이브 다시보기(몇 시간짜리 실황)는 제외 — 상한(초)
const MAX_LONGFORM_SEC = 3600;

// 공백 제거 + 소문자화(제목/축제명 비교용 정규화)
function normText(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

// 축제명에서 '영상 제목에 들어있어야 하는' 핵심 키워드를 뽑습니다.
//  - 정식 이름(공백제거) + 꼬리말(축제/페스티벌…)을 뗀 이름(3자 이상)만 사용.
//  - 흔한 조각(예: '축제', '서울')이 아무 영상에나 걸리지 않도록 조각 분해는 하지 않음.
function nameKeywords(q) {
  const base = normText(q);
  const stripped = normText(
    (q || "").replace(/축제|페스티벌|페스타|문화제|대축제|festival/gi, "")
  );
  const kws = new Set();
  if (base.length >= 2) kws.add(base);
  if (stripped.length >= 3) kws.add(stripped);
  return [...kws].filter(Boolean);
}

// 제목이 축제명을 '비유/과장'으로만 쓴 경우 제외 (예: "…축제급 꾸덕함", "…축제 같은").
const METAPHOR_RE = /^(급|같|만큼|처럼|수준|뺨|보다|이상|버금)/;
// 매칭된 키워드 뒤에 붙은 꼬리말(축제 등)은 건너뛰고 비유 여부를 판단하기 위한 패턴.
const SUFFIX_RE = /^(축제|페스티벌|페스타|문화제)/;

// 영상이 실제로 이 축제와 관련 있는지 판정.
//  - 채널명에 축제명이 있으면 관련(공식·지자체 채널 등)
//  - 제목에 축제명이 있고, (꼬리말을 건너뛴) 바로 뒤가 '급/같은/처럼' 비유가 아니면 관련
function isRelatedVideo(title, channel, keywords) {
  const nc = normText(channel);
  const nt = normText(title);
  for (const k of keywords) {
    if (nc.includes(k)) return true;
    let idx = nt.indexOf(k);
    while (idx !== -1) {
      let after = nt.slice(idx + k.length);
      const m = after.match(SUFFIX_RE);
      if (m) after = after.slice(m[0].length); // '축제' 등 꼬리말 건너뛰기
      if (!METAPHOR_RE.test(after)) return true;
      idx = nt.indexOf(k, idx + 1);
    }
  }
  return false;
}

async function fetchWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // 같은 검색어는 하루 동안 캐시 → 유튜브 한도 절약
    return await fetch(url, {
      signal: controller.signal,
      next: { revalidate: DAY },
    });
  } finally {
    clearTimeout(timer);
  }
}

// 검색어로 영상 ID 목록을 가져옵니다.
//  - duration : "short"(4분 미만·쇼츠) / "medium"(4~20분·브이로그) / 없으면 전체
//  - order=relevance : 관련성순(최신 영상도 상위에 잘 섞임)
//  - regionCode=KR   : 한국 지역 기준
async function searchIds(key, q, max, duration) {
  const dur = duration ? `&videoDuration=${duration}` : "";
  const url =
    `${YT_SEARCH}?key=${key}&part=snippet&type=video${dur}` +
    `&order=relevance&maxResults=${max}&regionCode=KR&safeSearch=moderate` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`yt search ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .map((it) => it.id && it.id.videoId)
    .filter(Boolean);
}

// 채널별 구독자수 조회 (channels.list = 1유닛, 한 번에 최대 50채널). 숨김/실패는 0.
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
    /* 실패해도 구독자수 0으로 정렬 진행 */
  }
  return map;
}

export async function GET(request) {
  const rl = rateLimit("videos", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const en = searchParams.get("en") === "1"; // 영어 페이지: 외국인 브이로그 병행 검색
  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  // 키가 없으면 화면에서 영상 영역이 안 뜨도록 알려줌
  if (!key || key.startsWith("여기에")) {
    return NextResponse.json({ configured: false, items: [] });
  }

  try {
    // videoDuration 제한 없이(전체 길이) 검색 → 일반 롱폼이 나오게 하고,
    // 쇼츠는 아래에서 길이로 제외. maxResults를 넉넉히 받아 롱폼 후보를 충분히 확보.
    //  (유튜브 search는 maxResults를 늘려도 호출 비용 동일 — 추가 호출 아님)
    const searches = [
      searchIds(key, `${query} 축제`, 40),
      searchIds(key, `${query} 브이로그`, 30),
    ];
    if (en) {
      searches.push(searchIds(key, `${query} korea festival`, 30));
      searches.push(searchIds(key, `${query} korea vlog`, 25));
    }
    const lists = await Promise.all(searches.map((p) => p.catch(() => [])));

    // id별 '최고 관련도 순위'(작을수록 상위) 기록 — 중복 제거 겸 정렬 힌트
    const rank = new Map();
    lists.forEach((ids) => {
      ids.forEach((id, i) => {
        if (!rank.has(id) || i < rank.get(id)) rank.set(id, i);
      });
    });
    // videos.list는 한 번에 최대 50개(1유닛)까지 조회 가능 → 후보를 넉넉히
    const ids = [...rank.keys()].slice(0, 50);
    if (ids.length === 0) {
      return NextResponse.json({ configured: true, items: [] });
    }

    // 조회수·채널명·썸네일·재생시간을 한 번에 조회 (videos.list = 1유닛)
    const vurl = `${YT_VIDEOS}?key=${key}&part=snippet,statistics,contentDetails&id=${ids.join(",")}`;
    const vres = await fetchWithTimeout(vurl);
    if (!vres.ok) throw new Error(`yt videos ${vres.status}`);
    const vdata = await vres.json();

    const cand = (vdata.items || [])
      .map((v) => ({
        id: v.id,
        title: (v.snippet && v.snippet.title) || "",
        channel: (v.snippet && v.snippet.channelTitle) || "",
        channelId: (v.snippet && v.snippet.channelId) || null,
        views: Number((v.statistics && v.statistics.viewCount) || 0),
        publishedAt: (v.snippet && v.snippet.publishedAt) || null,
        thumb: pickThumb(v.snippet && v.snippet.thumbnails),
        sec: isoToSeconds(v.contentDetails && v.contentDetails.duration),
      }))
      // 쇼츠 제외 — 60초 이하(쇼츠)와 너무 긴 라이브(1시간 초과)를 버리고 롱폼만 남김
      .filter((c) => c.sec > MIN_LONGFORM_SEC && c.sec <= MAX_LONGFORM_SEC);

    // 구독자수 정렬을 위해 후보 영상들의 채널 구독자수를 한 번 더 조회.
    const channelIds = [...new Set(cand.map((c) => c.channelId).filter(Boolean))];
    const subsByChannel = await fetchSubscribers(key, channelIds);

    // 각 영상에 정렬용 값 부여: 관련성·뉴스여부·최신묶음·조회수·구독자수
    const keywords = nameKeywords(query);
    const now = Date.now();
    const enriched = cand.map((v) => {
      const related = isRelatedVideo(v.title, v.channel, keywords); // 실제 관련(비유 제외)
      const isNews = NEWS_RE.test(v.channel);
      const publishedMs = v.publishedAt ? Date.parse(v.publishedAt) : 0;
      const daysAgo = publishedMs ? (now - publishedMs) / 86400000 : 1e9;
      const bucket = Math.floor(daysAgo / 30); // 약 한 달 단위 묶음(작을수록 최근)
      const subs = subsByChannel[v.channelId] || 0;
      return { v, related, isNews, bucket, views: v.views, subs };
    });

    // 노출 대상: 축제명이 들어간 '관련 영상' + 뉴스 아님을 우선.
    //  없으면 단계적으로 완화(관련만 → 전체)해 섹션이 비지 않게 함.
    const relatedNonNews = enriched.filter((x) => x.related && !x.isNews);
    const relatedAny = enriched.filter((x) => x.related);
    const pool =
      relatedNonNews.length > 0
        ? relatedNonNews
        : relatedAny.length > 0
        ? relatedAny
        : enriched;

    // 정렬 우선순위: ① 최신 묶음(최근 먼저) ② 조회수(많은 순) ③ 구독자수(많은 순)
    pool.sort(
      (a, b) => a.bucket - b.bucket || b.views - a.views || b.subs - a.subs
    );
    const items = pool.slice(0, 6).map((x) => x.v);

    // 영상 제목은 한국어라, 한국어 외 언어에선 Google 번역으로 대체(실패 시 원문)
    const locale = searchParams.get("locale") || "ko";
    if (locale !== "ko" && items.length > 0) {
      const titles = await translateMany(items.map((it) => it.title), locale);
      items.forEach((it, i) => {
        if (titles[i]) it.title = titles[i];
      });
    }

    return NextResponse.json(
      { configured: true, items },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=172800",
        },
      }
    );
  } catch (err) {
    console.warn("[videos] 유튜브 검색 실패:", err.message);
    // 실패(한도 초과 포함) → 빈 목록. 화면에서 영상 영역만 숨김.
    return NextResponse.json(
      { configured: true, items: [], error: true },
      { status: 502 }
    );
  }
}
