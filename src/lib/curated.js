// ────────────────────────────────────────────────────────────────
//  큐레이션 정보 로더
//   - data/curated/<콘텐츠ID>.json 파일이 있으면 그 축제의 '직접 입력' 정보를 읽어옵니다.
//   - 파일이 없으면 null → 해당 섹션들은 화면에 아예 표시되지 않습니다.
//   - 코딩을 몰라도 JSON 파일만 추가하면 되도록 설계 (data/curated/README.md 참고).
// ────────────────────────────────────────────────────────────────

// [공개] 축제 id로 큐레이션 JSON을 읽어옵니다. 없거나 오류면 null.
export async function getCurated(id) {
  // 경로 조작 방지: 안전한 문자만 허용 (숫자 contentId / s해시 / 슬러그)
  const safe = String(id || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) return null;
  try {
    // 정적 폴더를 통째로 번들에 포함(웹팩 컨텍스트). 새 파일 추가 시 재배포하면 반영됨.
    const mod = await import(`../../data/curated/${safe}.json`);
    return mod?.default || mod || null;
  } catch {
    return null; // 파일 없음 → 큐레이션 섹션 숨김
  }
}
