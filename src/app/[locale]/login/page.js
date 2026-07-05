"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { useI18n } from "@/lib/I18nProvider";
import AccountMenu from "@/components/AccountMenu";

// 카카오 로그인 노출 여부.
//  - 카카오는 이메일(account_email) 사용에 '개인 비즈니스 정보 검수'가 필요해요.
//  - 검수가 끝나면 이 값을 true 로만 바꾸면 카카오 버튼이 다시 나옵니다.
const KAKAO_ENABLED = false;

// 비밀번호 보안 규칙: 8자 이상 + 영문 + 숫자 + 기호
const PW_SYMBOL = /[~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?]/;
function checkPassword(pw) {
  return {
    length: pw.length >= 8,
    letter: /[A-Za-z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: PW_SYMBOL.test(pw),
  };
}
function passwordOk(pw) {
  const c = checkPassword(pw);
  return c.length && c.letter && c.number && c.symbol;
}

// 언어별 문구
const AU = {
  ko: {
    backHome: "← 홈으로", login: "로그인", signup: "회원가입",
    notConfigured: "회원 기능이 아직 설정되지 않았어요. (Supabase 키 등록 후 사용 가능)",
    nickname: "닉네임", nicknamePh: "축제러버", email: "이메일",
    password: "비밀번호", pwPhSignup: "8자 이상, 영문·숫자·기호 포함", pwPhLogin: "비밀번호",
    pwRules: "비밀번호 규칙", rLen: "8자 이상", rLet: "영문 포함", rNum: "숫자 포함", rSym: "기호 포함",
    busy: "처리 중…", signupCta: "가입하고 시작하기",
    or: "또는", kakao: "카카오로 시작하기",
    noAccount: "계정이 없으신가요?", hasAccount: "이미 계정이 있으신가요?",
    guest: "로그인하지 않아도 모든 축제 정보는 그대로 이용할 수 있어요. 로그인은 후기·방문기록 같은 개인 기능에만 필요해요.",
    pwError: "비밀번호는 8자 이상이며 영문·숫자·기호를 모두 포함해야 해요.",
    signupInfo: "가입 확인 메일을 보냈어요. 메일의 링크를 눌러 인증한 뒤 로그인해 주세요.",
    errInvalidLogin: "이메일 또는 비밀번호가 올바르지 않아요.",
    errAlready: "이미 가입된 이메일이에요. 로그인해 주세요.",
    errShort: "비밀번호는 6자 이상이어야 해요.",
    errEmail: "이메일 형식이 올바르지 않아요.",
    errNotConfirmed: "메일 인증이 아직 안 됐어요. 받은 메일의 링크를 눌러주세요.",
    errDefault: "문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    backHome: "← Home", login: "Log in", signup: "Sign up",
    notConfigured: "Membership isn't set up yet. (Available once a Supabase key is added.)",
    nickname: "Nickname", nicknamePh: "FestivalLover", email: "Email",
    password: "Password", pwPhSignup: "8+ chars with letters, numbers & a symbol", pwPhLogin: "Password",
    pwRules: "Password rules", rLen: "8+ characters", rLet: "Has a letter", rNum: "Has a number", rSym: "Has a symbol",
    busy: "Working…", signupCta: "Sign up & start",
    or: "or", kakao: "Continue with Kakao",
    noAccount: "Don't have an account?", hasAccount: "Already have an account?",
    guest: "You can browse all festival info without logging in. An account is only needed for personal features like reviews and visit history.",
    pwError: "Password must be 8+ characters and include letters, numbers, and a symbol.",
    signupInfo: "We sent a confirmation email. Click the link in it, then log in.",
    errInvalidLogin: "Email or password is incorrect.",
    errAlready: "This email is already registered. Please log in.",
    errShort: "Password must be at least 6 characters.",
    errEmail: "That email address isn't valid.",
    errNotConfirmed: "Email not confirmed yet. Please click the link in your email.",
    errDefault: "Something went wrong. Please try again shortly.",
  },
  ja: {
    backHome: "← ホームへ", login: "ログイン", signup: "会員登録",
    notConfigured: "会員機能はまだ設定されていません。（Supabaseキー登録後に利用可能）",
    nickname: "ニックネーム", nicknamePh: "お祭り好き", email: "メール",
    password: "パスワード", pwPhSignup: "8文字以上・英字・数字・記号を含む", pwPhLogin: "パスワード",
    pwRules: "パスワード規則", rLen: "8文字以上", rLet: "英字を含む", rNum: "数字を含む", rSym: "記号を含む",
    busy: "処理中…", signupCta: "登録して始める",
    or: "または", kakao: "Kakaoで始める",
    noAccount: "アカウントをお持ちでないですか？", hasAccount: "すでにアカウントをお持ちですか？",
    guest: "ログインしなくてもすべてのお祭り情報をご利用いただけます。ログインはレビューや訪問記録など個人機能にのみ必要です。",
    pwError: "パスワードは8文字以上で、英字・数字・記号をすべて含める必要があります。",
    signupInfo: "確認メールを送信しました。メール内のリンクをクリックして認証後、ログインしてください。",
    errInvalidLogin: "メールまたはパスワードが正しくありません。",
    errAlready: "このメールは既に登録されています。ログインしてください。",
    errShort: "パスワードは6文字以上である必要があります。",
    errEmail: "メールアドレスの形式が正しくありません。",
    errNotConfirmed: "メール認証がまだです。受信したメールのリンクをクリックしてください。",
    errDefault: "問題が発生しました。しばらくしてからもう一度お試しください。",
  },
  zh: {
    backHome: "← 首页", login: "登录", signup: "注册",
    notConfigured: "会员功能尚未设置。（注册 Supabase 密钥后可用）",
    nickname: "昵称", nicknamePh: "庆典爱好者", email: "邮箱",
    password: "密码", pwPhSignup: "8位以上，含字母、数字和符号", pwPhLogin: "密码",
    pwRules: "密码规则", rLen: "8位以上", rLet: "含字母", rNum: "含数字", rSym: "含符号",
    busy: "处理中…", signupCta: "注册并开始",
    or: "或", kakao: "使用 Kakao 登录",
    noAccount: "还没有账号？", hasAccount: "已有账号？",
    guest: "无需登录即可浏览所有庆典信息。登录仅用于点评、访问记录等个人功能。",
    pwError: "密码需为8位以上，并同时包含字母、数字和符号。",
    signupInfo: "已发送确认邮件。请点击邮件中的链接完成验证后再登录。",
    errInvalidLogin: "邮箱或密码不正确。",
    errAlready: "该邮箱已注册，请直接登录。",
    errShort: "密码至少需要6位。",
    errEmail: "邮箱格式不正确。",
    errNotConfirmed: "邮箱尚未验证。请点击邮件中的链接。",
    errDefault: "出现问题，请稍后再试。",
  },
};

// Supabase 오류 메시지를 이해하기 쉬운 문구(언어별)로 변환
function toMessage(message = "", au) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return au.errInvalidLogin;
  if (m.includes("already registered")) return au.errAlready;
  if (m.includes("at least 6")) return au.errShort;
  if (m.includes("invalid format") || m.includes("valid email")) return au.errEmail;
  if (m.includes("email not confirmed")) return au.errNotConfirmed;
  return message || au.errDefault;
}

