import { getStatusInfo } from "./format";

// 가벼운 인기 대체 점수 (블로그 조회 없이 즉시 계산 — 상세페이지 속도 유지)
//  대표이미지 있으면 +2, TourAPI 실데이터면 +1
function cheapPop(f) {
  return (f.image ? 2 : 0) + (f.source === "tour" ? 1 : 0);
}

// [공개] "이 축제가 좋았다면" 추천 목록.
//  기준을 아래 순서로 조합해 최대 limit개(기본 6):
//   ① 같은 시군구의 다른 축제
//   ② 같은 계절의 인기 축제
//   ③ 비슷한 유형(TourAPI 분류코드 cat3)의 축제
//  - 지금 보고 있는 축제 제외, 종료된 축제 제외, 중복 제외
export function getRelatedFestivals(current, all, limit = 6) {
  if (!current || !Array.isArray(all)) return [];
  const now = new Date();
  const pool = all.filter(
    (f) =>
      f.id !== current.id &&
      getStatusInfo(f.startDate, f.endDate, now).key !== "ended"
  );

  const seen = new Set();
  const out = [];
  const take = (list) => {
    for (const f of list) {
      if (out.length >= limit) break;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  };
  const byPop = (a, b) => cheapPop(b) - cheapPop(a);

  // ① 같은 시군구 (시도까지 같아야 동일 지역)
  take(
    pool
      .filter(
        (f) =>
          current.sigungu &&
          f.sigungu === current.sigungu &&
          f.sido === current.sido
      )
      .sort(byPop)
  );
  // ② 같은 계절의 인기 축제
  take(pool.filter((f) => f.season === current.season).sort(byPop));
  // ③ 비슷한 유형(분류코드)
  if (current.cat3) {
    take(pool.filter((f) => f.cat3 && f.cat3 === current.cat3).sort(byPop));
  }
  // ④ 그래도 부족하면 종료 안 된 인기 축제로 채움 (막다른 길 방지 — 다음 축제로 계속)
  take([...pool].sort(byPop));

  return out.slice(0, limit);
}
