import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LUMEROVIA Studio", template: "%s · LUMEROVIA Studio" },
  description: "Where Memories Become Melodies — AI 음악 제작 스튜디오. 영어 제목·한국어 스토리·영어 가사·Suno 스타일 프롬프트를 한 흐름으로.",
  applicationName: "LUMEROVIA Studio",
};

export const viewport: Viewport = { themeColor: "#0B1B33", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+KR:wght@400;600&family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
