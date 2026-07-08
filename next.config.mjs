/** @type {import('next').NextConfig} */

// 모든 페이지 응답에 붙는 표준 보안 헤더.
//  - 클릭재킹(우리 사이트를 남의 iframe에 넣어 속이는 공격) 방지
//  - MIME 스니핑 방지, 리퍼러 최소 노출, HTTPS 강제 등
//  ※ 기능을 깨지 않는 안전한 표준값만 사용(엄격한 CSP는 지도/영상/이미지가
//    막힐 수 있어 제외). geolocation 은 '길찾기' 기능이 쓰므로 self 는 허용.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // 모든 경로에 적용
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
