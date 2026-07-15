"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

// ────────────────────────────────────────────────────────────────
//  등록·제보 폼 (2탭: 담당자 등록 / 주민 제보)
//   · 담당자 등록: 축제 기본정보(필수) + 상세(선택) + 사진(선택) → /api/submit (type=organizer)
//   · 주민 제보:   유형·내용(필수) + 연관 축제·사진(선택)        → /api/submit (type=resident)
//   · 사진: 브라우저에서 압축(jpg/png) 후 Supabase Storage에 '직접' 업로드
//           (서버 용량 한도 우회 + 진행률 표시). PDF는 원본 그대로.
//   · 저장은 모두 status="pending"(대기) → 매일 알림 메일에서 1클릭 게시.
//   · 임시저장: 담당자 등록 입력은 브라우저(localStorage)에 자동 보관 → 새로고침해도 유지.
//   · 한국어·영어 라벨 제공, 그 외 언어는 영어로 대체.
// ────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 10;
const MAX_PHOTOS_RESIDENT = 5;
const MAX_FILE = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const DRAFT_KEY = "festivalro:submit:draft:v1";

const T = {
  ko: {
    tabOrg: "담당자 등록",
    tabRes: "주민 제보",
    orgLead: "축제 담당자(주최·주관)이신가요? 정보를 등록하시면 검토 후 축제 페이지에 반영됩니다.",
    resLead: "빠진 축제, 잘못된 정보, 사진·후기 등 무엇이든 알려 주세요.",
    // 기본(필수)
    secBasic: "기본 정보 (필수)",
    fFestival: "축제명",
    phFestival: "예: 보령머드축제 (입력 중 목록에서 선택하면 기존 축제와 연결돼요)",
    fPeriod: "축제 기간",
    fPlace: "장소",
    phPlace: "예: 충남 보령시 대천해수욕장 일원",
    fIntro: "축제 소개",
    phIntro: "축제를 소개해 주세요. 어떤 축제인지, 볼거리·즐길거리 등. (최대 1000자)",
    fOrganizer: "주최·주관 기관",
    phOrganizer: "예: 보령시 / 보령축제관광재단",
    fContact: "담당자 연락처",
    phContact: "이메일 또는 전화번호 (검토 결과 안내용)",
    // 상세(선택)
    secDetail: "상세 정보 (선택) — 적을수록 페이지가 풍성해져요",
    fTimetable: "프로그램·일정",
    phTimetable: "예: 10/3(금) 개막식 18:00, 불꽃놀이 20:00 / 10/4(토) 퍼레이드 14:00",
    fLineup: "초대가수·공연",
    phLineup: "예: 아이유, 잔나비, 지역 풍물패 (10/4 저녁 무대)",
    fParking: "주차 안내",
    phParking: "예: 제1주차장 500대(무료), 도보 5분 / 주말 만차 시 셔틀 이용",
    fShuttle: "교통·셔틀",
    phShuttle: "예: OO역 3번출구 ↔ 행사장 무료 셔틀 15분 간격, 09:00~22:00",
    fFood: "먹을거리",
    phFood: "예: 먹거리장터 30개 부스, 지역 특산물, 푸드트럭존",
    fExperience: "체험·포토존",
    phExperience: "예: 도자기 만들기, 페이스페인팅, 포토존 3곳 (무료)",
    fEtc: "기타 안내",
    phEtc: "예: 반려동물 동반 가능, 우천 시 실내 이전, 문의 041-000-0000",
    // 사진
    secPhoto: "사진 (선택)",
    photoHint: (n) => `jpg·png·pdf, 한 장 10MB까지, 최대 ${n}장. 사진은 자동으로 용량이 줄어듭니다.`,
    addPhoto: "＋ 사진 추가",
    uploading: "업로드 중",
    photoWait: "사진 업로드가 아직 끝나지 않았어요. 진행률이 끝난 뒤 다시 눌러 주세요.",
    // 주민 제보
    fCategory: "제보 유형",
    cats: ["새 축제 제보", "정보 오류 신고", "사진·후기 공유", "기타 의견"],
    fRelFestival: "연관 축제 (선택)",
    phRelFestival: "관련 축제가 있으면 입력해 주세요",
    fMessage: "내용",
    phMessage: "제보하실 내용을 자유롭게 적어 주세요. (5자 이상)",
    fResContact: "연락받을 이메일 (선택)",
    phResContact: "답장을 원하시면 이메일을 남겨 주세요",
    // 공통
    submitOrg: "등록 신청하기",
    submitRes: "제보 보내기",
    sending: "보내는 중…",
    okOrg: "✅ 등록 신청이 접수되었습니다. 검토 후 축제 페이지에 반영됩니다. 감사합니다!",
    okRes: "✅ 제보가 접수되었습니다. 소중한 의견 감사합니다!",
    another: "새로 작성하기",
    errFestival: "축제명을 입력해 주세요.",
    errPeriod: "축제 기간을 입력해 주세요.",
    errPlace: "장소를 입력해 주세요.",
    errIntro: "축제 소개를 입력해 주세요.",
    errOrganizer: "주최·주관 기관을 입력해 주세요.",
    errContact: "담당자 연락처를 입력해 주세요.",
    errMessage: "내용을 5자 이상 입력해 주세요.",
    errPhotoType: "jpg·png·pdf 파일만 올릴 수 있어요.",
    errPhotoSize: "한 파일은 10MB 이하만 가능해요.",
    errPhotoMax: (n) => `사진은 최대 ${n}장까지예요.`,
    errPhotoUp: "사진 업로드에 실패했어요. 다시 시도해 주세요.",
    fail: "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    notReady: "등록 기능이 아직 설정 중입니다. 잠시 후 다시 시도해 주세요.",
    draftSaved: "자동 임시저장됨",
    to: "~",
  },
  en: {
    tabOrg: "Organizer registration",
    tabRes: "Resident report",
    orgLead: "Are you a festival organizer? Register your info and it will appear on the festival page after review.",
    resLead: "Tell us about a missing festival, wrong info, photos or reviews — anything.",
    secBasic: "Basic info (required)",
    fFestival: "Festival name",
    phFestival: "e.g. Boryeong Mud Festival (pick from the list to link an existing festival)",
    fPeriod: "Dates",
    fPlace: "Location",
    phPlace: "e.g. Daecheon Beach, Boryeong, Chungnam",
    fIntro: "Introduction",
    phIntro: "Introduce the festival — what it is, highlights, things to do. (up to 1000 chars)",
    fOrganizer: "Host / organizer",
    phOrganizer: "e.g. Boryeong City / Boryeong Festival Foundation",
    fContact: "Contact",
    phContact: "Email or phone (to notify you of the review result)",
    secDetail: "Details (optional) — the more you add, the richer the page",
    fTimetable: "Program & schedule",
    phTimetable: "e.g. Oct 3 opening 18:00, fireworks 20:00 / Oct 4 parade 14:00",
    fLineup: "Performers",
    phLineup: "e.g. IU, Jannabi, local troupe (Oct 4 evening stage)",
    fParking: "Parking",
    phParking: "e.g. Lot 1, 500 cars (free), 5-min walk / shuttle when full",
    fShuttle: "Transport & shuttle",
    phShuttle: "e.g. Free shuttle from Station exit 3, every 15 min, 09:00–22:00",
    fFood: "Food",
    phFood: "e.g. 30 food stalls, local specialties, food-truck zone",
    fExperience: "Activities & photo spots",
    phExperience: "e.g. pottery, face painting, 3 photo zones (free)",
    fEtc: "Other notes",
    phEtc: "e.g. pets allowed, moves indoors if raining, info 041-000-0000",
    secPhoto: "Photos (optional)",
    photoHint: (n) => `jpg·png·pdf, up to 10MB each, ${n} max. Photos are auto-compressed.`,
    addPhoto: "＋ Add photos",
    uploading: "Uploading",
    photoWait: "Photos are still uploading. Please wait for the progress bars to finish, then tap again.",
    fCategory: "Type",
    cats: ["Suggest a festival", "Report an error", "Share photos/reviews", "Other feedback"],
    fRelFestival: "Related festival (optional)",
    phRelFestival: "Enter a related festival if any",
    fMessage: "Message",
    phMessage: "Write your message freely. (5+ characters)",
    fResContact: "Your email (optional)",
    phResContact: "Leave your email if you'd like a reply",
    submitOrg: "Submit registration",
    submitRes: "Send report",
    sending: "Sending…",
    okOrg: "✅ Your registration has been received. It will appear after review. Thank you!",
    okRes: "✅ Thank you! Your report has been received.",
    another: "Write another",
    errFestival: "Please enter the festival name.",
    errPeriod: "Please enter the dates.",
    errPlace: "Please enter the location.",
    errIntro: "Please enter an introduction.",
    errOrganizer: "Please enter the host/organizer.",
    errContact: "Please enter a contact.",
    errMessage: "Please enter at least 5 characters.",
    errPhotoType: "Only jpg·png·pdf files are allowed.",
    errPhotoSize: "Each file must be 10MB or less.",
    errPhotoMax: (n) => `Up to ${n} photos.`,
    errPhotoUp: "Photo upload failed. Please try again.",
    fail: "Failed to send. Please try again shortly.",
    notReady: "Registration is still being set up. Please try again later.",
    draftSaved: "Draft auto-saved",
    to: "–",
  },
};

