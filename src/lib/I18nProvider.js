"use client";

import { createContext, useContext } from "react";
import { getDictionary, localeHref, DEFAULT_LOCALE } from "./i18n";

const I18nContext = createContext(null);

// locale(문자열)만 서버에서 받아, 사전(함수 포함)은 클라이언트에서 구성.
// (함수가 든 사전은 서버→클라 props로 직렬화가 안 되므로 이렇게 처리)
export function I18nProvider({ locale, children }) {
  const loc = locale || DEFAULT_LOCALE;
  const value = {
    locale: loc,
    t: getDictionary(loc),
    href: (path) => localeHref(loc, path),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Provider 밖(예외적)에서도 안전하게 기본값
    return {
      locale: DEFAULT_LOCALE,
      t: getDictionary(DEFAULT_LOCALE),
      href: (path) => path,
    };
  }
  return ctx;
}
