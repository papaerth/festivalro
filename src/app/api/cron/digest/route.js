import { getAdmin } from "@/lib/supabaseAdmin";
import { getFestivals } from "@/lib/festivals";

// ────────────────────────────────────────────────────────────────
//  매일 알림 다이제스트 (하루 한 번 Vercel Cron이 호출)
//
//  대기(pending) 중인 등록/제보를 모아 운영자 메일로 보냅니다.
//    · 오늘 새로 들어온 건수 + 전체 대기 건수 안내
//    · 각 건마다 [게시하기] / [숨기기] 1클릭 링크(토큰 포함)
//    · 대기 0건이면 메일을 보내지 않음(스팸 방지)
//
//  인증: CRON_SECRET 이 설정돼 있으면 Bearer 토큰 일치해야 실행.
//  발송: Resend (report 라우트와 동일 방식/발신 주소).
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const SITE = (process.env.SITE_URL || "https://chukjero.com").replace(/\/$/, "");

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moderateLink(id, token, action, link) {
  return (
    `${SITE}/api/moderate?id=${encodeURIComponent(id)}&action=${action}&token=${encodeURIComponent(token)}` +
    (link ? `&link=${encodeURIComponent(link)}` : "")
  );
}

// 중복 판정용 정규화 이름 (festivals.js와 동일 규칙)
function normName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[0-9]/g, "")
    .replace(/(축제|페스티벌|festival|문화제|엑스포|expo|행사)/g, "")
    .replace(/[^가-힣a-z]/g, "");
}

function fmtPeriod(s, e) {
  if (!s) return "(미입력)";
  return e && e !== s ? `${s} ~ ${e}` : s;
}

