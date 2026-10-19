# 영상 자동화 환경 (Remotion · HyperFrames · OpenMontage)

[에이나우] "클로드로 영상 만드는 무료 오픈소스 3개" 가이드북 기준으로 세팅한 환경 메모.
한 번에 설치하려면 저장소 루트에서 `bash scripts/setup-video-tools.sh` (Mac/Linux).

| 도구 | 역할 | 위치 | 확인 명령 |
|---|---|---|---|
| Remotion | 영상을 코드로 만드는 엔진 | `remotion-project/` | `cd remotion-project && npm run dev` |
| HyperFrames | 촬영본 위에 자막·그래픽 (Claude Code 플러그인) | `claude plugin list` | `npx hyperframes doctor` |
| OpenMontage | 스톡·음악·자막 파이프라인 | `OpenMontage/` (git clone, 커밋 안 함) | `cd OpenMontage && make preflight` |

## 사전 준비
- Node.js 22 이상 (`node -v`), ffmpeg (`ffmpeg -version`), Python 3.10 이상 (`python3 --version`)
- Claude Code CLI (`claude`) — HyperFrames 플러그인 설치에 필요

## Remotion
- 프로젝트: `remotion-project/` (`npx create-video@latest --hello-world`, TypeScript)
- 공식 스킬 12종: `remotion-project/.claude/skills/` (`npx skills add remotion-dev/skills`)
- 테스트 인트로: `src/Intro.tsx` — 9:16 세로(1080×1920) 10초, 검은 배경에 흰 글자가 한 줄씩 떠오름
  ```bash
  cd remotion-project
  npm run dev                                   # 미리보기(:3000)
  npx remotion render Intro out/intro.mp4       # mp4 렌더 (out/은 git 제외)
  ```
- 첫 렌더 때 Chrome Headless Shell을 내려받는다(수 분). 다운로드가 막힌 환경이면
  `--browser-executable=<크롬 경로>` 로 로컬 Chrome을 지정하면 된다.
- 클로드에게 시키기: `/remotion-create 내 릴스 대본으로 9:16 세로 쇼츠를 만들어줘 …`

## HyperFrames
```bash
claude plugin marketplace add heygen-com/hyperframes
claude plugin install hyperframes@hyperframes
npx hyperframes browser ensure    # 렌더용 Chrome Headless Shell
npx hyperframes doctor            # 점검
```
- 플러그인으로 깔았으면 `/hyperframes:hyperframes`, 스킬로 깔았으면 `/hyperframes` 로 부른다.
- doctor의 whisper-cpp / Kokoro TTS / MusicGen / Docker 항목은 **선택**(전사·로컬 음성·로컬 음악용)이라 없어도 렌더는 된다.

## OpenMontage
```bash
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage && make setup      # .venv 생성, requirements, remotion-composer npm, piper-tts, .env 생성
```
- 스톡 영상·음악을 쓰려면 `OpenMontage/.env` 에서 아래 두 줄에 무료 API 키를 넣는다.
  ```
  PEXELS_API_KEY=      # https://www.pexels.com/api/
  PIXABAY_API_KEY=     # https://pixabay.com/api/docs/
  ```
  (`.env`는 git 제외. 키 값을 문서·커밋에 적지 말 것)
- AGPL 라이선스: 그냥 쓰는 건 자유, 고쳐서 외부 서비스로 내놓으면 소스 공개 필요.
- OpenMontage 폴더는 별도 저장소 클론이라 이 저장소에 커밋하지 않는다(`.gitignore`).

## Windows
`make`가 없으면 `OpenMontage/Makefile`의 `setup` 타깃을 순서대로 수동 실행:
```powershell
py -3.10 -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd remotion-composer ; npm install ; cd ..
pip install piper-tts
npx --yes hyperframes --version
copy .env.example .env
```
ffmpeg는 `winget install ffmpeg` 또는 https://ffmpeg.org, Node는 https://nodejs.org LTS.
