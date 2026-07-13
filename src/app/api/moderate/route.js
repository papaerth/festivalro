import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/supabaseAdmin";
import { LOCALES, localeHref } from "@/lib/i18n";

// ────────────────────────────────────────────────────────────────
//  1클릭 게시/숨김 (운영자 전용)
//
//  매일 알림 메일의 "게시하기 / 숨기기" 링크가 이 주소를 엽니다.
//    GET /api/moderate?id=<uuid>&action=publish|hide&token=<랜덤토큰>
//
//  · 링크는 운영자 메일로만 발송되고, 각 제출마다 무작위 token으로 보호됩니다.
//  · 게시(published)되면 해당 축제 상세페이지가 자동으로 다시 만들어져(사이트 반영).
//  · service_role 키는 서버에서만 사용(브라우저 노출 없음).
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

function page(title, body, accent = "#2563eb") {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${title} · 축제로</title></head>` +
      `<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 16px">` +
      `<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:center">` +
      `<h1 style="font-size:20px;margin:0 0 12px;color:${accent}">${title}</h1>` +
      `<div style="font-size:15px;line-height:1.6;color:#334155">${body}</div>` +
      `<p style="margin-top:24px"><a href="https://chukjero.com" style="color:${accent};text-decoration:none;font-weight:600">축제로 홈으로 →</a></p>` +
      `</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request) {
  const admin = getAdmin();
  if (!admin) return page("설정 전", "저장소가 아직 설정되지 않았습니다.", "#dc2626");

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const action = searchParams.get("action") || "";
  const token = searchParams.get("token") || "";
  // 선택: 기존 축제에 '보충'으로 연결할 축제 id (알림 메일의 '보충 게시' 링크에 포함)
  const link = (searchParams.get("link") || "").replace(/[^A-Za-z0-9_-]/g, "");

  if (!id || !["publish", "hide"].includes(action) || !token) {
    return page("잘못된 링크", "링크가 올바르지 않습니다.", "#dc2626");
  }

  // 대상 제출 조회 (토큰 검증용)
  const { data: row, error: selErr } = await admin
    .from("submissions")
    .select("id, token, status, type, festival_id, festival_name")
    .eq("id", id)
    .maybeSingle();

  if (selErr || !row) return page("찾을 수 없음", "해당 제출을 찾을 수 없습니다.", "#dc2626");
  if (row.token !== token) return page("권한 없음", "링크의 보안 토큰이 일치하지 않습니다.", "#dc2626");

  const nextStatus = action === "publish" ? "published" : "hidden";
  // 게시 시 link가 오면 기존 축제에 연결(보충). 이미 연결돼 있으면 유지.
  const update = { status: nextStatus };
  if (action === "publish" && link && !row.festival_id) update.festival_id = link;

  const { error: updErr } = await admin.from("submissions").update(update).eq("id", id);
  if (updErr) return page("처리 실패", "상태 변경 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "#dc2626");

  // 최종 연결 상태(보충이면 축제 id, 아니면 새 축제)
  const linkedId = update.festival_id || row.festival_id || null;
  const isNew = !linkedId; // 연결된 축제 없음 → 새 축제

  // 사이트 반영: 연결된 축제 페이지, 또는 (새 축제면) 홈 + 전용 상세페이지
  for (const l of LOCALES) {
    if (linkedId) {
      revalidatePath(localeHref(l, `/festival/${linkedId}`));
    } else {
      revalidatePath(localeHref(l, "/")); // 홈 목록에 새 축제 노출
      revalidatePath(localeHref(l, `/festival/sub-${row.id}`));
    }
  }

  const name = row.festival_name || "(제목 없음)";
  if (action === "publish") {
    const body = isNew
      ? "<b>새 축제</b>로 게시했습니다.<br>전용 상세페이지가 생성되고 홈 목록에도 곧 나타납니다."
      : "<b>기존 축제에 보충</b>했습니다.<br>연결된 축제 페이지에 곧 반영됩니다.";
    return page("✅ 게시되었습니다", `<b>${escapeHtml(name)}</b> · ${body}`, "#16a34a");
  }
  return page("🙈 숨김 처리됨", `<b>${escapeHtml(name)}</b> 제출을 <b>숨김</b> 처리했습니다.`, "#64748b");
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
