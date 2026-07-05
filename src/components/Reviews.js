"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";
import StarRating from "./StarRating";

const RV = {
  ko: {
    notReady: "후기 기능이 아직 설정되지 않았어요.", anon: "익명",
    countSuffix: (n) => `· 후기 ${n}개`, none: "아직 후기가 없어요. 첫 후기를 남겨보세요!",
    myStar: "내 별점", placeholder: "이 축제 어땠나요? 후기를 남겨주세요 (선택)",
    saving: "저장 중…", edit: "후기 수정", submit: "후기 등록", del: "삭제",
    login: "로그인", loginTail: " 하고 별점·후기를 남겨보세요",
    loadingList: "후기를 불러오는 중…", me: " (나)",
    needStar: "별점을 선택해 주세요.", saveFail: "저장에 실패했어요: ",
    confirmDel: "후기를 삭제할까요?",
  },
  en: {
    notReady: "Reviews aren't set up yet.", anon: "Anonymous",
    countSuffix: (n) => `· ${n} review${n === 1 ? "" : "s"}`, none: "No reviews yet. Be the first!",
    myStar: "My rating", placeholder: "How was this festival? Leave a review (optional)",
    saving: "Saving…", edit: "Update review", submit: "Post review", del: "Delete",
    login: "Log in", loginTail: " to leave a rating and review",
    loadingList: "Loading reviews…", me: " (me)",
    needStar: "Please choose a rating.", saveFail: "Failed to save: ",
    confirmDel: "Delete this review?",
  },
  ja: {
    notReady: "レビュー機能はまだ設定されていません。", anon: "匿名",
    countSuffix: (n) => `· レビュー${n}件`, none: "まだレビューがありません。最初のレビューをどうぞ！",
    myStar: "私の評価", placeholder: "このお祭りはどうでしたか？レビューをどうぞ（任意）",
    saving: "保存中…", edit: "レビューを更新", submit: "レビューを投稿", del: "削除",
    login: "ログイン", loginTail: "して評価・レビューを残しましょう",
    loadingList: "レビューを読み込み中…", me: "（自分）",
    needStar: "評価を選んでください。", saveFail: "保存に失敗しました: ",
    confirmDel: "レビューを削除しますか？",
  },
  zh: {
    notReady: "点评功能尚未设置。", anon: "匿名",
    countSuffix: (n) => `· ${n} 条点评`, none: "还没有点评，来写第一条吧！",
    myStar: "我的评分", placeholder: "这个庆典怎么样？写下你的点评（可选）",
    saving: "保存中…", edit: "修改点评", submit: "发布点评", del: "删除",
    login: "登录", loginTail: "后即可评分与点评",
    loadingList: "正在加载点评…", me: "（我）",
    needStar: "请选择评分。", saveFail: "保存失败： ",
    confirmDel: "要删除这条点评吗？",
  },
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Reviews({ festivalId }) {
  const { user } = useAuth();
  const { locale, href } = useI18n();
  const rv = RV[locale] || RV.ko;
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: revs } = await supabase
      .from("reviews")
      .select("id,user_id,rating,content,created_at,updated_at")
      .eq("festival_id", festivalId)
      .order("created_at", { ascending: false });

    const list = revs || [];
    // 작성자 닉네임을 한 번에 조회해 붙임
    const ids = [...new Set(list.map((r) => r.user_id))];
    let nameById = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,nickname")
        .in("id", ids);
      nameById = Object.fromEntries((profs || []).map((p) => [p.id, p.nickname]));
    }
    setReviews(list.map((r) => ({ ...r, nickname: nameById[r.user_id] || rv.anon })));
    setLoading(false);
  }, [festivalId]);

  useEffect(() => {
    load();
  }, [load]);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  // 내 후기가 있으면 폼 초기값으로 채움
  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setContent(myReview.content || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myReview?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!rating) {
      setError(rv.needStar);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.from("reviews").upsert(
      {
        festival_id: festivalId,
        user_id: user.id,
        rating,
        content: content.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "festival_id,user_id" }
    );
    setBusy(false);
    if (err) {
      setError(rv.saveFail + err.message);
      return;
    }
    await load();
  };

  const remove = async () => {
    if (!myReview) return;
    if (!window.confirm(rv.confirmDel)) return;
    await supabase.from("reviews").delete().eq("id", myReview.id);
    setRating(0);
    setContent("");
    await load();
  };

  if (!supabase) {
    return <p className="coming-soon">{rv.notReady}</p>;
  }

  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return (
    <div>
      <div className="review-summary">
        {reviews.length ? (
          <>
            <StarRating value={Math.round(avg)} readOnly size={18} />
            <b>{avg.toFixed(1)}</b>
            <span className="review-count">{rv.countSuffix(reviews.length)}</span>
          </>
        ) : (
          <span className="review-count">{rv.none}</span>
        )}
      </div>

      {user ? (
        <form className="review-form" onSubmit={submit}>
          <div className="review-form-row">
            <span className="review-form-label">{rv.myStar}</span>
            <StarRating value={rating} onChange={setRating} size={28} />
          </div>
          <textarea
            className="review-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={rv.placeholder}
            maxLength={500}
            rows={3}
          />
          {error && <p className="auth-error">{error}</p>}
          <div className="review-form-actions">
            <button className="auth-submit review-submit" type="submit" disabled={busy}>
              {busy ? rv.saving : myReview ? rv.edit : rv.submit}
            </button>
            {myReview && (
              <button type="button" className="review-delete" onClick={remove}>
                {rv.del}
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="review-login">
          <Link href={href("/login")} className="account-login">
            {rv.login}
          </Link>
          <span>{rv.loginTail}</span>
        </div>
      )}

      {loading ? (
        <p className="review-count" style={{ marginTop: "14px" }}>
          {rv.loadingList}
        </p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="review-item">
              <div className="review-head">
                <span className="review-name">
                  {r.nickname}
                  {user && r.user_id === user.id ? rv.me : ""}
                </span>
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
    </div>
  );
}
