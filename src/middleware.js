import { NextResponse } from "next/server";

// 지원 언어 (i18n.js와 동일). 미들웨어를 가볍게 유지하려고 여기선 상수만 사용.
const LOCALES = ["ko", "en", "ja", "zh"];
const DEFAULT_LOCALE = "ko";

// 경로에 언어 접두어(/en, /ja, /zh, /ko)가 없으면
// 내부적으로 /ko 로 rewrite 합니다. (주소창 URL은 '/' 그대로 유지 → 한국어 사이트 불변)
export function middleware(request) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (hasLocale) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // _next(정적자원)·api·파일(.확장자 포함) 은 제외
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
