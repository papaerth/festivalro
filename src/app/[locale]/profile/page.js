"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";
import AccountMenu from "@/components/AccountMenu";

const PF = {
  "zh-TW": { backHome: "← 首頁", title: "我的個人檔案", notConfigured: "會員功能尚未設定。", loading: "載入中…", nickname: "暱稱", nicknamePh: "暱稱", saving: "儲存中…", saved: "✅ 已儲存", saveNick: "儲存暱稱", logout: "登出", saveError: "儲存失敗。" },
  es: { backHome: "← Inicio", title: "Mi perfil", notConfigured: "La membresía aún no está configurada.", loading: "Cargando…", nickname: "Apodo", nicknamePh: "Apodo", saving: "Guardando…", saved: "✅ Guardado", saveNick: "Guardar apodo", logout: "Cerrar sesión", saveError: "No se pudo guardar." },
  fr: { backHome: "← Accueil", title: "Mon profil", notConfigured: "L'adhésion n'est pas encore configurée.", loading: "Chargement…", nickname: "Pseudo", nicknamePh: "Pseudo", saving: "Enregistrement…", saved: "✅ Enregistré", saveNick: "Enregistrer le pseudo", logout: "Se déconnecter", saveError: "Échec de l'enregistrement." },
  ru: { backHome: "← На главную", title: "Мой профиль", notConfigured: "Членство ещё не настроено.", loading: "Загрузка…", nickname: "Никнейм", nicknamePh: "Никнейм", saving: "Сохранение…", saved: "✅ Сохранено", saveNick: "Сохранить никнейм", logout: "Выйти", saveError: "Не удалось сохранить." },
  de: { backHome: "← Startseite", title: "Mein Profil", notConfigured: "Die Mitgliedschaft ist noch nicht eingerichtet.", loading: "Wird geladen…", nickname: "Spitzname", nicknamePh: "Spitzname", saving: "Wird gespeichert…", saved: "✅ Gespeichert", saveNick: "Spitznamen speichern", logout: "Abmelden", saveError: "Speichern fehlgeschlagen." },
  ar: { backHome: "← الرئيسية", title: "ملفي الشخصي", notConfigured: "لم يتم إعداد العضوية بعد.", loading: "جارٍ التحميل…", nickname: "الاسم المستعار", nicknamePh: "الاسم المستعار", saving: "جارٍ الحفظ…", saved: "✅ تم الحفظ", saveNick: "حفظ الاسم المستعار", logout: "تسجيل الخروج", saveError: "فشل الحفظ." },
  vi: { backHome: "← Trang chủ", title: "Hồ sơ của tôi", notConfigured: "Chức năng thành viên chưa được thiết lập.", loading: "Đang tải…", nickname: "Biệt danh", nicknamePh: "Biệt danh", saving: "Đang lưu…", saved: "✅ Đã lưu", saveNick: "Lưu biệt danh", logout: "Đăng xuất", saveError: "Lưu thất bại." },
  id: { backHome: "← Beranda", title: "Profil saya", notConfigured: "Keanggotaan belum disiapkan.", loading: "Memuat…", nickname: "Nama panggilan", nicknamePh: "Nama panggilan", saving: "Menyimpan…", saved: "✅ Tersimpan", saveNick: "Simpan nama panggilan", logout: "Keluar", saveError: "Gagal menyimpan." },
  th: { backHome: "← หน้าแรก", title: "โปรไฟล์ของฉัน", notConfigured: "ยังไม่ได้ตั้งค่าการเป็นสมาชิก", loading: "กำลังโหลด…", nickname: "ชื่อเล่น", nicknamePh: "ชื่อเล่น", saving: "กำลังบันทึก…", saved: "✅ บันทึกแล้ว", saveNick: "บันทึกชื่อเล่น", logout: "ออกจากระบบ", saveError: "บันทึกไม่สำเร็จ" },
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
