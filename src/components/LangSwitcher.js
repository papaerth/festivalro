"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, localeHref } from "@/lib/i18n";
import { useI18n } from "@/lib/I18nProvider";

const LABELS = {
  "zh-TW": "繁體中文",
  es: "Español",
  fr: "Français",
  ru: "Русский",
  de: "Deutsch",
  ar: "العربية",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  th: "ไทย", ko: "한국어", en: "English", ja: "日本語", zh: "简体中文" };
const SHORT = {
  "zh-TW": "繁",
  es: "ES",
  fr: "FR",
  ru: "RU",
  de: "DE",
  ar: "AR",
  vi: "VI",
  id: "ID",
  th: "TH", ko: "KO", en: "EN", ja: "JA", zh: "ZH" };

// 현재 페이지의 다른 언어 버전으로 이동하는 전환기 (같은 경로 유지)
export default function LangSwitcher() {
  const pathname = usePathname() || "/";
  const { locale } = useI18n();

  // 현재 경로에서 언어 접두어를 떼어 '순수 경로'로.
  //  ⚠️ 기본 언어(ko)도 벗겨야 함 — /ko 경로에서 ko를 안 떼면
  //     localeHref(en, "/ko") = "/en/ko" 처럼 언어코드가 이중으로 붙는 버그가 생김.
  let bare = pathname;
  for (const l of LOCALES) {
    if (pathname === `/${l}`) {
      bare = "/";
      break;
    }
    if (pathname.startsWith(`/${l}/`)) {
      bare = pathname.slice(l.length + 1);
      break;
    }
  }

  return (
    <div className="lang-switch">
      <button className="lang-btn" aria-label="Language">
        🌐 {SHORT[locale] || "KO"}
      </button>
      <div className="lang-menu">
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={localeHref(l, bare)}
            hrefLang={l}
            className={`lang-item ${l === locale ? "active" : ""}`}
          >
            {LABELS[l]}
          </Link>
        ))}
      </div>
    </div>
  );
}
