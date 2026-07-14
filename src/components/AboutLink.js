"use client";

import Link from "next/link";
import { useI18n } from "@/lib/I18nProvider";

// 푸터의 '축제로 소개'(/about) 링크 (13개 언어). 내부 링크로 소개 페이지 크롤링·발견 도움.
const LABEL = {
  ko: "축제로 소개",
  en: "About Chukjero",
  ja: "Chukjeroについて",
  zh: "关于 Chukjero",
  "zh-TW": "關於 Chukjero",
  es: "Acerca de Chukjero",
  fr: "À propos de Chukjero",
  ru: "О Chukjero",
  de: "Über Chukjero",
  ar: "عن Chukjero",
  vi: "Giới thiệu Chukjero",
  id: "Tentang Chukjero",
  th: "เกี่ยวกับ Chukjero",
};

export default function AboutLink() {
  const { locale, href } = useI18n();
  return (
    <Link href={href("/about")} className="footer-link">
      {LABEL[locale] || LABEL.en}
    </Link>
  );
}
