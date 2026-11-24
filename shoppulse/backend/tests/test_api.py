import io
import json
from datetime import datetime, timedelta

VIDEO_META = {"videos": [{"id": "dQw4w9WgXcQ", "title": "Rick Astley - Never Gonna Give You Up",
                          "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw", "channelTitle": "Rick Astley",
                          "publishedAt": "2009-10-25T06:57:33Z", "duration": "PT3M34S", "viewCount": 1840384614,
                          "likeCount": 19516779, "commentCount": 2462529, "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                          "vph": 13933.75, "outlierScore": None, "engagementRate": 0.01194}]}
VIDEO_STATS = {"videoId": "dQw4w9WgXcQ", "data": [
    {"timestamp": f"2026-11-{d:02d}T00:01:12Z", "views": 1837979766 + (d - 17) * 320000, "likes": None, "comments": None, "vph": 15000 + d}
    for d in range(17, 24)]}


def test_health_and_seed(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    chans = client.get("/api/channels").json()
    assert len(chans) >= 50
    assert all(c["verification_status"] == "unverified" for c in chans if c["source"] == "seed")
    assert all(c["channel_id"] is None for c in chans if c["source"] == "seed")


def test_celebrity_and_channel_flow(client):
    r = client.post("/api/celebrities", json={"name": "테스트연예인", "primary_field": "배우"})
    assert r.status_code == 201
    cid = r.json()["id"]
    r = client.post("/api/channels", json={"celebrity_id": cid, "channel_name": "테스트 채널",
                                          "channel_id": "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
                                          "relevance_food": 3})
    assert r.status_code == 201
    assert r.json()["channel_id"] == "UCuAXFkgsw1L7xaCfnd5JJOw"
    dup = client.post("/api/channels", json={"channel_name": "중복", "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw"})
    assert dup.status_code == 409
    chid = r.json()["id"]
    r = client.patch(f"/api/channels/{chid}", json={"verification_status": "verified"})
    assert r.json()["verification_status"] == "verified"
    # YouTube API 미설정 → 명확한 503
    r = client.post(f"/api/channels/{chid}/resolve")
    assert r.status_code == 503 and "YOUTUBE_API_KEY" in r.json()["detail"]
    job = client.post(f"/api/channels/{chid}/collect", json={}).json()
    assert job["status"] == "failed" and "YOUTUBE_API_KEY" in job["error"]


def test_video_dedupe_and_graph(client):
    chid = [c for c in client.get("/api/channels").json() if c["channel_name"] == "테스트 채널"][0]["id"]
    r = client.post("/api/videos", json={"url_or_id": "https://youtu.be/aaaaaaaaaaa", "channel_id": chid, "title": "테스트 영상",
                                        "duration_seconds": 1380, "view_count": 1000, "fetch": False})
    assert r.status_code == 201
    v = r.json()
    assert v["video_format"] == "long" and v["snapshot_count"] == 1
    assert v["graph"]["graph_type"] == "insufficient"
    dup = client.post("/api/videos", json={"url_or_id": "aaaaaaaaaaa", "fetch": False})
    assert dup.status_code == 409
    vid = v["id"]
    base = datetime(2026, 1, 1)
    deltas = [50000, 30000, 2000, 500, 300, 200, 150]
    total = 1000
    for i, d in enumerate(deltas):
        total += d
        r = client.post(f"/api/videos/{vid}/snapshots", json={"observed_at": (base + timedelta(days=i + 1)).isoformat(),
                                                             "view_count": total, "source": "manual"})
        assert r.status_code == 201
    g = client.get(f"/api/videos/{vid}/graph").json()
    assert g["analysis"]["graph_type"] == "spike_plateau"
    assert len(g["points"]) == 8
    # 같은 시각 중복 스냅샷 거부
    r = client.post(f"/api/videos/{vid}/snapshots", json={"observed_at": (base + timedelta(days=1)).isoformat(), "view_count": 1})
    assert r.status_code == 409
    # 미확인 지표는 NULL
    r = client.post(f"/api/videos/{vid}/metrics", json={"metric_type": "outlier", "value": None, "source": "vidiq_manual"})
    assert r.status_code == 201
    assert r.json()["outlier"] is None and r.json()["outlier_band"] is None
    r = client.post(f"/api/videos/{vid}/metrics", json={"metric_type": "vph", "value": 1200, "basis": "recent", "source": "vidiq_manual"})
    assert r.json()["vph"] == 1200 and r.json()["vph_band"] == "우선 조사"
    lst = client.get("/api/videos", params={"graph_type": "spike_plateau"}).json()
    assert lst["total"] >= 1
    lst = client.get("/api/videos", params={"sort": "vph"}).json()
    assert lst["items"][0]["id"] == vid


def test_vidiq_json_import_real_shape(client):
    f = io.BytesIO(json.dumps(VIDEO_META).encode())
    r = client.post("/api/import/vidiq-json", files={"file": ("meta.json", f, "application/json")})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["videos_created"] == 1 and res["null_outliers"] == 1
    f = io.BytesIO(json.dumps(VIDEO_STATS).encode())
    r = client.post("/api/import/vidiq-json", files={"file": ("stats.json", f, "application/json")})
    assert r.json()["result"]["snapshots_added"] == 7
    v = client.get("/api/videos", params={"q": "dQw4w9WgXcQ"}).json()["items"][0]
    assert v["outlier"] is None  # vidIQ 가 null 을 준 경우 0 이 아니라 미확인
    assert v["vph"] is not None and v["vph_basis"] == "unspecified"
    assert v["duration_seconds"] == 214 and v["snapshot_count"] == 8
    assert v["graph"]["graph_type"] != "insufficient"


def test_csv_import(client):
    csv = "video_id,outlier,vph,views,measured_at\nbbbbbbbbbbb,12.5,800,,2026-11-20T00:00:00Z\n,1,1,1,\n"
    r = client.post("/api/import/metrics-csv", files={"file": ("m.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "partial" and j["result"]["metrics_added"] == 2 and len(j["result"]["skipped"]) == 1


def test_product_candidate_score_verification_plan(client):
    vid = client.get("/api/videos", params={"q": "테스트 영상"}).json()["items"][0]["id"]
    seg = client.post(f"/api/videos/{vid}/segments", json={"start_seconds": 495, "end_seconds": 522,
                                                           "quote": "미국 콜라는 더 달아요", "content_type": "comparison",
                                                           "is_recommendation": False}).json()
    assert seg["timestamp_url"].endswith("&t=495s")
    bad = client.post(f"/api/videos/{vid}/segments", json={"start_seconds": 10, "end_seconds": 5})
    assert bad.status_code == 400
    p = client.post("/api/products", json={"name": "콜라(제품 미확정)", "category": "food", "identification_status": "brand_only"}).json()
    client.post(f"/api/products/{p['id']}/offers", json={"seller": "쿠팡", "price": 1200, "stock_status": "in_stock"})
    r = client.post("/api/products/mentions", json={"video_id": vid, "product_id": p["id"], "segment_id": seg["id"]})
    assert r.status_code == 201
    assert client.post("/api/products/mentions", json={"video_id": vid, "product_id": p["id"], "segment_id": seg["id"]}).status_code == 409

    r = client.post("/api/candidates", json={"video_id": vid, "product_id": p["id"], "segment_id": seg["id"],
                                             "channel_category": "food", "content_type": "comparison"})
    assert r.status_code == 201
    c = r.json()
    cid = c["id"]
    assert c["score"] is None and c["production_ready"] is False and len(c["verification"]) == 7
    # AI 제안: 성과 항목만(지표 있음), 나머지 NULL → 총점 NULL
    r = client.post(f"/api/candidates/{cid}/scores/suggest").json()
    assert r["scores"]["ai"]["total"] is None
    assert r["scores"]["ai"]["item_scores"]["performance"] is not None
    assert r["scores"]["ai"]["item_scores"]["hook"] is None
    # 사람 점수 — 일부만 → 총점 NULL
    r = client.post(f"/api/candidates/{cid}/scores", json={"scorer": "human", "item_scores": {"hook": 20}}).json()
    assert r["score"] is None
    full = {"hook": 22, "performance": 15, "originality": 18, "purchasability": 10, "target_fit": 8, "timing": 9}
    r = client.post(f"/api/candidates/{cid}/scores", json={"scorer": "human", "item_scores": full, "rationale": {"hook": "발언이 강함"}}).json()
    assert r["score"] == 82 and r["grade_key"] == "top" and r["grade_label"] == "최우선 검토"
    assert r["score_scorer"] == "human"
    assert client.post(f"/api/candidates/{cid}/scores", json={"item_scores": {**full, "hook": 26}}).status_code == 400
    # 검증: 중대 항목 미해결이면 점수 높아도 준비 완료 아님
    for item in ["official_source", "celebrity_appearance", "statement_context", "product_identity"]:
        client.put(f"/api/candidates/{cid}/verification", json={"item": item, "status": "passed"})
    r = client.get(f"/api/candidates/{cid}").json()
    assert r["production_ready"] is False and r["unresolved_critical"] == ["footage_rights"]
    client.put(f"/api/candidates/{cid}/verification", json={"item": "footage_rights", "status": "passed"})
    assert client.get(f"/api/candidates/{cid}").json()["production_ready"] is True
    # 기획안(템플릿): 저장된 발언만 사용, 단순 언급이면 '추천' 경고
    r = client.post(f"/api/candidates/{cid}/plans", json={"target_seconds": 25, "provider": "template"})
    assert r.status_code == 201
    plan = r.json()["plan"]
    assert plan["celebrity_statement"] == "미국 콜라는 더 달아요"
    assert any("추천템" in t for t in plan["research_todo"])
    assert r.json()["generated_by"] == "template"
    # 필터·정렬
    lst = client.get("/api/candidates", params={"category": "food", "sort": "score", "min_score": 80}).json()
    assert lst["total"] == 1 and lst["items"][0]["id"] == cid
    assert client.get("/api/candidates", params={"grade": "low"}).json()["total"] == 0
    assert client.get("/api/candidates", params={"graph_type": "spike_plateau"}).json()["total"] == 1


def test_schedule(client):
    cid = client.get("/api/candidates").json()["items"][0]["id"]
    r = client.put("/api/schedule", json={"schedule_date": "2026-11-24", "channel_category": "beauty", "slot": "morning", "candidate_id": cid})
    assert r.status_code == 400  # 카테고리 불일치
    r = client.put("/api/schedule", json={"schedule_date": "2026-11-24", "channel_category": "food", "slot": "night", "candidate_id": cid, "status": "scripting"})
    assert r.status_code == 200 and r.json()["status"] == "scripting"
    grid = client.get("/api/schedule", params={"schedule_date": "2026-11-24"}).json()
    assert len(grid["grid"]) == 9
    filled = [g for g in grid["grid"] if g["candidate_id"]]
    assert len(filled) == 1 and filled[0]["slot"] == "night"
    assert client.get(f"/api/candidates/{cid}").json()["status"] == "scripting"


def test_daily_sourcing_reports_actual_counts(client):
    r = client.post("/api/sourcing/run", json={"report_date": "2026-11-24", "background": False})
    assert r.status_code == 200
    rep = r.json()
    assert rep["summary"]["total_final"] == 1  # 점수 있는 후보 1개만 — 가짜로 채우지 않음
    food = [c for c in rep["categories"] if c["category"] == "food"][0]
    assert food["final_shortfall"] == 2 and food["shortfall"] == 8
    beauty = [c for c in rep["categories"] if c["category"] == "beauty"][0]
    assert beauty["found"] == 0 and beauty["note"]
    # 다음 날 다시 돌리면 중복 사유 기록
    r2 = client.post("/api/sourcing/run", json={"report_date": "2026-11-25", "background": False}).json()
    food2 = [c for c in r2["categories"] if c["category"] == "food"][0]
    assert len(food2["duplicates_from_previous_day"]) == 1
    stats = client.get("/api/dashboard/stats").json()
    assert stats["spike_plateau"] >= 1 and stats["scheduler"]["auto_enabled"] is False
    assert client.get("/api/sourcing/scheduler").json()["running"] is True


def test_settings_scoring_version(client):
    bad = client.post("/api/settings/scoring", json={"name": "x", "items": [{"key": "a", "label": "A", "max": 50}], "grades": []})
    assert bad.status_code == 400
    s = client.get("/api/settings").json()
    assert s["scoring"]["items"][0]["max"] == 25
    assert s["user"]["auto_sourcing_enabled"] is False
    r = client.put("/api/settings/user/default_region", json={"value": "부산"})
    assert r.json()["value"] == "부산"


def test_backup_restore_roundtrip(client):
    before = client.get("/api/videos").json()["total"]
    exp = client.get("/api/backup/export.json")
    assert exp.status_code == 200
    data = exp.json()
    assert data["format"] == "shoppulse-backup" and len(data["tables"]["videos"]) == before
    r = client.post("/api/backup", )
    assert r.status_code == 201
    assert client.get("/api/backup").json()["files"]
    # 영상 하나 삭제 후 복원 → 복구
    vid = client.get("/api/videos").json()["items"][0]["id"]
    client.delete(f"/api/videos/{vid}")
    assert client.get("/api/videos").json()["total"] == before - 1
    r = client.post("/api/backup/restore", files={"file": ("b.json", io.BytesIO(json.dumps(data).encode()), "application/json")})
    assert r.status_code == 200, r.text
    assert client.get("/api/videos").json()["total"] == before
    assert client.get(f"/api/videos/{vid}").status_code == 200
    zipr = client.get("/api/backup/export.zip")
    assert zipr.status_code == 200 and zipr.headers["content-type"] == "application/zip"


def test_persistence_across_sessions(client):
    """새 세션/엔진으로 다시 읽어도 데이터가 남아 있는지."""
    from app.database import SessionLocal
    from app.models import Video
    with SessionLocal() as db:
        assert db.query(Video).count() == client.get("/api/videos").json()["total"]


def test_bulk_endpoints_without_api_key(client):
    assert client.get("/api/channels/bulk/status").json()["running"] is False
    assert client.post("/api/channels/bulk/resolve", json={"limit": 5}).status_code == 503
    assert client.post("/api/channels/bulk/collect", json={}).status_code == 503


def test_pick_best_prefers_exact_name_and_flags_ambiguous():
    from app.services.bulk import pick_best
    from app.models import YoutubeChannel, Celebrity
    ch = YoutubeChannel(channel_name="성시경 SUNG SI KYUNG", celebrity=Celebrity(name="성시경"))
    best, verdict = pick_best(ch, [
        {"channel_id": "UC1", "title": "성시경 팬채널", "handle": "@fan", "subscriber_count": 1000, "url": ""},
        {"channel_id": "UC2", "title": "성시경 SUNG SI KYUNG", "handle": "@sungsikyung", "subscriber_count": 2360000, "url": ""},
    ])
    assert best["channel_id"] == "UC2" and verdict == "유력"
    best, verdict = pick_best(YoutubeChannel(channel_name="XYZ"), [{"channel_id": "UC9", "title": "전혀 다른 채널", "subscriber_count": 0, "url": ""}])
    assert verdict != "유력"
    assert pick_best(ch, [])[0] is None


def test_derived_shorts_link_and_evidence(client):
    orig = client.get("/api/videos", params={"q": "테스트 영상"}).json()["items"][0]
    r = client.post("/api/videos", json={"url_or_id": "ccccccccccc", "title": "[재편집] 테스트 쇼츠", "duration_seconds": 40,
                                        "source_type": "reedit_shorts", "fetch": False})
    assert r.status_code == 201
    short = r.json()
    assert short["is_derived"] is True and short["video_format"] == "short"
    assert client.patch(f"/api/videos/{short['id']}", json={"original_video_id": short["id"]}).status_code == 400
    r = client.patch(f"/api/videos/{short['id']}", json={"original_video_id": orig["id"]})
    assert r.json()["original"]["id"] == orig["id"]
    base = datetime(2026, 2, 1)
    total = 500000
    for i, d in enumerate([0, 300000, 200000, 5000, 1000, 900, 40000, 90000, 70000]):
        total += d
        client.post(f"/api/videos/{short['id']}/snapshots", json={"observed_at": (base + timedelta(days=i + 1)).isoformat(), "view_count": total})
    client.post(f"/api/videos/{short['id']}/metrics", json={"metric_type": "outlier", "value": 35, "source": "vidiq_manual"})
    # 상품이 연결되지 않은 쇼츠는 근거로 집계하지 않는다
    d = client.get(f"/api/videos/{orig['id']}").json()
    assert d["derived_count"] == 1 and d["evidence"]["count"] == 0 and d["evidence"]["unconfirmed_count"] == 1
    pid = client.get("/api/candidates").json()["items"][0]["product_id"]
    assert client.post("/api/products/mentions", json={"video_id": short["id"], "product_id": pid}).status_code == 201
    d = client.get(f"/api/videos/{orig['id']}").json()
    assert d["derived_count"] == 1 and d["evidence"]["count"] == 1 and d["evidence"]["best_outlier"] == 35
    assert d["derived_shorts"][0]["graph"]["graph_type"] == "resurgence"
    assert d["evidence"]["resurgence"] == 1
    # 후보 점수 제안에 재편집 쇼츠 근거 반영
    cid = client.get("/api/candidates").json()["items"][0]["id"]
    r = client.post(f"/api/candidates/{cid}/scores/suggest").json()
    assert "재편집 쇼츠" in r["scores"]["ai"]["rationale"]["performance"]
    assert r["evidence"]["count"] == 1
    # 필터
    assert client.get("/api/videos", params={"original_video_id": orig["id"]}).json()["total"] == 1
    assert client.get("/api/videos", params={"source_type": "reedit_shorts"}).json()["total"] == 1
    stats = client.get("/api/dashboard/stats").json()
    assert stats["videos_derived"] == 1 and stats["graph_derived"].get("resurgence") == 1
    # API 미설정 시 검색 작업은 실패로 기록
    j = client.post("/api/videos/discover-shorts", json={"query": "테스트 추천템"}).json()
    assert j["status"] == "failed" and "YOUTUBE_API_KEY" in j["error"]
    assert client.post("/api/channels/bulk/discover", json={}).status_code == 503


def test_migration_adds_missing_columns(tmp_path):
    import sqlite3
    from sqlalchemy import create_engine
    from app import migrations
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE videos (id INTEGER PRIMARY KEY, title TEXT)")
    con.execute("CREATE TABLE celebrities (id INTEGER PRIMARY KEY)")
    con.commit(); con.close()
    eng = create_engine(f"sqlite:///{db}")
    applied = migrations.run(eng)
    assert "videos.original_video_id" in applied and "videos.celebrity_id" in applied
    assert migrations.run(eng) == []  # 두 번째는 변경 없음


def test_shopping_flag_filter_and_bulk_delete(client):
    r = client.post("/api/videos", json={"url_or_id": "ddddddddddd", "title": "임영웅 콘서트 직캠", "source_type": "reedit_shorts", "fetch": False}).json()
    r2 = client.post("/api/videos", json={"url_or_id": "eeeeeeeeeee", "title": "임영웅 추천템 내돈내산 쿠팡 꿀템", "source_type": "reedit_shorts", "fetch": False}).json()
    assert r["is_shopping"] is False and r2["is_shopping"] is True  # 등록 시 자동 판별
    res = client.post("/api/videos/reclassify-shopping").json()
    assert res["total"] >= 2 and res["shopping"] >= 1 and res["non_shopping"] >= 1
    assert client.get(f"/api/videos/{r['id']}").json()["is_shopping"] is False
    assert client.get(f"/api/videos/{r2['id']}").json()["is_shopping"] is True
    # 사람 판정 우선
    client.patch(f"/api/videos/{r['id']}", json={"is_shopping": True})
    d = client.get(f"/api/videos/{r['id']}").json()
    assert d["is_shopping"] is True and d["is_shopping_manual"] is True
    client.patch(f"/api/videos/{r['id']}", json={"is_shopping": None})
    assert client.get(f"/api/videos/{r['id']}").json()["is_shopping"] is False
    no = client.get("/api/videos", params={"shopping": "no", "source_type": "reedit_shorts"}).json()
    assert any(i["id"] == r["id"] for i in no["items"]) and not any(i["id"] == r2["id"] for i in no["items"])
    # 후보 연결된 영상은 일괄 삭제에서 건너뜀
    cand_vid = client.get("/api/candidates").json()["items"][0]["video_id"]
    res = client.post("/api/videos/bulk-delete", json={"video_ids": [r["id"], cand_vid]}).json()
    assert res["deleted"] == 1 and len(res["skipped"]) == 1
    assert client.get(f"/api/videos/{r['id']}").status_code == 404


def test_evidence_requires_confirmed_product(client):
    orig = client.get("/api/videos", params={"q": "테스트 영상"}).json()["items"][0]
    short = client.post("/api/videos", json={"url_or_id": "ggggggggggg", "title": "[재편집] 상품 미연결 쇼츠 추천템", "source_type": "reedit_shorts", "fetch": False}).json()
    client.patch(f"/api/videos/{short['id']}", json={"original_video_id": orig["id"]})
    assert client.get(f"/api/videos/{short['id']}").json()["product_status"] == "none"
    d = client.get(f"/api/videos/{orig['id']}").json()
    assert d["evidence"]["count"] == 1 and d["evidence"]["unconfirmed_count"] == 1  # 상품 미연결 쇼츠는 집계 안 함
    # 원본의 상품(brand_only=확인됨)을 쇼츠로 복사 → 확인됨
    r = client.post(f"/api/videos/{short['id']}/copy-original-products").json()
    assert r["added"] == 1
    sd = client.get(f"/api/videos/{short['id']}").json()
    assert sd["product_status"] == "confirmed" and sd["product_names"]
    d = client.get(f"/api/videos/{orig['id']}").json()
    assert d["evidence"]["count"] == 2 and d["evidence"]["unconfirmed_count"] == 0
    assert client.get("/api/videos", params={"product_status": "confirmed", "source_type": "reedit_shorts"}).json()["total"] == 2
    # 설명란 링크 추출
    v = client.post("/api/videos", json={"url_or_id": "fffffffffff", "title": "링크 테스트 추천템", "source_type": "reedit_shorts", "fetch": False,
                                        "description": "구매는 여기 https://link.coupang.com/a/abc 와 https://example.com/page."}).json()
    links = client.get(f"/api/videos/{v['id']}").json()["description_links"]
    assert len(links) == 2 and links[0]["is_shopping_link"] is True and links[1]["is_shopping_link"] is False
    assert links[1]["url"].endswith("/page")
    stats = client.get("/api/dashboard/stats").json()
    assert stats["videos_derived_confirmed"] == 2


def test_identify_product_requires_ai_key_and_adopt(client):
    vid = client.get("/api/videos", params={"q": "링크 테스트"}).json()["items"][0]["id"]
    r = client.post(f"/api/videos/{vid}/identify-product")
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]
    r = client.post(f"/api/videos/{vid}/adopt-suggestion", json={"name": "테스트 세럼", "brand": "브랜드X", "category": "beauty", "evidence": "썸네일 로고"})
    assert r.status_code == 201
    p = r.json()
    assert p["identification_status"] == "similar_candidate" and "[AI 추정]" in p["notes"]
    v = client.get(f"/api/videos/{vid}").json()
    assert v["product_status"] == "candidate"  # 추정 상품은 '확인됨'이 아님
    # 수동 등록 영상도 쇼핑 점수가 매겨진다
    assert v["shopping_score"] is not None
    res = client.post("/api/videos/reclassify-shopping", params={"scope": "all"}).json()
    assert res["total"] >= 5


def test_sourcing_background_without_api_key_completes(client):
    import time
    r = client.post("/api/sourcing/run", json={"report_date": "2026-11-26"})
    assert r.status_code == 200 and r.json()["task"] == "sourcing"
    for _ in range(50):
        st = client.get("/api/channels/bulk/status").json()
        if not st["running"]:
            break
        time.sleep(0.1)
    assert st["running"] is False and st["summary"]["report_date"] == "2026-11-26"
    assert st["summary"]["stats_refresh"]["skipped"] is True
