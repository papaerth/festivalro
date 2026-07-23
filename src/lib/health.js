import "server-only";
// ────────────────────────────────────────────────────────────────
//  외부 API 건강 감시 (하루 1회, refresh 크론이 겸사겸사 실행)
//
//  · 연동된 각 외부 API를 '가볍게' 한 번씩 호출해 정상 응답 여부만 확인합니다.
//    (목록 1건만 요청하거나, 키 검증용 최저비용 엔드포인트를 사용 → 호출량 최소)
//  · 결과를 Supabase api_health 테이블에 기록하고 '연속 실패일'을 셉니다.
//  · 어떤 소스가 이틀 연속 실패하면 운영자에게 Resend 메일로 1회 알림
//    (3일 쿨다운 — 매일 스팸 방지). 회복되면 카운터 리셋.
//  · 미설정(키 없음) 소스는 감시 대상에서 제외(회색), 알림도 없음.
//  · api_health 테이블이 없으면 추적/알림은 건너뛰고 라이브 점검만 동작(무해).
// ────────────────────────────────────────────────────────────────
import { getAdmin } from "./supabaseAdmin";

const DAY = 24 * 60 * 60 * 1000;
const ALERT_COOLDOWN = 3 * DAY; // 같은 장애로 3일 안엔 재알림 안 함

