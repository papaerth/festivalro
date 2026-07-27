// 축제로 서비스 워커 — 가볍게: 정적 자산 캐싱(SWR) + 오프라인 폴백만.
//  · 데이터 API(/api/*)는 캐시하지 않음 → 기존 캐시(ISR·unstable_cache) 체계와 충돌 방지.
//  · 크로스오리진(타일·유튜브 등)도 건드리지 않음.
const CACHE = "chukjero-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // 크로스오리진: 그대로 통과
  if (url.pathname.startsWith("/api/")) return; // 데이터 API: 캐시 안 함(기존 캐시 존중)

  // 페이지 이동(문서): 네트워크 우선 → 실패 시 오프라인 폴백 페이지.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true }))
    );
    return;
  }

  // 정적 자산(_next/static, 이미지, 폰트, css/js): 캐시 우선 + 백그라운드 갱신(SWR).
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|css|js)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
