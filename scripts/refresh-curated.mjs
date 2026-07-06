#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────
//  큐레이션 최신성 점검 도우미
//  - data/curated/*.json 을 훑어 "year"가 올해보다 오래됐거나 없는 파일을 찾아줍니다.
//  - 매년(또는 주기적으로) 실행: `node scripts/refresh-curated.mjs`
//  - GitHub Actions(.github/workflows/curated-freshness.yml)로 자동 실행도 됩니다.
//  ※ 자동 수집 섹션(프로그램·이용안내·날짜·주변·홈페이지)은 TourAPI에서 매년
//    자동 갱신되므로 이 스크립트의 점검 대상이 아닙니다. (수동 큐레이션만 점검)
// ────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "curated");
const nowYear = new Date().getFullYear();

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
let needReview = 0;

console.log(`\n📋 큐레이션 최신성 점검 — 기준 연도 ${nowYear}\n`);

for (const f of files) {
  let j;
  try {
    j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch (e) {
    console.log(`❌ ${f}  — JSON 형식 오류: ${e.message}`);
    needReview++;
    continue;
  }
  const year = j.year ?? null;
  const src = j._source || "(출처 미기재)";
  let flag;
  if (year == null) flag = "⚠️  year 없음";
  else if (year < nowYear) flag = `🔴 오래됨 (${year}) → 갱신 필요`;
  else flag = `🟢 최신 (${year})`;

  console.log(`${flag}  ${f}`);
  if (year == null || year < nowYear) {
    needReview++;
    console.log(`     ↳ 최신 정보 확인: ${src}`);
  }
}

console.log(
  `\n총 ${files.length}개 중 ${needReview}개 점검 필요.` +
    (needReview
      ? `\n각 파일의 _source 링크에서 최신 정보를 확인해 값을 수정하고, "year"를 올해(${nowYear})로 바꾼 뒤 저장·배포하세요.\n`
      : `\n모두 최신입니다. 👍\n`)
);

// GitHub Actions에서 실패로 표시하고 싶으면 아래 주석을 해제하세요.
// if (needReview) process.exitCode = 1;
