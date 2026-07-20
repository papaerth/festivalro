// ────────────────────────────────────────────────────────────────
//  축제 세부 유형 태그 (불꽃놀이 / 야간 / 물놀이)
//   · 축제 제목·소개·장소 텍스트에서 아래 keywords 를 찾아 자동으로 태그를 붙입니다.
//   · 추가 API 호출 없음(이미 가진 데이터만 분석).
//
//  ✏️  기획자가 직접 고치는 곳은 딱 하나, 각 태그의 keywords 배열입니다.
//      단어를 넣으면 그 단어가 제목/소개에 있는 축제에 태그가 붙습니다(대소문자 무시).
//      예: 불꽃놀이 태그에 "야화" 를 추가하고 싶으면 fireworks.keywords 배열에 "야화" 만 추가.
//   · 자동 분류가 틀린 개별 축제는 tagCuration.js 에서 축제별로 바로잡습니다.
// ────────────────────────────────────────────────────────────────

export const TAG_DEFS = {
  fireworks: {
    emoji: "🎆",
    // 불꽃놀이 — 불꽃/불꽃축제/낙화놀이 등
    keywords: ["불꽃놀이", "불꽃축제", "불꽃", "낙화놀이", "불꽃쇼", "fireworks", "firework"],
  },
  night: {
    emoji: "🌙",
    // 야간 축제 — 야간/야시장/빛·등불/야행 등.
    //  ※ '밤' 한 글자는 넣지 않았습니다: '알밤축제·정안밤축제'(밤나무 열매)까지 잘못 잡혀서요.
    //     야간 뜻의 '밤'만 잡도록 아래처럼 두 글자 이상 조합으로 넣었습니다(밤바다·한여름밤 등).
    //  ※ '빛의'·영문 night 는 뺐습니다: 미술관 '빛의 여정' 전시·'A Sentimental Night' 공연까지
    //     잘못 잡혀서요. 야간 뜻이 분명한 '빛축제'만 남겼습니다.
    keywords: [
      "야간", "야시장", "야행", "야경", "빛축제", "루미나리에",
      "달빛", "불빛축제", "유등", "등불축제", "연등",
      "밤바다", "밤마실", "밤도깨비", "한여름밤", "나이트",
    ],
  },
  water: {
    emoji: "💧",
    // 물놀이 — 물놀이/워터/머드/해변/수영 등
    keywords: [
      "물놀이", "워터", "머드", "해변", "해수욕", "바다축제", "수영",
      "물총", "계곡", "래프팅", "비치", "썸머비치", "water",
    ],
  },
};

// 화면·필터에 태그를 보여주는 순서
export const TAG_ORDER = ["fireworks", "night", "water"];

// 텍스트에서 붙을 태그들을 찾습니다. (TAG_ORDER 순서로 반환)
export function detectTags(text = "") {
  const s = String(text).toLowerCase();
  const out = [];
  for (const key of TAG_ORDER) {
    const kws = TAG_DEFS[key].keywords;
    if (kws.some((kw) => s.includes(String(kw).toLowerCase()))) out.push(key);
  }
  return out;
}

// 축제 1건의 최종 태그 = 자동감지 + 큐레이션(수동 교정) 반영.
//  curationEntry 형태: { tags:[...] 완전지정 } 또는 { add:[...], remove:[...] }
//  ※ 분류는 '제목'만 봅니다(name+표시명): 주 데이터원(관광공사)의 소개문이 사실상 주소라
//     소개까지 넣으면 오분류(엉뚱한 축제에 태그)가 크게 늘어서요. 개별 보정은 tagCuration.js.
export function computeTags(festival, curationEntry) {
  const text = [festival.name, festival.displayName].filter(Boolean).join(" ");
  let tags = detectTags(text);
  if (curationEntry) {
    if (Array.isArray(curationEntry.tags)) tags = [...curationEntry.tags]; // 통째로 지정
    if (Array.isArray(curationEntry.add)) {
      for (const t of curationEntry.add) if (!tags.includes(t)) tags.push(t);
    }
    if (Array.isArray(curationEntry.remove)) {
      tags = tags.filter((t) => !curationEntry.remove.includes(t));
    }
  }
  // 유효한 태그키만, TAG_ORDER 순서로 정리
  return TAG_ORDER.filter((k) => tags.includes(k) && TAG_DEFS[k]);
}
