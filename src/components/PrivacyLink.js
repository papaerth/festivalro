"use client";

import Link from "next/link";
import { useI18n } from "@/lib/I18nProvider";

// 푸터의 개인정보처리방침(/privacy) 링크 (13개 언어).
const LABEL = {
  ko: "개인정보처리방침",
  en: "Privacy Policy",
  ja: "プライバシーポリシー",
  zh: "隐私政策",
  "zh-TW": "隱私政策",
  es: "Política de privacidad",
  fr: "Politique de confidentialité",
  ru: "Политика конфиденциальности",
  de: "Datenschutz",
  ar: "سياسة الخصوصية",
  vi: "Chính sách bảo mật",
  id: "Kebijakan privasi",
  th: "นโยบายความเป็นส่วนตัว",
};

export default function PrivacyLink() {
  const { locale, href } = useI18n();
  return (
    <Link href={href("/privacy")} className="footer-link">
      {LABEL[locale] || LABEL.en}
    </Link>
  );
}
