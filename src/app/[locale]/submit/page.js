import Link from "next/link";
import { localeHref, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import ReportForm from "@/components/ReportForm";

// 제보/문의 페이지 — 방문자가 운영자에게 의견을 보낼 수 있는 폼.
// 공문·홍보물용 대표 주소: /submit (지자체 발송 QR 링크가 여기를 가리킴)
const REP = {
  ko: {
    metaTitle: "제보하기 · 축제로",
    title: "제보하기",
    intro:
      "빠진 축제, 잘못된 정보, 개선 아이디어 등 무엇이든 알려 주세요. 보내주신 내용은 운영자에게 바로 전달됩니다.",
    back: "← 홈으로",
  },
  en: {
    metaTitle: "Send a report · Chukjero",
    title: "Send a report",
    intro:
      "Tell us about a missing festival, wrong info, or any idea to improve. Your message goes straight to the operator.",
    back: "← Home",
  },
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return { title: (REP[loc] || REP.en).metaTitle };
}

export default async function SubmitPage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const r = REP[loc] || REP.en;
  const home = localeHref(loc, "/");

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Link href={home} className="brand">
            축제로
          </Link>
        </div>
      </header>

      <main className="container legal">
        <h1 className="legal-title">{r.title}</h1>
        <p>{r.intro}</p>

        <ReportForm />

        <p className="legal-back">
          <Link href={home} className="popup-link">
            {r.back}
          </Link>
        </p>
      </main>
    </div>
  );
}
