# 축제로 (festivalro) — Claude 작업 안내

전국 축제·공연·전시·시장·불꽃놀이 명소를 지도에서 보여주는 Next.js 사이트. 운영 도메인: chukjero.com (Vercel 배포).
사용자와의 대화는 **한국어**로 한다. 커밋 메시지도 기존 관례대로 한국어(`feat:`, `fix:`, `data:`, `docs:`, `i18n:` 접두어).

## 명령
- `npm install` — 원격(웹/모바일) 세션에서는 `.claude/hooks/session-start.sh`가 자동 실행
- `npm run dev` — 로컬 개발 서버(:3000)
- `npx next build` — 유일한 실질 검증. 코드 변경 후 반드시 통과 확인
- ESLint/테스트는 **설정돼 있지 않다** (`next lint`는 대화형 설정 프롬프트가 떠서 쓰지 말 것)
- `node scripts/refresh-curated.mjs` — 큐레이션 데이터 최신성 점검(GitHub Actions 매월 1일)
- `node scripts/verify-culture.mjs` — 문화정보 API 검증

## 구조
- `src/app/[locale]/` — App Router, 13개 언어 locale 프리픽스. 페이지: 홈, `festival/[id]`, `place/[id]`, `market/[id]`, `[cityRoute]`, `festivals-in-korea/…`(영문 SEO 랜딩), `this-weekend`, `submit`, `mypage`, `admin/report` 등
- `src/app/api/` — 라우트 핸들러(weather, blog, videos, booking, submit, report, cron/refresh·digest, moderate 등)
- `src/components/` — 클라이언트 컴포넌트. 지도는 `MapView.js` + `MapDetailPanel.js` + `MapFilters.js`(Leaflet, react-leaflet, markercluster)
- `src/lib/` — 데이터 소스와 비즈니스 로직
  - `festivals.js`(TourAPI), `kopis.js`(공연), `seoul.js`, `kcisa.js`/`culture.js`(전시), `kintex.js`, `markets.js`, `fireworksSpots.js`
  - `i18n.js`/`I18nProvider.js`(번역), `translate.js`/`translateAI.js`(Google/Claude 번역)
  - `supabaseClient.js`(브라우저, anon), `supabaseAdmin.js`(서버 전용 service_role)
  - `seoLanding.js`, `season.js`, `curated.js`, `related.js`, `popular.js`
- `data/` — 정적 데이터: `curated/*.json`(축제별 큐레이션), `markets/markets.json`, `season/bloom.json·foliage.json`, `permanent-fireworks.js`
- `supabase/*.sql` — DB 스키마·크론 로그·헬스 테이블
- `vercel.json` — Vercel cron(refresh 18:00 UTC, digest 12:00 UTC)

## 환경변수
`.env.local.example` 참고. **키가 없어도 내장 샘플 데이터로 동작**하도록 설계되어 있으므로, 원격 세션에서 `.env.local`이 없어도 빌드·대부분 기능은 정상.
- 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` 등)는 절대 `NEXT_PUBLIC_` 붙이지 말 것
- 키 값을 문서·코드·커밋에 적지 말 것(공개 저장소)

## 작업 원칙
- 모바일 우선 반응형. 지도(Leaflet)는 SSR 불가 → `dynamic(..., { ssr: false })` 패턴 유지
- 사용자 노출 문자열은 13개 언어 i18n 사전에 함께 추가
- 외부 API 호출부는 실패 시 빈 배열/폴백으로 조용히 넘어가는 기존 패턴 유지(사이트가 죽지 않게)
- 데이터 출처 표기(KOPIS 등 이용조건)를 제거하지 말 것
- 큰 변경(메이저 업그레이드, 스키마 변경, 배포 설정)은 먼저 사용자에게 설명하고 확인
- `RECOVERY.md`(로컬 환경 복구), `SECURITY.md`(월간 보안 점검 절차) 참고
