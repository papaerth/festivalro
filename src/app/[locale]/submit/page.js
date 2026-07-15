import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { localeHref, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import SubmitForm from "@/components/SubmitForm";
import { getFestivals, getFestivalNameMap } from "@/lib/festivals";
import { matchSido } from "@/lib/regionsKr";

// 등록·제보 페이지 — 축제 담당자 등록 / 주민 제보 폼.
// 공문·홍보물용 대표 주소: /submit (지자체 발송 QR 링크가 여기를 가리킴)
export const revalidate = 21600; // 축제 목록(자동완성용)은 6시간마다 갱신

const REP = {
  ko: {
    metaTitle: "축제 등록·제보 · 축제로",
    title: "축제 등록 · 제보",
    intro:
      "축제 담당자는 정보를 등록하고, 주민·방문자는 제보를 남겨 주세요. 검토 후 축제 페이지에 반영됩니다.",
    back: "← 홈으로",
  },
  en: {
    metaTitle: "Register or report a festival · Chukjero",
    title: "Register · Report a festival",
    intro:
      "Organizers can register their festival; residents and visitors can send reports. Submissions appear after review.",
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

  // 자동완성용 축제 목록(가벼운 {id, name, displayName}만) — 기존 축제와 연결하는 데 사용
  const festivals = await getFestivals();
  const nameMap = await getFestivalNameMap(loc);
  const list = festivals.map((f) => ({
    id: f.id,
    name: f.name,
    displayName: nameMap[f.id] || f.name,
  }));

  // 등록 폼의 지역 선택용: 시도 key → 시군구 목록 (실데이터 기반)
  const sgSets = {};
  for (const f of festivals) {
    const sk = matchSido(f.sido || "");
    if (!sk || !f.sigungu) continue;
    (sgSets[sk] = sgSets[sk] || new Set()).add(f.sigungu);
  }
  const regionOptions = Object.fromEntries(
    Object.entries(sgSets).map(([k, s]) => [k, [...s].sort((a, b) => a.localeCompare(b, "ko"))])
  );

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <BrandLogo />
        </div>
      </header>

      <main className="container legal">
        <h1 className="legal-title">{r.title}</h1>
        <p>{r.intro}</p>

        <SubmitForm festivals={list} regionOptions={regionOptions} />

        <p className="legal-back">
          <Link href={home} className="popup-link">
            {r.back}
          </Link>
        </p>
      </main>
    </div>
  );
}
