"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";

// 방문기록 토글. 로그인 사용자가 '방문함'을 켜고 끌 수 있어요(본인만).
export default function VisitButton({ festivalId }) {
  const { user, configured } = useAuth();
  const [visited, setVisited] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase
      .from("visits")
      .select("id")
      .eq("festival_id", festivalId)
      .eq("user_id", user.id)
      .limit(1);
    setVisited(Boolean(data && data.length));
  }, [festivalId, user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!configured) return null;

  if (!user) {
    return (
      <Link href="/login" className="visit-btn" title="로그인하고 방문기록">
        📍 방문기록
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    if (visited) {
      await supabase
        .from("visits")
        .delete()
        .eq("festival_id", festivalId)
        .eq("user_id", user.id);
      setVisited(false);
    } else {
      await supabase.from("visits").insert({
        festival_id: festivalId,
        user_id: user.id,
      });
      setVisited(true);
    }
    setBusy(false);
  };

  return (
    <button
      className={`visit-btn ${visited ? "active" : ""}`}
      onClick={toggle}
      disabled={busy}
    >
      {visited ? "✅ 방문함" : "📍 방문기록"}
    </button>
  );
}
