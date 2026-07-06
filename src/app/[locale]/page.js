import HomeClient from "@/components/HomeClient";
import { getFestivals, getFestivalNameMap, isUsingSampleData } from "@/lib/festivals";
import { getPopularFestivals } from "@/lib/popular";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

// 이 페이지는 서버에서 축제 데이터를 먼저 불러온 뒤,
// 화면 조작(필터/지도)은 HomeClient(브라우저)에 넘깁니다.
export default async function HomePage({ params }) {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;

  const festivals = await getFestivals();
  const usingSample = isUsingSampleData();

  // 지원 언어면 TourAPI 다국어 이름으로 카드 제목을 번역(실패/미지원이면 {} → 한국어 유지)
  const nameMap = await getFestivalNameMap(loc);
  const localized =
    Object.keys(nameMap).length > 0
      ? festivals.map((f) =>
          nameMap[f.id] ? { ...f, displayName: nameMap[f.id] } : f
        )
      : festivals;

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
