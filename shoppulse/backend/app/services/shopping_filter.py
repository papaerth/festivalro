"""쇼핑 쇼츠 판별(규칙 기반, 투명). config/shopping_keywords.json 사용.

score(title, description, tags) -> (점수, 적중 목록). 제목 적중은 가중치 2배.
사람이 직접 정한 판정(video.is_shopping)이 있으면 항상 그것을 따른다.
"""
from __future__ import annotations

import re

from ..config import load_config_json


def _cfg() -> dict:
    return load_config_json("shopping_keywords.json") or {"threshold": 3}


def threshold() -> int:
    return int(_cfg().get("threshold", 3))


def score_text(title: str | None, description: str | None, tags: list | None) -> tuple[int, list[str]]:
    cfg = _cfg()
    t = (title or "").lower()
    body = " ".join([(description or ""), " ".join(tags or [])]).lower()
    total = 0
    hits: list[str] = []
    for group in ("strong", "medium", "weak", "url_patterns", "negative"):
        g = cfg.get(group) or {}
        w = int(g.get("weight", 0))
        for term in g.get("terms", []):
            term_l = term.lower()
            in_title = term_l in t
            in_body = term_l in body
            if in_title:
                total += w * 2
                hits.append(f"{term}(제목)")
            elif in_body:
                total += w
                hits.append(term)
    return total, hits


def classify(video) -> dict:
    """영상 객체에 점수를 기록하고 판정 dict 를 돌려준다(저장은 호출자가)."""
    s, hits = score_text(video.title, video.description, video.tags)
    video.shopping_score = s
    video.shopping_hits = hits[:20]
    return {"score": s, "hits": hits, "is_shopping": is_shopping(video)}


def is_shopping(video) -> bool | None:
    """사람 판정 우선, 없으면 점수 기준. 점수도 없으면 None(미판별)."""
    if video.is_shopping is not None:
        return video.is_shopping
    if video.shopping_score is None:
        return None
    return video.shopping_score >= threshold()
