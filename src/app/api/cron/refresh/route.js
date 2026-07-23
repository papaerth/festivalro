import { revalidatePath } from "next/cache";
import { LOCALES, localeHref, SITE_URL } from "@/lib/i18n";
import { runHealthChecks } from "@/lib/health";
import { refreshAllSources } from "@/lib/festivals";
import { logCronRun } from "@/lib/cronLog";

// ────────────────────────────────────────────────────────────────
//  자동 갱신 파이프라인 (하루 1회 Vercel Cron이 호출 — 단일 크론이 모든 소스 관리)
//
//  하는 일(순서):
//   ① 모든 외부 소스를 한 번씩 호출해 서버 캐시를 최신으로 데움(refreshAllSources).
//      · 소스별 TTL이 곧 갱신 주기: 축제·전시·공연 12h(하루 2회) / 표준데이터 7d(주 1회).
//      · TTL이 안 지난 소스는 캐시 그대로(외부 호출 안 함) → 소스별 주기 자동 적용.
//      · 각 소스 독립 병렬 + 실패 시 2초 후 1회 재시도. 실패 소스는 직전 성공 데이터 유지.
//   ② 모든 언어(13개) 홈을 revalidate → 방문자 없어도 최신 데이터/뱃지로 다시 그려짐.
//   ③ 대표 페이지 1회 셀프 요청으로 재생성을 즉시 트리거(무방문 상태에서도 반영 보장).
//   ④ 외부 API 건강 점검(이틀 연속 실패 시 Resend 메일 알림).
//   ⑤ 실행 결과(소스별 수집 건수·소요시간·성공여부)를 cron_runs에 기록 → /admin/report 노출.
//
//  ※ 유튜브 영상·네이버 블로그·날씨는 방문 시 브라우저가 직접 부르며 각자 캐시(24h/6h)를
//     가지므로 여기서 갱신하지 않아도 항상 최신입니다.
//  ※ CRON_SECRET 이 설정돼 있으면 그 Bearer 토큰이 있는 요청만 허용합니다.
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 소스 수집(콜드스타트 포함) + 건강 점검을 함께 하므로 여유

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  // ① 소스 캐시 데우기 + ④ 건강 점검을 병렬로(서로 독립) — 전체 소요시간 단축.
  const [sourcesRes, healthRes] = await Promise.allSettled([
    refreshAllSources(),
    runHealthChecks({ persist: true, sendAlerts: true }),
  ]);

  const sources = sourcesRes.status === "fulfilled" ? sourcesRes.value : [];
  const healthResults = healthRes.status === "fulfilled" ? healthRes.value : [];

  // ② 모든 언어 홈 revalidate (최신 데이터·상태 뱃지 반영)
  for (const l of LOCALES) {
    revalidatePath(localeHref(l, "/"));
  }

  // ③ 대표 페이지(한국어 홈) 셀프 요청 → 무방문 상태에서도 즉시 재생성(best-effort, 비차단)
  try {
    const base = (SITE_URL || "https://chukjero.com").replace(/\/$/, "");
    await fetch(`${base}/ko`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    /* 셀프 요청 실패는 무해 — 다음 방문 시 재생성됨 */
  }

  const totals = {
    total_count: sources.reduce((a, s) => a + (s.count || 0), 0),
    ok_count: sources.filter((s) => s.ok).length,
    fail_count: sources.filter((s) => !s.ok).length,
    health_ok: healthResults.filter((r) => r.status === "ok").length,
    health_fail: healthResults.filter((r) => r.status === "fail").length,
  };
  const duration_ms = Date.now() - startedAt;

  // ⑤ 실행 이력 기록(cron_runs 테이블 없으면 조용히 건너뜀)
  await logCronRun({
    ran_at: new Date().toISOString(),
    duration_ms,
    sources: sources.map((s) => ({ key: s.key, count: s.count, ms: s.ms, ok: s.ok, error: s.error || null })),
    totals,
  });

  return Response.json({
    ok: true,
    refreshed: "home",
    locales: LOCALES.length,
    duration_ms,
    sources,
    totals,
  });
}
