"""AI 상품 추정. 썸네일(공개 이미지)·사용자가 올린 캡처·제목·설명·태그·구매 링크를 Claude 에 보여 상품 후보를 추정한다.

원칙
- 결과는 '추정'이며 identification_status 는 similar_candidate 로만 등록한다. 사람이 확인해야 '확인됨'이 된다.
- 유튜브 영상 파일을 내려받아 프레임을 뽑지 않는다(약관). 공개 썸네일과 사용자가 직접 올린 캡처만 사용한다.
- ANTHROPIC_API_KEY 가 없으면 명확히 '미설정' 오류를 낸다.
"""
from __future__ import annotations

import base64
import json

import httpx

from ..config import get_settings

SUGGESTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["video_is_shopping", "suggestions", "notes"],
    "properties": {
        "video_is_shopping": {"type": "boolean"},
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "brand", "category", "subcategory", "confidence", "reasoning", "evidence"],
                "properties": {
                    "name": {"type": "string"},
                    "brand": {"type": "string"},
                    "category": {"type": "string", "enum": ["beauty", "living", "food", "unknown"]},
                    "subcategory": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "reasoning": {"type": "string"},
                    "evidence": {"type": "string"},
                },
            },
        },
        "notes": {"type": "string"},
    },
}


class AINotConfigured(Exception):
    pass


def fetch_image(url: str, timeout: float = 15.0) -> tuple[bytes, str] | None:
    try:
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
            return None
        return r.content, r.headers["content-type"].split(";")[0]
    except httpx.HTTPError:
        return None


def identify(video, extra_images: list[tuple[bytes, str]] | None = None, use_thumbnail: bool = True) -> dict:
    s = get_settings()
    if not s.anthropic_api_key:
        raise AINotConfigured("ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 에 키를 넣으면 AI 상품 추정을 쓸 수 있습니다.")
    import anthropic

    client = anthropic.Anthropic(api_key=s.anthropic_api_key)
    model = s.anthropic_model or "claude-opus-5-5"

    content: list[dict] = []
    image_sources: list[str] = []
    if use_thumbnail and video.thumbnail_url:
        img = fetch_image(video.thumbnail_url)
        if img:
            content.append({"type": "image", "source": {"type": "base64", "media_type": img[1],
                                                        "data": base64.standard_b64encode(img[0]).decode()}})
            image_sources.append("thumbnail")
    for data, mt in extra_images or []:
        content.append({"type": "image", "source": {"type": "base64", "media_type": mt,
                                                    "data": base64.standard_b64encode(data).decode()}})
        image_sources.append("user_capture")

    from ..serializers import description_links

    links = [l["url"] for l in description_links(video) if l["is_shopping_link"]]
    ctx = {
        "title": video.title, "description": (video.description or "")[:3000], "tags": (video.tags or [])[:30],
        "shopping_links": links[:10], "channel": video.yt_channel_title or (video.channel.channel_name if video.channel else None),
        "celebrity": (video.celebrity.name if video.celebrity else (video.channel.celebrity.name if video.channel and video.channel.celebrity else None)),
        "duration_seconds": video.duration_seconds, "images_provided": image_sources,
    }
    content.append({"type": "text", "text": (
        "다음 유튜브 쇼핑 쇼츠(또는 연예인 영상)가 다루는 상품을 추정해 주세요. 이미지는 썸네일이거나 사용자가 영상에서 캡처한 화면입니다.\n"
        "규칙: 1) 실제로 보이거나 적힌 근거(제품명·로고·패키지·링크 도메인·설명문)에 기반해 추정하고, 근거를 evidence 에 적습니다. "
        "2) 확신이 없으면 confidence 를 low 로 두고 brand 는 빈 문자열로 둡니다. 지어내지 않습니다. "
        "3) 여러 상품이 보이면 각각 별도 항목으로 최대 5개. 4) category 는 beauty(뷰티·패션)/living(생활용품)/food(먹거리)/unknown. "
        "5) 상품 판매와 무관한 영상이면 video_is_shopping=false 로 하고 suggestions 는 비웁니다. 한국어로 답합니다.\n\n"
        f"영상 정보(JSON):\n{json.dumps(ctx, ensure_ascii=False)}"
    )})

    resp = client.messages.create(
        model=model, max_tokens=4096,
        system="당신은 한국 온라인 쇼핑 상품 식별 전문가입니다. 보이는 근거로만 판단하고, 근거 없는 상품명을 만들지 않습니다.",
        messages=[{"role": "user", "content": content}],
        output_config={"format": {"type": "json_schema", "schema": SUGGESTION_SCHEMA}},
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("AI 가 응답을 거부했습니다.")
    text = next((b.text for b in resp.content if b.type == "text"), "")
    data = json.loads(text)
    data["model"] = model
    data["image_sources"] = image_sources
    data["disclaimer"] = "AI 추정입니다. '유사 상품 후보'로 등록되며 사람이 확인해야 '확인됨'이 됩니다."
    return data