// ── 초성 매칭(자동완성) — 홈 검색과 동일 방식 ──
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function toCho(str) {
  let out = "";
  for (const ch of String(str)) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}
const isChoQuery = (q) => /^[ㄱ-ㅎ]+$/.test(q);

// ── 이미지 압축(캔버스, 외부 라이브러리 없음) ──
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load"));
    };
    img.src = url;
  });
}
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const img = await loadImage(file);
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    // 압축이 원본보다 크면 원본 사용
    if (blob && blob.size < file.size) return { blob, contentType: "image/jpeg" };
  } catch {
    /* 압축 실패 시 원본 업로드 */
  }
  return { blob: file, contentType: file.type };
}

// ── 서명 URL로 직접 업로드(PUT) + 진행률 ──
//  ⚠️ 타임아웃 필수: 없으면 네트워크가 멈췄을 때 사진이 '업로드 중'에 영원히 머물러
//     제출이 조용히 막힘. 60초 안에 못 끝내면 실패로 처리해 사용자가 다시 시도하게 함.
function uploadToSigned(signedUrl, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.timeout = 60000;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("upload " + xhr.status));
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send(blob);
  });
}

// 제출 실패 시 운영자에게 자동 알림 (조용한 실패 방지 — 기존 /api/report 재사용)
function notifyFailure(detail) {
  try {
    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "⚠️ 등록/제보 제출 실패 자동알림",
        message: `축제로 /submit 제출이 실패했습니다.\n${detail}`,
        contact: "",
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 알림 실패는 무시 */
  }
}

