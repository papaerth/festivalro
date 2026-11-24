"""조회수 그래프 분석. 실제 관측 스냅샷만 사용하고, 데이터가 부족하면 '판별 불가'.

유형 키
- spike_plateau : 급등 후 평탄화
- resurgence    : 재상승
- steady_rise   : 꾸준히 상승
- late_surge    : 뒤늦은 급상승
- irregular     : 분류 보류(규칙에 맞지 않음)
- insufficient  : 판별 불가(데이터 부족)
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from statistics import mean, pstdev

from ..config import load_config_json

GRAPH_TYPE_LABELS = {
    "spike_plateau": "급등 후 평탄화",
    "resurgence": "재상승",
    "steady_rise": "꾸준히 상승",
    "late_surge": "뒤늦은 급상승",
    "irregular": "분류 보류",
    "insufficient": "판별 불가",
}


@dataclass
class GraphAnalysis:
    graph_type: str
    label: str
    confidence: str  # high / medium / low / none
    reason: str
    points: int
    span_hours: float
    first_observed: str | None
    last_observed: str | None
    total_growth: int | None
    peak_rate_per_hour: float | None
    current_rate_per_hour: float | None
    growth_7d: int | None
    growth_28d: int | None
    sources: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def _rates(points: list[tuple[datetime, int]]) -> list[tuple[float, float]]:
    """구간별 (중간시점 위치 0~1, 시간당 증가량)."""
    t0, t1 = points[0][0], points[-1][0]
    span = (t1 - t0).total_seconds()
    out = []
    for (ta, va), (tb, vb) in zip(points, points[1:]):
        hours = (tb - ta).total_seconds() / 3600
        if hours <= 0:
            continue
        rate = max(0.0, (vb - va) / hours)
        mid = ((ta - t0).total_seconds() + (tb - ta).total_seconds() / 2) / span if span else 0
        out.append((mid, rate))
    return out


def growth_within(points: list[tuple[datetime, int]], hours: float) -> int | None:
    """마지막 관측에서 hours 이전 이상 떨어진 관측이 있을 때만 증가량 계산."""
    if len(points) < 2:
        return None
    last_t, last_v = points[-1]
    base = None
    for t, v in points:
        if (last_t - t).total_seconds() >= hours * 3600:
            base = (t, v)
    if base is None:
        return None
    return last_v - base[1]


def analyze(points: list[tuple[datetime, int]], sources: list[str] | None = None, rules: dict | None = None) -> GraphAnalysis:
    rules = rules or load_config_json("graph_rules.json")
    sources = sorted(set(sources or []))
    points = sorted(points, key=lambda p: p[0])
    # 동일 시각 중복 제거
    dedup: list[tuple[datetime, int]] = []
    for p in points:
        if dedup and dedup[-1][0] == p[0]:
            dedup[-1] = p
        else:
            dedup.append(p)
    points = dedup
    n = len(points)
    span_h = (points[-1][0] - points[0][0]).total_seconds() / 3600 if n >= 2 else 0.0
    base = dict(
        points=n,
        span_hours=round(span_h, 1),
        first_observed=points[0][0].isoformat() if n else None,
        last_observed=points[-1][0].isoformat() if n else None,
        total_growth=(points[-1][1] - points[0][1]) if n >= 2 else None,
        growth_7d=growth_within(points, 24 * 7),
        growth_28d=growth_within(points, 24 * 28),
        sources=sources,
    )
    min_points = int(rules.get("min_points", 4))
    min_span = float(rules.get("min_span_hours", 72))
    if n < min_points or span_h < min_span:
        return GraphAnalysis(
            graph_type="insufficient",
            label=GRAPH_TYPE_LABELS["insufficient"],
            confidence="none",
            reason=f"관측 {n}개 / {span_h:.0f}시간. 최소 {min_points}개·{min_span:.0f}시간 필요. "
            "과거 조회수 기록은 추측하지 않습니다.",
            peak_rate_per_hour=None,
            current_rate_per_hour=None,
            **base,
        )

    rates = _rates(points)
    if not rates:
        return GraphAnalysis("insufficient", GRAPH_TYPE_LABELS["insufficient"], "none", "유효한 구간이 없습니다.", None, None, **base)
    peak_pos, peak_rate = max(rates, key=lambda r: r[1])
    current_rate = rates[-1][1]
    k = max(1, len(rates) // 3)
    early_rate = mean(r for _, r in rates[:k])
    late_rate = mean(r for _, r in rates[-k:])
    common = dict(peak_rate_per_hour=round(peak_rate, 2), current_rate_per_hour=round(current_rate, 2), **base)

    if peak_rate <= 0:
        return GraphAnalysis("irregular", GRAPH_TYPE_LABELS["irregular"], "low", "관측 기간 동안 조회수 증가가 없습니다.", **common)

    # D. 뒤늦은 급상승
    ls = rules.get("late_surge", {})
    early_window = float(ls.get("early_window", 0.4))
    early_rates = [r for pos, r in rates if pos <= early_window]
    early_avg = mean(early_rates) if early_rates else 0.0
    if (
        peak_pos >= float(ls.get("peak_position_min", 0.6))
        and early_avg <= peak_rate * float(ls.get("early_to_peak_ratio_max", 0.3))
        and current_rate >= peak_rate * 0.5
    ):
        return GraphAnalysis(
            "late_surge", GRAPH_TYPE_LABELS["late_surge"], "medium" if n >= 8 else "low",
            f"초반 평균 {early_avg:.1f}/h 대비 후반 최고 {peak_rate:.1f}/h 로 뒤늦게 상승, 현재 {current_rate:.1f}/h.",
            **common,
        )

    # B. 재상승: 고점 이후 저점(trough)이 있고, 그 뒤 다시 상승
    rs = rules.get("resurgence", {})
    peak_idx = max(range(len(rates)), key=lambda i: rates[i][1])
    after = rates[peak_idx + 1 :]
    if len(after) >= 2:
        trough_idx = min(range(len(after)), key=lambda i: after[i][1])
        trough = after[trough_idx][1]
        rebound = max((r for _, r in after[trough_idx + 1 :]), default=None)
        if (
            rebound is not None
            and trough <= peak_rate * float(rs.get("trough_ratio_max", 0.3))
            and rebound >= max(trough * float(rs.get("rebound_over_trough_min", 3.0)), 1e-9)
            and rebound >= peak_rate * float(rs.get("rebound_over_peak_min", 0.2))
        ):
            return GraphAnalysis(
                "resurgence", GRAPH_TYPE_LABELS["resurgence"], "medium" if n >= 8 else "low",
                f"최고 {peak_rate:.1f}/h → 저점 {trough:.1f}/h → 재상승 {rebound:.1f}/h.",
                **common,
            )

    # A. 급등 후 평탄화
    sp = rules.get("spike_plateau", {})
    if peak_pos <= float(sp.get("peak_position_max", 0.4)) and peak_rate >= max(
        current_rate * float(sp.get("peak_to_current_ratio_min", 5.0)), 1e-9
    ):
        return GraphAnalysis(
            "spike_plateau", GRAPH_TYPE_LABELS["spike_plateau"], "high" if n >= 8 else "medium",
            f"초반 최고 {peak_rate:.1f}/h 이후 현재 {current_rate:.1f}/h 로 둔화. "
            + ("현재도 조회가 이어지고 있습니다." if current_rate > 0 else "현재 증가가 거의 없습니다."),
            **common,
        )

    # C. 꾸준히 상승
    sr = rules.get("steady_rise", {})
    vals = [r for _, r in rates]
    cv = (pstdev(vals) / mean(vals)) if mean(vals) > 0 else 999
    if cv <= float(sr.get("cv_max", 0.5)) and late_rate > 0:
        return GraphAnalysis(
            "steady_rise", GRAPH_TYPE_LABELS["steady_rise"], "medium" if n >= 8 else "low",
            f"구간별 증가 속도 변동계수 {cv:.2f}, 평균 {mean(vals):.1f}/h 로 안정적으로 증가.",
            **common,
        )

    return GraphAnalysis(
        "irregular", GRAPH_TYPE_LABELS["irregular"], "low",
        f"규칙에 맞는 패턴이 없습니다(최고 {peak_rate:.1f}/h, 현재 {current_rate:.1f}/h, 변동계수 {cv:.2f}).",
        **common,
    )
