"use client";

import { createClient } from "@supabase/supabase-js";

// 브라우저용 Supabase 클라이언트.
//  - 키(URL/anon key)가 없으면 null → 회원 기능만 비활성화되고
//    축제 조회 등 나머지는 그대로 동작합니다.
//  - anon key는 공개되어도 되는 키입니다(보안은 DB의 RLS 규칙으로 보호).
// 환경변수에 실수로 앞뒤 공백/줄바꿈이 들어가도 안전하도록 정리
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// 유효한 https URL + 키가 있고, 자리표시자가 아닐 때만 활성화.
// (잘못된/자리표시자 값이면 회원 기능만 꺼지고 나머지는 정상 동작)
const looksValid =
  !!url &&
  !!anonKey &&
  /^https?:\/\//.test(url) &&
  !url.includes("여기에") &&
  !anonKey.includes("여기에");

let client = null;
if (looksValid) {
  try {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch {
    client = null;
  }
}

export const supabase = client;
export const isSupabaseConfigured = Boolean(client);
