import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

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

// 검색 결과에서 뉴스/방송 클립은 뒤로, 브이로그·공식/지자체 채널은 앞으로
// 정렬하기 위한 판별용 패턴 (채널명/제목 기준).
const NEWS_RE = /news|뉴스|kbs|mbc|sbs|ytn|jtbc|mbn|연합뉴스|채널a|tv조선|tvchosun|tbc|obs|보도|앵커|뉴스데스크/i;
const VLOG_RE = /브이로그|vlog|다녀|후기|여행|먹방|일상|가족|커플|데이트|당일치기|힐링|투어|즐기기/i;
const OFFICIAL_RE = /공식|official|시청|군청|도청|관광재단|문화재단|관광공사|축제위원회|조직위|관광|시ㅣ/i;

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
// 쇼츠만 남기기 위한 최대 길이(초). 실측 결과 진짜 쇼츠는 대개 60초 이하이고
// 60초를 넘는 짧은 영상은 대부분 가로형 롱폼이라, 60초로 끊어 롱폼을 확실히 제외.
const SHORTS_MAX_SEC = 60;

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
    // 검색은 전부 videoDuration=short로 하고, 아래에서 60초 이하만 남겨 롱폼 제외.
    //  - maxResults를 넉넉히(30) 받아 60초 이하 쇼츠 후보를 충분히 확보.
    //    (유튜브 search는 maxResults를 늘려도 호출 비용이 동일 — 추가 호출 아님)
    //  - "축제명 축제" + "축제명 브이로그"가 쇼츠 커버리지가 가장 좋음(호출 2회 유지)
    const searches = [
      searchIds(key, `${query} 축제`, 30, "short"),
      searchIds(key, `${query} 브이로그`, 20, "short"),
    ];
    if (en) {
      searches.push(searchIds(key, `${query} korea festival`, 25, "short"));
      searches.push(searchIds(key, `${query} korea vlog`, 20, "short"));
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
        views: Number((v.statistics && v.statistics.viewCount) || 0),
        publishedAt: (v.snippet && v.snippet.publishedAt) || null,
        thumb: pickThumb(v.snippet && v.snippet.thumbnails),
        sec: isoToSeconds(v.contentDetails && v.contentDetails.duration),
      }))
      // 롱폼 제외 — 재생시간 3분 초과는 버리고 쇼츠/짧은 영상만 남김
      .filter((c) => c.sec > 0 && c.sec <= SHORTS_MAX_SEC);

    // 뉴스/방송 채널은 감점, 브이로그·공식/지자체 채널은 가점, 관련도도 반영해 정렬.
    //  (뉴스는 완전히 빼지 않고 뒤로만 밀어, 영상이 뉴스뿐인 축제도 빈 섹션이 안 되게)
    const scored = cand.map((v) => {
      const text = `${v.channel} ${v.title}`;
      let s = Math.max(0, 16 - (rank.get(v.id) ?? 16));
      if (NEWS_RE.test(v.channel)) s -= 100;
      if (VLOG_RE.test(text)) s += 40;
      if (OFFICIAL_RE.test(v.channel)) s += 30;
      return { v, s };
    });
    scored.sort((a, b) => b.s - a.s);
    const items = scored.slice(0, 6).map((x) => x.v);

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
