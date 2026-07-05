"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";

// 헤더 우측 계정 영역.
//  - 회원 기능 미설정 → 아무것도 안 보임 (축제 조회는 그대로 동작)
//  - 로그아웃 상태 → "로그인" 버튼
//  - 로그인 상태 → 닉네임(프로필 링크) + 로그아웃
export default function AccountMenu() {
  const { configured, user, displayName, loading, signOut } = useAuth();
  const { t, href } = useI18n();

  if (!configured) return null;
  if (loading) return <span className="account-loading" aria-hidden="true" />;

  if (!user) {
    return (
      <div className="account-menu">
        <Link href={href("/login")} className="account-login">
          {t.nav.login}
        </Link>
        <Link href={href("/login?mode=signup")} className="account-signup">
          {t.nav.signup}
        </Link>
      </div>
    );
  }

  return (
    <div className="account-menu">
      <Link href={href("/mypage")} className="account-name" title={t.nav.mypage}>
        👤 {displayName}
      </Link>
      <button className="account-logout" onClick={signOut}>
        {t.nav.logout}
      </button>
    </div>
  );
}
