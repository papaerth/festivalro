import { revalidatePath } from "next/cache";
import { LOCALES, localeHref } from "@/lib/i18n";

// ────────────────────────────────────────────────────────────────
//  자동 새로고침 (하루 한 번 Vercel Cron이 호출)
//
//  홈 화면(모든 언어)을 강제로 다시 만들어 최신 축제 데이터가 반영되게 합니다.
//  → 방문자가 하루 종일 없어도 축제 목록/지도/카드뉴스가 자동으로 갱신됩니다.
//
//  ※ 유튜브 쇼츠·블로그 후기·날씨는 브라우저가 방문 시마다 새로 불러오므로
//     여기서 따로 갱신할 필요가 없습니다.
//  ※ 하는 일이 '화면 새로고침'뿐이라 무해하지만, Vercel에 CRON_SECRET 환경변수를
//     설정해두면 그 키가 있는 요청만 허용합니다(선택).
// ────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic"; // 항상 즉시 실행(캐시된 응답 방지)

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  // 홈(한국어 "/" + 각 언어 "/en", "/ja" …)을 새로 고침
  for (const l of LOCALES) {
    revalidatePath(localeHref(l, "/"));
  }

  return Response.json({ ok: true, refreshed: "home", locales: LOCALES.length });
}