export default function LoginPage() {
  const { configured, user, loading, signIn, signUp, signInWithKakao } = useAuth();
  const { locale, href } = useI18n();
  const au = AU[locale] || AU.ko;
  const router = useRouter();
  const home = href("/");

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // 이미 로그인 상태면 홈으로
  useEffect(() => {
    if (!loading && user) router.replace(home);
  }, [loading, user, router, home]);

  // 헤더의 "회원가입" 버튼(?mode=signup)으로 들어오면 회원가입 탭으로 시작
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "signup") setMode("signup");
  }, []);

  const pwChecks = checkPassword(password);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "signup" && !passwordOk(password)) {
      setError(au.pwError);
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        router.push(home);
      } else {
        const data = await signUp(
          email,
          password,
          nickname.trim() || email.split("@")[0]
        );
        if (data?.session) {
          router.push(home); // 이메일 확인이 꺼져 있으면 바로 로그인됨
        } else {
          setInfo(au.signupInfo);
        }
      }
    } catch (err) {
      setError(toMessage(err.message, au));
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
          {au.backHome}
        </Link>

        <div className="auth-card">
          <h1 className="auth-title">
            {mode === "login" ? au.login : au.signup}
          </h1>

          {!configured ? (
            <p className="auth-note">{au.notConfigured}</p>
          ) : (
            <>
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${mode === "login" ? "active" : ""}`}
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setInfo("");
                  }}
                >
                  {au.login}
                </button>
                <button
                  className={`auth-tab ${mode === "signup" ? "active" : ""}`}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setInfo("");
                  }}
                >
                  {au.signup}
                </button>
              </div>

              <form className="auth-form" onSubmit={submit}>
                {mode === "signup" && (
                  <label className="auth-field">
                    <span>{au.nickname}</span>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={au.nicknamePh}
                      maxLength={20}
                    />
                  </label>
                )}
                <label className="auth-field">
                  <span>{au.email}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </label>
                <label className="auth-field">
                  <span>{au.password}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? au.pwPhSignup : au.pwPhLogin}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>

                {mode === "signup" && (
                  <ul className="pw-rules" aria-label={au.pwRules}>
                    <li className={pwChecks.length ? "ok" : ""}>{au.rLen}</li>
                    <li className={pwChecks.letter ? "ok" : ""}>{au.rLet}</li>
                    <li className={pwChecks.number ? "ok" : ""}>{au.rNum}</li>
                    <li className={pwChecks.symbol ? "ok" : ""}>{au.rSym}</li>
                  </ul>
                )}

                {error && <p className="auth-error">{error}</p>}
                {info && <p className="auth-info">{info}</p>}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={busy || (mode === "signup" && !passwordOk(password))}
                >
                  {busy
                    ? au.busy
                    : mode === "login"
                    ? au.login
                    : au.signupCta}
                </button>
              </form>

              {KAKAO_ENABLED && (
                <>
                  <div className="auth-divider">
                    <span>{au.or}</span>
                  </div>

                  <button
                    type="button"
                    className="kakao-btn"
                    onClick={async () => {
                      setError("");
                      try {
                        await signInWithKakao();
                      } catch (err) {
                        setError(toMessage(err.message, au));
                      }
                    }}
                  >
                    <span className="kakao-icon">💬</span>
                    {au.kakao}
                  </button>
                </>
              )}

              <p className="auth-switch">
                {mode === "login" ? (
                  <>
                    {au.noAccount}{" "}
                    <button onClick={() => setMode("signup")}>{au.signup}</button>
                  </>
                ) : (
                  <>
                    {au.hasAccount}{" "}
                    <button onClick={() => setMode("login")}>{au.login}</button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <p className="auth-guest">{au.guest}</p>
      </main>
    </div>
  );
}
