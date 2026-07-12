"use client";

import Link from "next/link";
import { useI18n } from "@/lib/I18nProvider";

// 축제로 로고 — 핀버스트(지도 핀 + 폭죽) 마크 + 워드마크.
//  마크 색은 currentColor → 상단바의 계절 테마색(--accent)을 자동으로 따라감.
//  한국어는 "축제로", 그 외 언어는 "Chukjero" 워드마크.
export function BrandMark({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 62"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="축제로"
    >
      <path
        d="M24 3C13.5 3 5 11.5 5 22c0 8.9 7.2 16.4 13.4 24.6 1.9 2.5 3.7 5 5.1 7.5.2.4.8.4 1 0 1.4-2.5 3.2-5 5.1-7.5C36.8 38.4 44 30.9 44 22 44 11.5 35.5 3 24 3Z"
        fill="currentColor"
      />
      <path
        d="M24 11.5l2.7 6.8 6.8 2.7-6.8 2.7L24 30.5l-2.7-6.8L14.5 21l6.8-2.7z"
        fill="#fff"
      />
      <circle cx="24" cy="8" r="1.15" fill="#fff" />
      <circle cx="32" cy="16" r="1.05" fill="#fff" />
      <circle cx="16" cy="16" r="1.05" fill="#fff" />
    </svg>
  );
}

export default function BrandLogo() {
  const { locale, href } = useI18n();
  const word = locale === "ko" ? "축제로" : "Chukjero";
  return (
    <Link href={href("/")} className="brand" aria-label={word}>
      <BrandMark className="brand-mark" />
      <span className="brand-word">{word}</span>
    </Link>
  );
}
