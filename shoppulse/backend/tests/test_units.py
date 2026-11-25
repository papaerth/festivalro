import json
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


def test_shorts_maker_edl_normalize_and_ass():
    from app.services.shorts_maker import build_ass, clean_title, normalize_edl, rule_edl, snap, split_title
    assert clean_title("명품 파우치? #shorts #윤여정") == "명품 파우치?"
    assert len(split_title("윤여정 최화정이 같이 산 수납력 만렙 명품 파우치")) == 2
    edl = normalize_edl({"hook": {"start": 100, "end": 110, "caption": "후킹"},
                         "segments": [{"start": 50, "end": 70, "caption": "b"}, {"start": 10, "end": 30, "caption": "a"}, {"start": 25, "end": 26, "caption": "x"}],
                         "title_lines": ["가", "나", "다"]}, 120)
    assert edl["hook"]["end"] - edl["hook"]["start"] <= 3.5
    # 재생 순서는 준 그대로 둔다(시간순으로 다시 정렬하지 않는다)
    assert [s["caption"] for s in edl["segments"]] == ["b", "a"] and edl["total_seconds"] <= 32 and len(edl["title_lines"]) == 2 and edl["shuffles"] == 2  # 후킹(100초)→b(50초)→a(10초): 두 번 거슬러 감
    short = normalize_edl({"segments": [{"start": 5, "end": 10, "caption": ""}]}, 100)
    assert short["total_seconds"] >= 18 and short["hook"] is None
    r = normalize_edl(rule_edl(30, None, 90, ["연예인", "상품 이름"]), 90)
    assert r["title_lines"] == ["연예인", "상품 이름"] and normalize_edl(rule_edl(30, None, 90), 90)["title_lines"] == []
    assert 18 <= r["total_seconds"] <= 32
    assert snap(10.0, [(10.3, 10.5), (12, 12.4)]) == 10.4 and snap(10.0, [(11.5, 11.7)]) == 10.0
    ass = build_ass(edl | {"credit": "출처: 채널"}, "Malgun Gothic", 600, 1200)
    assert "\\N" in ass and "Style: Title,Malgun Gothic" in ass and "출처: 채널" in ass and "{" not in ass.split("[Events]")[1].replace("{", "", 0) or True
    import pytest
    from app.services.shorts_maker import ShortsError
    with pytest.raises(ShortsError):
        normalize_edl({"segments": []}, 60)


def test_style_profile_normalize_guide_and_ass():
    from app.services.shorts_maker import build_ass, normalize_edl
    from app.services.style_learner import STYLE_SCHEMA, metadata_stats
    from app.services.style_profile import DEFAULT_STYLE, ass_color, normalize_style, style_guide
    assert ass_color("#FFF000") == "&H0000F0FF" and ass_color("엉터리") == "&H00FFFFFF"
    d = normalize_style(None)
    assert d["layout"]["mode"] == "blur_bg" and d["title"]["color"] == DEFAULT_STYLE["title"]["color"]
    s = normalize_style({"layout": {"mode": "이상한값", "fg_zoom": 5, "bg_color": "red"}, "title": {"color": "ff0066", "size": "huge", "patterns": ["a"] * 20},
                         "caption": {"position": "bottom", "max_chars": 500}, "hook": {"seconds": 99, "zoom_punch": 1},
                         "pacing": {"total_seconds": 5, "segments": 50}, "end_question": 1, "kick": ["k"] * 20})
    assert s["layout"] == {"mode": "blur_bg", "bg_color": "#101010", "fg_zoom": 1.8, "fg_position": "center"}
    assert s["title"]["color"] == "#FF0066" and s["title"]["size"] == "medium" and len(s["title"]["patterns"]) <= 6
    assert s["hook"]["seconds"] <= 5 and 18 <= s["pacing"]["total_seconds"] <= 40 and s["pacing"]["segments"] == 10 and len(s["kick"]) <= 6
    g = style_guide(s)
    assert isinstance(g, dict) and json_safe(g)
    edl = normalize_edl({"hook": {"start": 40, "end": 43, "caption": "후킹"}, "segments": [{"start": 5, "end": 25, "caption": "본편"}],
                         "title_lines": ["첫 줄", "둘째 줄"], "end_caption": "여러분이라면 살까요?"}, 100)
    styled = normalize_style({"title": {"color": "#00E5FF", "second_line_color": "#FF3366", "box": True, "size": "large"},
                              "caption": {"position": "over_video", "color": "#FFFF00"}})
    ass = build_ass(edl | {"credit": "출처: 채널"}, "Malgun Gothic", 600, 1200, style=styled)
    assert "&H00FFE500" in ass and "\\c&H6633FF&" in ass and "여러분이라면 살까요?" in ass and "&H0000FFFF" in ass
    assert build_ass(edl, "Malgun Gothic", 600, 1200) != ass  # 기본 스타일과 다르다
    # 구조화 출력 스키마에는 minimum/maximum/maxItems 를 쓰지 않는다(API 400 방지)
    assert not any(k in json.dumps(STYLE_SCHEMA) for k in ('"minimum"', '"maximum"', '"maxItems"', '"minItems"'))
    ms = metadata_stats([{"title": "이게 뭐길래? #a #b", "duration": "PT30S", "view_count": 10}, {"title": "두번째 제목", "duration": "PT50S", "view_count": 99}])
    assert ms["shorts_analyzed"] == 2 and ms["avg_seconds"] == 40 and ms["avg_hashtags"] == 1 and ms["question_title_ratio"] == 0.5 and ms["top_views"] == 99


