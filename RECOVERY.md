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
| `YOUTUBE_API_KEY` | 영상 섹션 | console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → API 키(`AIza...`) |
| `NEXT_PUBLIC_GA_ID` | 방문 통계(GA) | analytics.google.com → 관리 → 데이터 스트림 → **측정 ID(`G-...`)** |
| `GG_DATA_KEY` *(선택)* | **킨텍스(KINTEX) 전시·박람회** 일정 | data.gg.go.kr(경기데이터드림) → 회원가입/로그인 → 인증키 발급 → "킨텍스_KINTEX 행사 일정" Open API 신청 후 받은 **인증키**. 안 넣으면 킨텍스만 빠지고 나머지 전시·공연/축제는 정상. |

> 🎪 **전시·박람회·공연 안내:** 축제 외에 전시회·박람회·공연도 자동으로 나옵니다. **추가 키·신청 없이 기본 동작**합니다.
> - **작동 방식:** 관광공사(TourAPI) 행사 목록에서 **분류코드 + 제목(박람회·엑스포·비엔날레·…페어 / 뮤지컬·콘서트·공연 등)** 으로 유형을 자동 판정합니다. 추가 API 호출이 전혀 없어 할당량 문제도 없습니다. (예: 서울일러스트레이션페어, 경남고성공룡세계엑스포, 부산국제불교박람회 → 전시·박람회로 자동 태깅)
> - **직접 등록:** 코엑스·벡스코처럼 관광공사에 없는 상업 전시는, 주최사가 `/submit`에서 유형을 "전시·박람회/공연"으로 골라 직접 올릴 수 있습니다.
> - **킨텍스(고양) 전용 일정(선택):** 아래 `GG_DATA_KEY`(경기데이터드림 무료 발급)를 넣으면 킨텍스 일정이 추가로 붙습니다.
>
> 참고(개발자용): 문화포털 「공연전시정보」 API(data.go.kr 15138937) 연동 코드도 있으나(`CULTURE_API_ENABLED=true`), 현재 해당 정부 API 게이트웨이가 불안정(500)해 **기본 비활성**입니다. TourAPI 제목분류 방식이 기본이라 신경 안 쓰셔도 됩니다.

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
- [ ] `.env.local` 생성 후 위 7개 키 채우기 (발급처에서 확인) · 킨텍스 원하면 `GG_DATA_KEY` 추가(선택)
- [ ] `npm run dev` → http://localhost:3000 확인

---
*이 문서는 실제 키 값을 담지 않습니다. 값은 각 발급처와 로컬 `.env.local`에만 존재합니다.*
