"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NF = {
  ko: {
    title: "축제를 찾을 수 없어요",
    desc: "주소가 바뀌었거나 없는 축제일 수 있어요.",
    back: "← 전체 축제 목록으로 돌아가기",
  },
  en: {
    title: "Festival not found",
    desc: "The address may have changed, or this festival may not exist.",
    back: "← Back to all festivals",
  },
  ja: {
    title: "お祭りが見つかりません",
    desc: "アドレスが変わったか、存在しないお祭りの可能性があります。",
    back: "← お祭り一覧に戻る",
  },
  zh: {
    title: "找不到该庆典",
    desc: "地址可能已更改，或该庆典不存在。",
    back: "← 返回全部庆典列表",
  },
};

const LOCALES = ["en", "ja", "zh"];

export default function NotFound() {
  const pathname = usePathname() || "/";
  const seg = pathname.split("/")[1];
  const locale = LOCALES.includes(seg) ? seg : "ko";
  const nf = NF[locale];
  const home = locale === "ko" ? "/" : `/${locale}`;

  return (
    <main className="container" style={{ textAlign: "center", padding: "80px 16px" }}>
      <h1 style={{ fontSize: "40px", color: "var(--accent)" }}>🎪</h1>
      <h2 style={{ margin: "12px 0" }}>{nf.title}</h2>
      <p style={{ color: "var(--text-soft)" }}>{nf.desc}</p>
      <p style={{ marginTop: "20px" }}>
        <Link href={home} className="popup-link" style={{ fontWeight: 700 }}>
          {nf.back}
        </Link>
      </p>
    </main>
  );
}