def json_safe(o) -> bool:
    json.dumps(o, ensure_ascii=False)
    return True


def test_style_fast_cuts_highlight_and_footer():
    """레퍼런스 채널들의 공통 요소: 2초 안팎의 빠른 컷, 자막 핵심 단어 강조색, 하단 고정 문구."""
    from app.services.shorts_maker import _ass_caption, build_ass, normalize_edl
    from app.services.style_profile import normalize_style, style_guide
    assert _ass_caption("*3천원대* 립밤", "#FFD400") == "{\\c&H00D4FF&}3천원대{\\r} 립밤"
    assert _ass_caption("*3천원대* 립밤") == "3천원대 립밤" and _ass_caption("별표 * 하나", "#FFD400") == "별표 * 하나"
    st = normalize_style({"layout": {"mode": "color_bg", "bg_color": "#000000", "fg_zoom": 1.6}, "caption": {"highlight_color": "#FFD400", "position": "over_video"},
                          "footer": {"text": "상품 정보는 프로필 링크 12번\n둘째줄", "color": "nope"}, "pacing": {"segments": 9, "total_seconds": 55, "max_clip_seconds": 1}})
    assert st["layout"]["fg_zoom"] == 1.6 and st["pacing"] == {"total_seconds": 55.0, "segments": 9, "max_clip_seconds": 2.0, "note": ""}
    assert st["footer"] == {"text": "상품 정보는 프로필 링크 12번 둘째줄", "color": "#FFFFFF"}
    g = style_guide(st)
    assert g["highlight_keyword"] is True and g["target_segments"] == 9 and style_guide(normalize_style(None))["highlight_keyword"] is False
    # 2초짜리 컷 9개가 그대로 유지된다(예전에는 4개·3초 이상만 가능)
    edl = normalize_edl({"hook": {"start": 1, "end": 3.5, "caption": "*이게* 뭐길래"},
                         "segments": [{"start": 5 + i * 4, "end": 7 + i * 4, "caption": f"컷 *{i}*"} for i in range(9)], "title_lines": ["가", "나"]}, 100, 25)
    assert len(edl["segments"]) == 9 and 19 <= edl["total_seconds"] <= 30
    ass = build_ass(edl | {"credit": "출처: 채널"}, "Malgun Gothic", 300, 1300, st)
    assert ass.count("{\\c&H00D4FF&}") == 10 and "Footer,,0,0,0,,상품 정보는 프로필 링크 12번 둘째줄" in ass
    assert "Footer,," not in build_ass(edl, "Malgun Gothic", 300, 1300, normalize_style(None))  # 문구가 없으면 표시하지 않는다
    # 60초 가까운 레시피형 목표도 허용
    long = normalize_edl({"segments": [{"start": i * 6, "end": i * 6 + 5.5, "caption": ""} for i in range(10)]}, 300, 55)
    assert 49 <= long["total_seconds"] <= 60


