"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import AccountMenu from "@/components/AccountMenu";

export default function ProfilePage() {
  const { configured, user, profile, displayName, loading, updateNickname, signOut } =
    useAuth();
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 로그인 안 되어 있으면 로그인 화면으로
  useEffect(() => {
    if (configured && !loading && !user) router.replace("/login");
  }, [configured, loading, user, router]);

  // 현재 닉네임을 입력창 초기값으로
  useEffect(() => {
    setNickname(profile?.nickname || displayName || "");
  }, [profile, displayName]);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await updateNickname(nickname.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Link href="/" className="brand">
            축제로
          </Link>
          <div className="header-right">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container auth-wrap">
        <Link href="/" className="back-link">
          ← 홈으로
        </Link>

        <div className="auth-card">
          <h1 className="auth-title">내 프로필</h1>

          {!configured ? (
            <p className="auth-note">회원 기능이 아직 설정되지 않았어요.</p>
          ) : loading || !user ? (
            <p className="auth-note">불러오는 중…</p>
          ) : (
            <>
              <p className="profile-email">📧 {user.email}</p>
              <form className="auth-form" onSubmit={save}>
                <label className="auth-field">
                  <span>닉네임</span>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    placeholder="닉네임"
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? "저장 중…" : saved ? "✅ 저장됐어요" : "닉네임 저장"}
                </button>
              </form>

              <button className="profile-logout" onClick={signOut}>
                로그아웃
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
