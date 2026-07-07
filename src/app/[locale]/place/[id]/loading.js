// 장소 페이지 로딩 스켈레톤 — 카드 클릭 즉시 이 화면이 뜨고(빈 대기 없음),
// 서버에서 장소 데이터가 준비되면 실제 내용으로 자연스럽게 교체됩니다.
export default function PlaceLoading() {
  const box = (h, extra = {}) => ({
    height: h,
    borderRadius: "var(--radius-btn)",
    ...extra,
  });
  return (
    <div>
      <header className="site-header">
        <div className="container">
          <span className="brand">축제로</span>
        </div>
      </header>
      <main className="container">
        <div
          className="skeleton"
          style={box(18, { width: 150, margin: "10px 0" })}
        />
        {/* 대표 사진 자리 */}
        <div
          className="skeleton"
          style={box("auto", {
            aspectRatio: "16 / 10",
            borderRadius: "var(--radius-card)",
            margin: "8px 0 16px",
          })}
        />
        {/* 분류 배지 + 이름 자리 */}
        <div
          className="skeleton"
          style={box(16, { width: 72, borderRadius: "var(--radius-pill)", margin: "8px 0" })}
        />
        <div
          className="skeleton"
          style={box(30, { width: "68%", margin: "6px 0 18px" })}
        />
        {/* 섹션 자리 */}
        <div
          className="skeleton"
          style={box(96, { borderRadius: "var(--radius-card)", margin: "12px 0" })}
        />
        <div
          className="skeleton"
          style={box(96, { borderRadius: "var(--radius-card)", margin: "12px 0" })}
        />
      </main>
    </div>
  );
}