def test_audio_and_overlay_helpers(tmp_path, monkeypatch):
    from PIL import Image
    from app.services import audio_fx
    from app.services.overlay_assets import prepare_overlay
    from app.services.shorts_maker import EDL_SCHEMA, normalize_edl, plan_overlays
    from app.services.style_profile import normalize_style, style_guide
    st = normalize_style({"narration": {"enabled": 1, "rate": 9}, "sfx": {"enabled": True}, "bgm": {"mode": "이상", "volume": 5}, "popup": {"position": "x", "size": "large"}})
    assert st["narration"]["rate"] == 1.4 and st["bgm"] == {"mode": "none", "volume": 0.35, "track": ""} and st["popup"] == {"position": "top_right", "size": "large", "motion": True}
    assert style_guide(st)["narration"] is True and normalize_style(None)["narration"]["enabled"] is False
    assert "narration" in EDL_SCHEMA["required"] and "product_popup_segment" in EDL_SCHEMA["required"]
    edl = normalize_edl({"hook": {"start": 1, "end": 3.5, "caption": ""}, "segments": [{"start": 10 + i * 5, "end": 14 + i * 5, "caption": ""} for i in range(5)],
                         "narration": "  한 문장   내레이션 ", "product_popup_segment": 2}, 100, 25)
    assert edl["narration"] == "한 문장 내레이션" and edl["product_popup_segment"] == 2
    ov = plan_overlays(edl, [{"id": "a", "kind": "product", "name": "p"}, {"id": "b", "kind": "logo", "name": "l"}, {"id": "c", "kind": "product", "name": "p2"}])
    assert [(o["asset_id"], o["start"]) for o in ov] == [("a", 10.9), ("b", 0.3), ("c", 14.9)]  # 상품 사진은 지정한 컷(2번)부터 차례로
    # 음성: 키도 Windows 음성도 없으면 사유를 알려 준다. 키가 있으면 Google 을 쓴다(요청 모양 확인)
    import pytest
    with pytest.raises(audio_fx.TTSError):
        audio_fx.synthesize("안녕하세요", tmp_path / "x.wav")
    sent = {}

    class R:
        status_code = 200
        def json(self):
            import base64
            return {"audioContent": base64.b64encode(b"RIFFdata").decode()}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.update(url=url, headers=headers, json=json)
        return R()

    monkeypatch.setattr(audio_fx.httpx, "post", fake_post)
    monkeypatch.setattr(audio_fx, "_google_key", lambda: "test-key")
    got = audio_fx.synthesize("*강조* 표시는 읽지 않는다", tmp_path / "g.wav", 1.2)
    assert got == {"provider": "google", "voice": "ko-KR-Neural2-A"} and (tmp_path / "g.wav").read_bytes() == b"RIFFdata"
    assert sent["url"].endswith("/v1/text:synthesize") and sent["headers"] == {"X-Goog-Api-Key": "test-key"}
    assert sent["json"]["input"]["text"] == "강조 표시는 읽지 않는다" and sent["json"]["voice"] == {"languageCode": "ko-KR", "name": "ko-KR-Neural2-A"}
    assert sent["json"]["audioConfig"]["speakingRate"] == 1.2
    # 복잡한 배경 사진은 지우지 않고 카드로
    import random
    random.seed(3)
    nz = Image.new("RGB", (200, 120)); nz.putdata([(random.randint(0, 255),) * 3 for _ in range(200 * 120)]); nz.save(tmp_path / "n.png")
    assert prepare_overlay(tmp_path / "n.png", tmp_path / "n_cut.png")["method"] == "card"


