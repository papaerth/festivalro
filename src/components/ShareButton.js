"use client";

import { useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

const SH = {
  "zh-TW": { copied: "✅ 已複製連結", text: (name) => `快來 Chukjero 看看 ${name}！`, prompt: "請複製下方網址" },
  es: { copied: "✅ Enlace copiado", text: (name) => `¡Mira ${name} en Chukjero!`, prompt: "Copia la dirección de abajo" },
  fr: { copied: "✅ Lien copié", text: (name) => `Découvrez ${name} sur Chukjero !`, prompt: "Copiez l'adresse ci-dessous" },
  ru: { copied: "✅ Ссылка скопирована", text: (name) => `Посмотрите ${name} на Chukjero!`, prompt: "Скопируйте адрес ниже" },
  de: { copied: "✅ Link kopiert", text: (name) => `Schau dir ${name} auf Chukjero an!`, prompt: "Kopiere die Adresse unten" },
  ar: { copied: "✅ تم نسخ الرابط", text: (name) => `اطّلع على ${name} على Chukjero!`, prompt: "انسخ العنوان أدناه" },
  vi: { copied: "✅ Đã sao chép liên kết", text: (name) => `Xem ${name} trên Chukjero nhé!`, prompt: "Sao chép địa chỉ bên dưới" },
  id: { copied: "✅ Tautan disalin", text: (name) => `Lihat ${name} di Chukjero!`, prompt: "Salin alamat di bawah ini" },
  th: { copied: "✅ คัดลอกลิงก์แล้ว", text: (name) => `มาดู ${name} บน Chukjero กันเถอะ!`, prompt: "คัดลอกที่อยู่ด้านล่าง" },
  ko: {
    copied: "✅ 링크가 복사됐어요",
    text: (t) => `${t} 축제 정보를 축제로에서 확인해보세요!`,
    prompt: "아래 주소를 복사하세요",
  },
  en: {
    copied: "✅ Link copied",
    text: (t) => `Check out ${t} on Chukjero!`,
    prompt: "Copy the address below",
  },
  ja: {
    copied: "✅ リンクをコピーしました",
    text: (t) => `${t}のお祭り情報を祝祭ロでチェック！`,
    prompt: "下のアドレスをコピーしてください",
  },
  zh: {
    copied: "✅ 链接已复制",
    text: (t) => `在庆典路查看「${t}」的庆典信息吧！`,
    prompt: "请复制下面的网址",
  },
};

// 축제 공유 버튼.
//  - 모바일/지원 브라우저: 기본 공유 시트(카카오톡·메시지 등) 열기 (navigator.share)
//  - 그 외(데스크톱 등): 링크를 클립보드에 복사
//  - 둘 다 안 되면: 주소를 보여주는 창으로 대체
export default function ShareButton({ title }) {
  const [copied, setCopied] = useState(false);
  const { t, locale } = useI18n();
  const sh = SH[locale] || SH.ko;

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = {
      title: `축제로 · ${title}`,
      text: sh.text(title),
      url,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // 사용자가 공유를 취소한 경우 등 — 아무 처리 안 함
      }
      return;
    }

    // 공유 시트 미지원 → 링크 복사
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(sh.prompt, url);
    }
  };

  return (
    <button className="share-btn" onClick={handleShare} aria-label={t.detail.share}>
      {copied ? sh.copied : t.detail.share}
    </button>
  );
}
