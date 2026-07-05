import HomeClient from "@/components/HomeClient";
import { getFestivals, isUsingSampleData } from "@/lib/festivals";

// 이 페이지는 서버에서 축제 데이터를 먼저 불러온 뒤,
// 화면 조작(필터/지도)은 HomeClient(브라우저)에 넘깁니다.
export default async function HomePage() {
  const festivals = await getFestivals();
  const usingSample = isUsingSampleData();

  return <HomeClient festivals={festivals} usingSample={usingSample} />;
}
