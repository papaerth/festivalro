import { NextResponse } from "next/server";

// ────────────────────────────────────────────────────────────────
//  축제 영상 검색 중계소 (YouTube Data API v3)
//
//  .env.local 에 YOUTUBE_API_KEY 가 있으면 축제 이름으로 유튜브에서
//  '세로형 쇼츠(짧은 영상)'를 관련성순으로 찾아 6개를 돌려줍니다.
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
const DAY = 60 * 60 * 24;

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

// 검색어로 '짧은 영상(쇼츠 우선)' ID 목록을 가져옵니다.
//  - videoDuration=short : 4분 미만(쇼츠·짧은 영상)
//  - order=relevance     : 관련성순(최신 영상도 상위에 잘 섞임)
//  - regionCode=KR       : 한국 지역 기준
async function searchIds(key, q, max) {
  const url =
    `${YT_SEARCH}?key=${key}&part=snippet&type=video&videoDuration=short` +
    `&order=relevance&maxResults=${max}&regionCode=KR&safeSearch=moderate` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`yt search ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .map((it) => it.id && it.id.videoId)
    .filter(Boolean);
}

export async function GET(request) {
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
    // 축제명 + "축제"로 관련도를 높이고, 영어권이면 "korea festival"도 병행.
    const idLists = await Promise.all([
      searchIds(key, `${query} 축제`, 10),
      en ? searchIds(key, `${query} korea festival`, 8) : Promise.resolve([]),
    ]);
    const ids = [...new Set(idLists.flat())].slice(0, 12);
    if (ids.length === 0) {
      return NextResponse.json({ configured: true, items: [] });
    }

    // 조회수·채널명·썸네일을 한 번에 조회 (videos.list = 1유닛)
    const vurl = `${YT_VIDEOS}?key=${key}&part=snippet,statistics&id=${ids.join(",")}`;
    const vres = await fetchWithTimeout(vurl);
    if (!vres.ok) throw new Error(`yt videos ${vres.status}`);
    const vdata = await vres.json();

    const items = (vdata.items || [])
      .map((v) => ({
        id: v.id,
        title: (v.snippet && v.snippet.title) || "",
        channel: (v.snippet && v.snippet.channelTitle) || "",
        views: Number((v.statistics && v.statistics.viewCount) || 0),
        thumb:
          (v.snippet &&
            v.snippet.thumbnails &&
            (v.snippet.thumbnails.high ||
              v.snippet.thumbnails.medium ||
              v.snippet.thumbnails.default) &&
            (v.snippet.thumbnails.high ||
              v.snippet.thumbnails.medium ||
              v.snippet.thumbnails.default).url) ||
          null,
      }))
      .slice(0, 6);

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
