import Link from "next/link";
import { getDictionary, localeHref, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

const PRIV = {
  ko: {
    metaTitle: "개인정보처리방침 · 축제로",
    title: "개인정보처리방침",
    updated: "최종 업데이트: 2026-07-05",
    intro: "축제로(이하 “서비스”)는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수합니다. 본 방침은 서비스가 수집하는 정보와 이용 방법을 설명합니다.",
    h1: "1. 수집하는 항목",
    l1: ["회원가입·로그인 시: 이메일, 닉네임 (카카오 로그인 시 카카오가 제공하는 이메일·닉네임)", "서비스 이용 시: 작성한 후기·평점, 방문기록", "브라우저에 저장: 즐겨찾기 목록 (내 기기에만 저장, 서버 전송 안 함)"],
    h2: "2. 이용 목적",
    l2: ["회원 식별 및 로그인 유지", "후기·평점·방문기록 등 개인화 기능 제공", "서비스 운영 및 개선"],
    h3: "3. 보관 및 파기",
    p3: "회원 탈퇴 시 관련 개인정보(프로필, 후기, 방문기록)는 지체 없이 파기됩니다. 이용자는 언제든 계정 삭제를 요청할 수 있습니다.",
    h4: "4. 처리 위탁 및 제3자",
    l4: ["인증·데이터 저장: Supabase", "소셜 로그인: 카카오(Kakao)", "축제 정보: 한국관광공사 TourAPI / 지도·날씨 등 공개 API"],
    h5: "5. 이용자의 권리",
    p5: "이용자는 자신의 개인정보에 대한 열람·수정·삭제를 요청할 수 있으며, 프로필 화면에서 닉네임을 직접 수정하거나 계정 삭제를 요청할 수 있습니다.",
    h6: "6. 문의",
    p6: "개인정보 관련 문의: 서비스 운영자 이메일로 연락 주시기 바랍니다.",
    back: "← 홈으로",
  },
  en: {
    metaTitle: "Privacy Policy · Chukjero",
    title: "Privacy Policy",
    updated: "Last updated: 2026-07-05",
    intro: "Chukjero (“the Service”) values your privacy and complies with applicable laws. This policy explains what information the Service collects and how it is used.",
    h1: "1. Information we collect",
    l1: ["On sign-up/login: email, nickname (for Kakao login, the email/nickname Kakao provides)", "While using the Service: your reviews, ratings, and visit history", "Stored in your browser: your favorites list (kept only on your device, not sent to the server)"],
    h2: "2. How we use it",
    l2: ["Identifying members and keeping you logged in", "Providing personalized features such as reviews, ratings, and visit history", "Operating and improving the Service"],
    h3: "3. Retention and deletion",
    p3: "When you close your account, related personal data (profile, reviews, visit history) is deleted without delay. You may request account deletion at any time.",
    h4: "4. Processors and third parties",
    l4: ["Authentication & data storage: Supabase", "Social login: Kakao", "Festival info: Korea Tourism Organization TourAPI / public APIs for maps and weather"],
    h5: "5. Your rights",
    p5: "You may request to view, edit, or delete your personal data. You can edit your nickname directly on the profile page or request account deletion.",
    h6: "6. Contact",
    p6: "For privacy inquiries, please contact the Service operator by email.",
    back: "← Home",
  },
  ja: {
    metaTitle: "プライバシーポリシー · 祝祭ロ",
    title: "プライバシーポリシー",
    updated: "最終更新: 2026-07-05",
    intro: "祝祭ロ（以下「本サービス」）は利用者の個人情報を大切にし、関連法令を遵守します。本ポリシーは、本サービスが収集する情報とその利用方法を説明します。",
    h1: "1. 収集する項目",
    l1: ["会員登録・ログイン時: メール、ニックネーム（Kakaoログイン時はKakaoが提供するメール・ニックネーム）", "サービス利用時: 投稿したレビュー・評価、訪問記録", "ブラウザに保存: お気に入りリスト（端末内のみに保存、サーバーへ送信しません）"],
    h2: "2. 利用目的",
    l2: ["会員識別およびログイン維持", "レビュー・評価・訪問記録などの個人化機能の提供", "サービスの運営および改善"],
    h3: "3. 保管および破棄",
    p3: "退会時、関連する個人情報（プロフィール、レビュー、訪問記録）は遅滞なく破棄されます。利用者はいつでもアカウント削除を請求できます。",
    h4: "4. 処理委託および第三者",
    l4: ["認証・データ保存: Supabase", "ソーシャルログイン: Kakao", "お祭り情報: 韓国観光公社 TourAPI / 地図・天気などの公開API"],
    h5: "5. 利用者の権利",
    p5: "利用者は自身の個人情報の閲覧・修正・削除を請求でき、プロフィール画面でニックネームを直接修正、またはアカウント削除を請求できます。",
    h6: "6. お問い合わせ",
    p6: "個人情報に関するお問い合わせは、サービス運営者のメールまでご連絡ください。",
    back: "← ホームへ",
  },
  zh: {
    metaTitle: "隐私政策 · 庆典路",
    title: "隐私政策",
    updated: "最后更新：2026-07-05",
    intro: "庆典路（以下简称“本服务”）重视用户的个人信息，并遵守相关法律法规。本政策说明本服务收集的信息及其使用方式。",
    h1: "1. 收集的信息",
    l1: ["注册·登录时：邮箱、昵称（使用 Kakao 登录时为 Kakao 提供的邮箱·昵称）", "使用服务时：所写的点评·评分、访问记录", "保存在浏览器：收藏列表（仅保存在你的设备，不发送到服务器）"],
    h2: "2. 使用目的",
    l2: ["识别会员并保持登录", "提供点评·评分·访问记录等个性化功能", "运营及改进服务"],
    h3: "3. 保存与销毁",
    p3: "注销会员时，相关个人信息（资料、点评、访问记录）将立即销毁。用户可随时申请删除账号。",
    h4: "4. 委托处理及第三方",
    l4: ["认证·数据存储：Supabase", "社交登录：Kakao", "庆典信息：韩国观光公社 TourAPI / 地图·天气等公开 API"],
    h5: "5. 用户权利",
    p5: "用户可申请查阅·修改·删除本人的个人信息，并可在资料页面直接修改昵称或申请删除账号。",
    h6: "6. 咨询",
    p6: "个人信息相关咨询，请通过服务运营者邮箱联系。",
    back: "← 首页",
  },
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return { title: (PRIV[loc] || PRIV.en).metaTitle };
}

export default async function PrivacyPage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const p = PRIV[loc] || PRIV.en;
  const home = localeHref(loc, "/");

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Link href={home} className="brand">
            축제로
          </Link>
        </div>
      </header>

      <main className="container legal">
        <h1 className="legal-title">{p.title}</h1>
        <p className="legal-updated">{p.updated}</p>

        <p>{p.intro}</p>

        <h2>{p.h1}</h2>
        <ul>
          {p.l1.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>

        <h2>{p.h2}</h2>
        <ul>
          {p.l2.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>

        <h2>{p.h3}</h2>
        <p>{p.p3}</p>

        <h2>{p.h4}</h2>
        <ul>
          {p.l4.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>

        <h2>{p.h5}</h2>
        <p>{p.p5}</p>

        <h2>{p.h6}</h2>
        <p>{p.p6}</p>

        <p className="legal-back">
          <Link href={home} className="popup-link">
            {p.back}
          </Link>
        </p>
      </main>
    </div>
  );
}
