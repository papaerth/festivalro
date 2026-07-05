"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NF = {
  "zh-TW": { title: "找不到慶典", desc: "地址可能已變更，或此慶典可能不存在。", back: "← 返回所有慶典" },
  es: { title: "Festival no encontrado", desc: "Puede que la dirección haya cambiado o que este festival no exista.", back: "← Volver a todos los festivales" },
  fr: { title: "Festival introuvable", desc: "L'adresse a peut-être changé, ou ce festival n'existe peut-être pas.", back: "← Retour à tous les festivals" },
  ru: { title: "Фестиваль не найден", desc: "Возможно, адрес изменился или этот фестиваль не существует.", back: "← Ко всем фестивалям" },
  de: { title: "Festival nicht gefunden", desc: "Die Adresse hat sich möglicherweise geändert, oder dieses Festival existiert nicht.", back: "← Zurück zu allen Festivals" },
  ar: { title: "المهرجان غير موجود", desc: "قد يكون العنوان قد تغيّر، أو قد لا يكون هذا المهرجان موجودًا.", back: "← العودة إلى كل المهرجانات" },
  vi: { title: "Không tìm thấy lễ hội", desc: "Địa chỉ có thể đã thay đổi, hoặc lễ hội này có thể không tồn tại.", back: "← Quay lại tất cả lễ hội" },
  id: { title: "Festival tidak ditemukan", desc: "Alamatnya mungkin telah berubah, atau festival ini mungkin tidak ada.", back: "← Kembali ke semua festival" },
  th: { title: "ไม่พบเทศกาล", desc: "ที่อยู่อาจมีการเปลี่ยนแปลง หรือเทศกาลนี้อาจไม่มีอยู่", back: "← กลับไปยังเทศกาลทั้งหมด" },
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

const LOCALES = ["en","ja","zh","zh-TW","es","fr","ru","de","ar","vi","id","th"];

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
