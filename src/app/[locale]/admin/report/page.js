import { notFound } from "next/navigation";
import { getHealthReport } from "@/lib/health";
import { getRecentCronRuns } from "@/lib/cronLog";

// ────────────────────────────────────────────────────────────────
//  운영자용 API 상태 페이지  (/admin/report)
//   · 연동된 외부 API를 지금 한 번씩 가볍게 호출해 초록/빨강/회색으로 표시.
//   · CRON_SECRET 이 설정돼 있으면 ?key=<CRON_SECRET> 이 맞아야 열립니다.
//     (설정 안 돼 있으면 그냥 열림 — 민감정보 없음, API 상태만 표시)
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic"; // 항상 실시간 점검
export const metadata = { robots: { index: false, follow: false } };

const DOT = { ok: "#16a34a", fail: "#dc2626", unconfigured: "#cbd5e1" };
const TEXT = {
  ok: { ko: "정상", label: "초록" },
  fail: { ko: "응답 없음", label: "빨강" },
  unconfigured: { ko: "미설정", label: "회색" },
};

function fmt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ") + " KST";
}

export default async function AdminReportPage({ searchParams }) {
  const sp = await searchParams;
  const secret = process.env.CRON_SECRET;
  if (secret && sp?.key !== secret) notFound(); // 잠금(선택)

  const [report, cronRuns] = await Promise.all([getHealthReport(), getRecentCronRuns(10)]);
  const okN = report.filter((r) => r.status === "ok").length;
  const failN = report.filter((r) => r.status === "fail").length;
  // 경고 배너는 소스별 알림 임계값(기본 2일, 표준데이터 7일) 이상일 때만
  const alerting = report.filter((r) => r.status === "fail" && (r.consecutiveFails || 0) >= (r.alertAfter || 2));

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>🩺 API 상태</h1>
      <p style={{ color: "#64748b", margin: "0 0 18px", fontSize: 14 }}>
        연동된 외부 API를 방금 한 번씩 확인했습니다. · 정상 <b style={{ color: "#16a34a" }}>{okN}</b> · 응답없음{" "}
        <b style={{ color: "#dc2626" }}>{failN}</b>
      </p>

      {alerting.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 14 }}>
          ⚠️ <b>{alerting.map((r) => `${r.label}(${r.consecutiveFails}일 연속)`).join(", ")}</b> — 알림 기준을 넘겨 응답이 없습니다. 키 만료·개편 가능성이 있어 확인이 필요합니다.
          (재발급 방법은 저장소 RECOVERY.md 참고)
        </div>
      )}

      {/* 상태 표시등 한 줄 요약 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {report.map((r) => (
          <span key={r.key} title={`${r.label}: ${TEXT[r.status].ko}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px", fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[r.status], display: "inline-block" }} />
            {r.label.split(" (")[0]}
          </span>
        ))}
      </div>

      {/* 상세 표 */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 12 }}>
            <th style={{ padding: "6px 8px" }}>상태</th>
            <th style={{ padding: "6px 8px" }}>API</th>
            <th style={{ padding: "6px 8px" }}>비고</th>
            <th style={{ padding: "6px 8px" }}>마지막 정상</th>
          </tr>
        </thead>
        <tbody>
          {report.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid #f1f5f9" }}>
              <td style={{ padding: "8px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[r.status], display: "inline-block", marginRight: 6 }} />
                {TEXT[r.status].ko}
                {r.status === "fail" && (r.consecutiveFails || 0) >= 2 ? ` (${r.consecutiveFails}일째)` : ""}
              </td>
              <td style={{ padding: "8px", fontWeight: 600 }}>{r.label}</td>
              <td style={{ padding: "8px", color: "#94a3b8", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.status === "unconfigured" ? "키 미설정(사용 안 함)" : r.detail || "—"}
              </td>
              <td style={{ padding: "8px", color: "#64748b" }}>{r.status === "unconfigured" ? "-" : fmt(r.lastOkAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 18 }}>
        🟢 정상 · 🔴 응답 없음(이틀 연속 시 메일 알림) · ⚪ 키 미설정. 자동 점검은 매일 1회(refresh 크론) 실행됩니다.
        어떤 API가 죽어도 사이트는 나머지 소스로 정상 동작합니다.
      </p>

      {/* ── 최근 자동 갱신 이력 (refresh 크론) ── */}
      <h2 style={{ fontSize: 18, margin: "30px 0 6px" }}>🔄 최근 자동 갱신 이력</h2>
      {cronRuns == null ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>
          이력 저장이 아직 설정되지 않았습니다. Supabase에 <code>cron_runs</code> 테이블을 만들면
          (저장소 <b>supabase/schema.sql</b> 참고) 여기에 최근 갱신 결과가 표시됩니다.
        </p>
      ) : cronRuns.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>아직 기록된 갱신 이력이 없습니다. (다음 크론 실행 후 표시)</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 12 }}>
              <th style={{ padding: "6px 8px" }}>실행 시각(KST)</th>
              <th style={{ padding: "6px 8px" }}>소요</th>
              <th style={{ padding: "6px 8px" }}>수집(성공/전체)</th>
              <th style={{ padding: "6px 8px" }}>소스별 건수</th>
            </tr>
          </thead>
          <tbody>
            {cronRuns.map((run, i) => {
              const t = run.totals || {};
              const srcs = Array.isArray(run.sources) ? run.sources : [];
              const failed = srcs.filter((s) => !s.ok);
              return (
                <tr key={i} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                  <td style={{ padding: "8px" }}>{fmt(run.ran_at)}</td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{Math.round((run.duration_ms || 0) / 100) / 10}s</td>
                  <td style={{ padding: "8px" }}>
                    <b>{t.total_count ?? "-"}</b>건 · {t.ok_count ?? "-"}/{(t.ok_count || 0) + (t.fail_count || 0)} 소스
                    {failed.length > 0 && (
                      <span style={{ color: "#dc2626" }}> · 실패 {failed.map((s) => s.key).join(",")}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 12 }}>
                    {srcs.map((s) => `${s.key} ${s.ok ? s.count : "✗"}`).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
