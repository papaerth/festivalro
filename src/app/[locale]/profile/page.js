"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";
import AccountMenu from "@/components/AccountMenu";

const PF = {
  ko: {
    backHome: "← 홈으로", title: "내 프로필",
    notConfigured: "회원 기능이 아직 설정되지 않았어요.", loading: "불러오는 중…",
    nickname: "닉네임", nicknamePh: "닉네임",
    saving: "저장 중…", saved: "✅ 저장됐어요", saveNick: "닉네임 저장",
    logout: "로그아웃", saveError: "저장에 실패했어요.",
  },
  en: {
    backHome: "← Home", title: "My profile",
    notConfigured: "Membership isn't set up yet.", loading: "Loading…",
    nickname: "Nickname", nicknamePh: "Nickname",
    saving: "Saving…", saved: "✅ Saved", saveNick: "Save nickname",
    logout: "Log out", saveError: "Failed to save.",
  },
  ja: {
    backHome: "← ホームへ", title: "プロフィール",
    notConfigured: "会員機能はまだ設定されていません。", loading: "読み込み中…",
    nickname: "ニックネーム", nicknamePh: "ニックネーム",
    saving: "保存中…", saved: "✅ 保存しました", saveNick: "ニックネームを保存",
    logout: "ログアウト", saveError: "保存に失敗しました。",
  },
  zh: {
    backHome: "← 首页", title: "我的资料",
    notConfigured: "会员功能尚未设置。", loading: "加载中…",
    nickname: "昵称", nicknamePh: "昵称",
    saving: "保存中…", saved: "✅ 已保存", saveNick: "保存昵称",
    logout: "退出登录", saveError: "保存失败。",
  },
};

export default function ProfilePage() {
  const { configured, user, profile, displayName, loading, updateNickname, signOut } =
    useAuth();
  const { locale, href } = useI18n();
  const pf = PF[locale] || PF.ko;
  const home = href("/");
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 로그인 안 되어 있으면 로그인 화면으로
  useEffect(() => {
    if (configured && !loading && !user) router.replace(href("/login"));
  }, [configured, loading, user, router, href]);

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
      setError(err.message || pf.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Link href={home} className="brand">
            축제로
          </Link>
          <div className="header-right">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container auth-wrap">
        <Link href={home} className="back-link">
          {pf.backHome}
        </Link>

        <div className="auth-card">
          <h1 className="auth-title">{pf.title}</h1>

          {!configured ? (
            <p className="auth-note">{pf.notConfigured}</p>
          ) : loading || !user ? (
            <p className="auth-note">{pf.loading}</p>
          ) : (
            <>
              <p className="profile-email">📧 {user.email}</p>
              <form className="auth-form" onSubmit={save}>
                <label className="auth-field">
                  <span>{pf.nickname}</span>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    placeholder={pf.nicknamePh}
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? pf.saving : saved ? pf.saved : pf.saveNick}
                </button>
              </form>

              <button className="profile-logout" onClick={signOut}>
                {pf.logout}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
