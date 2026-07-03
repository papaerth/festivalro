// 날짜/상태 관련 공통 도우미 모음

// "2026-03-27" → Date 객체 (하루의 시작)
function toDate(str) {
  return new Date(`${str}T00:00:00+09:00`);
}

// "2026-03-27" → "2026.03.27"
export function formatDate(str) {
  if (!str) return "";
  return str.replaceAll("-", ".");
}

// 축제 기간을 "2026.03.27 ~ 2026.04.05" 형태로. 하루짜리면 날짜 하나만.
export function formatPeriod(startDate, endDate) {
  const s = formatDate(startDate);
  const e = formatDate(endDate);
  if (!e || s === e) return s;
  return `${s} ~ ${e}`;
}

// 오늘 날짜 기준으로 축제 진행 상태를 계산
// 반환: { key, label } — key는 색/정렬용, label은 화면 표시용
export function getStatus(startDate, endDate, now = new Date()) {
  const s = toDate(startDate);
  const e = new Date(toDate(endDate).getTime() + 24 * 60 * 60 * 1000 - 1); // 종료일의 밤 11:59까지 포함
  if (now < s) return { key: "upcoming", label: "예정" };
  if (now > e) return { key: "ended", label: "종료" };
  return { key: "ongoing", label: "진행중" };
}

// 카드 목록 정렬용 우선순위 (진행중 → 예정 → 종료)
export const STATUS_ORDER = { ongoing: 0, upcoming: 1, ended: 2 };
