// ────────────────────────────────────────────────────────────────
//  개화(봄)·단풍(가을) 시즌 정보
//   · 공식 '예측 API'가 없어 운영자가 갱신하는 data/season/*.json 을 근거로,
//     축제 지역의 예상일과 오늘 날짜를 비교해 배지/배너를 자동 계산합니다.
//   · 연도는 무시하고 '월·일'만 비교(운영자가 한 해 갱신을 걸러도 대략 동작).
//   · 판정: 개화/단풍 전 → 절정 → 끝물 → (지나면) 없음.
// ────────────────────────────────────────────────────────────────
import BLOOM from "../../data/season/bloom.json";
import FOLIAGE from "../../data/season/foliage.json";

// 배지가 붙을 축제 판정용 키워드(제목) — 여기서 대상 꽃/단풍 종류를 조정할 수 있습니다.
const BLOOM_RE = /(벚꽃|벚나무|겹벚꽃|왕벚|매화|유채|진달래|철쭉|개나리|목련|봄꽃|꽃축제|튤립|영산홍|꽃대궐)/;
const FOLIAGE_RE = /(단풍|억새|은행나무|은행축제|갈대|국화축제|코스모스|가을빛|메타세쿼이아|낙엽)/;

// 월·일 비교용: 모든 날짜를 같은 기준연도(2001) Date로 환산 → 일수 오프셋 계산이 정확.
const REF = 2001;
function toRef(mmddStr = "") {
  const m = Number(String(mmddStr).slice(5, 7));
  const d = Number(String(mmddStr).slice(8, 10));
  if (!m || !d) return null;
  return new Date(REF, m - 1, d);
}
function addDays(dt, n) {
  const r = new Date(dt);
  r.setDate(r.getDate() + n);
  return r;
}
function todayRef(now) {
  return new Date(REF, now.getMonth(), now.getDate());
}
// "2026-04-01" → "4/1"
function md(dateStr = "") {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;
}

// 축제 1건의 시즌 배지 정보. 없으면 null.
//  반환: { kind:"bloom"|"foliage", phase:"before"|"peak"|"waning", date:"4/1"|null, range:"10/25~11/4"|null }
export function getSeasonBadge(festival, now = new Date()) {
  if (!festival) return null;
  const region = festival.region;
  const title = `${festival.name || ""} ${festival.displayName || ""}`;
  const T = todayRef(now);

  // 봄: 꽃 축제
  if (BLOOM_RE.test(title)) {
    const r = BLOOM.regions[region];
    const B = r && toRef(r.bloom);
    const F = r && toRef(r.full);
    if (B && F) {
      if (T >= addDays(B, -30) && T < B) return { kind: "bloom", phase: "before", date: md(r.bloom) };
      if (T >= B && T <= addDays(F, 6)) return { kind: "bloom", phase: "peak", date: md(r.bloom) };
      if (T > addDays(F, 6) && T <= addDays(F, 13)) return { kind: "bloom", phase: "waning", date: md(r.bloom) };
    }
  }
  // 가을: 단풍 축제
  if (FOLIAGE_RE.test(title)) {
    const r = FOLIAGE.regions[region];
    const S = r && toRef(r.peakStart);
    const E = r && toRef(r.peakEnd);
    if (S && E) {
      const range = `${md(r.peakStart)}~${md(r.peakEnd)}`;
      if (T >= addDays(S, -30) && T < S) return { kind: "foliage", phase: "before", range };
      if (T >= S && T <= E) return { kind: "foliage", phase: "peak", range };
      if (T > E && T <= addDays(E, 7)) return { kind: "foliage", phase: "waning", range };
    }
  }
  return null;
}

// 배지 문구 조합(이모지 + 현재 언어 문구). st = getSeasonText(locale).
export function seasonBadgeLabel(badge, st) {
  if (!badge || !st) return null;
  if (badge.kind === "bloom") {
    if (badge.phase === "before") return `🌸 ${st.bloomBefore(badge.date)}`;
    if (badge.phase === "peak") return `🌸 ${st.bloomPeak}`;
    return `🌸 ${st.bloomWaning}`;
  }
  if (badge.phase === "before") return `🍁 ${st.foliageBefore(badge.range)}`;
  if (badge.phase === "peak") return `🍁 ${st.foliagePeak}`;
  return `🍁 ${st.foliageWaning}`;
}

// 메인 상단 배너용: 지금 '절정'인 권역 목록. 없으면 null(→ 배너 숨김).
//  봄 절정이 있으면 봄 우선, 없고 가을 절정이 있으면 가을.
export function getSeasonBanner(now = new Date()) {
  const T = todayRef(now);
  const bloom = Object.entries(BLOOM.regions)
    .filter(([, r]) => {
      const B = toRef(r.bloom), F = toRef(r.full);
      return B && F && T >= B && T <= addDays(F, 6);
    })
    .map(([k]) => k);
  if (bloom.length) return { kind: "bloom", regions: bloom };
  const foliage = Object.entries(FOLIAGE.regions)
    .filter(([, r]) => {
      const S = toRef(r.peakStart), E = toRef(r.peakEnd);
      return S && E && T >= S && T <= E;
    })
    .map(([k]) => k);
  if (foliage.length) return { kind: "foliage", regions: foliage };
  return null;
}
