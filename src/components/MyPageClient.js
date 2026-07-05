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
  "zh-TW": { backHome: "← 首頁", pageSub: " 的頁面", notConfigured: "會員功能尚未設定。", loading: "載入中…", profile: "🙋 個人檔案", nickname: "暱稱", nicknamePh: "暱稱", saving: "儲存中…", saved: "✅ 已儲存", saveNick: "儲存暱稱", logout: "登出", favs: "❤️ 收藏的慶典", favEmpty1: "尚無收藏。", favEmpty2: "點擊慶典卡片上的 🤍 即可收藏！", favHidden: (n) => `有 ${n} 項收藏不在目前的清單中，因此已隱藏。`, reviews: "📝 我的評論", reviewsEmpty: "尚無評論。請在慶典的 ⭐ 評論分頁留下評分。", visits: "📍 已造訪的慶典", visitsEmpty: "尚無造訪記錄。請在慶典頁面使用 📍 造訪按鈕。", fallbackName: (fid) => `慶典 #${fid}`, saveError: "儲存失敗。", footer: "Chukjero · 您的慶典頁面" },
  es: { backHome: "← Inicio", pageSub: ", su página", notConfigured: "La membresía aún no está configurada.", loading: "Cargando…", profile: "🙋 Perfil", nickname: "Apodo", nicknamePh: "Apodo", saving: "Guardando…", saved: "✅ Guardado", saveNick: "Guardar apodo", logout: "Cerrar sesión", favs: "❤️ Festivales favoritos", favEmpty1: "Aún no tienes favoritos.", favEmpty2: "¡Toca el 🤍 en la tarjeta de un festival para guardarlo!", favHidden: (n) => `${n} favorito(s) no están en la lista actual, así que están ocultos.`, reviews: "📝 Mis reseñas", reviewsEmpty: "Aún no hay reseñas. Deja una valoración en la pestaña ⭐ Reseñas de un festival.", visits: "📍 Festivales visitados", visitsEmpty: "Aún no hay visitas. Usa el botón 📍 Visita en la página de un festival.", fallbackName: (fid) => `Festival n.º ${fid}`, saveError: "No se pudo guardar.", footer: "Chukjero · Tu página de festivales" },
  fr: { backHome: "← Accueil", pageSub: " — sa page", notConfigured: "L'adhésion n'est pas encore configurée.", loading: "Chargement…", profile: "🙋 Profil", nickname: "Pseudo", nicknamePh: "Pseudo", saving: "Enregistrement…", saved: "✅ Enregistré", saveNick: "Enregistrer le pseudo", logout: "Se déconnecter", favs: "❤️ Festivals favoris", favEmpty1: "Aucun favori pour l'instant.", favEmpty2: "Touchez le 🤍 sur une fiche de festival pour l'enregistrer !", favHidden: (n) => `${n} favori(s) ne figurent pas dans la liste actuelle, ils sont donc masqués.`, reviews: "📝 Mes avis", reviewsEmpty: "Aucun avis pour l'instant. Laissez une note dans l'onglet ⭐ Avis d'un festival.", visits: "📍 Festivals visités", visitsEmpty: "Aucune visite pour l'instant. Utilisez le bouton 📍 Visite sur la page d'un festival.", fallbackName: (fid) => `Festival n°${fid}`, saveError: "Échec de l'enregistrement.", footer: "Chukjero · Votre page de festivals" },
  ru: { backHome: "← На главную", pageSub: " — страница", notConfigured: "Членство ещё не настроено.", loading: "Загрузка…", profile: "🙋 Профиль", nickname: "Никнейм", nicknamePh: "Никнейм", saving: "Сохранение…", saved: "✅ Сохранено", saveNick: "Сохранить никнейм", logout: "Выйти", favs: "❤️ Избранные фестивали", favEmpty1: "Пока нет избранного.", favEmpty2: "Нажмите 🤍 на карточке фестиваля, чтобы сохранить его!", favHidden: (n) => `${n} избранных нет в текущем списке, поэтому они скрыты.`, reviews: "📝 Мои отзывы", reviewsEmpty: "Пока нет отзывов. Оставьте оценку на вкладке ⭐ Отзывы фестиваля.", visits: "📍 Посещённые фестивали", visitsEmpty: "Пока нет посещений. Используйте кнопку 📍 Посещение на странице фестиваля.", fallbackName: (fid) => `Фестиваль №${fid}`, saveError: "Не удалось сохранить.", footer: "Chukjero · Ваша страница фестивалей" },
  de: { backHome: "← Startseite", pageSub: "s Seite", notConfigured: "Die Mitgliedschaft ist noch nicht eingerichtet.", loading: "Wird geladen…", profile: "🙋 Profil", nickname: "Spitzname", nicknamePh: "Spitzname", saving: "Wird gespeichert…", saved: "✅ Gespeichert", saveNick: "Spitznamen speichern", logout: "Abmelden", favs: "❤️ Lieblingsfestivals", favEmpty1: "Noch keine Favoriten.", favEmpty2: "Tippe auf das 🤍 einer Festivalkarte, um es zu speichern!", favHidden: (n) => `${n} Favorit(en) sind nicht in der aktuellen Liste und werden daher ausgeblendet.`, reviews: "📝 Meine Bewertungen", reviewsEmpty: "Noch keine Bewertungen. Hinterlasse eine Bewertung im Tab ⭐ Bewertungen eines Festivals.", visits: "📍 Besuchte Festivals", visitsEmpty: "Noch keine Besuche. Nutze die Schaltfläche 📍 Besuch auf einer Festivalseite.", fallbackName: (fid) => `Festival #${fid}`, saveError: "Speichern fehlgeschlagen.", footer: "Chukjero · Deine Festivalseite" },
  ar: { backHome: "← الرئيسية", pageSub: " صفحة", notConfigured: "لم يتم إعداد العضوية بعد.", loading: "جارٍ التحميل…", profile: "🙋 الملف الشخصي", nickname: "الاسم المستعار", nicknamePh: "الاسم المستعار", saving: "جارٍ الحفظ…", saved: "✅ تم الحفظ", saveNick: "حفظ الاسم المستعار", logout: "تسجيل الخروج", favs: "❤️ المهرجانات المفضلة", favEmpty1: "لا توجد مفضلة بعد.", favEmpty2: "اضغط على 🤍 في بطاقة المهرجان لحفظه!", favHidden: (n) => `${n} من المفضلة غير موجودة في القائمة الحالية، لذا فهي مخفية.`, reviews: "📝 مراجعاتي", reviewsEmpty: "لا توجد مراجعات بعد. اترك تقييمًا في تبويب المراجعات ⭐ لأحد المهرجانات.", visits: "📍 المهرجانات التي تمت زيارتها", visitsEmpty: "لا توجد زيارات بعد. استخدم زر الزيارة 📍 في صفحة المهرجان.", fallbackName: (fid) => `مهرجان رقم ${fid}`, saveError: "فشل الحفظ.", footer: "Chukjero · صفحة مهرجاناتك" },
  vi: { backHome: "← Trang chủ", pageSub: " của trang", notConfigured: "Chức năng thành viên chưa được thiết lập.", loading: "Đang tải…", profile: "🙋 Hồ sơ", nickname: "Biệt danh", nicknamePh: "Biệt danh", saving: "Đang lưu…", saved: "✅ Đã lưu", saveNick: "Lưu biệt danh", logout: "Đăng xuất", favs: "❤️ Lễ hội yêu thích", favEmpty1: "Chưa có mục yêu thích.", favEmpty2: "Chạm vào 🤍 trên thẻ lễ hội để lưu!", favHidden: (n) => `${n} mục yêu thích không có trong danh sách hiện tại nên bị ẩn.`, reviews: "📝 Đánh giá của tôi", reviewsEmpty: "Chưa có đánh giá nào. Hãy để lại xếp hạng ở tab ⭐ Đánh giá của một lễ hội.", visits: "📍 Lễ hội đã đến", visitsEmpty: "Chưa có lượt đến nào. Dùng nút 📍 Đến trên trang lễ hội.", fallbackName: (fid) => `Lễ hội #${fid}`, saveError: "Lưu thất bại.", footer: "Chukjero · Trang lễ hội của bạn" },
  id: { backHome: "← Beranda", pageSub: " halaman", notConfigured: "Keanggotaan belum disiapkan.", loading: "Memuat…", profile: "🙋 Profil", nickname: "Nama panggilan", nicknamePh: "Nama panggilan", saving: "Menyimpan…", saved: "✅ Tersimpan", saveNick: "Simpan nama panggilan", logout: "Keluar", favs: "❤️ Festival favorit", favEmpty1: "Belum ada favorit.", favEmpty2: "Ketuk 🤍 pada kartu festival untuk menyimpannya!", favHidden: (n) => `${n} favorit tidak ada dalam daftar saat ini, jadi disembunyikan.`, reviews: "📝 Ulasan saya", reviewsEmpty: "Belum ada ulasan. Beri peringkat di tab ⭐ Ulasan pada suatu festival.", visits: "📍 Festival yang dikunjungi", visitsEmpty: "Belum ada kunjungan. Gunakan tombol 📍 Kunjungi di halaman festival.", fallbackName: (fid) => `Festival #${fid}`, saveError: "Gagal menyimpan.", footer: "Chukjero · Halaman festival Anda" },
  th: { backHome: "← หน้าแรก", pageSub: " หน้าของ", notConfigured: "ยังไม่ได้ตั้งค่าการเป็นสมาชิก", loading: "กำลังโหลด…", profile: "🙋 โปรไฟล์", nickname: "ชื่อเล่น", nicknamePh: "ชื่อเล่น", saving: "กำลังบันทึก…", saved: "✅ บันทึกแล้ว", saveNick: "บันทึกชื่อเล่น", logout: "ออกจากระบบ", favs: "❤️ เทศกาลที่ชื่นชอบ", favEmpty1: "ยังไม่มีรายการโปรด", favEmpty2: "แตะที่ 🤍 บนการ์ดเทศกาลเพื่อบันทึกไว้!", favHidden: (n) => `${n} รายการโปรดไม่อยู่ในรายการปัจจุบัน จึงถูกซ่อนไว้`, reviews: "📝 รีวิวของฉัน", reviewsEmpty: "ยังไม่มีรีวิว ให้คะแนนที่แท็บ ⭐ รีวิว ของเทศกาล", visits: "📍 เทศกาลที่เยี่ยมชมแล้ว", visitsEmpty: "ยังไม่มีการเยี่ยมชม ใช้ปุ่ม 📍 เยี่ยมชม บนหน้าเทศกาล", fallbackName: (fid) => `เทศกาล #${fid}`, saveError: "บันทึกไม่สำเร็จ", footer: "Chukjero · หน้าเทศกาลของคุณ" },
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
