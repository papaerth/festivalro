"use client";

import { useEffect } from "react";

// 서비스 워커 등록 — https(또는 localhost)에서만. 실패는 조용히 무시(사이트 정상).
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const isSecure =
      window.isSecureContext ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (!isSecure) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    // 초기 로드에 영향 없도록 load 이후 등록
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
