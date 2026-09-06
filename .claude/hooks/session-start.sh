#!/bin/bash
# Claude Code on the web(원격 세션) 시작 시 의존성을 설치해
# lint/build 를 바로 실행할 수 있게 준비합니다. 로컬 CLI 에서는 아무것도 하지 않습니다.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Playwright 브라우저는 컨테이너에 미리 설치되어 있어 재다운로드 금지
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 원격 세션에서는 Next 텔레메트리 불필요
export NEXT_TELEMETRY_DISABLED=1

# npm install(캐시 활용, 멱등). lockfile 이 있으므로 동일 버전으로 설치됩니다.
npm install --no-audit --no-fund

# 세션 전체에 적용할 환경변수
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export NEXT_TELEMETRY_DISABLED=1' >> "$CLAUDE_ENV_FILE"
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi

echo "[session-start] 의존성 설치 완료"
