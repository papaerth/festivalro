"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import AccountMenu from "@/components/AccountMenu";

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
  const { configured, user, loading, signIn, signUp } = useAuth();
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

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
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
                    placeholder="6자 이상"
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </label>

                {error && <p className="auth-error">{error}</p>}
                {info && <p className="auth-info">{info}</p>}

                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy
                    ? "처리 중…"
                    : mode === "login"
                    ? "로그인"
                    : "가입하고 시작하기"}
                </button>
              </form>

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
