import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ textAlign: "center", padding: "80px 16px" }}>
      <h1 style={{ fontSize: "40px", color: "var(--accent)" }}>🎪</h1>
      <h2 style={{ margin: "12px 0" }}>축제를 찾을 수 없어요</h2>
      <p style={{ color: "var(--text-soft)" }}>
        주소가 바뀌었거나 없는 축제일 수 있어요.
      </p>
      <p style={{ marginTop: "20px" }}>
        <Link href="/" className="popup-link" style={{ fontWeight: 700 }}>
          ← 전체 축제 목록으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
