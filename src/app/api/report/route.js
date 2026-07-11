import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ────────────────────────────────────────────────────────────────
//  제보(문의) 접수소 — 방문자가 보낸 제보를 운영자 이메일로 전송
//
//  .env.local 에 RESEND_API_KEY 가 있으면 Resend로 메일을 보내고,
//  받는 주소는 REPORT_TO_EMAIL(없으면 발송 계정 확인 필요)로 갑니다.
//
//  키가 없으면 { configured:false } 를 돌려주고, 화면은 '설정 전'
//  안내를 보여줍니다. (키 발급 후 자동 전환)
//
//  ▸ Resend 무료 플랜: 도메인 인증 전에는 보내는 주소를
//    onboarding@resend.dev 로만, 받는 주소는 'Resend 가입 이메일'로만
//    보낼 수 있습니다. (도메인 인증하면 아무 주소로나 발송 가능)
// ────────────────────────────────────────────────────────────────

// 입력값 정리(과도한 길이 컷 + 앞뒤 공백 제거)
function clip(s, max) {
  return String(s ?? "").trim().slice(0, max);
}

// HTML 메일에 값을 안전하게 넣기 위한 이스케이프
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request) {
  // 남용 방지: 같은 IP가 1분에 너무 많이 보내면 잠시 차단
  const rl = rateLimit("report", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  // 환경변수에 실수로 앞뒤 공백·BOM(﻿, 보이지 않는 문자)이 섞여도
  // 안전하도록 정리. (일부 도구가 값 저장 시 BOM을 앞에 붙이는 경우가 있어,
  // 그대로 HTTP 헤더에 넣으면 ByteString 변환 오류가 납니다.)
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.REPORT_TO_EMAIL?.trim();

  // 키/받는주소가 없으면 화면이 '설정 전' 안내로 대체되도록 알려줌
  if (!apiKey || apiKey.startsWith("여기에") || !to || to.startsWith("여기에")) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  // 입력 파싱
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const category = clip(body.category, 40) || "기타";
  const message = clip(body.message, 4000);
  const contact = clip(body.contact, 200); // 답장 받을 이메일(선택)

  if (message.length < 5) {
    return NextResponse.json(
      { ok: false, error: "내용을 5자 이상 입력해 주세요." },
      { status: 400 }
    );
  }

  // 제보자가 이메일을 남겼고 형식이 맞으면 '답장(reply-to)'으로 넣어줌
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);

  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">` +
    `<h2 style="margin:0 0 12px">🎪 축제로 새 제보</h2>` +
    `<p><b>유형:</b> ${esc(category)}</p>` +
    `<p><b>연락처:</b> ${validEmail ? esc(contact) : "(미입력)"}</p>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:12px 0">` +
    `<p style="white-space:pre-wrap">${esc(message)}</p>` +
    `</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "축제로 제보 <onboarding@resend.dev>",
        to: [to],
        subject: `[축제로 제보] ${category}`,
        ...(validEmail ? { reply_to: contact } : {}),
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Resend가 준 오류 메시지를 로그로 남기고, 사용자에겐 일반 안내
      const detail = await res.text().catch(() => "");
      console.error("[report] Resend 오류", res.status, detail);
      return NextResponse.json(
        { ok: false, error: "전송에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[report] 전송 예외", e);
    return NextResponse.json(
      { ok: false, error: "전송 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}