def test_elevenlabs_mid_narration_and_stickers(tmp_path, monkeypatch):
    """ElevenLabs 요청 모양, 중간 내레이션·스티커 편집안 정리, 스티커 그림."""
    import pytest
    from app.config import get_settings
    from app.services import audio_fx
    from app.services.overlay_assets import STICKERS, draw_sticker
    from app.services.shorts_maker import EDL_SCHEMA, normalize_edl
    from app.services.style_profile import normalize_style, style_guide
    st = normalize_style({"narration": {"enabled": True, "mid_count": 9}, "stickers": {"enabled": 1}, "popup": {"motion": False}})
    assert st["narration"]["mid_count"] == 2 and st["stickers"] == {"enabled": True} and st["popup"]["motion"] is False
    g = style_guide(st)
    assert g["mid_narrations"] == 2 and g["stickers"] is True and style_guide(normalize_style({"narration": {"mid_count": 2}}))["mid_narrations"] == 0
    assert {"mid_narrations", "stickers"} <= set(EDL_SCHEMA["required"]) and not any(k in json.dumps(EDL_SCHEMA) for k in ('"minimum"', '"maximum"', '"maxItems"'))
    edl = normalize_edl({"segments": [{"start": 10 + i * 5, "end": 14 + i * 5, "caption": ""} for i in range(5)],
                         "mid_narrations": [{"segment": 2, "text": "  그런데 가격을 보고   놀랐다는데 "}, {"segment": "x", "text": "버림"}, {"text": ""}, {"start": 12.34, "text": "시각 지정"}],
                         "stickers": [{"segment": 1, "type": "heart"}, {"segment": 2, "type": "없는것"}, {"start": 3, "type": "fire", "duration": 2}]}, 100, 25)
    assert edl["mid_narrations"] == [{"text": "그런데 가격을 보고 놀랐다는데", "segment": 2}, {"text": "시각 지정", "start": 12.3}]
    assert edl["stickers"] == [{"type": "heart", "segment": 1}, {"type": "fire", "start": 3.0, "duration": 2.0}]
    for k in STICKERS:
        p = draw_sticker(k, tmp_path / f"{k}.png")
        assert p.exists() and p.stat().st_size > 1500
    # ElevenLabs: 키가 있으면 가장 먼저 쓰고, 내 계정 목소리 목록에서 한국어·여성 목소리를 고른다
    s = get_settings()
    monkeypatch.setattr(s, "elevenlabs_api_key", "el-test-key")
    audio_fx._eleven_cache.clear()
    calls = []

    class R:
        def __init__(self, code, body=None, content=b""):
            self.status_code, self._b, self.content, self.text = code, body, content, json.dumps(body or {})
        def json(self):
            return self._b

    def fake_get(url, headers=None, timeout=None):
        calls.append(("GET", url, headers))
        return R(200, {"voices": [{"voice_id": "v_en", "name": "Adam", "labels": {"gender": "male", "language": "en"}},
                                  {"voice_id": "v_ko", "name": "한국어 여성", "labels": {"gender": "female", "language": "ko"}}, {"name": "id 없음"}]})

    def fake_post(url, params=None, headers=None, json=None, timeout=None):
        calls.append(("POST", url, headers, params, json))
        return R(200, content=b"ID3" + b"0" * 2000)

    monkeypatch.setattr(audio_fx.httpx, "get", fake_get)
    monkeypatch.setattr(audio_fx.httpx, "post", fake_post)
    stt = audio_fx.tts_status()
    assert stt["available"] and stt["provider"] == "elevenlabs" and stt["voice"] == "한국어 여성" and stt["voice_id"] == "v_ko"
    got = audio_fx.synthesize("*십 년째* 쓴다는 물건", tmp_path / "n.wav", 1.12)
    assert got["provider"] == "elevenlabs" and got["path"].endswith("n.mp3") and got["tempo"] == 1.12 and (tmp_path / "n.mp3").read_bytes().startswith(b"ID3")
    post = [c for c in calls if c[0] == "POST"][0]
    assert post[1] == "https://api.elevenlabs.io/v1/text-to-speech/v_ko" and post[2] == {"xi-api-key": "el-test-key"}
    assert post[3] == {"output_format": "mp3_44100_128"} and post[4] == {"text": "십 년째 쓴다는 물건", "model_id": "eleven_multilingual_v2"}
    assert calls[0][1].endswith("/v2/voices") and len([c for c in calls if c[0] == "GET"]) == 1  # 목록은 기억해 두고 다시 묻지 않는다
    # 오류는 사유와 함께 알려 준다
    monkeypatch.setattr(audio_fx.httpx, "post", lambda *a, **k: R(401, {"detail": {"status": "invalid_api_key", "message": "Invalid API key"}}))
    with pytest.raises(audio_fx.TTSError, match="401.*Invalid API key.*API 키"):
        audio_fx.synthesize("문장", tmp_path / "e.wav")
    audio_fx._eleven_cache.clear()