export async function GET(request) {
  // 크론 인증(선택)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = getAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.REPORT_TO_EMAIL?.trim();
  const mailReady = apiKey && !apiKey.startsWith("여기에") && to && !to.startsWith("여기에");

  // 대기 중인 제출 전체(최신순)
  const { data: rows, error } = await admin
    .from("submissions")
    .select("id, token, type, category, festival_id, festival_name, period_start, period_end, place, contact, manager_name, phone, email, message, photos, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[digest]", error.message);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }

  const pending = rows || [];
  if (pending.length === 0) {
    return Response.json({ ok: true, pending: 0, sent: false });
  }

  // 오늘(KST) 들어온 건수
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const todayKey = kst.toISOString().slice(0, 10); // YYYY-MM-DD (KST 기준)
  const todayCount = pending.filter((r) => {
    const c = new Date(new Date(r.created_at).getTime() + 9 * 3600 * 1000);
    return c.toISOString().slice(0, 10) === todayKey;
  }).length;

  if (!mailReady) {
    // 메일 미설정이어도 건수는 반환(수동 확인 가능)
    return Response.json({ ok: true, pending: pending.length, today: todayCount, sent: false });
  }

  // 기존 축제 목록 로드 → 각 제출이 '이미 있는 축제'인지 매칭 (진위 대조·보충 연결용)
  let festivals = [];
  try {
    festivals = await getFestivals();
  } catch {
    festivals = [];
  }
  const byId = new Map(festivals.map((f) => [f.id, f]));
  const byName = new Map();
  for (const f of festivals) {
    const k = normName(f.name);
    if (k.length > 1 && !byName.has(k)) byName.set(k, f);
  }
  const matchFestival = (r) => {
    if (r.festival_id && byId.has(r.festival_id)) return byId.get(r.festival_id);
    const k = normName(r.festival_name);
    return k.length > 1 ? byName.get(k) || null : null;
  };

  // 카드 목록 HTML
  const cards = pending
    .map((r) => {
      const isOrg = r.type === "organizer";
      const match = matchFestival(r);
      const title = esc(r.festival_name || "(제목 없음)");
      const kind = isOrg ? "🎪 담당자 등록" : `📣 주민 제보${r.category ? " · " + esc(r.category) : ""}`;
      const msg = r.message ? `<div style="margin:6px 0;color:#475569;white-space:pre-wrap">${esc(r.message).slice(0, 300)}</div>` : "";
      const photoN = Array.isArray(r.photos) ? r.photos.length : 0;
      const photoLine = photoN
        ? `<div style="margin:4px 0"><a href="${esc(r.photos[0])}" style="color:#2563eb">📷 사진 ${photoN}장 보기</a></div>`
        : "";
      const naver = `<a href="https://search.naver.com/search.naver?query=${encodeURIComponent(r.festival_name || "")}" style="color:#2563eb">🔎 네이버로 확인</a>`;

      // 담당자 연락처(운영자 전용) — 성명·전화·이메일. 구 데이터는 contact로 폴백.
      const cParts = [];
      if (r.manager_name) cParts.push(`👤 ${esc(r.manager_name)}`);
      if (r.phone) cParts.push(`☎ <a href="tel:${esc(r.phone)}" style="color:#2563eb">${esc(r.phone)}</a>`);
      if (r.email) cParts.push(`✉ <a href="mailto:${esc(r.email)}" style="color:#2563eb">${esc(r.email)}</a>`);
      if (!cParts.length && r.contact) cParts.push(esc(r.contact));
      const contactLine = cParts.length
        ? `<div style="margin:6px 0;font-size:13px;color:#334155;background:#f1f5f9;border-radius:6px;padding:5px 8px">${cParts.join(" · ")}</div>`
        : "";

      let banner, compare, pubLabel, pubLink;
      if (match) {
        // 이미 있는 축제 → 진위 대조 후 보충
        const existP = fmtPeriod(match.startDate, match.endDate);
        const existPlace = `${match.sido || ""} ${match.sigungu || ""}`.trim() || "(장소 정보 없음)";
        const subP = fmtPeriod(r.period_start, r.period_end);
        const subPlace = r.place ? esc(r.place) : "(미입력)";
        const dateWarn = r.period_start && match.startDate && r.period_start !== match.startDate ? " ⚠️" : "";
        banner = `<div style="font-size:12px;color:#0369a1;background:#e0f2fe;border-radius:6px;padding:4px 8px;display:inline-block;margin-bottom:6px">🔗 이미 있는 축제 — 대조 후 보충</div>`;
        compare =
          `<table style="font-size:13px;color:#475569;border-collapse:collapse;margin:6px 0">` +
          `<tr><td style="padding:2px 10px 2px 0;color:#94a3b8">항목</td><td style="padding:2px 12px">사이트 정보</td><td style="padding:2px 0">제출 정보</td></tr>` +
          `<tr><td style="padding:2px 10px 2px 0;color:#94a3b8">기간</td><td style="padding:2px 12px">${esc(existP)}</td><td style="padding:2px 0">${esc(subP)}${dateWarn}</td></tr>` +
          `<tr><td style="padding:2px 10px 2px 0;color:#94a3b8">장소</td><td style="padding:2px 12px">${esc(existPlace)}</td><td style="padding:2px 0">${subPlace}</td></tr>` +
          `</table>` +
          `<div style="margin:4px 0;font-size:13px"><a href="${SITE}/festival/${encodeURIComponent(match.id)}" style="color:#2563eb">🔗 기존 페이지 보기</a> · ${naver}</div>`;
        pubLabel = "✅ 보충 게시";
        pubLink = moderateLink(r.id, r.token, "publish", match.id);
      } else {
        // 사이트에 없는 새 축제 → 게시하면 전용 페이지 자동 생성
        const subP = fmtPeriod(r.period_start, r.period_end);
        const subPlace = r.place ? esc(r.place) : "(미입력)";
        banner = `<div style="font-size:12px;color:#9a3412;background:#ffedd5;border-radius:6px;padding:4px 8px;display:inline-block;margin-bottom:6px">🆕 새 축제 — 게시 시 상세페이지 생성</div>`;
        compare =
          `<div style="font-size:13px;color:#475569;margin:4px 0">📅 ${esc(subP)} · 📍 ${subPlace}</div>` +
          `<div style="margin:4px 0;font-size:13px">${naver}</div>`;
        pubLabel = "✅ 새 축제로 게시";
        pubLink = moderateLink(r.id, r.token, "publish");
      }
      const hide = moderateLink(r.id, r.token, "hide");

      return (
        `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:10px 0">` +
        `<div style="font-size:12px;color:#64748b;margin-bottom:4px">${kind}</div>` +
        banner +
        `<div style="font-size:16px;font-weight:700;color:#0f172a">${title}</div>` +
        compare +
        contactLine +
        msg +
        photoLine +
        `<div style="margin-top:10px">` +
        `<a href="${pubLink}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px;font-weight:700;margin-right:8px">${pubLabel}</a>` +
        `<a href="${hide}" style="display:inline-block;background:#f1f5f9;color:#475569;text-decoration:none;padding:8px 16px;border-radius:8px;font-weight:700">🙈 숨기기</a>` +
        `</div></div>`
      );
    })
    .join("");

  const html =
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto">` +
    `<h2 style="color:#2563eb;margin:0 0 4px">🎪 축제로 · 오늘의 등록/제보</h2>` +
    `<p style="color:#475569;margin:0 0 16px">오늘 새로 <b>${todayCount}건</b>, 대기 중 총 <b>${pending.length}건</b> 있습니다. 각 건이 <b>이미 있는 축제</b>인지 <b>새 축제</b>인지 표시했어요. 대조 후 게시/숨김하세요.</p>` +
    cards +
    `<p style="color:#94a3b8;font-size:12px;margin-top:20px">이 메일의 링크는 운영자 전용입니다. '보충 게시'는 기존 페이지에, '새 축제로 게시'는 새 상세페이지+홈 목록에 자동 반영됩니다.</p>` +
    `</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "축제로 알림 <no-reply@chukjero.com>",
        to: [to],
        subject: `[축제로] 오늘 ${todayCount}건 · 대기 ${pending.length}건`,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[digest] Resend", res.status, detail);
      return Response.json({ ok: false, error: "mail failed" }, { status: 502 });
    }
  } catch (e) {
    console.error("[digest] exception", e);
    return Response.json({ ok: false, error: "mail exception" }, { status: 502 });
  }

  return Response.json({ ok: true, pending: pending.length, today: todayCount, sent: true });
}
