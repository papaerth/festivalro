"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, localeHref } from "@/lib/i18n";
import { useI18n } from "@/lib/I18nProvider";

const LABELS = { ko: "한국어", en: "English", ja: "日本語", zh: "简体中文" };
const SHORT = { ko: "KO", en: "EN", ja: "JA", zh: "ZH" };

// 현재 페이지의 다른 언어 버전으로 이동하는 전환기 (같은 경로 유지)
export default function LangSwitcher() {
  const pathname = usePathname() || "/";
  const { locale } = useI18n();

  // 현재 경로에서 언어 접두어를 떼어 '순수 경로'로
  let bare = pathname;
  for (const l of LOCALES) {
    if (l === DEFAULT_LOCALE) continue;
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
