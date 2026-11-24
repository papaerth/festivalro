"""소싱 점수 계산. 배점·등급은 scoring_versions(활성 버전)에서 읽는다."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..config import load_config_json
from ..models import ScoringVersion, SourcingScore, VideoMetric


def get_active_version(db: Session) -> ScoringVersion:
    v = db.query(ScoringVersion).filter(ScoringVersion.is_active.is_(True)).first()
    if v:
        return v
    cfg = load_config_json("scoring.json")
    if not cfg:
        raise RuntimeError("config/scoring.json 이 없습니다")
    v = ScoringVersion(name=cfg.get("name", "기본 평가 모델"), config=cfg, is_active=True)
    db.add(v)
    db.flush()
    return v


def compute_total(item_scores: dict[str, Any], config: dict) -> tuple[float | None, str | None]:
    """모든 항목이 채워졌을 때만 총점·등급을 낸다. 하나라도 NULL 이면 (None, None)."""
    total = 0.0
    for item in config["items"]:
        raw = item_scores.get(item["key"])
        if raw is None:
            return None, None
        val = float(raw)
        if val < 0 or val > item["max"]:
            raise ValueError(f"{item['label']} 점수는 0~{item['max']} 사이여야 합니다")
        total += val
    grade = None
    for g in sorted(config["grades"], key=lambda g: -g["min"]):
        if total >= g["min"]:
            grade = g["key"]
            break
    return round(total, 1), grade


def grade_label(grade_key: str | None, config: dict) -> str | None:
    for g in config.get("grades", []):
        if g["key"] == grade_key:
            return g["label"]
    return None


def latest_scores(candidate_scores: list[SourcingScore]) -> dict[str, SourcingScore | None]:
    """scorer 별 최신 점수. 사람(human) 점수가 있으면 표시용 최종 점수는 사람 점수."""
    out: dict[str, SourcingScore | None] = {"ai": None, "human": None}
    for s in candidate_scores:
        cur = out.get(s.scorer)
        if cur is None or s.created_at > cur.created_at:
            out[s.scorer] = s
    out["final"] = out["human"] or out["ai"]
    return out


def suggest_performance_score(metrics: list[VideoMetric], graph_type: str | None, max_points: int) -> tuple[int | None, str]:
    """실제 확보한 지표가 있을 때만 '성과' 항목 제안 점수를 만든다.

    Outlier·VPH 운영 기준(metric_bands.json)을 사용한다. 지표가 하나도 없으면 (None, 사유).
    """
    bands = load_config_json("metric_bands.json")
    latest: dict[str, VideoMetric] = {}
    for m in metrics:
        if m.value is None:
            continue
        cur = latest.get(m.metric_type)
        if cur is None or m.measured_at > cur.measured_at:
            latest[m.metric_type] = m
    if not latest:
        return None, "Outlier·VPH 지표가 없어 제안 점수를 만들지 않았습니다(지표 미확인)."

    parts: list[float] = []
    reasons: list[str] = []
    if "outlier" in latest:
        v = latest["outlier"].value or 0
        key = _band_key(bands.get("outlier", []), v)
        frac = {"extreme": 1.0, "strong": 0.85, "active": 0.65, "interest": 0.45, "normal": 0.25}.get(key, 0.25)
        parts.append(frac)
        reasons.append(f"Outlier {v:g}배 → {_band_label(bands.get('outlier', []), v)}")
    if "vph" in latest:
        v = latest["vph"].value or 0
        key = _band_key(bands.get("vph", []), v)
        frac = {"strong": 1.0, "priority": 0.8, "active": 0.6, "interest": 0.4, "low": 0.2}.get(key, 0.2)
        parts.append(frac)
        reasons.append(f"VPH {v:g} ({latest['vph'].basis}) → {_band_label(bands.get('vph', []), v)}")
    bonus = 0.0
    if graph_type in ("resurgence", "late_surge"):
        bonus = 0.1
        reasons.append("그래프: 재상승/뒤늦은 급상승 가산")
    elif graph_type == "spike_plateau":
        bonus = 0.05
        reasons.append("그래프: 급등 후 평탄화(재발굴 가치) 가산")
    frac = min(1.0, sum(parts) / len(parts) + bonus)
    score = int(round(frac * max_points))
    return score, " / ".join(reasons) + " (운영 참고 기준 기반 AI 제안)"


def _band_key(bands: list[dict], value: float) -> str:
    for b in sorted(bands, key=lambda b: -b["min"]):
        if value >= b["min"]:
            return b["key"]
    return bands[-1]["key"] if bands else "unknown"


def _band_label(bands: list[dict], value: float) -> str:
    for b in sorted(bands, key=lambda b: -b["min"]):
        if value >= b["min"]:
            return b["label"]
    return "미확인"


def band_label_for(metric_type: str, value: float | None) -> str | None:
    if value is None:
        return None
    bands = load_config_json("metric_bands.json").get(metric_type, [])
    return _band_label(bands, value) if bands else None
