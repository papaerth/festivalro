// 문화공공데이터광장 「한눈에보는문화정보조회서비스」 연동 검증 스크립트
//  사용법: .env.local 에 CULTURE_API_KEY 를 넣은 뒤  →  node scripts/verify-culture.mjs
//  실제로 전시·공연 데이터를 받아와 우리 구조로 매핑되는지, 제목/기간/장소/좌표/이미지가
//  제대로 채워지는지 출력합니다. (앱을 건드리지 않는 독립 스크립트)
import fs from "node:fs";
import path from "node:path";

// ── .env.local 에서 키 읽기 ──
function readEnv(name) {
  try {
    const txt = fs.readFileSync(path.resolve(".env.local"), "utf8");
    const m = txt.match(new RegExp("^" + name + "=(.*)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return process.env[name] || "";
  }
}

const RAW = readEnv("CULTURE_API_KEY") || readEnv("TOUR_API_KEY");
if (!RAW || RAW.startsWith("여기에")) {
  console.error("❌ .env.local 에 CULTURE_API_KEY (또는 TOUR_API_KEY) 가 없습니다.");
  process.exit(1);
}
const USING = readEnv("CULTURE_API_KEY") ? "CULTURE_API_KEY(전용)" : "TOUR_API_KEY(폴백)";

// ── 키 인코딩 정규화: 디코딩 후 1회 인코딩 (Encoding/Decoding 키 둘 다 허용) ──
let decoded = RAW;
try { decoded = decodeURIComponent(RAW); } catch { decoded = RAW; }
const wasEncoded = decoded !== RAW; // 원본이 이미 %인코딩(Encoding 키)였는지
const serviceKey = encodeURIComponent(decoded);

const BASE =
  readEnv("CULTURE_API_BASE") ||
  "https://apis.data.go.kr/B553457/cultureinfo/period2";

// ── XML 파싱 헬퍼 (앱 culture.js 와 동일 규칙) ──
const unescapeXml = (s = "") =>
  String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .trim();
const tag = (b, n) => {
  const m = b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
};
const normDate = (raw = "") => {
  const d = String(raw).replace(/[^0-9]/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
};
const classifyRealm = (realm = "") => {
  const r = String(realm);
  if (/축제/.test(r)) return null;
  if (/(전시|미술|공예|사진|서예|디자인|건축|박람)/.test(r)) return "exhibition";
  return "performance";
};
function mapItem(block) {
  const title = tag(block, "title");
  const start = normDate(tag(block, "startDate"));
  if (!title || !start) return null;
  const type = classifyRealm(tag(block, "realmName"));
  const end = normDate(tag(block, "endDate")) || start;
  const lat = Number(tag(block, "gpsY"));
  const lng = Number(tag(block, "gpsX"));
  const thumb = tag(block, "thumbnail") || tag(block, "imgUrl");
  return {
    name: title,
    type,
    realmName: tag(block, "realmName"),
    startDate: start,
    endDate: end,
    place: tag(block, "place"),
    area: tag(block, "area"),
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    image: thumb && thumb.startsWith("http") ? thumb : null,
  };
}

// ── 실행 ──
(async () => {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const from = ymd(new Date(today.getTime() - 30 * 86400000));
  const to = ymd(new Date(today.getTime() + 365 * 86400000));
  const url = `${BASE}?serviceKey=${serviceKey}&from=${from}&to=${to}&cPage=1&rows=20&sortStdr=1`;

  console.log("═══ 문화정보 API 검증 ═══");
  console.log("사용 키:", USING);
  console.log("키 형태:", wasEncoded ? "Encoding(이미 %인코딩) → 디코딩 후 재인코딩" : "Decoding(원문) → 인코딩");
  console.log("엔드포인트:", BASE);
  console.log("요청:", `from=${from} to=${to} rows=20\n`);

  let res;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
  } catch (e) {
    console.error("❌ 요청 실패(타임아웃/네트워크):", e.name || e.message);
    process.exit(1);
  }
  const text = await res.text();

  const WRAP = text.includes("<perforList>") ? "perforList" : text.includes("<item>") ? "item" : null;
  if (!WRAP) {
    console.error(`❌ 정상 데이터가 아닙니다 (HTTP ${res.status}).`);
    const msg = (text.match(/<returnAuthMsg>([^<]+)</) || text.match(/<errMsg>([^<]+)</) || text.match(/<message>([^<]+)</) || text.match(/<cmmMsgHeader>[\s\S]*?<returnReasonCode>([^<]+)</) || [])[1];
    if (msg) console.error("   서버 메시지:", msg);
    else console.error("   응답 앞부분:", text.replace(/\s+/g, " ").slice(0, 200));
    console.error("");
    if (res.status === 404 || /not found/i.test(text)) {
      console.error("👉 404 'API not found' → ①키가 이 데이터셋에 미등록이거나 ②엔드포인트(요청주소)가 다를 수 있습니다.");
      console.error("   • 데이터셋 상세페이지(공공데이터포털 '한눈에보는문화정보조회서비스')의 '요청주소'를 확인하세요.");
      console.error("   • 주소가 현재와 다르면 .env.local 에 CULTURE_API_BASE=<그 주소> 를 넣으면 덮어씁니다.");
      console.error("   • 현재 기본 주소:", BASE);
    } else {
      console.error("👉 활용신청 미승인/키 오류 가능. 공공데이터포털에서 해당 API 활용신청 상태와 키를 확인하세요.");
    }
    console.error("👉 Encoding/Decoding 키는 이 스크립트가 자동 정규화하므로, 대개 문제는 키 등록 또는 엔드포인트입니다.");
    process.exit(1);
  }

  const blocks = text.split(`<${WRAP}>`).slice(1).map((b) => b.split(`</${WRAP}>`)[0]);
  const items = blocks.map(mapItem).filter(Boolean);
  console.log(`✅ 정상 응답 — 이번 페이지에서 ${blocks.length}건 수신, 매핑 성공 ${items.length}건\n`);

  const field = (v) => (v ? "✓" : "✗");
  const exCount = items.filter((x) => x.type === "exhibition").length;
  const pfCount = items.filter((x) => x.type === "performance").length;
  console.log(`유형 분류: 전시 ${exCount} · 공연 ${pfCount} · 미분류/축제제외 ${items.length - exCount - pfCount}\n`);

  console.log("── 샘플(최대 6건) 필드 채움 ──");
  items.slice(0, 6).forEach((x, i) => {
    console.log(
      `${i + 1}. [${x.type || "?"}] ${x.name.slice(0, 34)}\n` +
        `   제목${field(x.name)} 기간${field(x.startDate)}(${x.startDate}~${x.endDate}) ` +
        `장소${field(x.place)}(${(x.place || "").slice(0, 16)}) ` +
        `좌표${field(x.lat && x.lng)}(${x.lat ?? "-"},${x.lng ?? "-"}) ` +
        `이미지${field(x.image)}`
    );
  });

  // 필드 채움률 요약
  const rate = (fn) => Math.round((items.filter(fn).length / items.length) * 100);
  console.log("\n── 필드 채움률(수신 건 기준) ──");
  console.log(`제목 ${rate((x) => x.name)}% · 기간 ${rate((x) => x.startDate)}% · 장소 ${rate((x) => x.place)}% · 좌표 ${rate((x) => x.lat && x.lng)}% · 이미지 ${rate((x) => x.image)}%`);
  console.log("\n✅ 검증 완료. 좌표 채움률이 낮으면 지도 마커 대신 목록에만 표시됩니다(정상 폴백).");
})();
