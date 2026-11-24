"""쇼츠 기획안 생성. 교체 가능한 어댑터(template / anthropic).

원칙: 원본에 없는 연예인 발언을 생성하지 않는다. 확인되지 않은 항목은 '작성 필요' 로 남긴다.
"""
from __future__ import annotations

import json
from datetime import datetime

from ..models import utcnow
from ..config import get_settings

CONTENT_TYPES = {
    "direct_recommend": "직접 추천형", "sponsored": "광고·협찬형", "long_term_love": "애정템형",
    "natural_use": "자연 사용형", "experience": "경험담형", "comparison": "비교형",
    "taste_reveal": "취향 공개형", "value_find": "가성비 발견형", "premium_taste": "프리미엄 취향형",
    "regret": "실패·후회형", "life_tip": "생활 노하우형", "curiosity_debate": "호기심·논쟁형",
    "accidental_find": "우연한 발견형", "repeat_buy": "반복 구매형", "gift": "선물 추천형",
}

PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["hook", "key_scene", "celebrity_statement", "added_commentary", "product_info",
                 "purchase_points", "closing", "title_candidates", "thumbnail_texts", "description_draft",
                 "source_credit", "disclosure_checklist", "research_todo"],
    "properties": {
        "hook": {"type": "string"}, "key_scene": {"type": "string"}, "celebrity_statement": {"type": "string"},
        "added_commentary": {"type": "string"}, "product_info": {"type": "string"},
        "purchase_points": {"type": "array", "items": {"type": "string"}}, "closing": {"type": "string"},
        "title_candidates": {"type": "array", "items": {"type": "string"}},
        "thumbnail_texts": {"type": "array", "items": {"type": "string"}},
        "description_draft": {"type": "string"}, "source_credit": {"type": "string"},
        "disclosure_checklist": {"type": "array", "items": {"type": "string"}},
        "research_todo": {"type": "array", "items": {"type": "string"}},
    },
}


def _fmt_ts(sec: int | None) -> str:
    if sec is None:
        return "미확인"
    return f"{sec // 60:02d}:{sec % 60:02d}"


def build_context(candidate) -> dict:
    short = candidate.video
    v = short.original or short  # 재편집 쇼츠 후보면 원본 영상이 소재
    seg = candidate.segment
    p = candidate.product
    celeb = candidate.celebrity or (v.channel.celebrity if v.channel else None) or short.celebrity
    ref = None
    if short is not v:
        ref = {"title": short.title, "url": short.url, "view_count": short.view_count, "channel": short.yt_channel_title,
               "note": "타인이 만든 재편집 쇼츠 — 바이럴 참고 자료이며 제작 원본으로 쓰지 않음"}
    return {
        "reference_short": ref,
        "celebrity": celeb.name if celeb else None,
        "channel": v.channel.channel_name if v.channel else None,
        "channel_verified": (v.channel.verification_status == "verified") if v.channel else False,
        "video_title": v.title,
        "video_url": v.url,
        "published_at": v.published_at.isoformat() if v.published_at else None,
        "duration": _fmt_ts(v.duration_seconds),
        "segment_start": seg.start_seconds if seg else None,
        "segment_end": seg.end_seconds if seg else None,
        "segment_link": (f"{v.url}&t={seg.start_seconds}s" if seg and seg.start_seconds is not None and v.url else None),
        "quote": seg.quote if seg else None,
        "context": seg.context if seg else None,
        "content_type": candidate.content_type,
        "content_type_label": CONTENT_TYPES.get(candidate.content_type or "", candidate.content_type),
        "sponsorship": seg.sponsorship_status if seg else "unknown",
        "is_recommendation": seg.is_recommendation if seg else None,
        "product": {"name": p.name, "brand": p.brand, "model": p.model_name, "category": p.category,
                    "identification_status": p.identification_status, "features": p.features} if p else None,
        "offers": [{"seller": o.seller, "price": o.price, "stock": o.stock_status,
                    "affiliate": o.affiliate_available, "checked_at": o.checked_at.isoformat()} for o in (p.offers if p else [])],
        "channel_category": candidate.channel_category,
        "recommended_slot": candidate.recommended_slot,
    }


