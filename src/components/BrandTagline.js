"use client";

import { useI18n } from "@/lib/I18nProvider";

// 푸터 브랜드 한 줄 — 로고(이미지) 외에 브랜드명을 '텍스트'로 노출해 검색엔진이 읽게 함.
//  한글 "축제로"를 명확히 포함(브랜드 검색 노출용).
const TAG = {
  ko: "축제로(chukjero) - 전국 축제 정보 플랫폼",
  en: "Chukjero(축제로) - Korea's festival information platform",
  ja: "Chukjero(축제로) - 韓国のお祭り情報プラットフォーム",
  zh: "Chukjero(축제로) - 韩国庆典信息平台",
  "zh-TW": "Chukjero(축제로) - 韓國慶典資訊平台",
  es: "Chukjero(축제로) - Plataforma de información de festivales de Corea",
  fr: "Chukjero(축제로) - Plateforme d'information sur les festivals coréens",
  ru: "Chukjero(축제로) - Платформа информации о фестивалях Кореи",
  de: "Chukjero(축제로) - Informationsplattform für Feste in Korea",
  ar: "Chukjero(축제로) - منصة معلومات المهرجانات الكورية",
  vi: "Chukjero(축제로) - Nền tảng thông tin lễ hội Hàn Quốc",
  id: "Chukjero(축제로) - Platform informasi festival Korea",
  th: "Chukjero(축제로) - แพลตฟอร์มข้อมูลเทศกาลเกาหลี",
};

export default function BrandTagline() {
  const { locale } = useI18n();
  return <p className="brand-tagline">{TAG[locale] || TAG.en}</p>;
}
