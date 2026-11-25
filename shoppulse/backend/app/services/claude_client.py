"""Claude 호출 공통 계층. 공식 SDK(anthropic)를 우선 쓰고, SDK 를 불러올 수 없으면(예: Windows 앱 제어 정책이 SDK 의 네이티브 파일을
차단) 같은 Messages API 를 httpx 로 직접 호출한다. 두 경로 모두 동일한 요청 형식(output_config 구조화 출력 포함)을 쓴다."""
from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import get_settings

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class ClaudeError(Exception):
    pass


def sdk_import_error() -> str | None:
    """SDK 를 쓸 수 있으면 None, 아니면 오류 문자열."""
    try:
        import anthropic  # noqa: F401
        return None
    except Exception as e:  # ImportError, OSError(DLL 차단) 등
        return f"{type(e).__name__}: {e}"


def transport_status() -> dict:
    s = get_settings()
    err = sdk_import_error()
    return {"key_configured": bool(s.anthropic_api_key), "sdk_available": err is None, "sdk_error": err,
            "transport": "sdk" if err is None else "http", "model": s.anthropic_model or "claude-opus-5-5"}


def create_message(*, system: str, messages: list[dict], max_tokens: int = 4096, output_schema: dict | None = None,
                   model: str | None = None, timeout: float = 120.0) -> dict[str, Any]:
    """반환: {"text": str, "stop_reason": str, "model": str, "transport": "sdk"|"http"}"""
    s = get_settings()
    if not s.anthropic_api_key:
        raise ClaudeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다.")
    model = model or s.anthropic_model or "claude-opus-5-5"
    kwargs: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "system": system, "messages": messages}
    if output_schema:
        kwargs["output_config"] = {"format": {"type": "json_schema", "schema": output_schema}}

    if sdk_import_error() is None:
        import anthropic

        client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=timeout)
        try:
            resp = client.messages.create(**kwargs)
        except anthropic.AuthenticationError as e:
            raise ClaudeError(f"API 키 인증 실패: {e}") from e
        except anthropic.RateLimitError as e:
            raise ClaudeError(f"요청 한도 초과(잠시 후 재시도): {e}") from e
        except anthropic.APIStatusError as e:
            raise ClaudeError(f"API 오류 {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise ClaudeError(f"네트워크 오류: {e}") from e
        text = next((b.text for b in resp.content if b.type == "text"), "")
        return {"text": text, "stop_reason": resp.stop_reason, "model": resp.model, "transport": "sdk"}

    # ---- SDK 사용 불가 → 직접 HTTP
    headers = {"x-api-key": s.anthropic_api_key, "anthropic-version": API_VERSION, "content-type": "application/json"}
    try:
        r = httpx.post(API_URL, headers=headers, json=kwargs, timeout=timeout)
    except httpx.HTTPError as e:
        raise ClaudeError(f"네트워크 오류: {e}") from e
    if r.status_code == 401:
        raise ClaudeError("API 키 인증 실패(401). .env 의 ANTHROPIC_API_KEY 를 확인하세요.")
    if r.status_code == 429:
        raise ClaudeError("요청 한도 초과(429). 잠시 후 다시 시도하세요.")
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message", r.text[:300])
        except ValueError:
            msg = r.text[:300]
        raise ClaudeError(f"API 오류 {r.status_code}: {msg}")
    data = r.json()
    text = next((b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"), "")
    return {"text": text, "stop_reason": data.get("stop_reason"), "model": data.get("model", model), "transport": "http"}


def create_json(**kw) -> dict:
    """구조화 출력 호출 후 JSON 파싱. 거부(refusal)는 ClaudeError."""
    out = create_message(**kw)
    if out["stop_reason"] == "refusal":
        raise ClaudeError("AI 가 응답을 거부했습니다.")
    try:
        data = json.loads(out["text"])
    except json.JSONDecodeError as e:
        raise ClaudeError(f"AI 응답 JSON 파싱 실패: {e}") from e
    data["_model"] = out["model"]
    data["_transport"] = out["transport"]
    return data
