// 최근 본 축제를 브라우저에 기억합니다 (회원가입 없이, localStorage).
//  - 최대 5개, 최신순. 카드 렌더에 필요한 최소 정보만 저장.
const KEY = "chukjero:recent";
const MAX = 5;

// 카드 렌더에 필요한 필드만 추립니다 (설명문 등 큰 값은 저장 안 함).
function toMini(f) {
  return {
    id: f.id,
    name: f.name,
    displayName: f.displayName || null,
    image: f.image || null,
    startDate: f.startDate,
    endDate: f.endDate,
    sido: f.sido || "",
    sigungu: f.sigungu || "",
    season: f.season || "spring",
    region: f.region || "",
    source: f.source || null,
  };
}

export function getRecent() {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => x && x.id) : [];
  } catch {
    return [];
  }
}

export function addRecent(f) {
  if (typeof window === "undefined" || !f || !f.id) return;
  try {
    const mini = toMini(f);
    const list = getRecent().filter((x) => x.id !== f.id);
    list.unshift(mini);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 저장 실패해도 화면엔 영향 없음 */
  }
}
