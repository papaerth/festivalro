import HomeClient from "@/components/HomeClient";
import { getFestivals, localizeFestivals, isUsingSampleData } from "@/lib/festivals";
import { getPopularFestivals } from "@/lib/popular";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

// 홈 화면을 6시간마다 자동으로 다시 만들어(ISR) 최신 축제 데이터를 반영합니다.
//  - 이 값이 없으면 홈이 '배포 시점'에 굳어 재배포 전까지 안 바뀝니다.
//  - 방문자가 있으면 6시간 지난 뒤 첫 방문에서 백그라운드로 새로 고쳐집니다.
//  - 방문자가 없어도 하루 한 번 Vercel Cron(/api/cron/refresh)이 강제로 새로 고칩니다.
export const revalidate = 21600; // 6시간(초)

// 이 페이지는 서버에서 축제 데이터를 먼저 불러온 뒤,
// 화면 조작(필터/지도)은 HomeClient(브라우저)에 넘깁니다.
export default async function HomePage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;

  const festivals = await getFestivals();
  const usingSample = isUsingSampleData();

  // 현재 언어의 표시명(displayName)·시군구(displaySigungu)를 채움
  //  (TourAPI 공식 번역 → Google 번역[장기캐시] → 한국어+로마자). ko면 원문 그대로.
  const localized = await localizeFestivals(festivals, loc);

  // 다가오는 인기 축제(복합 점수: 블로그 글 수 등) → 카드별 점수 힌트맵
  const popular = await getPopularFestivals(localized);
  const popScoreById = Object.fromEntries(
    popular.map((f) => [f.id, f.popScore])
  );

  return (
    <HomeClient
      festivals={localized}
      usingSample={usingSample}
      popScoreById={popScoreById}
    />
  );
}