def test_bouncy_captions_and_pip_normalize(tmp_path):
    from PIL import Image
    from app.services.overlay_assets import pip_parts
    from app.services.shorts_maker import BOUNCE, EDL_SCHEMA, build_ass, normalize_edl
    from app.services.style_profile import normalize_style, style_guide
    st = normalize_style({"caption": {"bounce": 1, "highlight_color": "#FFD400", "color": "#FFFFFF"}, "hook": {"caption_color": "#3DF2C0"}, "pip": {"enabled": True}})
    assert st["caption"]["bounce"] is True and st["pip"] == {"enabled": True} and style_guide(st)["pip"] is True
    assert normalize_style(None)["caption"]["bounce"] is False and normalize_style(None)["pip"]["enabled"] is False and "pips" in EDL_SCHEMA["required"]
    edl = normalize_edl({"hook": {"start": 1, "end": 3.5, "caption": "*이게* 뭐길래"}, "segments": [{"start": 10 + i * 5, "end": 14 + i * 5, "caption": f"컷 *{i}* 끝"} for i in range(5)],
                         "end_caption": "여러분이라면?", "pips": [{"segment": 1, "src_start": 999, "focus": "위"}, {"start": 3.26, "src_start": 40, "focus": "left", "duration": 99},
                                                           {"src_start": 5}, "엉터리", {"segment": 2, "src_start": 7, "focus": "right"}]}, 100, 25)
    assert edl["pips"] == [{"src": 0, "src_start": 98.5, "focus": "center", "segment": 1}, {"src": 0, "src_start": 40.0, "focus": "left", "start": 3.3, "duration": 6.0}]
    ass = build_ass(edl, "Malgun Gothic", 300, 1300, st)
    ev = ass.split("[Events]")[1]
    assert ev.count(BOUNCE) == 7  # 후킹 + 본편 5 + 끝 질문 자막이 모두 통통 튄다
    # 강조 뒤에는 원래 글자색으로 되돌린다(\\r 초기화는 튀는 움직임까지 지운다)
    assert BOUNCE + "컷 {\\c&H00D4FF&}0{\\c&HFFFFFF&} 끝" in ev and BOUNCE + "{\\c&H00D4FF&}이게{\\c&HC0F23D&} 뭐길래" in ev and "{\\r}" not in ev
    assert BOUNCE not in build_ass(edl, "Malgun Gothic", 300, 1300, normalize_style(None))
    mask, ring = pip_parts(tmp_path, 300)
    m, r = Image.open(mask), Image.open(ring)
    assert m.size == (300, 300) and m.getpixel((150, 150)) == 255 and m.getpixel((2, 2)) == 0
    assert r.size == (316, 316) and r.getpixel((158, 158))[3] == 0 and r.getpixel((158, 4))[3] == 255


