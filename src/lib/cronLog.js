import "server-only";
import { getAdmin } from "./supabaseAdmin";

// ────────────────────────────────────────────────────────────────
//  크론 실행 이력 기록/조회 — Supabase `cron_runs` 테이블(선택).
//   · 테이블이 없으면 조용히 건너뜀(사이트/크론 정상). 마이그레이션은 supabase/schema.sql 참고.
//   · 관리자 리포트(/admin/report)에서 최근 갱신 이력을 표로 보여주는 데 사용.
// ────────────────────────────────────────────────────────────────

// 한 번의 크론 실행 결과를 기록. row: { ran_at, duration_ms, sources(jsonb), totals(jsonb) }
export async function logCronRun(row) {
  const admin = getAdmin();
  if (!admin) return;
  try {
    await admin.from("cron_runs").insert(row);
    // 테이블이 무한정 커지지 않도록 30일 지난 이력은 정리(best-effort)
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    await admin.from("cron_runs").delete().lt("ran_at", cutoff);
  } catch (e) {
    console.warn("[cron] 이력 기록 실패(무해 — cron_runs 테이블 미적용?):", e?.message);
  }
}

// 최근 크론 실행 이력 N건. 테이블 없으면 null(리포트에서 '미설정' 안내).
export async function getRecentCronRuns(limit = 10) {
  const admin = getAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("cron_runs")
      .select("ran_at,duration_ms,sources,totals")
      .order("ran_at", { ascending: false })
      .limit(limit);
    if (error) return null;
    return data || [];
  } catch {
    return null;
  }
}
