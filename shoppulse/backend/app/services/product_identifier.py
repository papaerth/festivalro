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
    from .claude_client import create_json

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
    hub_products = [{"title": p.get("title"), "url": p.get("final_url") or p.get("url"), "via": p.get("via")}
                    for p in ((video.resolved_links or {}).get("products") or [])][:15]
    ctx = {
        "collected_product_links": hub_products,
        "title": video.title, "description": (video.description or "")[:3000], "tags": (video.tags or [])[:30],
        "shopping_links": links[:10], "channel": video.yt_channel_title or (video.channel.channel_name if video.channel else None),
        "celebrity": (video.celebrity.name if video.celebrity else (video.channel.celebrity.name if video.channel and video.channel.celebrity else None)),
        "duration_seconds": video.duration_seconds, "images_provided": image_sources,
    }
    content.append({"type": "text", "text": (
        "다음 유튜브 쇼핑 쇼츠(또는 연예인 영상)가 다루는 상품을 추정해 주세요. 이미지는 썸네일이거나 사용자가 영상에서 캡처한 화면입니다.\n"
        "규칙: 1) 실제로 보이거나 적힌 근거(제품명·로고·패키지·링크 도메인·설명문·collected_product_links 의 링크 제목/주소)에 기반해 추정하고, 근거를 evidence 에 적습니다. "
        "2) 확신이 없으면 confidence 를 low 로 두고 brand 는 빈 문자열로 둡니다. 지어내지 않습니다. "
        "3) 여러 상품이 보이면 각각 별도 항목으로 최대 5개. 4) category 는 beauty(뷰티·패션)/living(생활용품)/food(먹거리)/unknown. "
        "5) 상품 판매와 무관한 영상이면 video_is_shopping=false 로 하고 suggestions 는 비웁니다. 한국어로 답합니다.\n\n"
        f"영상 정보(JSON):\n{json.dumps(ctx, ensure_ascii=False)}"
    )})

    data = create_json(system="당신은 한국 온라인 쇼핑 상품 식별 전문가입니다. 보이는 근거로만 판단하고, 근거 없는 상품명을 만들지 않습니다.",
                       messages=[{"role": "user", "content": content}], output_schema=SUGGESTION_SCHEMA)
    data["model"] = data.pop("_model", None)
    data["transport"] = data.pop("_transport", None)
    data["image_sources"] = image_sources
    data["disclaimer"] = "AI 추정입니다. '유사 상품 후보'로 등록되며 사람이 확인해야 '확인됨'이 됩니다."
    return data


INVESTIGATE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["items", "notes"],
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "brand", "model_or_option", "visible_price", "category", "features", "confidence", "evidence", "search_queries"],
                "properties": {
                    "name": {"type": "string"}, "brand": {"type": "string"}, "model_or_option": {"type": "string"},
                    "visible_price": {"type": "string"},
                    "category": {"type": "string", "enum": ["beauty", "living", "food", "unknown"]},
                    "features": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "evidence": {"type": "string"},
                    "search_queries": {"type": "array", "items": {"type": "string"}, "description": "최대 3개"},
                },
            },
        },
        "notes": {"type": "string"},
    },
}


def investigate_capture(images: list[tuple[bytes, str]], hint: str | None = None, context: dict | None = None) -> dict:
    """사용자가 올린 캡처(영상 장면·쿠팡/네이버 상품 페이지 등)에서 상품 정보를 읽어내고 검색어·검색 링크를 만든다."""
    from urllib.parse import quote

    s = get_settings()
    if not s.anthropic_api_key:
        raise AINotConfigured("ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 에 키를 넣으면 캡처 조사 기능을 쓸 수 있습니다.")
    if not images:
        raise ValueError("이미지가 필요합니다")
    from .claude_client import create_json

    content: list[dict] = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.standard_b64encode(data).decode()}}
                           for data, mt in images[:4]]
    content.append({"type": "text", "text": (
        "이미지는 사용자가 캡처한 화면입니다(유튜브 영상 장면, 또는 쿠팡·네이버 상품 페이지 등). 화면에 보이는 상품을 조사해 주세요.\n"
        "규칙: 1) 보이는 글자(상품명·브랜드·로고·패키지·가격·옵션)와 형태를 근거로만 판단하고 evidence 에 근거를 적습니다. "
        "2) 확신이 없으면 confidence=low, brand 는 빈 문자열. 지어내지 않습니다. 3) 가격은 화면에 보일 때만 visible_price 에 숫자+단위로 적고 없으면 빈 문자열. "
        "4) 상품마다 쿠팡·네이버쇼핑에서 찾기 좋은 한국어 검색어를 1~3개 만듭니다(브랜드+상품명+용량/모델 순, 불필요한 수식어 제외). "
        "5) category 는 beauty/living/food/unknown. 6) 여러 상품이면 최대 5개. 한국어로 답합니다.\n"
        + (f"사용자 힌트: {hint}\n" if hint else "") + (f"영상 정보: {json.dumps(context, ensure_ascii=False)}" if context else "")
    )})
    data = create_json(system="당신은 한국 온라인 쇼핑 상품 식별 전문가입니다. 보이는 근거로만 판단하고 근거 없는 상품명을 만들지 않습니다.",
                       messages=[{"role": "user", "content": content}], output_schema=INVESTIGATE_SCHEMA)
    model = data.pop("_model", None); data.pop("_transport", None)
    for it in data.get("items", []):
        q = (it.get("search_queries") or [f"{it.get('brand', '')} {it.get('name', '')}".strip()])[0]
        it["links"] = {
            "coupang": f"https://www.coupang.com/np/search?q={quote(q)}",
            "naver_shopping": f"https://search.shopping.naver.com/search/all?query={quote(q)}",
            "google": f"https://www.google.com/search?q={quote(q)}",
        }
    data["model"] = model
    data["disclaimer"] = "AI 추정입니다. 링크로 직접 확인한 뒤 등록하세요. 등록 시 '유사 상품 후보' 상태로 저장됩니다."
    return data