let photoSeq = 0;

export default function SubmitForm({ festivals = [] }) {
  const { locale } = useI18n();
  const t = T[locale] || T.en;

  const [tab, setTab] = useState("organizer");
  const [status, setStatus] = useState("idle"); // idle | sending | okOrg | okRes | error
  const [error, setError] = useState("");

  // 담당자 등록 필드
  const [org, setOrg] = useState({
    festivalName: "", festivalId: "", periodStart: "", periodEnd: "",
    place: "", intro: "", organizer: "", contact: "",
    timetable: "", lineup: "", parking: "", shuttle: "", food: "", experience: "", etc: "",
  });
  // 주민 제보 필드
  const [res, setRes] = useState({
    category: t.cats[0], festivalName: "", festivalId: "", message: "", contact: "",
  });
  const [photos, setPhotos] = useState([]); // {id, name, status:'uploading'|'done'|'error', progress, publicUrl}
  const [draftNote, setDraftNote] = useState(false);

  const setO = (k, v) => setOrg((s) => ({ ...s, [k]: v }));
  const setR = (k, v) => setRes((s) => ({ ...s, [k]: v }));

  // ── 임시저장 복원 (담당자 등록만) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") setOrg((s) => ({ ...s, ...saved }));
      }
    } catch {
      /* 무시 */
    }
  }, []);

  // ── 임시저장 자동보관 (입력 500ms 후) ──
  const draftTimer = useRef(null);
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        const hasAny = Object.values(org).some((v) => String(v || "").trim());
        if (hasAny) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(org));
          setDraftNote(true);
        }
      } catch {
        /* 무시 */
      }
    }, 500);
    return () => draftTimer.current && clearTimeout(draftTimer.current);
  }, [org]);

  const maxPhotos = tab === "organizer" ? MAX_PHOTOS : MAX_PHOTOS_RESIDENT;

  // ── 사진 선택 처리 ──
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError("");
    for (const file of files) {
      if (photos.length >= maxPhotos) {
        setError(t.errPhotoMax(maxPhotos));
        break;
      }
      if (!ALLOWED.includes(file.type)) {
        setError(t.errPhotoType);
        continue;
      }
      if (file.size > MAX_FILE) {
        setError(t.errPhotoSize);
        continue;
      }
      const id = ++photoSeq;
      setPhotos((p) => [...p, { id, name: file.name, status: "uploading", progress: 0, publicUrl: "" }]);
      // 비동기 업로드 (개별)
      uploadOne(id, file);
    }
  }

  async function uploadOne(id, file) {
    try {
      // 이미지면 압축, pdf는 원본
      const isImg = file.type === "image/jpeg" || file.type === "image/png";
      const { blob, contentType } = isImg
        ? await compressImage(file)
        : { blob: file, contentType: file.type };

      const r = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, size: blob.size }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok || !data.signedUrl) throw new Error("no url");

      await uploadToSigned(data.signedUrl, blob, contentType, (frac) => {
        setPhotos((p) => p.map((x) => (x.id === id ? { ...x, progress: frac } : x)));
      });

      setPhotos((p) =>
        p.map((x) => (x.id === id ? { ...x, status: "done", progress: 1, publicUrl: data.publicUrl } : x))
      );
    } catch {
      setPhotos((p) => p.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
      setError(t.errPhotoUp);
    }
  }

  const removePhoto = (id) => setPhotos((p) => p.filter((x) => x.id !== id));

  // ── 제출 ──
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    let body;
    if (tab === "organizer") {
      if (!org.festivalName.trim()) return void setError(t.errFestival);
      if (!org.periodStart) return void setError(t.errPeriod);
      if (!org.place.trim()) return void setError(t.errPlace);
      if (!org.intro.trim()) return void setError(t.errIntro);
      if (!org.organizer.trim()) return void setError(t.errOrganizer);
      if (!org.contact.trim()) return void setError(t.errContact);
      body = {
        type: "organizer",
        festivalName: org.festivalName,
        festivalId: org.festivalId,
        periodStart: org.periodStart,
        periodEnd: org.periodEnd || org.periodStart,
        place: org.place,
        intro: org.intro,
        organizer: org.organizer,
        contact: org.contact,
        timetable: org.timetable,
        lineup: org.lineup,
        parking: org.parking,
        shuttle: org.shuttle,
        food: org.food,
        experience: org.experience,
        etc: org.etc,
        photos: photos.filter((x) => x.status === "done").map((x) => x.publicUrl),
      };
    } else {
      if (res.message.trim().length < 5) return void setError(t.errMessage);
      body = {
        type: "resident",
        category: res.category,
        festivalName: res.festivalName,
        festivalId: res.festivalId,
        message: res.message,
        contact: res.contact,
        photos: photos.filter((x) => x.status === "done").map((x) => x.publicUrl),
      };
    }

    // 업로드 진행 중인 사진이 있으면 명확히 안내하고 대기 (조용한 차단 방지)
    if (photos.some((x) => x.status === "uploading")) {
      setError(t.photoWait);
      return;
    }

    const who = tab === "organizer" ? org.festivalName : (res.message || "").slice(0, 30);

    setStatus("sending");
    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        if (tab === "organizer") {
          try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
        }
        setStatus(tab === "organizer" ? "okOrg" : "okRes");
      } else {
        setStatus("error");
        setError(data.error || t.fail);
        notifyFailure(`[${tab}] ${who} — HTTP ${r.status}, ${data.error || "ok=false"}`);
      }
    } catch (err) {
      setStatus("error");
      setError(t.fail);
      notifyFailure(`[${tab}] ${who} — 네트워크 예외: ${(err && err.message) || ""}`);
    }
  }

  function reset() {
    setStatus("idle");
    setError("");
    setPhotos([]);
    setOrg({
      festivalName: "", festivalId: "", periodStart: "", periodEnd: "",
      place: "", intro: "", organizer: "", contact: "",
      timetable: "", lineup: "", parking: "", shuttle: "", food: "", experience: "", etc: "",
    });
    setRes({ category: t.cats[0], festivalName: "", festivalId: "", message: "", contact: "" });
  }

  if (status === "okOrg" || status === "okRes") {
    return (
      <div style={{ padding: "22px 0", maxWidth: 620 }}>
        <p style={{ fontSize: 16, color: "var(--accent, #2563eb)", marginBottom: 16 }}>
          {status === "okOrg" ? t.okOrg : t.okRes}
        </p>
        <button type="button" onClick={reset} style={btnGhost}>
          {t.another}
        </button>
      </div>
    );
  }

  const sending = status === "sending";
  const uploadingCount = photos.filter((x) => x.status === "uploading").length;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 620, marginTop: 8 }} noValidate>
      {/* 탭 */}
      <div style={tabRow} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "organizer"}
          onClick={() => { setTab("organizer"); setError(""); }}
          style={{ ...tabBtn, ...(tab === "organizer" ? tabActive : {}) }}
        >
          {t.tabOrg}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "resident"}
          onClick={() => { setTab("resident"); setError(""); }}
          style={{ ...tabBtn, ...(tab === "resident" ? tabActive : {}) }}
        >
          {t.tabRes}
        </button>
      </div>

      <p style={leadStyle}>{tab === "organizer" ? t.orgLead : t.resLead}</p>

      {tab === "organizer" ? (
        <>
          {/* 기본 정보 (필수) */}
          <fieldset style={fieldset}>
            <legend style={legend}>{t.secBasic}</legend>

            <FestivalPicker
              label={t.fFestival}
              placeholder={t.phFestival}
              festivals={festivals}
              value={org.festivalName}
              required
              onChange={(name, id) => { setO("festivalName", name); setO("festivalId", id || ""); }}
            />

            <Row>
              <label style={field}>{t.fPeriod} <span style={req}>*</span></label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={org.periodStart} onChange={(e) => setO("periodStart", e.target.value)} style={{ ...input, width: "auto", flex: "1 1 150px" }} />
                <span aria-hidden="true">{t.to}</span>
                <input type="date" value={org.periodEnd} onChange={(e) => setO("periodEnd", e.target.value)} style={{ ...input, width: "auto", flex: "1 1 150px" }} />
              </div>
            </Row>

            <Text label={t.fPlace} req value={org.place} onChange={(v) => setO("place", v)} ph={t.phPlace} />

            <Row>
              <label style={field}>{t.fIntro} <span style={req}>*</span></label>
              <textarea value={org.intro} onChange={(e) => setO("intro", e.target.value)} placeholder={t.phIntro} rows={5} maxLength={1000} style={{ ...input, resize: "vertical" }} />
              <Counter n={org.intro.length} max={1000} />
            </Row>

            <Text label={t.fOrganizer} req value={org.organizer} onChange={(v) => setO("organizer", v)} ph={t.phOrganizer} />
            <Text label={t.fContact} req value={org.contact} onChange={(v) => setO("contact", v)} ph={t.phContact} />
          </fieldset>

          {/* 상세 정보 (선택) */}
          <details style={details}>
            <summary style={summary}>{t.secDetail}</summary>
            <div style={{ marginTop: 12 }}>
              <Area label={t.fTimetable} value={org.timetable} onChange={(v) => setO("timetable", v)} ph={t.phTimetable} rows={3} />
              <Area label={t.fLineup} value={org.lineup} onChange={(v) => setO("lineup", v)} ph={t.phLineup} />
              <Area label={t.fParking} value={org.parking} onChange={(v) => setO("parking", v)} ph={t.phParking} />
              <Area label={t.fShuttle} value={org.shuttle} onChange={(v) => setO("shuttle", v)} ph={t.phShuttle} />
              <Area label={t.fFood} value={org.food} onChange={(v) => setO("food", v)} ph={t.phFood} />
              <Area label={t.fExperience} value={org.experience} onChange={(v) => setO("experience", v)} ph={t.phExperience} />
              <Area label={t.fEtc} value={org.etc} onChange={(v) => setO("etc", v)} ph={t.phEtc} />
            </div>
          </details>

          {/* 사진 (선택) */}
          <details style={details} open>
            <summary style={summary}>{t.secPhoto}</summary>
            <PhotoBox t={t} photos={photos} maxPhotos={maxPhotos} onFiles={handleFiles} onRemove={removePhoto} />
          </details>
        </>
      ) : (
        <>
          <fieldset style={fieldset}>
            <Row>
              <label style={field}>{t.fCategory}</label>
              <select value={res.category} onChange={(e) => setR("category", e.target.value)} style={input}>
                {t.cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Row>

            <FestivalPicker
              label={t.fRelFestival}
              placeholder={t.phRelFestival}
              festivals={festivals}
              value={res.festivalName}
              onChange={(name, id) => { setR("festivalName", name); setR("festivalId", id || ""); }}
            />

            <Row>
              <label style={field}>{t.fMessage} <span style={req}>*</span></label>
              <textarea value={res.message} onChange={(e) => setR("message", e.target.value)} placeholder={t.phMessage} rows={6} maxLength={1000} style={{ ...input, resize: "vertical" }} />
              <Counter n={res.message.length} max={1000} />
            </Row>

            <Row>
              <label style={field}>{t.fResContact}</label>
              <input type="email" value={res.contact} onChange={(e) => setR("contact", e.target.value)} placeholder={t.phResContact} style={input} />
            </Row>
          </fieldset>

          <details style={details}>
            <summary style={summary}>{t.secPhoto}</summary>
            <PhotoBox t={t} photos={photos} maxPhotos={maxPhotos} onFiles={handleFiles} onRemove={removePhoto} />
          </details>
        </>
      )}

      {/* 오류를 눈에 띄는 배너로 (조용한 실패 방지) */}
      {error && (
        <p
          role="alert"
          style={{
            margin: "14px 0",
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fdecec",
            border: "1px solid #f5b5b5",
            color: "#b42318",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          ⚠️ {error}
        </p>
      )}

      {/* 사진 업로드 중 안내 (제출이 왜 안 되는지 보이게) */}
      {uploadingCount > 0 && (
        <p style={{ margin: "10px 0", fontSize: 13, color: "var(--accent, #2563eb)" }}>
          ⏳ {t.uploading}… ({uploadingCount})
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          type="submit"
          disabled={sending || uploadingCount > 0}
          style={{
            ...btnPrimary,
            opacity: sending || uploadingCount > 0 ? 0.6 : 1,
            cursor: sending || uploadingCount > 0 ? "default" : "pointer",
          }}
        >
          {sending
            ? t.sending
            : uploadingCount > 0
            ? `${t.uploading}… (${uploadingCount})`
            : tab === "organizer"
            ? t.submitOrg
            : t.submitRes}
        </button>
        {tab === "organizer" && draftNote && (
          <span style={{ fontSize: 12, color: "var(--muted, #6b7280)" }}>💾 {t.draftSaved}</span>
        )}
      </div>
    </form>
  );
}

// ── 축제 자동완성 선택기 ──
function FestivalPicker({ label, placeholder, festivals, value, onChange, required }) {
  const [text, setText] = useState(value || "");
  const [show, setShow] = useState(false);
  const [hi, setHi] = useState(-1);

  useEffect(() => { setText(value || ""); }, [value]);

  const suggestions = useMemo(() => {
    const q = text.trim();
    if (q.length < 1) return [];
    const cho = isChoQuery(q);
    const out = [];
    const seen = new Set();
    for (const f of festivals) {
      if (out.length >= 6) break;
      const disp = f.displayName || f.name;
      const ko = f.name || "";
      if (!disp || seen.has(disp)) continue;
      const sub = disp.toLowerCase().includes(q.toLowerCase()) || ko.toLowerCase().includes(q.toLowerCase());
      const choHit = cho && (toCho(ko).includes(q) || toCho(disp).includes(q));
      if (sub || choHit) { seen.add(disp); out.push(f); }
    }
    return out;
  }, [text, festivals]);

  const pick = (f) => {
    const name = f.name || f.displayName;
    setText(name);
    onChange(name, f.id);
    setShow(false);
    setHi(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setShow(true); setHi((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
    else if (e.key === "Enter") { if (show && hi >= 0 && suggestions[hi]) { e.preventDefault(); pick(suggestions[hi]); } }
    else if (e.key === "Escape") setShow(false);
  };

  return (
    <Row>
      <label style={field}>{label} {required && <span style={req}>*</span>}</label>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => { const v = e.target.value; setText(v); onChange(v, ""); setShow(true); setHi(-1); }}
          onFocus={() => setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 150)}
          onKeyDown={onKeyDown}
          style={input}
          autoComplete="off"
        />
        {show && suggestions.length > 0 && (
          <ul style={autoList} role="listbox">
            {suggestions.map((f, i) => (
              <li
                key={f.id}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => { e.preventDefault(); pick(f); }}
                onMouseEnter={() => setHi(i)}
                style={{ ...autoItem, ...(i === hi ? autoItemActive : {}) }}
              >
                📍 {f.displayName || f.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Row>
  );
}

// ── 사진 업로드 박스 ──
function PhotoBox({ t, photos, maxPhotos, onFiles, onRemove }) {
  const ref = useRef(null);
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, color: "var(--muted, #6b7280)", margin: "0 0 10px" }}>{t.photoHint(maxPhotos)}</p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
      <button type="button" onClick={() => ref.current?.click()} disabled={photos.length >= maxPhotos} style={{ ...btnGhost, opacity: photos.length >= maxPhotos ? 0.5 : 1 }}>
        {t.addPhoto} ({photos.length}/{maxPhotos})
      </button>

      {photos.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {photos.map((p) => (
            <li key={p.id} style={photoItem}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
                {p.status === "done" ? "✅ " : p.status === "error" ? "⚠️ " : "⏳ "}{p.name}
              </span>
              {p.status === "uploading" && (
                <span style={{ width: 90, height: 6, background: "var(--border,#e5e7eb)", borderRadius: 4, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.round(p.progress * 100)}%`, background: "var(--accent,#2563eb)", transition: "width .2s" }} />
                </span>
              )}
              <button type="button" onClick={() => onRemove(p.id)} aria-label="삭제" style={xBtn}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 작은 조립 컴포넌트 ──
function Row({ children }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>;
}
function Text({ label, value, onChange, ph, req: isReq }) {
  return (
    <Row>
      <label style={field}>{label} {isReq && <span style={req}>*</span>}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} style={input} />
    </Row>
  );
}
function Area({ label, value, onChange, ph, rows = 2 }) {
  return (
    <Row>
      <label style={field}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} rows={rows} maxLength={4000} style={{ ...input, resize: "vertical" }} />
    </Row>
  );
}
function Counter({ n, max }) {
  return <div style={{ textAlign: "right", fontSize: 12, color: n >= max ? "#dc2626" : "var(--muted,#6b7280)", marginTop: 4 }}>{n}/{max}</div>;
}

// ── 스타일 ──
const field = { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 };
const req = { color: "#dc2626" };
const input = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--border, #d1d5db)", background: "var(--card, #fff)",
  color: "inherit", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box",
};
const tabRow = { display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--border,#e5e7eb)" };
const tabBtn = {
  padding: "10px 16px", border: "none", background: "transparent", color: "var(--muted,#6b7280)",
  fontSize: 15, fontWeight: 700, cursor: "pointer", borderBottom: "3px solid transparent", marginBottom: -1,
};
const tabActive = { color: "var(--accent,#2563eb)", borderBottomColor: "var(--accent,#2563eb)" };
const leadStyle = { fontSize: 14, color: "var(--muted,#6b7280)", margin: "0 0 18px", lineHeight: 1.5 };
const fieldset = { border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: 16, margin: "0 0 16px" };
const legend = { fontWeight: 700, fontSize: 14, padding: "0 6px" };
const details = { border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: "12px 16px", margin: "0 0 16px" };
const summary = { fontWeight: 700, fontSize: 14, cursor: "pointer", listStyle: "revert" };
const autoList = {
  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, margin: "4px 0 0", padding: 4,
  listStyle: "none", background: "var(--card,#fff)", border: "1px solid var(--border,#d1d5db)",
  borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 260, overflowY: "auto",
};
const autoItem = { padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const autoItemActive = { background: "var(--hover,#f3f4f6)" };
const photoItem = {
  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
  border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, background: "var(--card,#fff)",
};
const xBtn = {
  border: "none", background: "transparent", color: "var(--muted,#6b7280)", cursor: "pointer",
  fontSize: 15, lineHeight: 1, padding: 4,
};
const btnPrimary = {
  padding: "12px 24px", borderRadius: 10, border: "none", background: "var(--accent,#2563eb)",
  color: "#fff", fontSize: 15, fontWeight: 700,
};
const btnGhost = {
  padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border,#d1d5db)",
  background: "var(--card,#fff)", color: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
