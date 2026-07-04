"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import AccountMenu from "@/components/AccountMenu";

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

// Supabase 오류 메시지를 이해하기 쉬운 한글로 변환
function toKorean(message = "") {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (m.includes("already registered")) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (m.includes("at least 6")) return "비밀번호는 6자 이상이어야 해요.";
  if (m.includes("invalid format") || m.includes("valid email"))
    return "이메일 형식이 올바르지 않아요.";
  if (m.includes("email not confirmed"))
    return "메일 인증이 아직 안 됐어요. 받은 메일의 링크를 눌러주세요.";
  return message || "문제가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

export default function LoginPage() {
  const { configured, user, loading, signIn, signUp, signInWithKakao } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // 이미 로그인 상태면 홈으로
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

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
      setError("비밀번호는 8자 이상이며 영문·숫자·기호를 모두 포함해야 해요.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        router.push("/");
      } else {
        const data = await signUp(
          email,
          password,
          nickname.trim() || email.split("@")[0]
        );
        if (data?.session) {
          router.push("/"); // 이메일 확인이 꺼져 있으면 바로 로그인됨
        } else {
          setInfo(
            "가입 확인 메일을 보냈어요. 메일의 링크를 눌러 인증한 뒤 로그인해 주세요."
          );
        }
      }
    } catch (err) {
      setError(toKorean(err.message));
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

      <main className="container auth-wrap">
        <Link href="/" className="back-link">
          ← 홈으로
        </Link>

        <div className="auth-card">
          <h1 className="auth-title">
            {mode === "login" ? "로그인" : "회원가입"}
          </h1>

          {!configured ? (
            <p className="auth-note">
              회원 기능이 아직 설정되지 않았어요. (Supabase 키 등록 후 사용 가능)
            </p>
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
                  로그인
                </button>
                <button
                  className={`auth-tab ${mode === "signup" ? "active" : ""}`}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setInfo("");
                  }}
                >
                  회원가입
                </button>
              </div>

              <form className="auth-form" onSubmit={submit}>
                {mode === "signup" && (
                  <label className="auth-field">
                    <span>닉네임</span>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="축제러버"
                      maxLength={20}
                    />
                  </label>
                )}
                <label className="auth-field">
                  <span>이메일</span>
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
                  <span>비밀번호</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "signup"
                        ? "8자 이상, 영문·숫자·기호 포함"
                        : "비밀번호"
                    }
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>

                {mode === "signup" && (
                  <ul className="pw-rules" aria-label="비밀번호 규칙">
                    <li className={pwChecks.length ? "ok" : ""}>8자 이상</li>
                    <li className={pwChecks.letter ? "ok" : ""}>영문 포함</li>
                    <li className={pwChecks.number ? "ok" : ""}>숫자 포함</li>
                    <li className={pwChecks.symbol ? "ok" : ""}>기호 포함</li>
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
                    ? "처리 중…"
                    : mode === "login"
                    ? "로그인"
                    : "가입하고 시작하기"}
                </button>
              </form>

              <div className="auth-divider">
                <span>또는</span>
              </div>

              <button
                type="button"
                className="kakao-btn"
                onClick={async () => {
                  setError("");
                  try {
                    await signInWithKakao();
                  } catch (err) {
                    setError(toKorean(err.message));
                  }
                }}
              >
                <span className="kakao-icon">💬</span>
                카카오로 시작하기
              </button>

              <p className="auth-switch">
                {mode === "login" ? (
                  <>
                    계정이 없으신가요?{" "}
                    <button onClick={() => setMode("signup")}>회원가입</button>
                  </>
                ) : (
                  <>
                    이미 계정이 있으신가요?{" "}
                    <button onClick={() => setMode("login")}>로그인</button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <p className="auth-guest">
          로그인하지 않아도 모든 축제 정보는 그대로 이용할 수 있어요. 로그인은
          후기·방문기록 같은 개인 기능에만 필요해요.
        </p>
      </main>
    </div>
  );
}
