from datetime import datetime, timedelta

from app.services.dedupe import classify_format, extract_video_id, normalize_channel_ref, parse_iso8601_duration
from app.services.graph_analysis import analyze
from app.services.scoring import compute_total, suggest_performance_score

RULES = {"min_points": 4, "min_span_hours": 72,
         "spike_plateau": {"peak_position_max": 0.4, "peak_to_current_ratio_min": 5.0},
         "resurgence": {"trough_ratio_max": 0.3, "rebound_over_trough_min": 3.0, "rebound_over_peak_min": 0.2},
         "steady_rise": {"cv_max": 0.5},
         "late_surge": {"early_window": 0.4, "early_to_peak_ratio_max": 0.3, "peak_position_min": 0.6}}
T0 = datetime(2026, 1, 1)


def series(deltas):
    """일 단위 증가량 → 누적 포인트."""
    pts, total = [], 1000
    for i, d in enumerate(deltas):
        total += d
        pts.append((T0 + timedelta(days=i), total))
    return pts


def test_video_id_extraction():
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("not a video") is None
    assert normalize_channel_ref("https://www.youtube.com/@MrBeast") == {"handle": "@MrBeast"}
    assert normalize_channel_ref("UCX6OQ3DkcsbYNE6H8uQQuVA") == {"channel_id": "UCX6OQ3DkcsbYNE6H8uQQuVA"}


def test_duration_and_format():
    assert parse_iso8601_duration("PT3M34S") == 214
    assert parse_iso8601_duration("PT1H2M") == 3720
    assert parse_iso8601_duration("bad") is None
    assert classify_format(45) == "short"
    assert classify_format(120) == "short_or_long"
    assert classify_format(1400) == "long"
    assert classify_format(None) == "unknown"


def test_graph_insufficient_data():
    r = analyze([(T0, 10), (T0 + timedelta(hours=1), 20)], rules=RULES)
    assert r.graph_type == "insufficient"
    assert r.confidence == "none"
    assert r.growth_7d is None


def test_graph_spike_plateau():
    r = analyze(series([0, 50000, 30000, 2000, 500, 300, 200, 150, 100]), rules=RULES)
    assert r.graph_type == "spike_plateau"
    assert r.current_rate_per_hour is not None and r.current_rate_per_hour > 0


def test_graph_resurgence():
    r = analyze(series([0, 20000, 15000, 1000, 500, 400, 6000, 9000, 8000]), rules=RULES)
    assert r.graph_type == "resurgence"


def test_graph_steady_rise():
    r = analyze(series([0, 1000, 1100, 950, 1050, 1000, 980, 1020]), rules=RULES)
    assert r.graph_type == "steady_rise"


def test_graph_late_surge():
    r = analyze(series([0, 100, 120, 110, 100, 90, 3000, 9000, 12000]), rules=RULES)
    assert r.graph_type == "late_surge"


def test_growth_windows():
    pts = series([0] + [1000] * 30)
    r = analyze(pts, rules=RULES)
    assert r.growth_7d == 7000
    assert r.growth_28d == 28000


CFG = {"items": [{"key": "a", "label": "A", "max": 60}, {"key": "b", "label": "B", "max": 40}],
       "grades": [{"min": 80, "key": "top", "label": "T"}, {"min": 0, "key": "low", "label": "L"}]}


def test_compute_total_requires_all_items():
    assert compute_total({"a": 50, "b": None}, CFG) == (None, None)
    assert compute_total({"a": 50, "b": 35}, CFG) == (85.0, "top")
    assert compute_total({"a": 10, "b": 10}, CFG) == (20.0, "low")


def test_compute_total_rejects_out_of_range():
    import pytest
    with pytest.raises(ValueError):
        compute_total({"a": 61, "b": 0}, CFG)


def test_performance_suggestion_requires_metrics():
    val, reason = suggest_performance_score([], None, 20)
    assert val is None
    assert "미확인" in reason
