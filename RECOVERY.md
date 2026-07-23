# 🛟 축제로(festivalro) 복구 가이드

> **터미널에서 여는 법:** `cd C:\Users\sskk1\OneDrive\Desktop\festivalro` → `claude`

> PC를 초기화했거나 새 컴퓨터에서 다시 개발을 시작할 때, **이 문서 하나만 순서대로 따라 하면** 로컬 개발 환경이 복구됩니다.
> 사이트 코드는 GitHub에, 배포는 Vercel에 있으므로 **운영 중인 사이트(chukjero.com)는 이 작업과 무관하게 계속 정상 동작**합니다.
>
> ⚠️ **보안:** 이 문서에는 실제 API 키 값을 **절대 적지 않습니다.** (공개 저장소) 키 값은 아래 "발급처"에서 그때그때 확인해 `.env.local`에만 넣으세요. `.env.local`은 `.gitignore`에 등록돼 있어 GitHub에 올라가지 않습니다.

---

## 1. 필요한 프로그램 설치

| 프로그램 | 확인 명령 | 없을 때 설치 (Windows) |
|----------|-----------|------------------------|
| Node.js | `node --version` | https://nodejs.org 에서 LTS 설치 |
| Git | `git --version` | `winget install --id Git.Git -e` |
| GitHub CLI | `gh --version` | `winget install --id GitHub.cli -e` |
| Vercel CLI | `vercel --version` | `npm install -g vercel` |

> 설치 중 파란색 권한(UAC) 팝업이 뜨면 "예"를 누르세요.
> 새로 설치한 명령은 **새 터미널 창**을 열어야 인식됩니다.

---

## 2. GitHub 로그인 & 저장소 복원

```powershell
gh auth login        # GitHub.com → HTTPS → 브라우저 로그인
cd $HOME\OneDrive\Desktop
gh repo clone papaerth/festivalro
cd festivalro
```

---

## 3. 프로젝트 실행 준비

```powershell
npm install
```

---

## 4. API 키 다시 넣기 (`.env.local`)

`.env.local.example` 파일을 복사해 `.env.local`로 만든 뒤, 아래 키들을 채웁니다.
**키 값은 Vercel에서 되받을 수 없습니다**(Sensitive/암호화 저장). 반드시 아래 **각 발급처에서 "기존 값 확인"**(재발급 아님)해서 넣으세요.

| 키 이름 | 용도 | 발급처에서 확인하는 방법 |
|---------|------|--------------------------|
| `TOUR_API_KEY` | 홈 축제 데이터(한국관광공사) | data.go.kr → 로그인 → 마이페이지 → 오픈API → 개발계정 → **일반 인증키(Decoding)** |
| `NAVER_CLIENT_ID` | 블로그 후기 탭 | developers.naver.com/apps → 내 애플리케이션 → 개요 → **Client ID** |
| `NAVER_CLIENT_SECRET` | 블로그 후기 탭 | 같은 화면 → Client Secret **[보기]** (ID와 다른 짧은 값) |
| `NEXT_PUBLIC_SUPABASE_URL` | 회원/로그인 | supabase.com → 프로젝트 → Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 회원/로그인 | 같은 화면 → **anon / public** 키 (공개돼도 되는 키) |
| `SUPABASE_SERVICE_ROLE_KEY` | 등록·제보 저장, 알림, 상태감시(서버 전용) | 같은 화면 → **service_role** 키 (⚠️ 비공개 — 절대 노출 금지) |
| `YOUTUBE_API_KEY` | 영상 섹션 | console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → API 키(`AIza...`) |
| `GOOGLE_TRANSLATE_API_KEY` | 다국어 번역(기계) | console.cloud.google.com → 같은 프로젝트 → Cloud Translation API 사용설정 → API 키 |
| `ANTHROPIC_API_KEY` *(선택)* | 소개글 고품질 AI 번역 | console.anthropic.com → API Keys → 발급(`sk-ant-...`). 없으면 Google 번역으로 자동 폴백 |
| `RESEND_API_KEY` | 등록 다이제스트·**API 상태 경고** 메일 | resend.com → 로그인 → **API Keys** → 발급(`re_...`) |
| `REPORT_TO_EMAIL` | 위 알림을 받을 내 이메일 | 내 이메일 주소 (Resend 도메인 미인증 시 Resend 가입 이메일로만 수신) |
| `NEXT_PUBLIC_GA_ID` | 방문 통계(GA) | analytics.google.com → 관리 → 데이터 스트림 → **측정 ID(`G-...`)** |
| `CRON_SECRET` *(선택)* | 크론·`/admin/report` 잠금 | 임의의 긴 문자열 직접 생성. 넣으면 `/admin/report?key=<값>` 이어야 열림 |
| `SEOUL_API_KEY` *(권장·선택)* | **서울시 전시/미술·공연** 대폭 보강 | data.seoul.go.kr(서울 열린데이터광장) → 회원가입 → 로그인 → 마이페이지 → **인증키 신청**(즉시 자동발급, 무료) → 받은 키. 안 넣으면 서울 전시·공연만 빠지고 나머지는 정상. |
| `GG_DATA_KEY` *(선택)* | **킨텍스(KINTEX) 전시·박람회** 일정 | data.gg.go.kr(경기데이터드림) → 회원가입/로그인 → 인증키 발급 → "킨텍스_KINTEX 행사 일정" Open API 신청 후 받은 **인증키**. 안 넣으면 킨텍스만 빠지고 나머지 전시·공연/축제는 정상. |
| `KOPIS_API_KEY` *(권장·선택)* | **전국 공연**(연극·뮤지컬·콘서트·무용·국악) 보강 | kopis.or.kr(공연예술통합전산망) → 회원가입/로그인 → **오픈API 활용신청**(무료, 이메일로 서비스키 발급) → 받은 키. 안 넣으면 서울 밖 공연만 빠지고 나머지는 정상. (스캔량 `KOPIS_MAX_PAGES`) |
| `CULTURE_API_KEY` *(권장·선택)* | **전국 전시·공연**(문화공공데이터광장) 보강 | data.go.kr/문화공공데이터광장 → "한눈에보는문화정보조회서비스"(15138937) **활용신청**(무료) → 받은 인증키. Encoding/Decoding 아무거나(앱이 정규화). 넣으면 자동 켜짐. 검증: `node scripts/verify-culture.mjs` |

