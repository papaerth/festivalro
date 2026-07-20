// ────────────────────────────────────────────────────────────────
//  5일장(정기시장) '다음 장날' 계산
//   · openDays = 장서는 날의 '끝자리' 배열 (예: [4,9] = 4·9·14·19·24·29일)
//   · 오늘부터 앞으로 훑어 가장 가까운 장날을 찾음(오늘이 장날이면 isToday).
//   · 야시장(openDays=[])은 정기 장날이 없어 null 반환.
// ────────────────────────────────────────────────────────────────
export function nextMarketDay(openDays, now = new Date()) {
  if (!Array.isArray(openDays) || openDays.length === 0) return null;
  const ends = openDays.map((d) => Number(d) % 10);
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (ends.includes(d.getDate() % 10)) {
      return { date: d, isToday: i === 0, daysUntil: i };
    }
  }
  return null;
}

// BCP-47 로케일로 "8월 3일 (월)" / "Aug 3 (Mon)" 처럼 현지화된 날짜 문자열.
//  intlLocale 예: ko, en, ja, zh, zh-TW … (우리 로케일 코드와 대체로 동일)
export function formatMarketDate(date, intlLocale = "ko") {
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  } catch {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}