class TemplatePlanner:
    """외부 AI 없이 저장된 사실만으로 뼈대를 만든다."""

    name = "template"

    def generate(self, ctx: dict, target_seconds: int) -> dict:
        celeb = ctx["celebrity"] or "(연예인 미지정)"
        quote = ctx["quote"]
        prod = ctx["product"]
        prod_name = prod["name"] if prod else "(상품 미확인)"
        is_direct = ctx["content_type"] in ("direct_recommend", "sponsored", "long_term_love", "repeat_buy")
        hook = (
            f"{celeb}이(가) 직접 말한 \"{quote[:40]}…\"" if quote and len(quote) > 40 else
            f"{celeb}이(가) 직접 말한 \"{quote}\"" if quote else
            f"[작성 필요] 원본 발언(segment.quote)이 없어 후킹 문구를 만들 수 없습니다."
        )
        scene = (
            f"{_fmt_ts(ctx['segment_start'])}~{_fmt_ts(ctx['segment_end'])} 구간 ({ctx['segment_link']})"
            if ctx["segment_start"] is not None else "[확인 필요] 타임스탬프 미기록 — 원본 확인 후 입력"
        )
        statement = quote or "[원본 발언 미기록 — 생성하지 않음]"
        structure = (
            ["후킹(발언 인용)", "원본 장면", "상품 정보·사용 포인트", "구매 판단 포인트", "마무리"] if is_direct else
            ["후킹(발언·궁금증)", "원본 장면", "사실 확인·배경 해설", "상품/대안 정보", "마무리(의견 유도)"]
        )
        commentary = (
            "[작성 필요] 경험담/비교/호기심 유형: 발언의 사실관계 확인, 국가별·브랜드별 차이, 성분·제조 방식 등 근거 있는 정보를 추가하세요."
            if not is_direct else
            "[작성 필요] 직접 추천 유형: 추천 이유를 뒷받침하는 실제 제품 특징, 사용법, 유사 제품과의 차이를 추가하세요."
        )
        notes = []
        if prod and prod["identification_status"] != "exact":
            notes.append(f"상품 식별 상태가 '{prod['identification_status']}' 입니다. 정확한 상품 확인 전에는 '연예인 추천템'으로 단정하지 마세요.")
        if ctx["is_recommendation"] is False:
            notes.append("단순 언급입니다. '추천템'이라고 표현하지 마세요. 발언 맥락을 그대로 전달하세요.")
        if ctx["is_recommendation"] is None:
            notes.append("추천/단순 언급 여부가 미확인입니다.")
        if ctx["sponsorship"] in ("sponsored", "suspected"):
            notes.append("원본이 광고·협찬(또는 의심)입니다. 쇼츠에서 해당 사실을 밝히세요.")
        if not ctx["channel_verified"]:
            notes.append("원본 채널의 공식 여부가 검증 전입니다.")
        disclosure = [
            "제휴 링크 사용 시 '쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다' 등 제휴 고지",
            "원본 광고·협찬 여부 표시 (sponsorship=" + str(ctx["sponsorship"]) + ")",
            "원본 출처·채널 표기 유지",
            "유료 광고 포함 표시가 필요한 경우 유튜브 설정에서 체크",
        ]
        offers_txt = ", ".join(f"{o['seller']} {o['price']:,}원({o['checked_at'][:10]} 기준)" if o["price"] else o["seller"] for o in ctx["offers"]) or "판매처 미확인"
        return {
            "target_seconds": target_seconds,
            "structure": structure,
            "hook": hook,
            "key_scene": scene,
            "celebrity_statement": statement,
            "added_commentary": commentary,
            "product_info": (f"{prod['brand'] or ''} {prod_name} {prod['model'] or ''}".strip() + f" / 식별: {prod['identification_status']} / {prod['features'] or '특징 미기록'}") if prod else "[상품 미확인]",
            "purchase_points": ["[작성 필요] 가격·용량·대안 비교", f"판매처: {offers_txt}", "가격·재고는 확인 시점 기준임을 표기"],
            "closing": "[작성 필요] 과장 없이 자연스러운 마무리. 예: 발언의 맥락을 요약하고 시청자 의견을 묻기",
            "title_candidates": [f"{celeb}이(가) 말한 {prod_name}, 직접 확인해봤습니다" if prod else f"{celeb} 영상 속 그 장면, 사실일까?", "[작성 필요] 제목 후보 2", "[작성 필요] 제목 후보 3"],
            "thumbnail_texts": [f"{celeb} 픽?" if is_direct else f"{celeb}의 그 말", "[작성 필요]"],
            "description_draft": f"원본: {ctx['channel'] or '채널 미확인'} - {ctx['video_title']} ({ctx['video_url']})\n[작성 필요] 해설 요약, 상품 정보, 제휴 고지",
            "source_credit": f"출처: {ctx['channel'] or '채널 미확인'} / {ctx['video_title']} / {ctx['video_url']}",
            "disclosure_checklist": disclosure,
            "research_todo": notes + ["연예인 실제 발언·맥락 재확인", "상품 현재 판매가·재고 확인", "영상 사용 권한·창작적 기여(해설·자막·비교 등) 검토"],
            "caution": "원본의 속도 변경·반전·자막 추가만으로 저작권/재사용 콘텐츠 문제가 해결되지 않습니다.",
        }


