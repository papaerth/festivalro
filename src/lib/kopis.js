import "server-only";
// ────────────────────────────────────────────────────────────────
//  전국 공연 — KOPIS(공연예술통합전산망) 오픈API 「공연목록(pblprfr)」
//
//  · 전국 연극·뮤지컬·콘서트(대중음악)·무용·국악·서커스/마술·복합 공연을
//    공연명·기간·공연장·포스터·지역과 함께 제공. (전국, 서울 밖 공연 보강 주력)
//  · ⚠️ 별도 무료 인증키 필요: kopis.or.kr → 오픈API 활용신청 후 받은 키를
//    .env.local 의 KOPIS_API_KEY 에 넣으면 켜집니다. (없으면 조용히 [] → 사이트 정상)
//  · 목록 API엔 좌표(위경도)가 없어, 지역(area=시도) 중심 좌표에 소량 분산(jitter)해 마커 표시.
//    정확 좌표는 공연장별로 추후 보강 가능(공연시설 API).
//
//  응답: XML <dbs><db><mt20id><prfnm><prfpdfrom><prfpdto><fcltynm><poster><area><genrenm>…</db></dbs>
// ────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";

const KOPIS_BASE =
  process.env.KOPIS_API_BASE || "http://www.kopis.or.kr/openApi/restful/pblprfr";
const MAX_PAGES = Number(process.env.KOPIS_MAX_PAGES || 10); // 100건×페이지

// area(시도명) → 우리 권역 + 대략 좌표(시도 중심). 목록에 좌표가 없어 중심 근방에 뿌림.
const AREA = {
  서울특별시: { region: "seoul", xy: [37.5665, 126.978] },
  부산광역시: { region: "gyeongsang", xy: [35.1796, 129.0756] },
  대구광역시: { region: "gyeongsang", xy: [35.8714, 128.6014] },
  인천광역시: { region: "gyeonggi", xy: [37.4563, 126.7052] },
  광주광역시: { region: "jeolla", xy: [35.1595, 126.8526] },
  대전광역시: { region: "chungcheong", xy: [36.3504, 127.3845] },
  울산광역시: { region: "gyeongsang", xy: [35.5384, 129.3114] },
  세종특별자치시: { region: "chungcheong", xy: [36.48, 127.289] },
  경기도: { region: "gyeonggi", xy: [37.4138, 127.5183] },
  강원특별자치도: { region: "gangwon", xy: [37.8228, 128.1555] },
  강원도: { region: "gangwon", xy: [37.8228, 128.1555] },
  충청북도: { region: "chungcheong", xy: [36.6357, 127.4917] },
  충청남도: { region: "chungcheong", xy: [36.6588, 126.6728] },
  전북특별자치도: { region: "jeolla", xy: [35.7175, 127.153] },
  전라북도: { region: "jeolla", xy: [35.7175, 127.153] },
  전라남도: { region: "jeolla", xy: [34.8161, 126.463] },
  경상북도: { region: "gyeongsang", xy: [36.576, 128.5056] },
  경상남도: { region: "gyeongsang", xy: [35.4606, 128.2132] },
  제주특별자치도: { region: "jeju", xy: [33.4996, 126.5312] },
};

function hashNum(s = "") {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = (h << 5) + h + s.charCodeAt(i); h |= 0; }
  return h >>> 0;
}
function tag(block, name) {
  const m = block.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}
function toDate(raw = "") {
  const m = String(raw).match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function seasonOf(d = "") {
  const mo = Number(String(d).slice(5, 7));
  if (mo >= 3 && mo <= 5) return "spring";
  if (mo >= 6 && mo <= 8) return "summer";
  if (mo >= 9 && mo <= 11) return "autumn";
  return "winter";
}

function mapRow(block) {
  const id = tag(block, "mt20id");
  const name = tag(block, "prfnm");
  const start = toDate(tag(block, "prfpdfrom"));
  const end = toDate(tag(block, "prfpdto")) || start;
  if (!id || !name || !start) return null;
  const areaName = tag(block, "area");
  const A = AREA[areaName] || null;
  const fclt = tag(block, "fcltynm");
  const poster = tag(block, "poster");
  const genre = tag(block, "genrenm");
  let lat = null, lng = null, region = "seoul", sido = areaName || "";
  if (A) {
    region = A.region;
    // 시도 중심 근방에 결정적 분산(±~0.03°, 약 3km) — 같은 시도 공연이 한 점에 뭉치지 않게
    const h = hashNum(id);
    lat = A.xy[0] + ((h % 1000) / 1000 - 0.5) * 0.06;
    lng = A.xy[1] + (((h >> 10) % 1000) / 1000 - 0.5) * 0.06;
  }
  return {
    id: "kopis" + id,
    name,
    sido,
    sigungu: "",
    region,
    lat,
    lng,
    season: seasonOf(start),
    startDate: start,
    endDate: end,
    description: [genre, fclt].filter(Boolean).join(" · "),
    image: poster && poster.startsWith("http") ? poster : null,
    source: "kopis", // 출처: 공연예술통합전산망(KOPIS)
    type: "performance", // KOPIS는 전부 공연
    eventplace: fclt || null,
    addr: [sido, fclt].filter(Boolean).join(" "),
    homepage: null,
    tel: null,
  };
}

async function fetchWithTimeout(url, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, next: { revalidate: 60 * 60 * 12 } }); }
  finally { clearTimeout(t); }
}

async function fetchKopisRaw() {
  const key = process.env.KOPIS_API_KEY;
  if (!key) return [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const st = `${now.getFullYear()}0101`;
  const ed = `${now.getFullYear() + 1}0101`;
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${KOPIS_BASE}?service=${encodeURIComponent(key)}&stdate=${st}&eddate=${ed}&cpage=${page}&rows=100`;
    let res;
    try { res = await fetchWithTimeout(url); } catch { break; }
    if (!res.ok) break;
    const xml = await res.text();
    const blocks = xml.split("<db>").slice(1).map((b) => b.split("</db>")[0]);
    if (blocks.length === 0) break;
    for (const b of blocks) {
      const it = mapRow(b);
      // 종료 안 된(오늘 이후) 공연만, id 중복 제거
      if (it && it.endDate >= today && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    }
    if (blocks.length < 100) break;
  }
  if (out.length === 0) throw new Error("KOPIS 결과 없음(또는 키 문제)");
  return out;
}

const kopisCached = unstable_cache(fetchKopisRaw, ["kopis-perf-v1"], {
  revalidate: 60 * 60 * 12,
});

// [공개] 전국 공연 목록. 키 없음/실패 시 [] (사이트 정상).
export async function fetchFromKopis() {
  if (!process.env.KOPIS_API_KEY) return [];
  try {
    return await kopisCached();
  } catch (err) {
    console.warn("[축제로] KOPIS 실패:", err.message);
    return [];
  }
}