> 🎪 **전시·박람회·공연 안내:** 축제 외에 전시회·박람회·공연도 자동으로 나옵니다. **추가 키·신청 없이 기본 동작**합니다.
> - **작동 방식:** 관광공사(TourAPI) 행사 목록에서 **분류코드 + 제목(박람회·엑스포·비엔날레·…페어 / 뮤지컬·콘서트·공연 등)** 으로 유형을 자동 판정합니다. 추가 API 호출이 전혀 없어 할당량 문제도 없습니다. (예: 서울일러스트레이션페어, 경남고성공룡세계엑스포, 부산국제불교박람회 → 전시·박람회로 자동 태깅)
> - **서울 전시·공연 대폭 보강(권장·선택):** 아래 `SEOUL_API_KEY`(서울 열린데이터광장 무료 발급)를 넣으면, **서울시 전시/미술·공연 수천 건**이 좌표·이미지와 함께 추가됩니다. 코엑스 등 서울 상업 전시 보강에 가장 효과적입니다.
> - **직접 등록:** 관광공사·서울API에도 없는 상업 전시는, 주최사가 `/submit`에서 유형을 "전시·박람회/공연"으로 골라 직접 올릴 수 있습니다.
> - **킨텍스(고양) 전용 일정(선택):** 아래 `GG_DATA_KEY`(경기데이터드림 무료 발급)를 넣으면 킨텍스 일정이 추가로 붙습니다.
> - 모든 소스는 **이름+지역 기준 중복 제거**되어 같은 행사가 두 번 나오지 않습니다.
>
> 참고(개발자용): 문화포털 「공연전시정보」 API(data.go.kr 15138937) 연동 코드도 있으나(`CULTURE_API_ENABLED=true`), 현재 해당 정부 API 게이트웨이가 불안정(500)해 **기본 비활성**입니다. TourAPI 제목분류 방식이 기본이라 신경 안 쓰셔도 됩니다.

