#!/usr/bin/env bash
# 영상 자동화 3종(Remotion · HyperFrames · OpenMontage) 설치 스크립트 — Mac/Linux용.
# Windows는 VIDEO.md의 "Windows" 절을 보고 같은 순서로 수동 실행.
# 사용법: bash scripts/setup-video-tools.sh   (festivalro 저장소 루트에서)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [0] 사전 준비 점검 =="
NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "ERROR: Node.js 22 이상이 필요합니다 (현재 $(node -v)). https://nodejs.org 에서 LTS 설치"; exit 1
fi
echo "node $(node -v) OK"
if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg 없음 — 설치 시도"
  if command -v brew >/dev/null; then brew install ffmpeg
  elif command -v apt-get >/dev/null; then sudo apt-get update && sudo apt-get install -y ffmpeg
  else echo "ERROR: ffmpeg를 https://ffmpeg.org 에서 설치 후 다시 실행"; exit 1; fi
fi
echo "$(ffmpeg -version | head -1) OK"
PY=$(command -v python3.10 || command -v python3 || true)
if [ -z "$PY" ]; then echo "ERROR: Python 3.10 이상 필요 (https://python.org)"; exit 1; fi
"$PY" -c 'import sys; assert sys.version_info >= (3,10), sys.version' && echo "$("$PY" --version) OK"

echo; echo "== [1] Remotion =="
if [ ! -d remotion-project/node_modules ]; then
  if [ -d remotion-project ]; then
    (cd remotion-project && npm install)
  else
    npx -y create-video@latest --yes --hello-world remotion-project
  fi
fi
(cd remotion-project && npx -y skills add remotion-dev/skills -y -a claude-code)
echo "Remotion OK — cd remotion-project && npm run dev 로 미리보기"

echo; echo "== [2] HyperFrames =="
if command -v claude >/dev/null; then
  claude plugin marketplace add heygen-com/hyperframes || true
  claude plugin install hyperframes@hyperframes || true
else
  echo "claude CLI 없음 — 대신 스킬만 설치: npx skills add heygen-com/hyperframes"
  npx -y skills add heygen-com/hyperframes -y -a claude-code || true
fi
npx -y hyperframes browser ensure
npx -y hyperframes doctor || true

echo; echo "== [3] OpenMontage =="
if [ ! -d OpenMontage ]; then
  git clone https://github.com/calesthio/OpenMontage.git
fi
(cd OpenMontage && make setup)
echo "OpenMontage OK — API 키는 OpenMontage/.env 의 PEXELS_API_KEY / PIXABAY_API_KEY 에 입력"

echo; echo "== 완료 =="
echo "테스트 렌더: cd remotion-project && npx remotion render Intro out/intro.mp4"
