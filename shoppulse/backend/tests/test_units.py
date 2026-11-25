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


def test_shopping_filter_scores():
    from app.services.shopping_filter import score_text, threshold
    s, hits = score_text("성시경 추천템 내돈내산 간식 5가지", "구매 링크 https://link.coupang.com/xxx 쿠팡 파트너스 활동으로 수수료를 제공받습니다", ["쇼핑"])
    assert s >= threshold() and any("추천템" in h for h in hits)
    s2, _ = score_text("임영웅 콘서트 직캠 레전드 무대", "팬미팅 현장", [])
    assert s2 < threshold()
    s3, _ = score_text("임영웅 근황", "", [])
    assert s3 < threshold()


def test_sourcing_window_defaults_and_settings():
    from datetime import datetime, timezone
    from app.database import SessionLocal
    from app.models import UserSetting
    from app.services.collection import sourcing_window
    with SessionLocal() as db:
        after, before, mn, mx = sourcing_window(db)
        assert (mn, mx) == (90, 1095)
        now = datetime.now(timezone.utc)
        assert 1094 <= (now - after).days <= 1096 and 89 <= (now - before).days <= 91
        db.merge(UserSetting(key="window_min_age_days", value={"value": 30}))
        db.merge(UserSetting(key="window_max_age_days", value={"value": 400}))
        db.commit()
        _, _, mn, mx = sourcing_window(db)
        assert (mn, mx) == (30, 400)
        _, _, mn, mx = sourcing_window(db, min_age_days=0, max_age_days=10)
        assert (mn, mx) == (0, 10)
        db.delete(db.get(UserSetting, "window_min_age_days")); db.delete(db.get(UserSetting, "window_max_age_days")); db.commit()


def test_link_resolver_classification(monkeypatch):
    from app.services import link_resolver as lr
    assert lr.is_link_hub("https://inpock.link/sungsikyung") and lr.is_link_hub("https://linktr.ee/abc")
    assert lr.is_shop("https://www.coupang.com/vp/products/123") and lr.is_shop("https://smartstore.naver.com/x/products/1")
    assert not lr.is_shop("https://www.youtube.com/watch?v=abc")
    assert lr.is_shortener("https://link.coupang.com/a/xyz")
    # 네트워크 없이: expand/fetch 를 가짜로
    monkeypatch.setattr(lr, "expand", lambda u, timeout=6.0: "https://www.coupang.com/vp/products/999" if "link.coupang" in u else u)
    monkeypatch.setattr(lr, "fetch_hub_links", lambda u, timeout=8.0: [{"title": "성시경 라면 (쿠팡)", "url": "https://link.coupang.com/a/abc"}, {"title": "인스타", "url": "https://instagram.com/x"}])
    r = lr.resolve_video_links("구매는 https://inpock.link/test 참고! 그리고 https://smartstore.naver.com/shop/products/1", None)
    assert r["hubs"][0]["links_found"] == 2 and r["hubs"][0]["shopping_links"] == 1
    assert any(p["final_url"].startswith("https://www.coupang.com") and p["title"].startswith("성시경") for p in r["products"])
    assert any("smartstore" in p["url"] for p in r["products"])
    assert all(not o["is_shopping"] for o in r["others"])


def test_claude_client_http_fallback(monkeypatch):
    from app.services import claude_client as cc
    from app.config import get_settings
    monkeypatch.setattr(cc, "sdk_import_error", lambda: "ImportError: DLL load failed (테스트)")
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")

    class R:
        status_code = 200
        def json(self): return {"content": [{"type": "text", "text": "{\"ok\": true}"}], "stop_reason": "end_turn", "model": "claude-opus-5-5"}
    captured = {}
    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, body=json); return R()
    monkeypatch.setattr(cc.httpx, "post", fake_post)
    out = cc.create_json(system="s", messages=[{"role": "user", "content": "hi"}], output_schema={"type": "object"})
    assert out["ok"] is True and out["_transport"] == "http"
    assert captured["headers"]["x-api-key"] == "test-key" and captured["body"]["output_config"]["format"]["type"] == "json_schema"
    assert cc.transport_status()["transport"] == "http"
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "")


def test_structured_output_schemas_avoid_unsupported_keywords():
    """Claude 구조화 출력은 integer 의 minimum/maximum, array 의 maxItems 등을 거부한다."""
    from app.services.ai_scorer import _schema
    from app.services.product_identifier import INVESTIGATE_SCHEMA, SUGGESTION_SCHEMA
    from app.services.shorts_planner import PLAN_SCHEMA
    import json
    banned = ("minimum", "maximum", "maxItems", "minItems", "minLength", "maxLength", "pattern", "format")
    for sch in (_schema([{"key": "a", "max": 25}, {"key": "performance", "max": 20}]), INVESTIGATE_SCHEMA, SUGGESTION_SCHEMA, PLAN_SCHEMA):
        text = json.dumps(sch)
        for b in banned:
            assert f'"{b}"' not in text, f"{b} in schema"


def test_segment_finder_parsers_and_window():
    from app.services.segment_finder import parse_chapters, parse_transcript_text, _window_search, transcript_from_payload
    ch = parse_chapters("0:00 인트로\n03:15 트레이더조 쇼핑\n10:02 마무리", 700)
    assert [c["start"] for c in ch] == [0, 195, 602] and ch[1]["end"] == 602 and ch[2]["end"] == 700
    assert parse_chapters("그냥 설명", 100) == []
    segs = parse_transcript_text("[0:00] 안녕하세요\n[0:15] 오늘은 트레이더조 가방을 보여드릴게요\n[0:30] 쿨 유리 언니가 줄 서서 샀대요\n[1:05:10] 끝")
    assert segs[1]["start"] == 15 and segs[3]["start"] == 3910
    w = _window_search(segs, ["트레이더조", "가방", "유리", "없는단어"])
    assert w and w["start"] <= 15 and w["end"] >= 30 and "트레이더조" in w["quote"] and set(w["matched"]) == {"트레이더조", "가방", "유리"}
    tr = transcript_from_payload({"videoId": "x", "transcription": "[0:00] 가\n[0:10] 나", "language": "ko"})
    assert tr["count"] == 2 and tr["source"] == "vidiq_mcp"
    assert transcript_from_payload({"videoId": "x"}) is None


def test_image_original_youtube_id_extraction():
    from app.services.image_original import _YT_ID_RE
    urls = ["https://www.youtube.com/watch?v=sHJvABrKOno&t=10s", "https://i.ytimg.com/vi/90Ube_-fCf8/maxresdefault.jpg",
            "https://youtu.be/99TWvVVTARo", "https://example.com/page"]
    ids = [m for u in urls for m in _YT_ID_RE.findall(u)]
    assert ids == ["sHJvABrKOno", "90Ube_-fCf8", "99TWvVVTARo"]


def test_celebrity_discovery_name_candidates_heuristic(db_session=None):
    from app.services.celebrity_discovery import _name_candidates, EXTRA_STOP
    assert "트레이더조" in EXTRA_STOP and "다이소" in EXTRA_STOP
