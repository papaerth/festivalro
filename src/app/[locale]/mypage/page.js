import { getFestivals } from "@/lib/festivals";
import MyPageClient from "@/components/MyPageClient";

// 마이페이지 — 축제 카탈로그를 서버에서 받아, 개인 정보/즐겨찾기는
// 브라우저(MyPageClient)에서 처리합니다.
export const revalidate = 86400;

export default async function MyPage() {
  const festivals = await getFestivals();
  return <MyPageClient festivals={festivals} />;
}
