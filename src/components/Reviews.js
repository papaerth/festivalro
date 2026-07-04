"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import StarRating from "./StarRating";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Reviews({ festivalId }) {
  const { user } = useAuth();
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
    setReviews(list.map((r) => ({ ...r, nickname: nameById[r.user_id] || "익명" })));
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
      setError("별점을 선택해 주세요.");
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
      setError("저장에 실패했어요: " + err.message);
      return;
    }
    await load();
  };

  const remove = async () => {
    if (!myReview) return;
    if (!window.confirm("후기를 삭제할까요?")) return;
    await supabase.from("reviews").delete().eq("id", myReview.id);
    setRating(0);
    setContent("");
    await load();
  };

  if (!supabase) {
    return <p className="coming-soon">후기 기능이 아직 설정되지 않았어요.</p>;
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
            <span className="review-count">· 후기 {reviews.length}개</span>
          </>
        ) : (
          <span className="review-count">아직 후기가 없어요. 첫 후기를 남겨보세요!</span>
        )}
      </div>

      {user ? (
        <form className="review-form" onSubmit={submit}>
          <div className="review-form-row">
            <span className="review-form-label">내 별점</span>
            <StarRating value={rating} onChange={setRating} size={28} />
          </div>
          <textarea
            className="review-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="이 축제 어땠나요? 후기를 남겨주세요 (선택)"
            maxLength={500}
            rows={3}
          />
          {error && <p className="auth-error">{error}</p>}
          <div className="review-form-actions">
            <button className="auth-submit review-submit" type="submit" disabled={busy}>
              {busy ? "저장 중…" : myReview ? "후기 수정" : "후기 등록"}
            </button>
            {myReview && (
              <button type="button" className="review-delete" onClick={remove}>
                삭제
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="review-login">
          <Link href="/login" className="account-login">
            로그인
          </Link>
          <span> 하고 별점·후기를 남겨보세요</span>
        </div>
      )}

      {loading ? (
        <p className="review-count" style={{ marginTop: "14px" }}>
          후기를 불러오는 중…
        </p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="review-item">
              <div className="review-head">
                <span className="review-name">
                  {r.nickname}
                  {user && r.user_id === user.id ? " (나)" : ""}
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
