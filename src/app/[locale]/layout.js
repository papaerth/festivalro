import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import "../globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import { I18nProvider } from "@/lib/I18nProvider";
import { CardNewsProvider } from "@/components/CardNewsProvider";
import ScrollReveal from "@/components/ScrollReveal";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { Analytics } from "@vercel/analytics/react";
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  getDictionary,
  HTML_LANG,
  SITE_URL,
  localeHref,
  isRtl,
} from "@/lib/i18n";

const blackHanSans = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-title",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// 한국어(/) + 영어(/en)·일본어(/ja)·중국어(/zh) 를 정적 생성
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C2578A",
};

// 언어별 제목·설명 + hreflang(언어 버전 상호 연결)
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = getDictionary(loc);

  // 각 언어 홈 주소 (ko는 접두어 없음)
  const languages = {};
  for (const l of LOCALES) {
    languages[HTML_LANG[l]] = `${SITE_URL}${localeHref(l, "/")}`;
  }
  languages["x-default"] = `${SITE_URL}/`;

  return {
    metadataBase: new URL(SITE_URL),
    title: dict.meta.homeTitle,
    description: dict.meta.homeDesc,
    alternates: {
      canonical: `${SITE_URL}${localeHref(loc, "/")}`,
      languages,
    },
    openGraph: {
      title: dict.meta.homeTitle,
      description: dict.meta.homeDesc,
      url: `${SITE_URL}${localeHref(loc, "/")}`,
      locale: HTML_LANG[loc],
    },
  };
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;

  return (
    <html lang={HTML_LANG[loc]} dir={isRtl(loc) ? "rtl" : "ltr"}>
      <body className={`${blackHanSans.variable} ${notoSansKr.variable}`}>
        <GoogleAnalytics />
        <I18nProvider locale={loc}>
          <AuthProvider>
            <CardNewsProvider>{children}</CardNewsProvider>
            <ScrollReveal />
          </AuthProvider>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
