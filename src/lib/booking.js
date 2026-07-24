// ────────────────────────────────────────────────────────────────
//  예매/홈페이지 링크 처리 (공용) — 서버·클라이언트 양쪽에서 import(순수 함수, 지시자 없음).
//   · cleanBookingUrl: HTML(<a href>)·텍스트에서 안전한 http(s) URL만 추출·정리.
//       - javascript:·data: 등 비정상 스킴 필터, http→https 승격 시도.
//   · bookingLabel: 유형별 버튼 라벨(공연·전시·박람회=예매하기, 축제=홈페이지).
// ────────────────────────────────────────────────────────────────

// 원본(HTML 조각/문자열)에서 첫 http(s) URL을 뽑아 정리. 없거나 비정상이면 null.
export function cleanBookingUrl(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/&amp;/g, "&").trim();
  if (!s) return null;
  const m = s.match(/https?:\/\/[^\s"'<>)\]]+/i);
  if (m) s = m[0];
  else if (/^www\./i.test(s)) s = "https://" + s; // www.… 은 https로 보정
  else return null; // http(s) URL이 아니면(javascript:, mailto:, 빈 값 등) 버림
  if (!/^https?:\/\//i.test(s)) return null; // 이중 안전장치
  // 끝에 붙는 문장부호 정리
  s = s.replace(/[.,;]+$/, "");
  // http → https 승격(시도). 대부분의 예매/공식 사이트는 https를 지원.
  if (/^http:\/\//i.test(s)) s = "https://" + s.slice("http://".length);
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// 버튼 라벨(13개 언어). 공연·전시·박람회=예매, 축제=홈페이지. 누락 언어는 영어.
const LABELS = {
  book: {
    ko: "예매하기", en: "Book tickets", ja: "チケット予約", zh: "购票", "zh-TW": "購票",
    es: "Comprar entradas", fr: "Billetterie", de: "Tickets", ru: "Билеты",
    ar: "حجز التذاكر", vi: "Đặt vé", id: "Pesan tiket", th: "จองบัตร",
  },
  home: {
    ko: "홈페이지", en: "Website", ja: "公式サイト", zh: "官网", "zh-TW": "官網",
    es: "Sitio web", fr: "Site web", de: "Website", ru: "Сайт",
    ar: "الموقع", vi: "Trang chủ", id: "Situs web", th: "เว็บไซต์",
  },
  // 예매처가 여러 곳일 때 목록 제목
  pickVendor: {
    ko: "예매처 선택", en: "Choose a seller", ja: "販売サイトを選択", zh: "选择购票处",
    "zh-TW": "選擇購票處", es: "Elegir vendedor", fr: "Choisir un vendeur", de: "Anbieter wählen",
    ru: "Выбрать продавца", ar: "اختر البائع", vi: "Chọn nơi bán", id: "Pilih penjual", th: "เลือกผู้ขาย",
  },
};

export function bookingLabel(type, locale = "ko") {
  const key = type === "festival" ? "home" : "book"; // 축제=홈페이지, 그 외(공연·전시·박람회)=예매
  return LABELS[key][locale] || LABELS[key].en;
}

export function bookingPickLabel(locale = "ko") {
  return LABELS.pickVendor[locale] || LABELS.pickVendor.en;
}

// 유형별 아이콘(축제=🔗 홈페이지, 그 외=🎫 예매)
export function bookingIcon(type) {
  return type === "festival" ? "🔗" : "🎫";
}
