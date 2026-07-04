"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

const AuthContext = createContext(null);

// 로그인 상태(user)와 프로필(닉네임)을 앱 전체에 제공합니다.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid) => {
    if (!supabase || !uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", uid)
      .maybeSingle();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const u = data.session?.user ?? null;
      setUser(u);
      loadProfile(u?.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      loadProfile(u?.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = async (email, password, nickname) => {
    if (!supabase) throw new Error("회원 기능이 아직 설정되지 않았어요.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    if (!supabase) throw new Error("회원 기능이 아직 설정되지 않았어요.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // 카카오 소셜 로그인 (카카오 화면으로 이동 후 다시 사이트로 돌아옴)
  const signInWithKakao = async () => {
    if (!supabase) throw new Error("회원 기능이 아직 설정되지 않았어요.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const updateNickname = async (nickname) => {
    if (!supabase || !user) throw new Error("로그인이 필요해요.");
    const { error } = await supabase
      .from("profiles")
      .update({ nickname })
      .eq("id", user.id);
    if (error) throw error;
    setProfile((p) => ({ ...(p || {}), nickname }));
  };

  // 화면에 표시할 이름 (프로필 닉네임 → 가입 시 닉네임 → 이메일 앞부분)
  const displayName =
    profile?.nickname ||
    user?.user_metadata?.nickname ||
    user?.email?.split("@")[0] ||
    "회원";

  const value = {
    configured: isSupabaseConfigured,
    user,
    profile,
    displayName,
    loading,
    signUp,
    signIn,
    signInWithKakao,
    signOut,
    updateNickname,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있어요.");
  return ctx;
}
