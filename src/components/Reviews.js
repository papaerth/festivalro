"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";
import StarRating from "./StarRating";

const RV = {
  "zh-TW": { notReady: "評論功能尚未設定完成。", anon: "匿名", countSuffix: (n) => `· ${n} 則評論`, none: "尚無評論。搶先留下第一則吧！", myStar: "我的評分", placeholder: "這場慶典如何？留下評論（選填）", saving: "儲存中…", edit: "更新評論", submit: "發表評論", del: "刪除", login: "登入", loginTail: " 以留下評分與評論", loadingList: "正在載入評論…", me: "（我）", needStar: "請選擇評分。", saveFail: "儲存失敗：", confirmDel: "要刪除這則評論嗎？" },
  es: { notReady: "Las reseñas aún no están configuradas.", anon: "Anónimo", countSuffix: (n) => `· ${n} reseñas`, none: "Aún no hay reseñas. ¡Sé el primero!", myStar: "Mi valoración", placeholder: "¿Qué te pareció este festival? Deja una reseña (opcional)", saving: "Guardando…", edit: "Actualizar reseña", submit: "Publicar reseña", del: "Eliminar", login: "Iniciar sesión", loginTail: " para dejar una valoración y una reseña", loadingList: "Cargando reseñas…", me: " (yo)", needStar: "Elige una valoración.", saveFail: "No se pudo guardar: ", confirmDel: "¿Eliminar esta reseña?" },
  fr: { notReady: "Les avis ne sont pas encore configurés.", anon: "Anonyme", countSuffix: (n) => `· ${n} avis`, none: "Aucun avis pour l'instant. Soyez le premier !", myStar: "Ma note", placeholder: "Comment était ce festival ? Laissez un avis (facultatif)", saving: "Enregistrement…", edit: "Modifier l'avis", submit: "Publier l'avis", del: "Supprimer", login: "Se connecter", loginTail: " pour laisser une note et un avis", loadingList: "Chargement des avis…", me: " (moi)", needStar: "Veuillez choisir une note.", saveFail: "Échec de l'enregistrement : ", confirmDel: "Supprimer cet avis ?" },
  ru: { notReady: "Отзывы ещё не настроены.", anon: "Аноним", countSuffix: (n) => `· ${n} отзывов`, none: "Пока нет отзывов. Будьте первым!", myStar: "Моя оценка", placeholder: "Как вам этот фестиваль? Оставьте отзыв (необязательно)", saving: "Сохранение…", edit: "Обновить отзыв", submit: "Опубликовать отзыв", del: "Удалить", login: "Войти", loginTail: ", чтобы оставить оценку и отзыв", loadingList: "Загрузка отзывов…", me: " (я)", needStar: "Пожалуйста, выберите оценку.", saveFail: "Не удалось сохранить: ", confirmDel: "Удалить этот отзыв?" },
  de: { notReady: "Bewertungen sind noch nicht eingerichtet.", anon: "Anonym", countSuffix: (n) => `· ${n} Bewertungen`, none: "Noch keine Bewertungen. Sei der Erste!", myStar: "Meine Bewertung", placeholder: "Wie war dieses Festival? Hinterlasse eine Bewertung (optional)", saving: "Wird gespeichert…", edit: "Bewertung aktualisieren", submit: "Bewertung veröffentlichen", del: "Löschen", login: "Anmelden", loginTail: ", um eine Bewertung und Rezension zu hinterlassen", loadingList: "Bewertungen werden geladen…", me: " (ich)", needStar: "Bitte wähle eine Bewertung.", saveFail: "Speichern fehlgeschlagen: ", confirmDel: "Diese Bewertung löschen?" },
  ar: { notReady: "لم يتم إعداد المراجعات بعد.", anon: "مجهول", countSuffix: (n) => `· ${n} مراجعة`, none: "لا توجد مراجعات بعد. كن الأول!", myStar: "تقييمي", placeholder: "كيف كان هذا المهرجان؟ اترك مراجعة (اختياري)", saving: "جارٍ الحفظ…", edit: "تحديث المراجعة", submit: "نشر المراجعة", del: "حذف", login: "تسجيل الدخول", loginTail: " لترك تقييم ومراجعة", loadingList: "جارٍ تحميل المراجعات…", me: " (أنا)", needStar: "يرجى اختيار تقييم.", saveFail: "فشل الحفظ: ", confirmDel: "حذف هذه المراجعة؟" },
  vi: { notReady: "Chức năng đánh giá chưa được thiết lập.", anon: "Ẩn danh", countSuffix: (n) => `· ${n} đánh giá`, none: "Chưa có đánh giá nào. Hãy là người đầu tiên!", myStar: "Xếp hạng của tôi", placeholder: "Lễ hội này thế nào? Để lại đánh giá (tùy chọn)", saving: "Đang lưu…", edit: "Cập nhật đánh giá", submit: "Đăng đánh giá", del: "Xóa", login: "Đăng nhập", loginTail: " để để lại xếp hạng và đánh giá", loadingList: "Đang tải đánh giá…", me: " (tôi)", needStar: "Vui lòng chọn xếp hạng.", saveFail: "Lưu thất bại: ", confirmDel: "Xóa đánh giá này?" },
  id: { notReady: "Ulasan belum disiapkan.", anon: "Anonim", countSuffix: (n) => `· ${n} ulasan`, none: "Belum ada ulasan. Jadilah yang pertama!", myStar: "Peringkat saya", placeholder: "Bagaimana festival ini? Tinggalkan ulasan (opsional)", saving: "Menyimpan…", edit: "Perbarui ulasan", submit: "Kirim ulasan", del: "Hapus", login: "Masuk", loginTail: " untuk memberi peringkat dan ulasan", loadingList: "Memuat ulasan…", me: " (saya)", needStar: "Silakan pilih peringkat.", saveFail: "Gagal menyimpan: ", confirmDel: "Hapus ulasan ini?" },
  th: { notReady: "ยังไม่ได้ตั้งค่ารีวิว", anon: "ไม่ระบุชื่อ", countSuffix: (n) => `· ${n} รีวิว`, none: "ยังไม่มีรีวิว มาเป็นคนแรกสิ!", myStar: "คะแนนของฉัน", placeholder: "เทศกาลนี้เป็นอย่างไรบ้าง? เขียนรีวิว (ไม่บังคับ)", saving: "กำลังบันทึก…", edit: "อัปเดตรีวิว", submit: "โพสต์รีวิว", del: "ลบ", login: "เข้าสู่ระบบ", loginTail: " เพื่อให้คะแนนและเขียนรีวิว", loadingList: "กำลังโหลดรีวิว…", me: " (ฉัน)", needStar: "กรุณาเลือกคะแนน", saveFail: "บันทึกไม่สำเร็จ: ", confirmDel: "ลบรีวิวนี้ใช่ไหม?" },
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
