"use client";

import Link from "next/link";
import { useI18n } from "@/lib/I18nProvider";

// 푸터의 제보하기(/report) 링크 (13개 언어, 미지정 언어는 영어).
const LABEL = {
  ko: "제보하기",
  en: "Send a report",
  ja: "情報提供",
  zh: "反馈",
  "zh-TW": "意見回饋",
  es: "Enviar aviso",
  fr: "Signaler",
  ru: "Сообщить",
  de: "Feedback",
  ar: "إبلاغ",
  vi: "Gửi phản hồi",
  id: "Kirim laporan",
  th: "แจ้งข้อมูล",
};

export default function ReportLink() {
  const { locale, href } = useI18n();
  return (
    <Link href={href("/submit")} className="footer-link">
      {LABEL[locale] || LABEL.en}
    </Link>
  );
}