function isSet(v) {
  return !!v && !String(v).startsWith("여기에");
}
// 환경변수 값의 앞뒤 공백·개행 제거 (Vercel에 붙여넣을 때 흔히 섞임 — 앱 코드와 동일 처리)
function env(name) {
  return process.env[name]?.trim() || "";
}
function decodeKey(k) {
  const s = String(k || "").trim();
  try { return decodeURIComponent(s); } catch { return s; }
}
async function ping(url, opts = {}, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

// ── 소스별 정의: label(표시명) / configured(설정됨?) / check(경량 핑) ──
const CHECKS = [
  {
    key: "tour",
    label: "관광공사 TourAPI (축제·전시·공연)",
    configured: () => isSet(process.env.TOUR_API_KEY),
    async check() {
      const key = decodeKey(process.env.TOUR_API_KEY);
      const url =
        `https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${encodeURIComponent(key)}` +
        `&MobileOS=ETC&MobileApp=chukjero&_type=json&numOfRows=1&pageNo=1&arrange=A&eventStartDate=20260101`;
      const r = await ping(url);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const code = (await r.json())?.response?.header?.resultCode;
      return code === "0000" ? { ok: true } : { ok: false, detail: `resultCode ${code}` };
    },
  },
  {
    key: "standard",
    label: "전국문화축제 표준데이터",
    // 이 정부 호스트는 원래 응답이 느려 단기 실패가 잦음 → 7일 연속일 때만 메일 알림
    // (상태 표시등에는 그대로 빨강으로 표시됨). 기본 임계값은 2일.
    alertAfter: 7,
    configured: () => isSet(process.env.TOUR_API_KEY) && process.env.STANDARD_API_ENABLED !== "false",
    async check() {
      const key = decodeKey(process.env.TOUR_API_KEY);
      const base = process.env.STANDARD_API_BASE || "https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";
      // 이 호스트는 응답이 느릴 때가 있어 타임아웃을 넉넉히(15초) 줍니다.
      const r = await ping(`${base}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=1&type=json`, {}, 15000);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const code = (await r.json())?.response?.header?.resultCode;
      return code === "00" ? { ok: true } : { ok: false, detail: `resultCode ${code}` };
    },
  },
  {
    key: "seoul",
    label: "서울 열린데이터 (전시·공연)",
    configured: () => isSet(process.env.SEOUL_API_KEY),
    async check() {
      const host = process.env.SEOUL_API_HOST || "http://openapi.seoul.go.kr:8088";
      const r = await ping(`${host}/${env("SEOUL_API_KEY")}/json/culturalEventInfo/1/1/`);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const code = (await r.json())?.culturalEventInfo?.RESULT?.CODE;
      return code === "INFO-000" ? { ok: true } : { ok: false, detail: `code ${code}` };
    },
  },
  {
    key: "culture",
    label: "문화공공데이터광장 (전시·공연)",
    // 전용 키(CULTURE_API_KEY)를 넣으면 감시 대상. (예전 CULTURE_API_ENABLED=true+TOUR_API_KEY도 인정)
    //  ※ Vercel 값의 끝 공백/줄바꿈·대소문자에 관대하게(trim+소문자) — 강비교(=== "true") 금지
    configured: () =>
      isSet(process.env.CULTURE_API_KEY) ||
      ((process.env.CULTURE_API_ENABLED || "").trim().toLowerCase() === "true" &&
        isSet(process.env.TOUR_API_KEY)),
    async check() {
      const base = process.env.CULTURE_API_BASE || "https://apis.data.go.kr/B553457/cultureinfo/period2";
      // 앱과 동일하게 키 인코딩 정규화(디코딩 후 1회 인코딩)
      const key = encodeURIComponent(decodeKey(env("CULTURE_API_KEY") || env("TOUR_API_KEY")));
      const r = await ping(`${base}?serviceKey=${key}&from=20260101&to=20261231&cPage=1&rows=1&sortStdr=1`);
      const text = await r.text();
      // 정상: 레코드/필드가 있고 인증 에러가 아님
      const ok = r.ok && (text.includes("<perforList") || text.includes("<item") || text.includes("<title>"));
      return ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
  {
    key: "youtube",
    label: "유튜브 (영상 섹션)",
    configured: () => isSet(process.env.YOUTUBE_API_KEY),
    async check() {
      // i18nLanguages: 키 검증용 최저비용(쿼터 1) 엔드포인트
      const r = await ping(`https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&key=${env("YOUTUBE_API_KEY")}`);
      return r.ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
  {
    key: "naver",
    label: "네이버 (블로그 후기)",
    configured: () => isSet(process.env.NAVER_CLIENT_ID) && isSet(process.env.NAVER_CLIENT_SECRET),
    async check() {
      const r = await ping("https://openapi.naver.com/v1/search/blog.json?query=%EC%B6%95%EC%A0%9C&display=1", {
        headers: {
          "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID.trim(),
          "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET.trim(),
        },
      });
      return r.ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
  {
    key: "gtranslate",
    label: "Google 번역",
    configured: () => isSet(process.env.GOOGLE_TRANSLATE_API_KEY),
    async check() {
      // 실제 앱과 동일한 translate POST로 점검(languages 메타 엔드포인트는 키 제한 시 오탐).
      const r = await ping(`https://translation.googleapis.com/language/translate/v2?key=${env("GOOGLE_TRANSLATE_API_KEY")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: ["ok"], source: "ko", target: "en", format: "text" }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        const reason = t.match(/"message"\s*:\s*"([^"]+)"/)?.[1] || t.slice(0, 100);
        return { ok: false, detail: `HTTP ${r.status} ${reason}`.slice(0, 160) };
      }
      const ok = !!(await r.json())?.data?.translations?.length;
      return ok ? { ok: true } : { ok: false, detail: "no translation" };
    },
  },
  {
    key: "anthropic",
    label: "Claude AI 번역",
    configured: () => isSet(process.env.ANTHROPIC_API_KEY),
    async check() {
      // 모델 목록 GET: 키 검증용(토큰 소모 없음)
      const r = await ping("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" },
      });
      return r.ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
  {
    key: "supabase",
    label: "Supabase (회원·후기·등록저장)",
    configured: () => !!getAdmin(),
    async check() {
      const admin = getAdmin();
      // submissions 테이블 1행 조회로 연결 확인(service_role 접근 보장된 테이블)
      const { error } = await admin.from("submissions").select("id").limit(1);
      return error ? { ok: false, detail: error.message.slice(0, 120) } : { ok: true };
    },
  },
  {
    key: "resend",
    label: "Resend (알림 메일)",
    configured: () => isSet(process.env.RESEND_API_KEY),
    async check() {
      // domains GET: 메일을 보내지 않고 키만 검증
      const r = await ping("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}` },
      });
      return r.ok ? { ok: true } : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
];

// 소스별 알림 임계값(연속 실패일). 지정 없으면 기본 2일.
const ALERT_AFTER = Object.fromEntries(CHECKS.map((c) => [c.key, c.alertAfter || 2]));

// [공개] 감시 대상 소스 메타(표시명·임계값) — 어드민 페이지 참조용
export const HEALTH_SOURCES = CHECKS.map((c) => ({ key: c.key, label: c.label, alertAfter: c.alertAfter || 2 }));

// 각 소스를 한 번씩 점검. persist=true면 DB 기록 + 연속실패 갱신, sendAlerts=true면 알림.
export async function runHealthChecks({ persist = true, sendAlerts = true } = {}) {
  const results = await Promise.all(
    CHECKS.map(async (c) => {
      if (!c.configured()) return { key: c.key, label: c.label, status: "unconfigured", detail: "" };
      try {
        const r = await c.check();
        return { key: c.key, label: c.label, status: r.ok ? "ok" : "fail", detail: r.detail || "" };
      } catch (e) {
        return { key: c.key, label: c.label, status: "fail", detail: (e?.message || "error").slice(0, 160) };
      }
    })
  );

  if (persist) {
    try {
      await persistAndAlert(results, sendAlerts);
    } catch (e) {
      console.warn("[health] 기록/알림 단계 실패(무해):", e?.message);
    }
  }
  return results;
}

// 결과를 api_health에 upsert하고, 이틀 연속 실패 소스는 알림 목록에 모아 메일 발송.
async function persistAndAlert(results, sendAlerts) {
  const admin = getAdmin();
  if (!admin) return; // DB 없으면 추적/알림 건너뜀(라이브 점검만)
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const toAlert = [];

  for (const r of results) {
    if (r.status === "unconfigured") continue;
    // 이전 상태 조회 (테이블 없으면 error → 조용히 중단)
    const { data: prev, error: selErr } = await admin
      .from("api_health")
      .select("consecutive_fails,last_alert_at")
      .eq("source", r.key)
      .maybeSingle();
    if (selErr) {
      console.warn("[health] api_health 테이블 확인 실패(스키마 미적용?):", selErr.message);
      return; // 테이블 자체가 없으면 전체 추적 중단
    }

    const wasFails = prev?.consecutive_fails || 0;
    const fails = r.status === "ok" ? 0 : wasFails + 1;
    const lastAlert = prev?.last_alert_at ? new Date(prev.last_alert_at).getTime() : 0;
    const recentlyAlerted = lastAlert && nowMs - lastAlert < ALERT_COOLDOWN;

    const row = {
      source: r.key,
      label: r.label,
      ok: r.status === "ok",
      consecutive_fails: fails,
      detail: r.detail || null,
      last_checked_at: nowIso,
    };
    if (r.status === "ok") row.last_ok_at = nowIso;

    // 소스별 임계값(기본 2일, 표준데이터 7일) 연속 실패 + 최근 알림 없음 → 알림 대상
    const threshold = ALERT_AFTER[r.key] || 2;
    if (fails >= threshold && !recentlyAlerted) {
      toAlert.push({ ...r, fails });
      row.last_alert_at = nowIso;
    }
    await admin.from("api_health").upsert(row, { onConflict: "source" });
  }

  if (sendAlerts && toAlert.length > 0) await sendAlert(toAlert);
}

// 이틀 연속 실패 소스들을 Resend로 운영자에게 알림 (report/digest와 동일 방식)
async function sendAlert(failed) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.REPORT_TO_EMAIL?.trim();
  if (!isSet(apiKey) || !isSet(to)) return;

  const rows = failed
    .map(
      (f) =>
        `<li style="margin:6px 0"><b>${f.label}</b> — ${f.fails}일 연속 응답 없음` +
        (f.detail ? ` <span style="color:#94a3b8">(${escapeHtml(f.detail)})</span>` : "") +
        `</li>`
    )
    .join("");
  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6">` +
    `<h2 style="color:#dc2626;margin:0 0 8px">⚠️ 축제로 · API 상태 경고</h2>` +
    `<p style="color:#475569;margin:0 0 12px">아래 API가 <b>여러 날 연속</b> 응답하지 않습니다. <b>키 만료 또는 서비스 개편</b> 가능성이 있으니 확인이 필요합니다. (사이트는 나머지 소스로 정상 동작 중입니다.)</p>` +
    `<ul style="padding-left:20px">${rows}</ul>` +
    `<p style="color:#64748b;font-size:13px;margin-top:16px">키 재발급 방법은 저장소의 <b>RECOVERY.md</b>를, 실시간 상태는 <b>/admin/report</b> 페이지를 확인하세요.</p>` +
    `</div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "축제로 알림 <no-reply@chukjero.com>",
      to: [to],
      subject: `⚠️ [축제로] API ${failed.length}건 응답 없음 — 확인 필요`,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.warn("[health] 알림 메일 실패:", e?.message));
}

function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// [공개] 어드민 페이지용: 라이브 점검 결과 + DB의 연속실패/최근성공 정보 병합.
export async function getHealthReport() {
  const live = await runHealthChecks({ persist: false, sendAlerts: false });
  const admin = getAdmin();
  let db = {};
  if (admin) {
    try {
      const { data } = await admin.from("api_health").select("source,consecutive_fails,last_ok_at,last_checked_at");
      if (Array.isArray(data)) db = Object.fromEntries(data.map((d) => [d.source, d]));
    } catch {
      /* 테이블 없으면 라이브 결과만 */
    }
  }
  return live.map((r) => ({
    ...r,
    consecutiveFails: db[r.key]?.consecutive_fails ?? (r.status === "fail" ? 1 : 0),
    lastOkAt: db[r.key]?.last_ok_at || null,
    alertAfter: ALERT_AFTER[r.key] || 2,
  }));
}
