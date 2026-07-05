"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { useFavorites } from "@/lib/useFavorites";
import { useI18n } from "@/lib/I18nProvider";
import { supabase } from "@/lib/supabaseClient";
import AccountMenu from "./AccountMenu";
import FestivalCard from "./FestivalCard";
import StarRating from "./StarRating";

const MP = {
  ko: {
    backHome: "← 홈으로", pageSub: "님의 페이지",
    notConfigured: "회원 기능이 아직 설정되지 않았어요.", loading: "불러오는 중…",
    profile: "🙋 프로필", nickname: "닉네임", nicknamePh: "닉네임",
    saving: "저장 중…", saved: "✅ 저장됐어요", saveNick: "닉네임 저장", logout: "로그아웃",
    favs: "❤️ 즐겨찾기한 축제",
    favEmpty1: "아직 즐겨찾기한 축제가 없어요.", favEmpty2: "축제 카드의 🤍 하트를 눌러 담아보세요!",
    favHidden: (n) => `일부 즐겨찾기(${n}곳)는 현재 목록에 없어 표시되지 않았어요.`,
    reviews: "📝 내가 쓴 후기", reviewsEmpty: "아직 쓴 후기가 없어요. 축제 상세의 ⭐후기 탭에서 별점·후기를 남겨보세요!",
    visits: "📍 방문한 축제", visitsEmpty: "아직 방문기록이 없어요. 축제 상세의 📍방문기록 버튼으로 기록해보세요!",
    fallbackName: (fid) => `축제 #${fid}`, saveError: "저장에 실패했어요.",
    footer: "축제로 · 나만의 축제 페이지",
  },
  en: {
    backHome: "← Home", pageSub: "'s page",
    notConfigured: "Membership isn't set up yet.", loading: "Loading…",
    profile: "🙋 Profile", nickname: "Nickname", nicknamePh: "Nickname",
    saving: "Saving…", saved: "✅ Saved", saveNick: "Save nickname", logout: "Log out",
    favs: "❤️ Favorite festivals",
    favEmpty1: "No favorites yet.", favEmpty2: "Tap the 🤍 on a festival card to save it!",
    favHidden: (n) => `${n} favorite(s) aren't in the current list, so they're hidden.`,
    reviews: "📝 My reviews", reviewsEmpty: "No reviews yet. Leave a rating on the ⭐ Reviews tab of a festival.",
    visits: "📍 Festivals visited", visitsEmpty: "No visits yet. Use the 📍 Visit button on a festival page.",
    fallbackName: (fid) => `Festival #${fid}`, saveError: "Failed to save.",
    footer: "Chukjero · Your festival page",
  },
  ja: {
    backHome: "← ホームへ", pageSub: "さんのページ",
    notConfigured: "会員機能はまだ設定されていません。", loading: "読み込み中…",
    profile: "🙋 プロフィール", nickname: "ニックネーム", nicknamePh: "ニックネーム",
    saving: "保存中…", saved: "✅ 保存しました", saveNick: "ニックネームを保存", logout: "ログアウト",
    favs: "❤️ お気に入りのお祭り",
    favEmpty1: "まだお気に入りがありません。", favEmpty2: "お祭りカードの🤍を押して保存しましょう！",
    favHidden: (n) => `一部のお気に入り（${n}件）は現在のリストにないため表示されていません。`,
    reviews: "📝 書いたレビュー", reviewsEmpty: "まだレビューがありません。お祭り詳細の⭐レビュータブで評価を残しましょう！",
    visits: "📍 訪れたお祭り", visitsEmpty: "まだ訪問記録がありません。お祭り詳細の📍訪問ボタンで記録しましょう！",
    fallbackName: (fid) => `お祭り #${fid}`, saveError: "保存に失敗しました。",
    footer: "祝祭ロ · あなたのお祭りページ",
  },
  zh: {
    backHome: "← 首页", pageSub: " 的页面",
    notConfigured: "会员功能尚未设置。", loading: "加载中…",
    profile: "🙋 个人资料", nickname: "昵称", nicknamePh: "昵称",
    saving: "保存中…", saved: "✅ 已保存", saveNick: "保存昵称", logout: "退出登录",
    favs: "❤️ 收藏的庆典",
    favEmpty1: "还没有收藏的庆典。", favEmpty2: "点击庆典卡片上的🤍即可收藏！",
    favHidden: (n) => `部分收藏（${n} 个）不在当前列表中，因此未显示。`,
    reviews: "📝 我的点评", reviewsEmpty: "还没有点评。在庆典详情的⭐点评标签中评分吧！",
    visits: "📍 到访的庆典", visitsEmpty: "还没有访问记录。在庆典详情用📍访问按钮记录吧！",
    fallbackName: (fid) => `庆典 #${fid}`, saveError: "保存失败。",
    footer: "庆典路 · 你的庆典页面",
  },
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function MyPageClient({ festivals }) {
  const { configured, user, loading, displayName, updateNickname, signOut } =
    useAuth();
  const { favorites, ready } = useFavorites();
  const { locale, href } = useI18n();
  const mp = MP[locale] || MP.ko;
  const home = href("/");
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 로그인 안 되어 있으면 로그인으로
  useEffect(() => {
    if (configured && !loading && !user) router.replace(href("/login"));
  }, [configured, loading, user, router, href]);

  useEffect(() => {
    setNickname(displayName || "");
  }, [displayName]);

  const favFestivals = ready
    ? festivals.filter((f) => favorites.includes(f.id))
    : [];
  const hiddenFav = ready ? favorites.length - favFestivals.length : 0;

  // 내 후기 / 방문기록 불러오기
  const [myReviews, setMyReviews] = useState([]);
  const [myVisits, setMyVisits] = useState([]);
  useEffect(() => {
    if (!supabase || !user) return;
    let alive = true;
    (async () => {
      const { data: rv } = await supabase
        .from("reviews")
        .select("festival_id,rating,content,updated_at,created_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      const { data: vs } = await supabase
        .from("visits")
        .select("id,festival_id,visited_on,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!alive) return;
      setMyReviews(rv || []);
      setMyVisits(vs || []);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const nameOf = (fid) =>
    festivals.find((f) => f.id === fid)?.name || mp.fallbackName(fid);

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
      setError(err.message || mp.saveError);
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

      <main className="container">
        <Link href={home} className="back-link">
          {mp.backHome}
        </Link>

        <h1 className="mypage-title">
          👤 {displayName}
          <span className="mypage-title-sub">{mp.pageSub}</span>
        </h1>

        {!configured ? (
          <p className="auth-note">{mp.notConfigured}</p>
        ) : loading || !user ? (
          <p className="auth-note">{mp.loading}</p>
        ) : (
          <>
            {/* 프로필 */}
            <section className="section">
              <h2>{mp.profile}</h2>
              <div className="mypage-card">
                <p className="profile-email">📧 {user.email}</p>
                <form className="auth-form" onSubmit={saveNickname}>
                  <label className="auth-field">
                    <span>{mp.nickname}</span>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={20}
                      placeholder={mp.nicknamePh}
                    />
                  </label>
                  {error && <p className="auth-error">{error}</p>}
                  <button className="auth-submit" type="submit" disabled={busy}>
                    {busy ? mp.saving : saved ? mp.saved : mp.saveNick}
                  </button>
                </form>
                <button className="profile-logout" onClick={signOut}>
                  {mp.logout}
                </button>
              </div>
            </section>

            {/* 즐겨찾기 */}
            <section className="section">
              <h2 suppressHydrationWarning>
                {mp.favs}{ready && favFestivals.length > 0 ? ` ${favFestivals.length}` : ""}
              </h2>
              {favFestivals.length === 0 ? (
                <div className="empty">
                  {mp.favEmpty1}
                  <br />
                  {mp.favEmpty2}
                </div>
              ) : (
                <>
                  <div className="card-grid">
                    {favFestivals.map((f) => (
                      <FestivalCard key={f.id} festival={f} />
                    ))}
                  </div>
                  {hiddenFav > 0 && (
                    <p className="mypage-note">{mp.favHidden(hiddenFav)}</p>
                  )}
                </>
              )}
            </section>

            {/* 내가 쓴 후기 */}
            <section className="section">
              <h2>{mp.reviews} {myReviews.length > 0 ? myReviews.length : ""}</h2>
              {myReviews.length === 0 ? (
                <p className="coming-soon">{mp.reviewsEmpty}</p>
              ) : (
                <ul className="review-list">
                  {myReviews.map((r) => (
                    <li key={r.festival_id} className="review-item">
                      <div className="review-head">
                        <Link href={href(`/festival/${r.festival_id}`)} className="review-name">
                          {nameOf(r.festival_id)}
                        </Link>
                        <StarRating value={r.rating} readOnly size={14} />
                        <span className="review-date">
                          {fmtDate(r.updated_at || r.created_at)}
                        </span>
                      </div>
                      {r.content && <p className="review-content">{r.content}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 방문기록 */}
            <section className="section">
              <h2>{mp.visits} {myVisits.length > 0 ? myVisits.length : ""}</h2>
              {myVisits.length === 0 ? (
                <p className="coming-soon">{mp.visitsEmpty}</p>
              ) : (
                <ul className="visit-list">
                  {myVisits.map((v) => (
                    <li key={v.id}>
                      <Link href={href(`/festival/${v.festival_id}`)} className="visit-link">
                        <span className="visit-check">✅</span>
                        <span className="visit-name">{nameOf(v.festival_id)}</span>
                        <span className="review-date">
                          {fmtDate(v.visited_on || v.created_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">{mp.footer}</div>
      </footer>
    </div>
  );
}
