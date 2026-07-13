import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAdmin, SUBMISSIONS_BUCKET } from "@/lib/supabaseAdmin";

// 사진 업로드용 '서명 업로드 URL' 발급 (서버 전용 service_role 사용).
//  브라우저는 이 URL로 Supabase Storage에 직접 업로드 → Vercel 요청 용량 한도(4.5MB)
//  를 우회하고, 진행률 표시도 가능. 파일은 서버를 거치지 않음.

const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const MAX = 10 * 1024 * 1024; // 장당 10MB

export async function POST(request) {
  const rl = rateLimit("submit", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "저장소가 아직 설정 전입니다." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const contentType = String(body.contentType || "");
  const size = Number(body.size || 0);
  if (!ALLOWED.includes(contentType)) {
    return NextResponse.json(
      { ok: false, error: "jpg·png·pdf 파일만 업로드할 수 있어요." },
      { status: 400 }
    );
  }
  if (size > MAX) {
    return NextResponse.json(
      { ok: false, error: "한 파일은 10MB 이하만 가능해요." },
      { status: 400 }
    );
  }

  const ext =
    contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
  const rand =
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const path = `submissions/${rand}.${ext}`;

  const { data, error } = await admin.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) {
    console.error("[upload-url]", error.message);
    return NextResponse.json({ ok: false, error: "업로드 URL 발급 실패" }, { status: 500 });
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SUBMISSIONS_BUCKET}/${path}`;
  return NextResponse.json({
    ok: true,
    path,
    token: data.token,
    signedUrl: data.signedUrl, // 클라이언트가 uploadToSignedUrl에 사용
    publicUrl,
  });
}