> 🩺 **API 상태 자동 감시:** 위 외부 API들이 조용히 죽는 걸 막기 위해, **하루 1회(자동 새로고침 때 겸사겸사)** 각 API를 가볍게 한 번씩 호출해 정상 여부를 확인합니다.
> - **이틀 연속 실패**하면 `REPORT_TO_EMAIL`로 **경고 메일**이 옵니다: "○○ API가 응답하지 않습니다 — 키 만료 또는 개편 가능성". → 위 표에서 해당 키를 재발급/교체하세요. (단, **표준데이터**는 원래 느린 정부 호스트라 **7일 연속**일 때만 알림 — 표시등에는 빨강으로 그대로 보임. 소스별 기준은 `src/lib/health.js`의 `alertAfter`.)
> - 실시간 상태는 **`chukjero.com/admin/report`** 에서 초록/빨강/회색 표시등으로 확인할 수 있습니다. (`CRON_SECRET`을 설정했다면 `/admin/report?key=<CRON_SECRET>`)
> - **어떤 API가 죽어도 사이트는 나머지 소스로 정상 동작**하도록 설계돼 있습니다(모든 외부호출이 `Promise.allSettled`+개별 폴백).
> - ⚙️ **최초 1회 설정(이메일 알림용):** Supabase → SQL Editor 에 `supabase/schema.sql`을 다시 붙여넣고 **[Run]** 하면 상태 저장 테이블(`api_health`)이 생깁니다. (안 해도 `/admin/report` 실시간 표시는 동작하지만, '이틀 연속' 추적·메일 알림은 이 테이블이 있어야 켜집니다.)
> - ⚙️ **최초 1회 설정(갱신 이력용, 선택):** Supabase → SQL Editor 에 `supabase/cron_runs.sql`을 붙여넣고 **[Run]** 하면 `cron_runs` 테이블이 생겨 `/admin/report`의 **'최근 자동 갱신 이력'**(소스별 수집 건수·소요시간·성공/실패)이 채워집니다. (안 해도 자동 갱신·사이트는 정상, 이력만 안 남음.)

## 🔄 자동 갱신 (수동 개입 불필요)

- 매일 1회 **`/api/cron/refresh`** 크론이 전 소스를 새로 수집→전 언어 재생성→건강점검→이력 기록까지 자동 처리합니다.
- 소스별 갱신 주기는 코드의 캐시 TTL로 자동 적용: **축제·전시·공연 12시간(하루 2회)**, **표준데이터 7일(주 1회)**. 유튜브·네이버·날씨는 방문 시 브라우저가 직접 갱신.
- 종료일이 지난 이벤트는 목록·지도·캐러셀에서 자동 제외됩니다(상세페이지 URL은 유지). 조회 날짜는 모두 '올해 기준'으로 동적 계산돼 **해마다 수동 갱신할 필요가 없습니다.**
- ⏰ **연 1회 수동 확인 필요:** **KOPIS 인증키**는 유효기간(발급 후 약 1년)이 있어 만료 전 kopis.or.kr에서 연장/재발급해야 합니다. 만료되면 `/admin/report`에서 'KOPIS' 빨강 + 이틀 뒤 메일 알림이 오니, 그때 갱신하면 됩니다.

메모:
- `_BASE`, `_HOST`, `_ENABLED`로 끝나는 변수는 코드에 기본값이 있어 **넣지 않아도 됩니다.** (`EVENTS_API_ENABLED=false`로 전시·공연 자동수집을 끌 수 있음)
- `CRON_SECRET`은 운영(Vercel)의 자동 새로고침용이라 **로컬 개발에는 불필요**합니다.
- 키를 비워두면 해당 기능만 샘플/링크로 대체되고 **사이트 자체는 정상 실행**됩니다.
- 💡 **Supabase anon 키(`eyJ...`)에는 프로젝트 주소가 들어있어**, 키만 있으면 URL은 `https://<ref>.supabase.co`로 복원할 수 있습니다.

### 참고: Vercel에 저장된 키 목록만 확인하기(값은 안 보임)
```powershell
vercel login
vercel link          # festivalro/festivalro 선택
vercel env ls        # 키 "이름"만 확인 가능 (값은 Sensitive라 안 보임)
```

---

## 5. 로컬에서 사이트 실행 & 확인

```powershell
npm run dev
```
- 브라우저에서 **http://localhost:3000** 접속
- 종료는 터미널에서 **Ctrl + C**

### 키가 잘 들어갔는지 빠른 점검 (선택)
| 확인 대상 | 주소 | 정상 응답 |
|-----------|------|-----------|
| 홈(축제 데이터) | `http://localhost:3000` | 페이지가 뜨고 실제 축제 목록이 보임 |
| 블로그 API | `http://localhost:3000/api/blog?query=진해군항제` | `"configured": true` |
| 영상 API | `http://localhost:3000/api/videos?query=진해군항제` | `"configured": true` |

---

## 요약 체크리스트
- [ ] Node.js / Git / GitHub CLI 설치
- [ ] `gh auth login` 로그인
- [ ] `gh repo clone papaerth/festivalro`
- [ ] `npm install`
- [ ] `.env.local` 생성 후 위 7개 키 채우기 (발급처에서 확인) · 선택: `SEOUL_API_KEY`(서울 전시·공연 보강), `GG_DATA_KEY`(킨텍스)
- [ ] `npm run dev` → http://localhost:3000 확인

---
*이 문서는 실제 키 값을 담지 않습니다. 값은 각 발급처와 로컬 `.env.local`에만 존재합니다.*