class AnthropicPlanner:
    """Claude 로 기획안 초안을 만든다. 발언은 저장된 quote 만 사용하도록 지시한다."""

    name = "anthropic"

    def __init__(self):
        s = get_settings()
        if not s.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 가 없습니다. SHOPPULSE_AI_PROVIDER=template 로 설정하세요.")
        import anthropic  # 지연 임포트: 미설치 환경에서도 template 는 동작

        self.client = anthropic.Anthropic(api_key=s.anthropic_api_key)
        self.model = s.anthropic_model or "claude-opus-5-5"

    def generate(self, ctx: dict, target_seconds: int) -> dict:
        system = (
            "당신은 연예인 유튜브 원본 영상을 활용한 쇼핑 쇼츠 기획자다. 한국어로 답한다.\n"
            "규칙: 1) celebrity_statement 에는 입력된 quote 를 그대로 쓰고, quote 가 없으면 '[원본 발언 미기록]' 이라고 쓴다. "
            "연예인 발언을 새로 만들지 않는다. 2) 상품이 '정확한 상품 확인(exact)' 이 아니면 '연예인 추천템' 으로 단정하지 않는다. "
            "3) is_recommendation 이 false 면 '추천' 표현을 쓰지 않는다. 4) 광고·협찬 사실을 숨기지 않는다. "
            "5) 모르는 사실은 research_todo 에 넣고 지어내지 않는다. 6) 직접 추천형과 경험담형은 다른 대본 구조를 쓴다."
        )
        response = self.client.messages.create(
            model=self.model,
            max_tokens=16000,
            system=system,
            output_config={"format": {"type": "json_schema", "schema": PLAN_SCHEMA}},
            messages=[{"role": "user", "content": f"목표 길이 {target_seconds}초. 후보 데이터(JSON):\n{json.dumps(ctx, ensure_ascii=False)}"}],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("AI 가 응답을 거부했습니다. 템플릿 기획안을 사용하세요.")
        text = next((b.text for b in response.content if b.type == "text"), "")
        plan = json.loads(text)
        plan["target_seconds"] = target_seconds
        plan["model"] = self.model
        return plan


def get_planner():
    s = get_settings()
    if s.shoppulse_ai_provider == "anthropic" and s.anthropic_api_key:
        try:
            return AnthropicPlanner()
        except Exception:
            return TemplatePlanner()
    return TemplatePlanner()


def generate_plan(candidate, target_seconds: int = 25, provider: str | None = None) -> tuple[dict, str]:
    ctx = build_context(candidate)
    planner = TemplatePlanner() if provider == "template" else get_planner()
    plan = planner.generate(ctx, target_seconds)
    plan["generated_at"] = utcnow().isoformat()
    plan["context_snapshot"] = ctx
    return plan, planner.name
