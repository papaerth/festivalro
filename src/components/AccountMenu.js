"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";

// 헤더 우측 계정 영역.
//  - 회원 기능 미설정 → 아무것도 안 보임 (축제 조회는 그대로 동작)
//  - 로그아웃 상태 → "로그인" 버튼
//  - 로그인 상태 → 닉네임(프로필 링크) + 로그아웃
export default function AccountMenu() {
  const { configured, user, displayName, loading, signOut } = useAuth();

  if (!configured) return null;
  if (loading) return <span className="account-loading" aria-hidden="true" />;

  if (!user) {
    return (
      <div className="account-menu">
        <Link href="/login" className="account-login">
          로그인
        </Link>
        <Link href="/login?mode=signup" className="account-signup">
          회원가입
        </Link>
      </div>
    );
  }

  return (
    <div className="account-menu">
      <Link href="/mypage" className="account-name" title="내 페이지">
        👤 {displayName}
      </Link>
      <button className="account-logout" onClick={signOut}>
        로그아웃
      </button>
    </div>
  );
}
