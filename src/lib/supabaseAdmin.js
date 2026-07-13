import "server-only"; // ⚠️ 서버에서만 — 클라이언트에 import하면 빌드 실패(service_role 보호)
import { createClient } from "@supabase/supabase-js";

// service_role 키를 쓰는 서버 전용 Supabase 클라이언트.
//  - 제출 저장(insert), 승인(update), 사진 서명 URL 발급 등에 사용.
//  - 절대 브라우저에 노출되지 않음 (NEXT_PUBLIC_ 아님 + server-only).

export const SUBMISSIONS_BUCKET = "festival-photos";

let cached = null;
export function getAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.startsWith("여기에")) return null; // 미설정이면 기능만 비활성
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
