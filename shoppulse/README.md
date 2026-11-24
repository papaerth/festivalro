# SHOPPULSE 3.0 — 연예인 유튜브 기반 AI 쇼핑 쇼츠 상품 소싱 시스템

Windows PC에서 실행하는 로컬 프로그램입니다. 연예인 공식 유튜브 영상에서 상품 관련 장면을 찾아 기록하고,
vidIQ 지표·실제 조회수 시계열·소싱 점수·검증 상태·편성표·쇼츠 기획안을 한 화면(한국어 대시보드)에서 관리합니다.

- 백엔드: Python 3.11+ / FastAPI / SQLAlchemy / SQLite (`backend/`)
- 프런트엔드: React + TypeScript + Vite + Tailwind + Recharts (`frontend/`)
- 데이터: `data/shoppulse.db` (SQLite), 백업: `backups/`, 설정: `config/*.json`, 키: `.env`

> 데이터 신뢰성 원칙: 가짜 조회수·Outlier·VPH·타임스탬프·발언을 만들지 않습니다. 미확인 값은 0이 아니라 **NULL(미확인)** 로 저장하고,
> 조회수 그래프는 **실제 관측 스냅샷**만 그리며 데이터가 부족하면 **판별 불가**로 표시합니다. 시연용 데이터는 `DEMO` 표시로 운영 데이터와 분리됩니다.

---

## 1. 설치 (최초 1회)

