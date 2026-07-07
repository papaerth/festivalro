// 방문자 이벤트를 Google Analytics(GA4)로 보냅니다.
//  - gtag가 없으면(측정 ID 미설정 등) 조용히 무시 → 화면엔 영향 없음.
//  - 나중에 제휴 협상 근거가 될 숫자(카드뉴스 클릭·상세 진입·길찾기·영상재생·주변 클릭).
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    /* 분석 전송 실패해도 서비스엔 영향 없음 */
  }
}
