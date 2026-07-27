"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 설치 유도 UI (다국어)
const TXT = {
  ko: { title: "홈 화면에 추가하고 앱처럼 쓰세요", body: "축제로를 앱처럼 빠르게 열 수 있어요.", install: "설치", later: "나중에", dontShow: "다시 보지 않기",
    iosTitle: "홈 화면에 추가하기", iosStep1: "아래 공유 버튼을 누르고", iosStep2: "‘홈 화면에 추가’를 선택하세요", share: "공유", addHome: "홈 화면에 추가" },
  en: { title: "Add to Home Screen, use it like an app", body: "Open Chukjero instantly, like a native app.", install: "Install", later: "Later", dontShow: "Don’t show again",
    iosTitle: "Add to Home Screen", iosStep1: "Tap the Share button below,", iosStep2: "then choose ‘Add to Home Screen’.", share: "Share", addHome: "Add to Home Screen" },
  ja: { title: "ホーム画面に追加してアプリのように", body: "チュッチェロをアプリのように素早く開けます。", install: "追加", later: "後で", dontShow: "今後表示しない",
    iosTitle: "ホーム画面に追加", iosStep1: "下の共有ボタンを押して", iosStep2: "「ホーム画面に追加」を選んでください", share: "共有", addHome: "ホーム画面に追加" },
  zh: { title: "添加到主屏幕，像应用一样使用", body: "像原生应用一样快速打开 Chukjero。", install: "安装", later: "稍后", dontShow: "不再显示",
    iosTitle: "添加到主屏幕", iosStep1: "点击下方的分享按钮，", iosStep2: "然后选择“添加到主屏幕”。", share: "分享", addHome: "添加到主屏幕" },
};
function txt(locale) { return TXT[locale] || TXT.en; }

const DISMISS_KEY = "pwa_dismiss";
const VISITS_KEY = "pwa_visits";

// iOS 공유 아이콘(네모+위 화살표) — 그림 안내용 인라인 SVG
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

export default function PWAInstall() {
  const { locale } = useI18n();
  const t = txt(locale);
  const [mode, setMode] = useState(null); // null | "android" | "ios"
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 이미 설치(스탠드얼론)면 표시 안 함
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return;
    // '다시 보지 않기' 눌렀으면 표시 안 함
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch {}
    if (dismissed) return;

    // 방문 횟수(세션 단위로 1회 증가) — 2회차부터 즉시 자격
    let visits = 1;
    try {
      if (!sessionStorage.getItem("pwa_counted")) {
        visits = (parseInt(localStorage.getItem(VISITS_KEY) || "0", 10) || 0) + 1;
        localStorage.setItem(VISITS_KEY, String(visits));
        sessionStorage.setItem("pwa_counted", "1");
      } else {
        visits = parseInt(localStorage.getItem(VISITS_KEY) || "1", 10) || 1;
      }
    } catch {}

    const ua = window.navigator.userAgent || "";
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    let captured = null;
    const onBIP = (e) => {
      e.preventDefault(); // 기본 미니 인포바 억제 → 우리 UI로 유도
      captured = e;
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);

    // 표시 시점: 방문 2회차 이상이면 바로, 아니면 체류 60초 후.
    const reveal = () => {
      if (captured) setMode("android");
      else if (isIOS) setMode("ios"); // iOS Safari는 beforeinstallprompt 없음 → 수동 안내
    };
    let timer = null;
    if (visits >= 2) timer = setTimeout(reveal, 1200); // 2회차: 살짝만 지연
    else timer = setTimeout(reveal, 60000); // 첫 방문: 60초 체류 후

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = (permanent) => {
    if (permanent) { try { localStorage.setItem(DISMISS_KEY, "1"); } catch {} }
    setMode(null);
  };

  const doInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null);
    setMode(null);
  };

  if (!mode) return null;

  if (mode === "android") {
    return (
      <div className="pwa-banner" role="dialog" aria-label={t.title}>
        <img className="pwa-banner-icon" src="/icon-192.png" alt="" width="40" height="40" />
        <div className="pwa-banner-text">
          <strong>{t.title}</strong>
          <span>{t.body}</span>
        </div>
        <div className="pwa-banner-actions">
          <button className="pwa-btn primary" onClick={doInstall}>{t.install}</button>
          <button className="pwa-btn ghost" onClick={() => dismiss(true)} aria-label={t.dontShow}>✕</button>
        </div>
      </div>
    );
  }

  // iOS 안내 시트
  return (
    <div className="pwa-sheet-backdrop" onClick={() => dismiss(false)}>
      <div className="pwa-sheet" role="dialog" aria-label={t.iosTitle} onClick={(e) => e.stopPropagation()}>
        <img className="pwa-sheet-icon" src="/icon-192.png" alt="" width="52" height="52" />
        <h3 className="pwa-sheet-title">{t.iosTitle}</h3>
        <ol className="pwa-sheet-steps">
          <li>
            <span className="pwa-step-visual"><ShareGlyph /></span>
            <span>{t.iosStep1} <b>{t.share}</b></span>
          </li>
          <li>
            <span className="pwa-step-visual pwa-step-plus">＋</span>
            <span>{t.iosStep2}</span>
          </li>
        </ol>
        <div className="pwa-sheet-actions">
          <button className="pwa-btn ghost" onClick={() => dismiss(true)}>{t.dontShow}</button>
          <button className="pwa-btn primary" onClick={() => dismiss(false)}>{t.later}</button>
        </div>
      </div>
    </div>
  );
}
