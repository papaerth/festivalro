# LUMEROVIA Studio

**Where Memories Become Melodies** — 한국의 자연 풍경과 1970~80년대 올드팝 감성을 잇는 영어 음악 브랜드 LUMEROVIA의 AI 음악 제작 스튜디오.

참고 가사 분석 → 영어 제목·한국어 스토리 → 영어 가사(부분 재작성·음절 검증) → C/A/B 스타일 프롬프트 → Suno 원클릭 복사 → 영상 콘셉트까지 한 흐름으로 만들고, 모든 곡은 자동 저장·버전 관리됩니다.

## 실행

```bash
cd lumerovia-studio
npm install            # postinstall에서 prisma generate 실행
cp .env.example .env   # DATABASE_URL, ANTHROPIC_API_KEY
npx prisma db push     # SQLite 파일(prisma/dev.db) 생성
npm run dev            # http://localhost:3100
```

프로덕션: `npm run build && npm start` (포트 3100).

### 환경변수 (`.env`)

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | `file:./dev.db` — Prisma SQLite 파일 (prisma/ 폴더 기준) |
| `ANTHROPIC_API_KEY` | 서버 전용 Anthropic 키. **없으면 내장 샘플 생성기로 전체 흐름이 동작**하며 UI에 "샘플 모드"가 표시됩니다 |
| `LUMEROVIA_AI_MODEL` | 기본 `claude-opus-5-5` |

키는 서버 라우트(`src/app/api/ai/*`)에서만 사용되며 브라우저로 전달되지 않습니다. 모델이 안전상 응답을 거부하면 서버 측 폴백(`claude-opus-4-8`)으로 같은 요청을 다시 시도합니다.

## 테스트

서버를 띄운 뒤:

```bash
npm run test:api   # API 스모크 테스트 (전체 제작 흐름 + 버전 복원 + 프리셋 CRUD)
npm run test:e2e   # Playwright(Chromium) 브라우저 E2E — 클립보드 복사까지 검증
```

`test:e2e`는 `playwright` 패키지가 필요합니다 (`npm i -D playwright && npx playwright install chromium`).

## 구조

```
prisma/schema.prisma        StylePreset · Project · ProjectVersion (SQLite)
src/app/page.tsx            대시보드(곡 목록, 새 곡)
src/app/studio/[id]         6단계 스튜디오 (참고 가사 → 제목 → 가사 → 스타일 → Suno 복사 → 영상)
src/app/presets             스타일 프리셋 관리 (수정·추가·기본값·복원)
src/app/api/projects/*      프로젝트 CRUD, 자동 저장 PATCH, 복제, 버전 저장/복원
src/app/api/presets/*       프리셋 CRUD, 기본 제공 프리셋 복원
src/app/api/ai/*            analyze · titles · lyrics · rewrite · styles · video · compare
src/lib/lyricsAnalysis.ts   규칙 기반 영어 가사 분석(구성·음절·단어·강세·라임·슬래시·분위기·난이도) + 정밀 편집 비교
src/lib/styleBuilder.ts     프리셋 + 가사 내용(감정·이미지·호흡) → 10개 항목 + Suno 프롬프트
src/lib/presets.ts          C(기본)·A·B·C1·C2·C3 내장 프리셋
src/lib/ai/                 Anthropic 클라이언트, 프롬프트, 오프라인 샘플 생성기
src/components/studio/*     단계별 화면, 자동 저장 표시, 수정 기록 서랍
```

## 저작권 처리

참고 가사의 권리를 **본인 작품 / 이용 허락 받음**으로 표시한 경우에만 음절 수·행 수·공백 구조·슬래시 위치를 그대로 유지하는 **정밀 편집 모드**가 열립니다. 그 외(확인 안 함 / 타인 저작물)에는 구성·호흡·분위기 같은 음악적 특징만 AI에 전달하고 원문 문구는 전달하지 않습니다.