1. [Python 3.11 이상](https://www.python.org/downloads/) 설치 — 설치 화면에서 **"Add python.exe to PATH"** 체크
2. [Node.js LTS](https://nodejs.org/) 설치 (화면 빌드용, 최초 설정과 업데이트 때만 필요)
3. `shoppulse` 폴더에서 **`setup.bat`** 더블클릭
   - Python 가상환경 생성 → 패키지 설치 → `.env` 생성 → 화면 빌드 → 상태 점검
4. (선택) `shoppulse/.env` 를 메모장으로 열어 키 입력
   - `YOUTUBE_API_KEY=` : YouTube Data API v3 키 (Google Cloud Console → API 및 서비스 → 사용자 인증 정보). 없어도 실행되며, 자동 수집만 비활성.
   - `ANTHROPIC_API_KEY=` + `SHOPPULSE_AI_PROVIDER=anthropic` : AI 기획안. 없으면 템플릿 기획안으로 동작.
   - `SHOPPULSE_PORT=8787` : 포트가 겹치면 변경
   - **키는 절대 Git/공유 폴더에 올리지 마세요. `.env` 는 `.gitignore` 에 포함되어 있습니다.**

## 2. 매일 사용

- 바탕화면의 **「SHOPPULSE 3.0」 아이콘** 더블클릭 → 서버가 작업 표시줄에 최소화된 채 켜지고 브라우저에 `http://localhost:8787` 이 열립니다. 이미 켜져 있으면 브라우저만 엽니다. (아이콘이 없으면 `make_shortcut.bat` 실행)
- `start.bat` : 서버 창을 보이게 실행 / `stop.bat` : 서버 종료 (최소화된 서버 창을 닫아도 됨)
- **`backup.bat`** : JSON 전체 백업을 `backups/` 에 생성
- **`restore.bat`** : 백업 JSON 파일을 아이콘 위로 끌어다 놓으면 복원 (복원 전 사전 백업 자동 생성)
- **`doctor.bat`** : 환경·DB 상태 점검
- **`update.bat`** : GitHub 최신 코드로 업데이트(데이터·키 보존)
- 자동 소싱(매일 05:00 Asia/Seoul)은 **PC와 start.bat 창이 켜져 있을 때만** 실행됩니다. 기본은 비활성이며 설정 화면에서 켭니다. 기존 ChatGPT 예약 브리핑과는 별개 시스템입니다.

### 문제 해결
- `ImportError: DLL load failed ... 애플리케이션 제어 정책에서 이 파일을 차단했습니다` : Windows 스마트 앱 컨트롤이 서명 없는 확장 파일을 막은 것입니다. `setup.bat` 을 다시 실행하면 SQLAlchemy 컴파일 확장을 제거하고 순수 Python 모듈로 동작하게 바꿉니다(기능 동일, 속도만 약간 느림).
- `setup.bat` 창이 저절로 닫힘 / 오류 : 최신 배치 파일로 교체 후 다시 실행. 모든 배치 파일은 오류가 나도 창이 남습니다.
- 포트 충돌 : `.env` 의 `SHOPPULSE_PORT` 변경.

### 업데이트 시
`start.bat` 창을 닫고 **`update.bat`** 더블클릭. 자동으로 백업 → GitHub 최신 코드 내려받기 → 덮어쓰기(`data/`, `.env`, `backups/`, 가상환경, `node_modules` 유지) → `setup.bat` 갱신까지 진행합니다. 끝나면 `start.bat` 실행.
받아올 브랜치는 기본 `claude/practical-darwin-xswmhh` 이며 `.env` 에 `SHOPPULSE_UPDATE_BRANCH=main` 처럼 적어 바꿀 수 있습니다.

---

## 3. 화면 구성

| 메뉴 | 내용 |
|---|---|
| 대시보드 | 채널 수·영상 수·오늘 후보·최종 추천·그래프 유형별 수·검증 대기·마지막 수집 시각, 최근 소싱 보고서, 데이터 연결 상태, 오늘 소싱 실행 버튼 |
| 소싱 후보 | 카드(썸네일·연예인·채널·제목·게시일·길이·조회수·VPH·Outlier·그래프·점수·상품·유형·검증·판매·추천 시간대) + 13종 필터 + 8종 정렬 |
| 후보 상세 | 원본 열기·장면 이동 링크, 실제 조회수 그래프, 지표, 연예인 실제 발언, 상품·판매처, 점수(AI 제안/사람 입력 분리, 항목별 근거), 검증 체크리스트(중대 항목 미해결 시 제작 준비 아님), 제작 상태, 쇼츠 기획안 |
| 영상 | 저장된 영상 검색·필터·정렬, 영상 등록(URL/ID, 중복 방지, API 조회 또는 수동) |
| 영상 상세 | 조회수 관측 입력, vidIQ 지표 입력(기준·출처·측정시각), 장면(타임스탬프·발언·유형·협찬·추천/언급) 기록, 상품 연결, 후보 등록 |
| 연예인·채널 | 시드 63개(모두 **검증 전**, 채널 ID 없음) + 등록·수정·검증, YouTube 채널 ID 조회(자동 확정 안 함), 채널 영상 수집 |
| 상품 | 상품(확인 상태 5단계)·판매처(가격·재고·제휴, 확인 시점 표기) |
| 하루 9편 편성표 | 3채널×3시간대 그리드, 드래그 앤 드롭 배정, 상태 8단계, 시간대 배치 가설 표시 |
| 데이터 수집·가져오기 | YouTube 채널 수집·조회수 갱신, vidIQ JSON/CSV 가져오기, 데이터 소스 상태, 작업 이력, 보고서 이력 |
| 설정·백업 | 점수 배점·등급(버전 관리), 그래프 규칙, Outlier/VPH 기준, 시간대 가설, 기본 지역·명절, 자동 소싱 토글, 백업·복원·CSV 내보내기 |

---

## 4. 데이터 연동 현황 (솔직한 상태)

| 소스 | 상태 | 설명 |
|---|---|---|
| YouTube Data API v3 | **구현됨 (키 필요)** | 채널 검색/확인, 업로드 목록 기반 최근 3년 영상 수집, 메타데이터 갱신, 조회수 스냅샷 축적, 중복 방지, 할당량 계산·`quotaExceeded` 오류 표시, 작업 이력 |
| vidIQ | **JSON/CSV 가져오기 구현** | vidIQ는 외부 프로그램용 공개 REST API를 제공하지 않습니다. 공식 외부 접근 경로는 ChatGPT·Claude 등에 연결하는 **vidIQ MCP 서버**입니다. 그 대화에서 얻은 `vidiq_get_videos_by_ids`(최신 VPH·Outlier·참여율) / `vidiq_video_stats`(일별 조회수·VPH 시계열) 응답 JSON을 그대로 가져옵니다(실제 응답 구조로 테스트됨). Outlier `null` → 미확인, VPH 측정 구간은 vidIQ가 명시하지 않아 '기준 미확인'으로 저장. 프로그램이 직접 vidIQ에 접속하는 기능은 **없습니다**. |
| AI 기획안 | 템플릿 구현 / Claude 어댑터 구현(키 필요) | 템플릿은 저장된 발언·상품만 사용하고 빈 곳은 `[작성 필요]`. Claude 어댑터는 발언 생성 금지·협찬 은폐 금지 규칙을 프롬프트에 포함하고 JSON 스키마로 출력. |
| AI 영상 내용 분석(자막·전사 자동 분석) | **미구현** | 장면·발언·타임스탬프는 사람이 확인해 입력합니다(접근 상태 5단계 기록). 자막 자동 수집은 YouTube API의 caption 존재 여부만 기록. |
| 쿠팡·네이버쇼핑 상품 조회 | **미구현** | 판매처·가격·재고·제휴 가능 여부는 수동 입력, 확인 시각 함께 저장 |
| 날씨 | **미구현** | 계절·공휴일·소비 이벤트는 날짜 기반 계산. 설·추석은 설정에서 날짜 입력 |
| 자동 소싱 스케줄러 | 구현(기본 비활성) | APScheduler, 매일 05:00 Asia/Seoul. 저장된 후보를 재평가해 카테고리별 후보 9·추천 3을 **실제 확보한 수만큼** 보고서에 기록, 전날 중복 사유 기록 |

## 5. 그래프 분석 규칙 (config/graph_rules.json)

실제 관측(`view_snapshots`)이 최소 4개·72시간 이상일 때만 판별합니다.
- 급등 후 평탄화: 최고 증가 속도가 관측 전반 40% 안에 있고 현재 속도의 5배 이상
- 재상승: 고점 → 저점(고점의 30% 이하) → 저점의 3배 이상이며 고점의 20% 이상으로 반등
- 꾸준히 상승: 구간별 증가 속도 변동계수 0.5 이하
- 뒤늦은 급상승: 초반 40% 평균 속도가 최고 속도의 30% 이하이고 최고점이 후반 60% 이후
- 그 외: 분류 보류 / 데이터 부족: 판별 불가
3년 전 조회수 기록은 복원하지 않습니다. 매일 조회수를 갱신해야 그래프가 쌓입니다.

## 6. 소싱 점수 (config/scoring.json)

후킹 25 / vidIQ 성과 20 / 독창적 해설 20 / 구매 연결 15 / 타깃 10 / 계절·시간 10 = 100.
AI 제안은 **실제 지표가 있는 '성과' 항목만** 생성하고 나머지는 사람 평가 대기(NULL). 모든 항목이 채워져야 총점·등급이 산출됩니다.
등급 80+ 최우선 / 65+ 적극 / 50+ 관찰 / 그 외 낮음 (설정에서 수정, 버전 관리). Outlier·VPH 구간은 SHOPPULSE 운영 참고 기준이며 vidIQ 공식 등급이 아닙니다.

## 7. 개발자용

```bash
# 백엔드 테스트
cd backend && .venv/bin/python -m pytest -q tests      # Windows: .venv\Scripts\python -m pytest -q tests
# 개발 서버 (API :8787 + Vite :5173 프록시)
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8787
cd frontend && npm run dev
# API 문서
http://localhost:8787/docs
```

구조: `backend/app/models.py`(20개 엔터티) · `services/`(scoring, graph_analysis, metrics(vidIQ import), youtube_connector, collection, daily_sourcing, shorts_planner, backup, scheduler, season) · `routers/`(REST) · `seeds/`(시드 채널) · `frontend/src/pages/`(10개 화면).
DB는 SQLAlchemy URL(`SHOPPULSE_DATABASE_URL`)만 바꾸면 PostgreSQL로 전환할 수 있도록 설계했습니다(현재 스키마는 `create_all` 로 생성, 마이그레이션 도구는 아직 없음).
