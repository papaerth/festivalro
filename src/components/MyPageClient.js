"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { useFavorites } from "@/lib/useFavorites";
import AccountMenu from "./AccountMenu";
import FestivalCard from "./FestivalCard";

export default function MyPageClient({ festivals }) {
  const { configured, user, loading, displayName, updateNickname, signOut } =
    useAuth();
  const { favorites, ready } = useFavorites();
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 로그인 안 되어 있으면 로그인으로
  useEffect(() => {
    if (configured && !loading && !user) router.replace("/login");
  }, [configured, loading, user, router]);

  useEffect(() => {
    setNickname(displayName || "");
  }, [displayName]);

  const favFestivals = ready
    ? festivals.filter((f) => favorites.includes(f.id))
    : [];
  const hiddenFav = ready ? favorites.length - favFestivals.length : 0;

  const saveNickname = async (e) => {
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

      <main className="container">
        <Link href="/" className="back-link">
          ← 홈으로
        </Link>

        <h1 className="mypage-title">
          👤 {displayName}
          <span className="mypage-title-sub">님의 페이지</span>
        </h1>

        {!configured ? (
          <p className="auth-note">회원 기능이 아직 설정되지 않았어요.</p>
        ) : loading || !user ? (
          <p className="auth-note">불러오는 중…</p>
        ) : (
          <>
            {/* 프로필 */}
            <section className="section">
              <h2>🙋 프로필</h2>
              <div className="mypage-card">
                <p className="profile-email">📧 {user.email}</p>
                <form className="auth-form" onSubmit={saveNickname}>
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
              </div>
            </section>

            {/* 즐겨찾기 */}
            <section className="section">
              <h2 suppressHydrationWarning>
                ❤️ 즐겨찾기한 축제{ready && favFestivals.length > 0 ? ` ${favFestivals.length}` : ""}
              </h2>
              {favFestivals.length === 0 ? (
                <div className="empty">
                  아직 즐겨찾기한 축제가 없어요.
                  <br />
                  축제 카드의 🤍 하트를 눌러 담아보세요!
                </div>
              ) : (
                <>
                  <div className="card-grid">
                    {favFestivals.map((f) => (
                      <FestivalCard key={f.id} festival={f} />
                    ))}
                  </div>
                  {hiddenFav > 0 && (
                    <p className="mypage-note">
                      일부 즐겨찾기({hiddenFav}곳)는 현재 목록에 없어 표시되지 않았어요.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* 다음 단계 예정 */}
            <section className="section">
              <h2>📝 내가 쓴 후기</h2>
              <p className="coming-soon">
                곧 제공될 예정이에요. 축제 상세에서 별점·후기를 남기면 여기에 모여요!
              </p>
            </section>

            <section className="section">
              <h2>📍 방문기록</h2>
              <p className="coming-soon">
                곧 제공될 예정이에요. 다녀온 축제를 기록할 수 있게 준비 중이에요.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">축제로 · 나만의 축제 페이지</div>
      </footer>
    </div>
  );
}
