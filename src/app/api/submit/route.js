import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAdmin } from "@/lib/supabaseAdmin";

// 등록/제보 저장소.
//  - 담당자 등록(organizer) / 주민 제보(resident) 제출을 submissions 테이블에
//    status="pending"(대기)로 저장. 사진은 이미 Storage에 업로드된 공개 URL 배열.
//  - 게시/숨김을 1클릭으로 처리하기 위한 랜덤 토큰을 함께 저장.
//  - 실제 알림(건수)은 매일 스케줄러가 모아서 보냄.

function clip(s, max) {
  return String(s ?? "").trim().slice(0, max);
}
function dateOrNull(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? s : null;
}
function token() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export async function POST(request) {
  const rl = rateLimit("submit", request);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "저장소가 아직 설정 전입니다." });
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const type = b.type === "organizer" ? "organizer" : "resident";

  const photos = Array.isArray(b.photos)
    ? b.photos
        .filter((u) => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u.startsWith("http"))
        .slice(0, 10)
    : [];

  const row = {
    type,
    status: "pending",
    token: token(),
    festival_id: clip(b.festivalId, 40) || null,
    festival_name: clip(b.festivalName, 200) || null,
    period_start: dateOrNull(b.periodStart),
    period_end: dateOrNull(b.periodEnd),
    place: clip(b.place, 300) || null,
    organizer: clip(b.organizer, 200) || null,
    contact: clip(b.contact, 200) || null,
    intro: clip(b.intro, 1000) || null,
    timetable: clip(b.timetable, 4000) || null,
    lineup: clip(b.lineup, 2000) || null,
    parking: clip(b.parking, 2000) || null,
    shuttle: clip(b.shuttle, 2000) || null,
    food: clip(b.food, 2000) || null,
    experience: clip(b.experience, 2000) || null,
    etc: clip(b.etc, 2000) || null,
    category: clip(b.category, 40) || null,
    message: clip(b.message, 1000) || null,
    photos,
  };

  // 최소 검증: 주민 제보는 내용 5자 이상, 담당자 등록은 축제명 필수
  if (type === "resident" && (!row.message || row.message.length < 5)) {
    return NextResponse.json(
      { ok: false, error: "내용을 5자 이상 입력해 주세요." },
      { status: 400 }
    );
  }
  if (type === "organizer" && !row.festival_name) {
    return NextResponse.json(
      { ok: false, error: "축제명을 입력해 주세요." },
      { status: 400 }
    );
  }

  const { error } = await admin.from("submissions").insert(row);
  if (error) {
    console.error("[submit]", error.message);
    return NextResponse.json({ ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