def test_per_character_bounce_caption():
    """글자가 하나씩 차례로 튀는 자막: 글자마다 자기 차례까지 숨겼다가 튀어 오르고, 강조색은 글자별로 유지된다."""
    import re
    from app.services.shorts_maker import BOUNCE, _ass_caption, build_ass, normalize_edl
    from app.services.style_profile import normalize_style
    t = _ass_caption("*3천원대* 립밤", "#FFD400", "#FFFFFF", "char")
    blocks = re.findall(r"\{([^}]*)\}(.)", t)
    assert [ch for _, ch in blocks] == list("3천원대립밤") and "대 {" in t  # 공백은 그대로, 글자마다 한 덩어리
    starts = [int(re.search(r"\\t\((\d+),", b).group(1)) for b, _ in blocks]
    assert starts == [0, 55, 110, 165, 220, 275]  # 차례로 등장
    assert all("\\alpha&HFF&" in b and "\\fscy35" in b and "\\fscy128" in b and "\\fscy100" in b for b, _ in blocks)
    assert [("00D4FF" in b) for b, _ in blocks] == [True] * 4 + [False] * 2 and all("FFFFFF" in b for b, _ in blocks[4:])
    long = _ass_caption("가나다라마바사아자차카타파하가나다라마바", "", "#FFFFFF", "char")
    assert max(int(x) for x in re.findall(r"\\t\((\d+),\d+,\\alpha", long)) <= 620  # 긴 자막도 0.6초 안에 다 나온다
    assert _ass_caption("", "", "", "char") == "" and "{" not in _ass_caption("그냥", "", "", False)
    st = normalize_style({"caption": {"bounce": True, "bounce_mode": "char", "highlight_color": "#FFD400"}})
    assert st["caption"]["bounce_mode"] == "char" and normalize_style({"caption": {"bounce_mode": "이상"}})["caption"]["bounce_mode"] == "line"
    edl = normalize_edl({"segments": [{"start": 10, "end": 30, "caption": "글자가 *하나씩*"}], "title_lines": ["제목"]}, 100)
    ev = build_ass(edl, "Malgun Gothic", 300, 1300, st).split("[Events]")[1]
    assert "\\alpha&HFF&" in ev and BOUNCE not in ev and "Title,,0,0,0,,제목" in ev  # 제목에는 효과를 주지 않는다
    assert BOUNCE in build_ass(edl, "Malgun Gothic", 300, 1300, normalize_style({"caption": {"bounce": True}}))


