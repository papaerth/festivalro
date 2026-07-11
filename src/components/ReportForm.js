"use client";

import { useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// 제보 폼 (내용/연락처 입력 → /api/report 로 전송).
//  한국어·영어 라벨을 제공하고, 그 외 언어는 영어로 대체됩니다.
const T = {
  ko: {
    catLabel: "제보 유형",
    cats: ["새 축제 제보", "정보 오류 신고", "기타 의견"],
    msgLabel: "내용",
    msgPh: "제보하실 내용을 자유롭게 적어 주세요. (5자 이상)",
    contactLabel: "연락받을 이메일 (선택)",
    contactPh: "답장을 원하시면 이메일을 남겨 주세요",
    submit: "제보 보내기",
    sending: "보내는 중…",
    ok: "✅ 제보가 접수되었습니다. 소중한 의견 감사합니다!",
    tooShort: "내용을 5자 이상 입력해 주세요.",
    fail: "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    notReady: "제보 기능이 아직 설정 중입니다. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    catLabel: "Type",
    cats: ["Suggest a festival", "Report an error", "Other feedback"],
    msgLabel: "Message",
    msgPh: "Write your message freely. (5+ characters)",
    contactLabel: "Your email (optional)",
    contactPh: "Leave your email if you'd like a reply",
    submit: "Send",
    sending: "Sending…",
    ok: "✅ Thank you! Your report has been received.",
    tooShort: "Please enter at least 5 characters.",
    fail: "Failed to send. Please try again shortly.",
    notReady: "Reporting is still being set up. Please try again later.",
  },
};

export default function ReportForm() {
  const { locale } = useI18n();
  const t = T[locale] || T.en;

  const [category, setCategory] = useState(t.cats[0]);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | ok | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (message.trim().length < 5) {
      setStatus("error");
      setError(t.tooShort);
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, contact }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("ok");
        setMessage("");
        setContact("");
      } else if (data.configured === false) {
        setStatus("error");
        setError(t.notReady);
      } else {
        setStatus("error");
        setError(data.error || t.fail);
      }
    } catch {
      setStatus("error");
      setError(t.fail);
    }
  }

  if (status === "ok") {
    return (
      <p style={{ padding: "18px 0", fontSize: 16, color: "var(--accent, #2563eb)" }}>
        {t.ok}
      </p>
    );
  }

  const field = { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border, #d1d5db)",
    background: "var(--card, #fff)",
    color: "inherit",
    fontSize: 15,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560, marginTop: 8 }}>
      <div style={{ marginBottom: 16 }}>
        <label style={field} htmlFor="rep-cat">{t.catLabel}</label>
        <select
          id="rep-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={input}
        >
          {t.cats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={field} htmlFor="rep-msg">{t.msgLabel}</label>
        <textarea
          id="rep-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.msgPh}
          rows={6}
          maxLength={4000}
          required
          style={{ ...input, resize: "vertical" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={field} htmlFor="rep-contact">{t.contactLabel}</label>
        <input
          id="rep-contact"
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t.contactPh}
          style={input}
        />
      </div>

      {status === "error" && error && (
        <p style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          padding: "11px 22px",
          borderRadius: 10,
          border: "none",
          background: "var(--accent, #2563eb)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: status === "sending" ? "default" : "pointer",
          opacity: status === "sending" ? 0.6 : 1,
        }}
      >
        {status === "sending" ? t.sending : t.submit}
      </button>
    </form>
  );
}
