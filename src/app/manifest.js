// Web App Manifest (Next.js App Router → /manifest.webmanifest)
//  · PWA 설치용. 다국어 사용자를 위해 이름은 한국어+로마자(Chukjero) 병기, 설명은 국/영 병기.
//  · 아이콘은 기존 로고(public/icon.svg)로 생성한 PNG(192/512/maskable).
export default function manifest() {
  return {
    name: "축제로 (Chukjero) — 전국 축제·공연·전시 지도",
    short_name: "축제로",
    description:
      "전국의 축제·공연·전시를 한 지도에서. 날씨·길찾기까지 한 번에. / Korea's festivals, shows & exhibitions on one map.",
    lang: "ko",
    dir: "ltr",
    start_url: "/?utm_source=pwa",
    id: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#1E8E85",
    categories: ["travel", "entertainment", "lifestyle", "maps"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