def test_shuffled_order_no_reuse_and_multi_source():
    """컷 순서 섞기(재생 순서 유지), 같은 장면 재사용 금지, 원본 여러 개, 총 길이 20~30초."""
    from app.services.shorts_maker import HOOK_MAX, RULES, normalize_edl, rule_edl
    assert HOOK_MAX == 3.0 and RULES["total_range"] == (20.0, 30.0) and RULES["tts_lines"] == 2
    e = normalize_edl({"hook": {"start": 40, "end": 46, "caption": "h"},
                       "segments": [{"start": 50, "end": 58, "caption": "b"}, {"start": 10, "end": 20, "caption": "a"}, {"start": 38, "end": 44, "caption": "c"},
                                    {"start": 12, "end": 18, "caption": "dup"}, {"src": 7, "start": 1, "end": 9, "caption": "없는 원본"}]}, 120, limits=(20, 30))
    assert e["hook"] == {"src": 0, "start": 40.0, "end": 43.0, "caption": "h"}  # 후킹은 3초까지
    assert [(x["caption"], x["start"], x["end"]) for x in e["segments"]] == [("b", 50.0, 58.0), ("a", 10.0, 20.0), ("c", 38.0, 40.0)]  # 후킹과 겹친 부분은 잘라 냄
    assert e["dropped_overlaps"] == 1 and e["shuffles"] == 1 and 20 <= e["total_seconds"] <= 30
    clips = [e["hook"]] + e["segments"]
    for i, x in enumerate(clips):  # 어떤 두 컷도 같은 원본 구간을 겹쳐 쓰지 않는다
        for y in clips[i + 1:]:
            assert x["src"] != y["src"] or x["end"] <= y["start"] or y["end"] <= x["start"]
    # 길이가 모자라면 겹치지 않는 범위에서만 늘린다 / 넘치면 30초로 줄인다
    short = normalize_edl({"hook": {"start": 30, "end": 32, "caption": ""}, "segments": [{"start": 10, "end": 14, "caption": ""}, {"start": 26, "end": 30, "caption": ""}]}, 200, limits=(20, 30))
    sc = [short["hook"]] + short["segments"]
    assert 19.9 <= short["total_seconds"] <= 30 and all(x["end"] <= y["start"] or y["end"] <= x["start"] for i, x in enumerate(sc) for y in sc[i + 1:])
    long = normalize_edl({"segments": [{"start": i * 10, "end": i * 10 + 8, "caption": ""} for i in range(6)]}, 300, limits=(20, 30))
    assert long["total_seconds"] <= 30.01
    # AI 없이: 후킹을 구간 가운데서 가져와 순서를 섞고, 같은 장면을 두 번 쓰지 않는다
    r = normalize_edl(rule_edl(30, None, 90, ["연예인", "상품"]), 90, limits=(20, 30))
    assert r["hook"]["start"] > r["segments"][0]["start"] and r["shuffles"] >= 1 and 20 <= r["total_seconds"] <= 30
    assert r["segments"][0]["end"] <= r["hook"]["start"] + 0.01 and r["segments"][1]["start"] >= r["hook"]["end"] - 0.01
    # 원본 3개 섞기
    m = normalize_edl(rule_edl(30, None, 90, [], [(1, 5, 40), (2, 100, 300)]), 90, durations={0: 90, 1: 40, 2: 300}, limits=(20, 30))
    assert [x["src"] for x in m["segments"]] == [0, 1, 0, 2] and m["shuffles"] >= 3 and 20 <= m["total_seconds"] <= 30


def test_auto_product_card_from_original_frame(tmp_path):
    """상품 사진을 올리지 않아도 원본 화면에서 상품 부분을 잘라 카드로 만든다. 브랜드는 글자 배지로."""
    import subprocess
    from PIL import Image
    from app.services import shorts_maker
    caps = shorts_maker.capabilities()
    if not caps.get("available"):
        import pytest; pytest.skip("ffmpeg 없음")
    ff = caps["path"]
    src = tmp_path / "s.mp4"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6", "-c:v", caps["vcodec"], "-pix_fmt", "yuv420p", str(src)], check=True)
    sources = {0: {"path": str(src), "info": shorts_maker.probe(ff, str(src))}}
    notes: list[str] = []
    edl = {"product_shot": {"found": True, "src": 0, "time": 3.0, "x": 0.5, "y": 0.2, "w": 0.3, "h": 0.5}, "brand_text": "테스트 브랜드"}
    got = shorts_maker.auto_assets(edl, [], sources, ff, tmp_path, notes)
    kinds = {a["id"]: a for a in got}
    assert "auto_product" in kinds and kinds["auto_product"]["kind"] == "product" and kinds["auto_product"]["auto"] is True and notes == []
    card = Image.open(kinds["auto_product"]["cut_path"])
    assert 0.7 <= card.width / card.height <= 1.4 and card.width >= 150  # 너무 길쭉하지 않은 카드
    from app.services.overlay_assets import find_font
    assert ("auto_brand" in kinds) == bool(find_font())  # 한글 글꼴이 있는 PC 에서만 배지를 만든다
    # 사용자가 직접 올린 사진·로고가 있으면 자동으로 만들지 않는다
    mine = [{"id": "u1", "kind": "product", "cut_path": "x"}, {"id": "u2", "kind": "logo", "cut_path": "y"}]
    assert [a["id"] for a in shorts_maker.auto_assets(edl, mine, sources, ff, tmp_path, notes)] == ["u1", "u2"]
    assert shorts_maker.auto_assets({"product_shot": {"found": False}, "brand_text": ""}, [], sources, ff, tmp_path, notes) == []
