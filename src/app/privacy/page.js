import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 · 축제로",
};

export default function PrivacyPage() {
  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Link href="/" className="brand">
            축제로
          </Link>
        </div>
      </header>

      <main className="container legal">
        <h1 className="legal-title">개인정보처리방침</h1>
        <p className="legal-updated">최종 업데이트: 2026-07-05</p>

        <p>
          축제로(이하 “서비스”)는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을
          준수합니다. 본 방침은 서비스가 수집하는 정보와 이용 방법을 설명합니다.
        </p>

        <h2>1. 수집하는 항목</h2>
        <ul>
          <li>회원가입·로그인 시: 이메일, 닉네임 (카카오 로그인 시 카카오가 제공하는 이메일·닉네임)</li>
          <li>서비스 이용 시: 작성한 후기·평점, 방문기록</li>
          <li>브라우저에 저장: 즐겨찾기 목록 (내 기기에만 저장, 서버 전송 안 함)</li>
        </ul>

        <h2>2. 이용 목적</h2>
        <ul>
          <li>회원 식별 및 로그인 유지</li>
          <li>후기·평점·방문기록 등 개인화 기능 제공</li>
          <li>서비스 운영 및 개선</li>
        </ul>

        <h2>3. 보관 및 파기</h2>
        <p>
          회원 탈퇴 시 관련 개인정보(프로필, 후기, 방문기록)는 지체 없이 파기됩니다.
          이용자는 언제든 계정 삭제를 요청할 수 있습니다.
        </p>

        <h2>4. 처리 위탁 및 제3자</h2>
        <ul>
          <li>인증·데이터 저장: Supabase</li>
          <li>소셜 로그인: 카카오(Kakao)</li>
          <li>축제 정보: 한국관광공사 TourAPI / 지도·날씨 등 공개 API</li>
        </ul>

        <h2>5. 이용자의 권리</h2>
        <p>
          이용자는 자신의 개인정보에 대한 열람·수정·삭제를 요청할 수 있으며, 프로필
          화면에서 닉네임을 직접 수정하거나 계정 삭제를 요청할 수 있습니다.
        </p>

        <h2>6. 문의</h2>
        <p>개인정보 관련 문의: 서비스 운영자 이메일로 연락 주시기 바랍니다.</p>

        <p className="legal-back">
          <Link href="/" className="popup-link">
            ← 홈으로
          </Link>
        </p>
      </main>
    </div>
  );
}
