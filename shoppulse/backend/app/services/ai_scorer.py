"""AI 1차 채점. 후보의 저장된 사실(제목·설명·발언·상품·근거)만으로 6개 항목을 채점한다. scorer='ai' 로 분리 저장.

- '성과' 항목은 규칙(suggest_performance_score)이 낸 값을 우선 사용한다(지표가 있을 때).
- 키가 없으면 AINotConfigured. 거부/실패는 호출자가 기록한다.
"""
from __future__ import annotations

import json

from ..config import get_settings
from .product_identifier import AINotConfigured


def _schema(items: list[dict]) -> dict:
    props = {}
    for it in items:
        props[it["key"]] = {"type": "object", "additionalProperties": False, "required": ["score", "rationale"],
                            "properties": {"score": {"type": "integer", "minimum": 0, "maximum": it["max"]},
                                           "rationale": {"type": "string"}}}
    return {"type": "object", "additionalProperties": False, "required": list(props) + ["summary"],
            "properties": {**props, "summary": {"type": "string"}}}


def score_with_ai(candidate, scoring_config: dict, context: dict, performance_rule: tuple[int | None, str]) -> dict:
    s = get_settings()
    if not s.anthropic_api_key:
        raise AINotConfigured("ANTHROPIC_API_KEY 가 설정되지 않았습니다.")
    from .claude_client import create_json

    items = scoring_config["items"]
    criteria = "\n".join(f"- {it['key']} ({it['label']}, 0~{it['max']}점): {it['criteria']}" for it in items)
    system = (
        "당신은 연예인 유튜브 원본을 활용한 쇼핑 쇼츠 소싱 심사위원입니다. 제공된 사실만으로 채점하고, 확인되지 않은 것(상품 미확인, 발언 미기록, 지표 없음)은 "
        "낮게 평가하며 그 사실을 rationale 에 적습니다. 지어내지 않습니다. 한국어로 답합니다.\n"
        "타깃: 한국 30~50대 여성, YouTube Shorts, 채널 3개(뷰티·패션/생활용품/먹거리), 업로드 11시·17시·21시.\n"
        f"평가 항목:\n{criteria}"
    )
    data = create_json(system=system, messages=[{"role": "user", "content": f"후보 데이터(JSON):\n{json.dumps(context, ensure_ascii=False)}"}],
                       output_schema=_schema(items))
    model = data.pop("_model", None); data.pop("_transport", None)
    item_scores, rationale = {}, {}
    for it in items:
        d = data.get(it["key"], {})
        item_scores[it["key"]] = max(0, min(int(d.get("score", 0)), it["max"]))
        rationale[it["key"]] = d.get("rationale", "")
    perf_val, perf_reason = performance_rule
    if perf_val is not None:
        item_scores["performance"] = perf_val
        rationale["performance"] = perf_reason
    else:
        rationale["performance"] = (rationale.get("performance", "") + " [지표 미확인 — AI 추정]").strip()
    return {"item_scores": item_scores, "rationale": rationale, "summary": data.get("summary", ""), "model": model}
