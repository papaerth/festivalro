import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";

// 제목용 폰트: Black Han Sans
const blackHanSans = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-title",
  display: "swap",
});

// 본문용 폰트: Noto Sans KR
const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "축제로 — 전국 축제 지도",
  description:
    "대한민국 전국 시군구의 사계절 축제를 지도에서 한눈에. 날씨와 길찾기까지 한 번에 확인하세요.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C2578A",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${blackHanSans.variable} ${notoSansKr.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
