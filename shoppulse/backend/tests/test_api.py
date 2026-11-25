import base64
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
    # 생성 즉시 규칙 간이 점수(총점 있음)·템플릿 기획안이 붙는다. 사람·AI 점수는 아직 없음
    assert c["score"] is not None and c["score_scorer"] == "rule" and c["scores"]["human"] is None and c["scores"]["ai"] is None
    assert c["plan_count"] == 1 and c["latest_plan_by"] == "template"
    assert c["production_ready"] is False and len(c["verification"]) == 7
    # 키 없음 → suggest 는 규칙 간이 채점(성과 항목에 실제 지표 근거)
    r = client.post(f"/api/candidates/{cid}/scores/suggest").json()
    assert r["scores"]["ai"] is None and r["scores"]["rule"]["total"] is not None
    assert r["scores"]["rule"]["item_scores"]["performance"] is not None and "VPH" in r["scores"]["rule"]["rationale"]["performance"]
    # 사람 점수 — 일부만 → 사람 총점 NULL, 표시 점수는 규칙 간이 점수로 유지
    r = client.post(f"/api/candidates/{cid}/scores", json={"scorer": "human", "item_scores": {"hook": 20}}).json()
    assert r["scores"]["human"]["total"] is None and r["score_scorer"] == "rule"
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
    assert "재편집 쇼츠" in r["scores"]["rule"]["rationale"]["performance"]
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


def test_auto_discovery_creates_candidates_and_ai_skipped_without_key(client):
    # 쇼핑 판정이 참이고 먹거리 단어가 있는 재편집 쇼츠를 등록 → 후보 대상
    orig = client.get("/api/videos", params={"q": "테스트 영상"}).json()["items"][0]
    v = client.post("/api/videos", json={"url_or_id": "hhhhhhhhhhh", "title": "성시경 추천템 간식 라면 내돈내산", "duration_seconds": 45,
                                        "view_count": 2500000, "fetch": False, "source_type": "reedit_shorts"}).json()
    client.patch(f"/api/videos/{v['id']}", json={"original_video_id": orig["id"]})
    assert v["is_shopping"] is True
    # 원본 영상은 후보 대상이 아님
    client.post("/api/videos", json={"url_or_id": "iiiiiiiiiii", "title": "성시경 추천템 간식 원본 롱폼", "duration_seconds": 900, "view_count": 9000000, "fetch": False})
    rep = client.post("/api/sourcing/run", json={"report_date": "2026-11-27", "background": False}).json()
    disc = rep["summary"]["auto_discovery"]
    assert disc["created"]["food"] >= 1
    assert rep["summary"]["ai_scoring"]["skipped"] is True
    cands = client.get("/api/candidates", params={"category": "food"}).json()["items"]
    auto = [c for c in cands if c["video_id"] == v["id"]]
    assert len(auto) == 1 and "[자동 발굴" in auto[0]["notes"] and auto[0]["status"] == "candidate"
    assert auto[0]["is_short_candidate"] is True and auto[0]["original_video"]["id"] == orig["id"]
    assert not any("원본 롱폼" in (c.get("video") or {}).get("title", "") for c in cands)
    det = client.get(f"/api/candidates/{auto[0]['id']}").json()
    assert det["original_detail"]["id"] == orig["id"]
    # 원본의 장면을 쇼츠 후보에 연결할 수 있다
    seg_id = det["original_detail"]["segments"][0]["id"]
    assert client.patch(f"/api/candidates/{auto[0]['id']}", json={"segment_id": seg_id}).status_code == 200
    plan = client.post(f"/api/candidates/{auto[0]['id']}/plans", json={"target_seconds": 25, "provider": "template"}).json()
    assert plan["plan"]["context_snapshot"]["reference_short"]["title"].startswith("성시경 추천템")
    assert plan["plan"]["context_snapshot"]["video_title"] == orig["title"]
    # 다시 돌려도 같은 영상·카테고리 후보는 중복 생성하지 않음
    rep2 = client.post("/api/sourcing/run", json={"report_date": "2026-11-28", "background": False}).json()
    assert rep2["summary"]["auto_discovery"]["skipped"]["already"] >= 1
    assert len([c for c in client.get("/api/candidates", params={"category": "food"}).json()["items"] if c["video_id"] == v["id"]]) == 1


def test_daily_sourcing_ai_products_skipped_without_key(client):
    rep = client.post("/api/sourcing/run", json={"report_date": "2026-11-29", "background": False}).json()
    assert rep["summary"]["ai_products"]["skipped"] is True and ("ANTHROPIC_API_KEY" in rep["summary"]["ai_products"]["reason"] or "집중 모드" in rep["summary"]["ai_products"]["reason"])


def test_auto_discovery_respects_window(client):
    # 최근 10일 전 게시 쇼츠는 창(3개월~3년) 밖 → 후보에서 제외
    from datetime import datetime, timedelta
    recent = (datetime.now() - timedelta(days=10)).isoformat()
    v = client.post("/api/videos", json={"url_or_id": "jjjjjjjjjjj", "title": "장영란 추천템 주방 냄비 내돈내산", "duration_seconds": 40,
                                        "view_count": 3000000, "fetch": False, "source_type": "reedit_shorts", "published_at": recent}).json()
    rep = client.post("/api/sourcing/run", json={"report_date": "2026-11-30", "background": False}).json()
    disc = rep["summary"]["auto_discovery"]
    assert disc["window_days"] == [90, 1095] and disc["skipped"]["out_of_window"] >= 1
    assert not any(c["video_id"] == v["id"] for c in client.get("/api/candidates", params={"category": "living"}).json()["items"])
    assert rep["summary"]["ai_plans"]["skipped"] is True


def test_legacy_original_auto_candidates_are_retired(client):
    orig = client.post("/api/videos", json={"url_or_id": "kkkkkkkkkkk", "title": "구버전 원본 후보 추천템", "duration_seconds": 900, "view_count": 100, "fetch": False}).json()
    c = client.post("/api/candidates", json={"video_id": orig["id"], "channel_category": "food", "notes": "[자동 발굴 2026-11-25] 신호 5 — 테스트"}).json()
    rep = client.post("/api/sourcing/run", json={"report_date": "2026-12-01", "background": False}).json()
    assert rep["summary"]["auto_discovery"]["legacy_retired"] >= 1
    d = client.get(f"/api/candidates/{c['id']}").json()
    assert d["status"] == "rejected" and "구버전" in d["duplicate_reason"]
    assert not any(x["id"] == c["id"] for x in client.get("/api/candidates").json()["items"])
    assert any(x["id"] == c["id"] for x in client.get("/api/candidates", params={"include_rejected": "true"}).json()["items"])
    food = [x for x in rep["categories"] if x["category"] == "food"][0]
    assert "shorts" in food and "originals" in food


def test_produced_flag_and_filters(client):
    cid = client.get("/api/candidates").json()["items"][0]["id"]
    r = client.put(f"/api/candidates/{cid}/produced", json={"produced": True, "produced_url": "https://youtube.com/shorts/xyz"}).json()
    assert r["produced_at"] and r["produced_url"].endswith("xyz") and r["status"] in ("published", "analyzing")
    assert any(c["id"] == cid for c in client.get("/api/candidates", params={"produced": "yes", "status": "published,analyzing"}).json()["items"])
    assert client.get("/api/dashboard/stats").json()["produced_total"] >= 1
    r = client.put(f"/api/candidates/{cid}/produced", json={"produced": False}).json()
    assert r["produced_at"] is None


def test_search_offers_without_keys_reports_not_configured(client):
    r = client.get("/api/products/search-offers", params={"q": "콜라"}).json()
    assert r["naver"]["status"] == "not_configured" and r["coupang"]["status"] == "not_configured"
    assert client.get("/api/products/search-offers", params={"q": " "}).status_code == 400


def test_weather_in_stats_is_structured(client):
    w = client.get("/api/dashboard/stats").json()["season"]["weather"]
    assert w["status"] in ("ok", "unavailable") and w["region"]


def test_investigate_requires_ai_key(client):
    import io
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
    r = client.post("/api/products/investigate", files={"files": ("cap.png", io.BytesIO(png), "image/png")}, data={"hint": "쿠팡 상품"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]
    r = client.post("/api/products/investigate", files={"files": ("x.txt", io.BytesIO(b"hi"), "text/plain")})
    assert r.status_code == 400


def test_resolve_links_and_product_from_link(client, monkeypatch):
    from app.services import link_resolver as lr
    monkeypatch.setattr(lr, "expand", lambda u, timeout=6.0: u)
    monkeypatch.setattr(lr, "fetch_hub_links", lambda u, timeout=8.0: [{"title": "백종원 소갈비찜", "url": "https://www.coupang.com/vp/products/1"}])
    v = client.post("/api/videos", json={"url_or_id": "lllllllllll", "title": "소갈비찜 리뷰 추천템", "source_type": "reedit_shorts", "fetch": False,
                                        "description": "제품은 여기 https://inpock.link/foodie"}).json()
    r = client.post(f"/api/videos/{v['id']}/resolve-links").json()
    assert r["hubs"][0]["host"] == "inpock.link" and r["products"][0]["title"] == "백종원 소갈비찜"
    assert client.get(f"/api/videos/{v['id']}").json()["resolved_links"]["products"]
    p = client.post(f"/api/videos/{v['id']}/product-from-link", json={"url": r["products"][0]["final_url"], "name": "백종원 소갈비찜", "category": "food"}).json()
    assert p["identification_status"] == "similar_candidate" and p["offers"][0]["seller"] == "쿠팡"
    assert client.get(f"/api/videos/{v['id']}").json()["product_status"] == "candidate"


def test_computed_vph_and_outlier(client):
    from datetime import datetime, timedelta
    # 등록 채널에 영상 6개(조회수 분포) → 기준선 → Outlier 계산
    chid = [c for c in client.get("/api/channels").json() if c["channel_name"] == "테스트 채널"][0]["id"]
    pub = (datetime.now() - timedelta(days=30)).isoformat()
    ids = []
    for i, views in enumerate([1000, 1200, 900, 1100, 1000, 50000]):
        v = client.post("/api/videos", json={"url_or_id": f"outl{i:07d}", "channel_id": chid, "title": f"기준 영상 {i}", "duration_seconds": 600,
                                            "view_count": views, "published_at": pub, "fetch": False}).json()
        ids.append(v["id"])
    big = client.get(f"/api/videos/{ids[-1]}").json()
    assert big["computed"]["vph_overall"]["value"] > 0 and big["vph_source"] == "computed_overall"
    r = client.post(f"/api/videos/{ids[-1]}/compute-outlier").json()
    assert r["outlier"]["basis"] == "channel_median" and r["outlier"]["value"] > 10
    d = client.get(f"/api/videos/{ids[-1]}").json()
    assert d["outlier_source"] == "computed" and d["outlier"] > 10 and d["outlier_band"]
    # 최근 구간 VPH: 2시간 뒤 관측 추가
    client.post(f"/api/videos/{ids[-1]}/snapshots", json={"observed_at": (datetime.now() + timedelta(hours=2)).isoformat(), "view_count": 52000})
    d = client.get(f"/api/videos/{ids[-1]}").json()
    assert abs(d["computed"]["vph_recent"]["value"] - 1000.0) < 5 and d["vph_source"] == "computed_recent"
    req = client.get("/api/videos/vidiq-request", params={"limit": 5}).json()
    assert req["count"] >= 1 and "vidiq_video_stats" in req["prompt"]


def test_ai_suggest_falls_back_to_rule_without_key(client):
    v = client.post("/api/videos", json={"url_or_id": "mmmmmmmmmmm", "title": "규칙 채점용 쇼츠 추천템?", "duration_seconds": 30,
                                        "view_count": 250000, "fetch": False, "source_type": "reedit_shorts"}).json()
    cid = client.post("/api/candidates", json={"video_id": v["id"], "channel_category": "living"}).json()["id"]
    r = client.post(f"/api/candidates/{cid}/scores/suggest", params={"mode": "ai"}).json()
    # 키 없음 → 규칙 간이 채점: 6개 항목 모두 채워지고 총점·등급이 나온다(scorer=rule)
    rule = r["scores"]["rule"]
    assert rule is not None and all(v is not None for v in rule["item_scores"].values()) and rule["total"] is not None
    assert rule["rationale"]["_summary"].startswith("규칙 간이 채점") and rule["rationale"]["performance"]
    assert r["score_scorer"] == "rule" and r["score"] == rule["total"]
    # 사람 점수가 들어오면 사람 점수가 우선한다
    full = {k: 1 for k in rule["item_scores"]}
    r2 = client.post(f"/api/candidates/{cid}/scores", json={"scorer": "human", "item_scores": full}).json()
    assert r2["score_scorer"] == "human" and r2["score"] == len(full)


def test_prepare_all_and_rank(client):
    r = client.post("/api/candidates/prepare-all").json()
    assert r["rule_scores"]["total"] >= 1 and r["template_plans"]["total"] >= 1
    # 다시 호출하면 입력이 안 바뀐 후보는 재계산하지 않는다
    r2 = client.post("/api/candidates/prepare-all").json()
    assert r2["rule_scores"]["scored"] == 0 and r2["rule_scores"]["unchanged"] >= 1
    lst = client.get("/api/candidates", params={"sort": "score"}).json()
    ranked = [i for i in lst["items"] if i["rank"] is not None]
    assert ranked and ranked[0]["rank"] == 1 and all(i["plan_count"] >= 1 for i in lst["items"] if i["status"] != "rejected")
    scores = [i["score"] for i in ranked]
    assert scores == sorted(scores, reverse=True)
    # 업로드 시간 자동 추천: 모든 활성 후보에 슬롯 + '[자동]' 근거
    assert all(i["recommended_slot"] in ("morning", "afternoon", "night") and i["slot_auto"] for i in lst["items"] if i["status"] != "rejected" and i["slot_reason"] != "사용자 지정")
    cid = lst["items"][0]["id"]
    d = client.patch(f"/api/candidates/{cid}", json={"recommended_slot": "night"}).json()
    assert d["recommended_slot"] == "night" and d["slot_reason"] == "사용자 지정" and d["slot_auto"] is False
    client.post("/api/candidates/prepare-all")  # 사용자 지정은 덮어쓰지 않음
    assert client.get(f"/api/candidates/{cid}").json()["slot_reason"] == "사용자 지정"
    d = client.patch(f"/api/candidates/{cid}", json={"recommended_slot": None}).json()
    assert d["slot_auto"] is True and d["recommended_slot"]


def test_find_original_and_segment_from_transcript(client):
    import io, json
    # 연예인 '테스트' 의 원본 영상(수집됨) + 그 이름을 해시태그로 단 재편집 쇼츠
    found = [x for x in client.get("/api/celebrities", params={"q": "장영란"}).json() if x["name"] == "장영란"]
    celeb = found[0] if found else client.post("/api/celebrities", json={"name": "장영란"}).json()
    orig = client.post("/api/videos", json={"url_or_id": "nnnnnnnnnnn", "title": "장영란 미국 마트 털기 트레이더조 쇼핑 브이로그", "duration_seconds": 900,
                                             "view_count": 50000, "fetch": False, "source_type": "original_celebrity", "celebrity_id": celeb["id"],
                                             "description": "0:00 인트로\n03:15 트레이더조 가방 구경\n08:00 마무리", "published_at": "2026-06-01T00:00:00"}).json()
    short = client.post("/api/videos", json={"url_or_id": "ooooooooooo", "title": "줄 서서 사 온 트레이더조 가방 대란 #장영란 #미국쇼핑", "duration_seconds": 30,
                                              "view_count": 900000, "fetch": False, "source_type": "reedit_shorts", "published_at": "2026-08-01T00:00:00"}).json()
    cid = client.post("/api/candidates", json={"video_id": short["id"], "channel_category": "living"}).json()["id"]
    # 같은 연예인의 쇼츠(45초)는 단어가 더 많이 겹쳐도 원본 후보에서 제외된다
    client.post("/api/videos", json={"url_or_id": "ppppppppppp", "title": "장영란 트레이더조 가방 미국쇼핑 쇼츠", "duration_seconds": 45, "fetch": False,
                                     "source_type": "original_celebrity", "celebrity_id": celeb["id"], "published_at": "2026-06-02T00:00:00"})
    r = client.post(f"/api/candidates/{cid}/find-original", params={"use_api": False}).json()
    assert r["match"]["skipped_shorts"] >= 1 and all(c["duration_seconds"] > 60 for c in r["match"]["candidates"])
    assert r["match"]["candidates"][0]["rank"] == 1 and "롱폼 15분" in r["match"]["candidates"][0]["reasons"]
    assert r["match"]["celebrities"] == ["장영란"] and r["match"]["linked"] is True and r["match"]["confidence"] in ("high", "certain")
    assert r["candidate"]["original_video"]["id"] == orig["id"]
    # 자막 없음 → 설명란 챕터로 구간 제안
    p = client.post(f"/api/candidates/{cid}/find-segment").json()["proposal"]
    assert p["status"] == "found" and p["basis"] == "chapters" and p["start"] == 195 and p["end"] == 480 and p["link"].endswith("&t=195s")
    # vidIQ 자막 업로드 → 자막 기반 구간이 자동 저장(세그먼트 연결)
    payload = [{"videoId": "nnnnnnnnnnn", "language": "ko",
                "transcription": "[0:00] 안녕하세요 장영란입니다\n[3:20] 여기가 트레이더조예요 다들 줄 서서 사는 가방\n[3:35] 이 가방이 그렇게 대란이래요\n[3:50] 다음은 과자 코너"}]
    up = client.post("/api/import/vidiq-json", files={"file": ("t.json", io.BytesIO(json.dumps(payload).encode()), "application/json")}).json()
    assert up["result"]["transcripts_added"] == 1 and up["result"]["segments"]["found"] >= 1
    d = client.get(f"/api/candidates/{cid}").json()
    assert d["segment"] and d["segment"]["source"] == "captions" and 190 <= d["segment"]["start_seconds"] <= 200 and "가방" in d["segment"]["quote"]
    assert d["segment"]["timestamp_url"].endswith(f"&t={d['segment']['start_seconds']}s") and d["original_has_transcript"] is True
    # 자막 요청 문구: 이제 자막·장면이 있으니 대상 없음
    assert "nnnnnnnnnnn" not in client.get("/api/videos/vidiq-transcript-request").json()["video_ids"]
    # 직접 URL 연결
    client.patch(f"/api/videos/{short['id']}", json={"original_video_id": None})
    d = client.post(f"/api/candidates/{cid}/link-original", json={"video_id": orig["id"]}).json()
    assert d["original_video"]["id"] == orig["id"] and d["original_match"]["confidence"] == "manual"


def test_find_original_by_image_without_keys_is_honest(client):
    import io
    cid = [c for c in client.get("/api/candidates").json()["items"] if c["is_short_candidate"]][0]["id"]
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0d2c6a2e0000000049454e44ae426082")
    r = client.post(f"/api/candidates/{cid}/find-original-by-image", params={"use_thumbnail": False},
                    files={"files": ("a.png", io.BytesIO(png), "image/png")})
    assert r.status_code == 200
    m = r.json()["match"]
    assert m["method"] == "image" and not m.get("linked") and m["candidates"] == []
    assert any("GOOGLE_VISION_API_KEY" in n for n in m["notes"]) and any("ANTHROPIC_API_KEY" in n for n in m["notes"])
    # 이미지도 썸네일도 없으면 400
    assert client.post(f"/api/candidates/{cid}/find-original-by-image", params={"use_thumbnail": False}).status_code == 400


def test_auto_on_open_runs_pipeline_and_respects_interval(client):
    import time
    r = client.post("/api/sourcing/auto-on-open").json()
    assert r["enabled"] is True and r["started"] is True
    for _ in range(100):
        st = client.get("/api/channels/bulk/status").json()
        if not st["running"]:
            break
        time.sleep(0.1)
    assert not st["running"] and st["task"] == "auto" and st["error"] is None, st
    assert st["summary"]["collect"]["skipped"] and "sourcing" in st["summary"]["stages"]
    assert st["summary"]["sourcing"]["total_candidates"] >= 1
    r2 = client.post("/api/sourcing/auto-on-open").json()
    assert r2["started"] is False and "지나지 않음" in r2["reason"] and r2["last_run"]
    client.put("/api/settings/user/auto_on_open", json={"value": False})
    assert client.post("/api/sourcing/auto-on-open").json()["reason"].startswith("접속 자동 작업이 꺼져")
    client.put("/api/settings/user/auto_on_open", json={"value": True})


def test_auto_celebrity_registration_without_ai_uses_rule(client):
    # 서로 다른 채널의 쇼츠 3개에 같은 해시태그 이름 → 규칙 기준으로 자동 등록, 브랜드 단어는 제외
    for i, ch in enumerate(["UCa", "UCb", "UCc"]):
        client.post("/api/videos", json={"url_or_id": f"qqqqqqqqq{i}q", "title": f"추천템 영상 {i} #김영란 #트레이더조 #다이소", "duration_seconds": 30,
                                        "fetch": False, "source_type": "reedit_shorts", "view_count": 1000})
        from app.database import SessionLocal
        from app.models import Video
        with SessionLocal() as db:
            v = db.query(Video).filter(Video.youtube_video_id == f"qqqqqqqqq{i}q").first(); v.yt_channel_id = ch; db.commit()
    from app.database import SessionLocal
    from app.services.celebrity_discovery import auto_register_celebrities
    with SessionLocal() as db:
        r = auto_register_celebrities(db)
    assert r["method"] == "heuristic" and any(x["name"] == "김영란" for x in r["list"])
    names = [c["name"] for c in client.get("/api/celebrities", params={"q": "김영란"}).json()]
    assert "김영란" in names
    chans = [c for c in client.get("/api/channels").json() if c["celebrity_name"] == "김영란"]
    assert chans and chans[0]["verification_status"] == "unverified" and chans[0]["channel_id"] is None
    assert not any(c["name"] == "트레이더조" for c in client.get("/api/celebrities").json())


def test_studio_upload_and_make_short_without_ai(client, tmp_path):
    """합성 영상으로 제작실 전체 흐름: 원본 URL 연결 → mp4 업로드 → (AI 키 없음) 위치 지정 → 렌더링 → 편집안 고쳐 재렌더."""
    import subprocess, time
    from app.services import shorts_maker
    caps = shorts_maker.capabilities()
    if not caps.get("available"):
        import pytest; pytest.skip("ffmpeg 없음")
    src = tmp_path / "src.mp4"
    subprocess.run([caps["path"], "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=60",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=60", "-c:v", caps["vcodec"], "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)], check=True)
    v = client.post("/api/videos", json={"url_or_id": "sssssssssss", "title": "제작실 테스트 쇼츠 추천템 #테스트", "duration_seconds": 30,
                                        "view_count": 500000, "fetch": False, "source_type": "reedit_shorts"}).json()
    cid = client.post("/api/candidates", json={"video_id": v["id"], "channel_category": "living"}).json()["id"]
    st = client.get(f"/api/studio/{cid}").json()
    assert st["ffmpeg"]["available"] and st["source"] is None and "내려받지 않습니다" in st["notice"]
    assert client.post(f"/api/studio/{cid}/make").status_code == 400  # 파일 먼저
    assert client.post(f"/api/studio/{cid}/original", json={"url_or_id": "https://youtu.be/rrrrrrrrrrr"}).json()["original"]["url"].endswith("rrrrrrrrrrr")
    with src.open("rb") as f:
        st = client.post(f"/api/studio/{cid}/source", files={"file": ("orig.mp4", f, "video/mp4")}).json()
    assert st["source"]["exists"] and abs(st["source"]["info"]["duration"] - 60) < 1 and st["source"]["info"]["width"] == 640
    assert client.post(f"/api/studio/{cid}/source", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 400

    def wait():
        for _ in range(300):
            r = client.get(f"/api/studio/{cid}").json()["renders"][0]
            if r["status"] in ("done", "failed"):
                return r
            time.sleep(0.2)
        raise AssertionError("렌더 시간 초과")

    # AI 키 없음 + 위치 없음 → 안내와 함께 실패(가짜 결과 없음)
    client.post(f"/api/studio/{cid}/make")
    r = wait()
    assert r["status"] == "failed" and "대략 위치" in r["error"]
    # 위치 지정 → 규칙 편집으로 완성
    client.post(f"/api/studio/{cid}/make", data={"hint": "0:20"})
    r = wait()
    assert r["status"] == "done", r
    assert r["output_info"]["width"] == 1080 and r["output_info"]["height"] == 1920 and 18 <= r["output_info"]["duration"] <= 33
    assert r["edl"]["hook"] and r["edl"]["credit"].startswith("출처") and "rule" in r["decided_by"]
    f = client.get(r["file_url"])
    assert f.status_code == 200 and f.headers["content-type"] == "video/mp4" and len(f.content) > 10000
    # 편집안 고쳐 재렌더(AI 없음)
    edl = {"hook": {"start": 30, "end": 32.5, "caption": "이게 뭐길래?"}, "segments": [{"start": 10, "end": 30, "caption": "직접 확인한 구성"}],
           "title_lines": ["테스트 제목", "둘째 줄"], "credit": "출처: 테스트 채널"}
    client.post(f"/api/studio/{cid}/rerender", json=edl)
    r2 = wait()
    assert r2["status"] == "done" and r2["id"] != r["id"] and r2["decided_by"] == "edited" and r2["edl"]["segments"][0]["caption"] == "직접 확인한 구성"
    assert abs(r2["output_info"]["duration"] - 22.5) < 1.5
    client.delete(f"/api/studio/{cid}/source")
    assert client.get(f"/api/studio/{cid}").json()["source"]["exists"] is False


def test_reference_style_learn_and_make_with_style(client, tmp_path):
    """레퍼런스 스타일: 키 없이 채널 주소만 → 정직하게 실패 / 샘플 mp4 → 컷 속도 실측으로 학습 → 그 스타일로 쇼츠 제작."""
    import subprocess, time
    from app.services import shorts_maker
    caps = shorts_maker.capabilities()
    if not caps.get("available"):
        import pytest; pytest.skip("ffmpeg 없음")
    ff = caps["path"]

    def wait_style(sid):
        for _ in range(300):
            s = client.get(f"/api/styles/{sid}").json()
            if s["status"] != "learning":
                return s
            time.sleep(0.2)
        raise AssertionError("학습 시간 초과")

    assert client.post("/api/styles", data={"name": "빈 것"}).status_code == 400
    # 채널 주소만 + YouTube 키 없음 → 가짜 스타일을 만들지 않고 실패 사유를 알려 준다
    s0 = wait_style(client.post("/api/styles", data={"name": "주소만", "channel_url": "https://www.youtube.com/@some_ref"}).json()["id"])
    assert s0["status"] == "failed" and "YOUTUBE_API_KEY" in s0["error"] and s0["profile"] is None
    # 샘플 쇼츠(3초마다 화면이 바뀌는 9초 세로 영상) → 컷 간격 실측
    sample = tmp_path / "ref.mp4"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=360x640:rate=30:duration=3",
                    "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=3", "-f", "lavfi", "-i", "color=c=blue:size=360x640:rate=30:duration=3",
                    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0", "-c:v", caps["vcodec"], "-pix_fmt", "yuv420p", str(sample)], check=True)
    with sample.open("rb") as f:
        made = client.post("/api/styles", data={"name": "빠른 컷 채널"}, files=[("files", ("ref.mp4", f, "video/mp4"))])
    assert made.status_code == 201
    s1 = wait_style(made.json()["id"])
    assert s1["status"] == "ready", s1
    assert s1["stats"]["sample_videos"] == 1 and 2.0 <= s1["stats"]["avg_shot_seconds"] <= 4.0
    assert any("ANTHROPIC_API_KEY" in n for n in s1["stats"]["notes"]) and s1["profile"]["layout"]["mode"] == "blur_bg"
    # 사람이 직접 고치기: 범위를 벗어난 값은 안전 범위로 정리
    prof = s1["profile"] | {"layout": {"mode": "color_bg", "fg_zoom": 9}, "hook": {"seconds": 2.0, "zoom_punch": True, "pattern": "p"},
                            "title": s1["profile"]["title"] | {"color": "#00E5FF", "box": True}, "end_question": True, "kick": ["끝 질문 자막"]}
    p1 = client.patch(f"/api/styles/{s1['id']}", json={"name": "빠른 컷", "profile": prof}).json()
    assert p1["name"] == "빠른 컷" and p1["profile"]["layout"]["fg_zoom"] == 1.8 and p1["profile"]["title"]["color"] == "#00E5FF"
    assert [x["name"] for x in client.get("/api/styles").json()["styles"]] == ["주소만", "빠른 컷"]

    # 이 스타일로 쇼츠 만들기
    src = tmp_path / "src.mp4"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=50",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=50", "-c:v", caps["vcodec"], "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)], check=True)
    v = client.post("/api/videos", json={"url_or_id": "ttttttttttt", "title": "스타일 테스트 쇼츠 추천템", "duration_seconds": 30,
                                        "view_count": 400000, "fetch": False, "source_type": "reedit_shorts"}).json()
    cid = client.post("/api/candidates", json={"video_id": v["id"], "channel_category": "food"}).json()["id"]
    with src.open("rb") as f:
        client.post(f"/api/studio/{cid}/source", files={"file": ("orig.mp4", f, "video/mp4")})
    assert client.post(f"/api/studio/{cid}/make", data={"hint": "0:10", "style_id": str(s0["id"])}).status_code == 400  # 학습 안 된 스타일
    st = client.post(f"/api/studio/{cid}/make", data={"hint": "0:10", "style_id": str(s1["id"])}).json()
    assert [x["name"] for x in st["styles"]] == ["주소만", "빠른 컷"]

    def wait():
        for _ in range(300):
            r = client.get(f"/api/studio/{cid}").json()["renders"][0]
            if r["status"] in ("done", "failed"):
                return r
            time.sleep(0.2)
        raise AssertionError("렌더 시간 초과")

    r = wait()
    assert r["status"] == "done", r
    assert r["style_id"] == s1["id"] and "style:빠른 컷" in r["decided_by"] and r["output_info"]["width"] == 1080
    # 확대·세로 채움 스타일에서도 화소 비율은 1:1 이어야 한다(아니면 플레이어에서 가로로 눌려 보인다)
    from app.config import get_settings
    probe = subprocess.run([ff, "-hide_banner", "-i", str(sorted((get_settings().media_dir / "renders").glob("*.mp4"), key=lambda p: p.stat().st_mtime)[-1])],
                           capture_output=True, text=True).stderr
    assert "1080x1920" in probe and ("SAR 1:1" in probe or "SAR" not in probe), probe[-400:]
    assert r["edl"]["hook"]["end"] - r["edl"]["hook"]["start"] <= 2.6
    # 편집안 재렌더는 직전 스타일을 유지하고 끝 질문 자막을 받는다
    client.post(f"/api/studio/{cid}/rerender", json={"hook": None, "segments": [{"start": 5, "end": 25, "caption": "확인한 구성"}],
                                                      "title_lines": ["제목"], "credit": "출처: 테스트", "end_caption": "여러분이라면?"})
    r2 = wait()
    assert r2["status"] == "done" and r2["style_id"] == s1["id"] and r2["edl"]["end_caption"] == "여러분이라면?"
    # 스타일을 지워도 만든 영상·제작실은 그대로
    assert client.delete(f"/api/styles/{s1['id']}").status_code == 204
    assert client.get(f"/api/studio/{cid}").status_code == 200
    client.delete(f"/api/styles/{s0['id']}")


def test_interrupted_jobs_are_recovered_on_startup(client):
    """제작·학습 도중 서버가 꺼지면 '만드는 중'으로 굳지 않고, 다음 시작 때 실패로 정리돼 다시 누를 수 있다."""
    from app.database import SessionLocal
    from app.main import _recover_interrupted_jobs
    from app.models import ReferenceStyle, ShortsRender
    v = client.post("/api/videos", json={"url_or_id": "uuuuuuuuuuu", "title": "중단 복구 테스트 추천템", "duration_seconds": 30,
                                        "view_count": 300000, "fetch": False, "source_type": "reedit_shorts"}).json()
    cid = client.post("/api/candidates", json={"video_id": v["id"], "channel_category": "food"}).json()["id"]
    with SessionLocal() as db:
        db.add(ShortsRender(candidate_id=cid, status="running", step="렌더링 중", progress=60))
        db.add(ReferenceStyle(name="학습 중단", status="learning", step="대기"))
        db.add(ReferenceStyle(name="재학습 중단", status="learning", step="대기", profile={"summary": "이전에 배운 값"}))
        db.commit()
        assert _recover_interrupted_jobs(db) == 3 and _recover_interrupted_jobs(db) == 0
    r = client.get(f"/api/studio/{cid}").json()["renders"][0]
    assert r["status"] == "failed" and "다시 눌러" in r["error"]
    by = {s["name"]: s for s in client.get("/api/styles").json()["styles"]}
    assert by["학습 중단"]["status"] == "failed" and by["재학습 중단"]["status"] == "ready"
    for s in by.values():
        client.delete(f"/api/styles/{s['id']}")


def test_style_file_import_export_and_backup_keeps_styles(client):
    """분석해 둔 스타일 파일(.json) 가져오기·내보내기. 예전 백업을 복원해도 스타일은 지워지지 않는다."""
    payload = {"format": "shoppulse-styles", "version": 1, "styles": [
        {"name": "검은 배경 빠른 컷", "channel_url": "https://www.youtube.com/@ref_a/shorts", "yt_channel_id": "UCaaaaaaaaaaaaaaaaaaaaaa", "channel_title": "ref_a",
         "profile": {"summary": "s", "layout": {"mode": "color_bg", "bg_color": "#000000", "fg_zoom": 99}, "pacing": {"segments": 9, "total_seconds": 25},
                     "caption": {"highlight_color": "#FFD400"}, "footer": {"text": "내 채널"}},
         "stats": {"sources": ["영상 분석"], "avg_shot_seconds_est": 2.0}},
        {"name": "", "profile": {}}, {"name": "프로필 없음"}]}
    up = lambda body: client.post("/api/styles/import", files={"file": ("styles.json", json.dumps(body, ensure_ascii=False).encode("utf-8"), "application/json")})
    assert up({"format": "other"}).status_code == 400
    assert client.post("/api/styles/import", files={"file": ("x.json", b"not json", "application/json")}).status_code == 400
    r = up(payload).json()
    assert r["created"] == 1 and r["updated"] == 0
    st = [x for x in r["styles"] if x["name"] == "검은 배경 빠른 컷"][0]
    assert st["status"] == "ready" and st["profile"]["layout"]["fg_zoom"] == 1.8 and st["profile"]["pacing"]["segments"] == 9
    assert st["profile"]["footer"]["text"] == "내 채널" and st["stats"]["avg_shot_seconds_est"] == 2.0
    payload["styles"][0]["name"] = "이름만 바꿈"
    r2 = up(payload).json()  # 같은 채널이면 새로 만들지 않고 갱신
    assert r2["created"] == 0 and r2["updated"] == 1 and [x["name"] for x in r2["styles"] if x["id"] == st["id"]] == ["이름만 바꿈"]
    ex = client.get("/api/styles/export").json()
    assert ex["format"] == "shoppulse-styles" and any(x["yt_channel_id"] == "UCaaaaaaaaaaaaaaaaaaaaaa" for x in ex["styles"])
    # 백업에 스타일이 들어가고, 스타일 표가 없는 예전 백업을 복원해도 스타일은 남는다
    from app.database import SessionLocal
    from app.services import backup
    with SessionLocal() as db:
        full = backup.export_all(db)
        assert any(x["name"] == "이름만 바꿈" for x in full["tables"]["reference_styles"])
        old = {"format": "shoppulse-backup", "version": 1, "tables": {k: v for k, v in full["tables"].items() if k != "reference_styles"}}
        backup.restore_all(db, old, "replace")
    assert any(x["id"] == st["id"] for x in client.get("/api/styles").json()["styles"])
    client.delete(f"/api/styles/{st['id']}")


def test_narration_sfx_bgm_and_popups_end_to_end(client, tmp_path, monkeypatch):
    """AI 음성 내레이션 + 합성 효과음 + 배경음악 + 상품 사진(누끼)·로고 팝업이 한 영상에 들어간다. 음성이 없으면 정직하게 알리고 계속 만든다."""
    import subprocess, time
    from PIL import Image, ImageDraw
    from app.services import audio_fx, shorts_maker
    caps = shorts_maker.capabilities()
    if not caps.get("available"):
        import pytest; pytest.skip("ffmpeg 없음")
    ff = caps["path"]
    # 상태·보관함(이전 실행이 남긴 곡이 있으면 먼저 비운다)
    for b in client.get("/api/styles/audio").json()["bgm"]:
        client.delete(f"/api/styles/bgm/{b['name']}")
    au = client.get("/api/styles/audio").json()
    assert au["tts"]["available"] is False and au["bgm"] == [] and "권한" in au["note"]
    assert client.post("/api/styles/tts-test", data={"text": "테스트"}).status_code == 400  # 음성 없음 → 사유 안내
    tone = tmp_path / "my song.wav"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-t", "3", "-i", "sine=frequency=330", str(tone)], check=True)
    with tone.open("rb") as f:
        assert client.post("/api/styles/bgm", files=[("files", ("my song.wav", f, "audio/wav"))]).json()["bgm"][0]["name"] == "my song.wav"
    assert client.post("/api/styles/bgm", files=[("files", ("x.txt", b"x", "text/plain"))]).status_code == 400
    assert client.delete("/api/styles/bgm/..%2F..%2Fshoppulse.db").status_code in (404, 405)
    # 후보·원본
    src = tmp_path / "src.mp4"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=50",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=50", "-c:v", caps["vcodec"], "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)], check=True)
    v = client.post("/api/videos", json={"url_or_id": "snd_test_01", "title": "소리 테스트 쇼츠 추천템", "duration_seconds": 30,
                                        "view_count": 400000, "fetch": False, "source_type": "reedit_shorts"}).json()
    cid = client.post("/api/candidates", json={"video_id": v["id"], "channel_category": "beauty"}).json()["id"]
    with src.open("rb") as f:
        client.post(f"/api/studio/{cid}/source", files={"file": ("orig.mp4", f, "video/mp4")})
    # 상품 사진(흰 배경 → 누끼)과 로고(투명 PNG)
    prod = tmp_path / "prod.jpg"
    im = Image.new("RGB", (600, 600), (253, 253, 252)); ImageDraw.Draw(im).rounded_rectangle([200, 100, 400, 520], radius=30, fill=(200, 40, 60)); im.save(prod)
    logo = tmp_path / "logo.png"
    lg = Image.new("RGBA", (300, 150), (0, 0, 0, 0)); ImageDraw.Draw(lg).ellipse([10, 10, 290, 140], fill=(0, 0, 0, 255)); lg.save(logo)
    with prod.open("rb") as f:
        st = client.post(f"/api/studio/{cid}/assets", files={"file": ("prod.jpg", f, "image/jpeg")}, data={"kind": "product"}).json()
    with logo.open("rb") as f:
        st = client.post(f"/api/studio/{cid}/assets", files={"file": ("logo.png", f, "image/png")}, data={"kind": "logo"}).json()
    assert [(a["kind"], a["method"]) for a in st["assets"]] == [("product", "flood"), ("logo", "alpha")] and st["tts"]["available"] is False
    assert client.get(st["assets"][0]["url"]).headers["content-type"] == "image/png"
    assert client.post(f"/api/studio/{cid}/assets", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 400
    # 소리가 켜진 스타일
    up = client.post("/api/styles/import", files={"file": ("s.json", json.dumps({"format": "shoppulse-styles", "styles": [{"name": "소리 스타일", "profile": {
        "layout": {"mode": "color_bg", "bg_color": "#000000"}, "narration": {"enabled": True}, "sfx": {"enabled": True},
        "bgm": {"mode": "auto", "volume": 0.12}, "popup": {"position": "top_right", "size": "large"}, "end_question": True}}]}).encode(), "application/json")}).json()
    sid = [x for x in up["styles"] if x["name"] == "소리 스타일"][0]["id"]
    prof = client.get(f"/api/styles/{sid}").json()["profile"]
    assert prof["narration"]["enabled"] and prof["sfx"]["enabled"] and prof["bgm"] == {"mode": "auto", "volume": 0.12, "track": ""}

    def wait():
        for _ in range(400):
            r = client.get(f"/api/studio/{cid}").json()["renders"][0]
            if r["status"] in ("done", "failed"):
                return r
            time.sleep(0.2)
        raise AssertionError("렌더 시간 초과")

    edl = {"hook": {"start": 30, "end": 32.5, "caption": "*이게* 뭐길래?"}, "segments": [{"start": 5 + i * 4, "end": 7.5 + i * 4, "caption": f"컷 {i}"} for i in range(7)],
           "title_lines": ["테스트 제목", "둘째 줄"], "credit": "출처: 테스트", "end_caption": "여러분이라면?", "narration": "이 배우가 십 년째 쓴다는 물건이 있다는데", "style_id": sid}
    # 1) 음성이 없는 PC: 내레이션만 빠지고 나머지는 들어간다
    client.post(f"/api/studio/{cid}/rerender", json=edl)
    r = wait()
    assert r["status"] == "done", r
    assert any("AI 음성 내레이션을 넣지 못했습니다" in n for n in r["notes"]) and r["edl"]["audio"]["narration"] is None
    assert r["edl"]["audio"]["bgm"] == "내 보관함: my song.wav" and r["edl"]["audio"]["sfx"] == ["whoosh", "pop", "pop", "ding"]
    ov = {o["kind"]: o for o in r["edl"]["overlays"]}
    assert ov["logo"]["start"] == 0.3 and ov["product"]["start"] == 2.9 and ov["product"]["duration"] == 2.8
    # 2) 음성이 있을 때(가짜 음성 2초): 내레이션까지 섞인다. 사진 시각을 직접 고친 값은 유지된다
    def fake(text, out, rate=1.12):
        subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-t", "2", "-i", "sine=frequency=700", str(out)], check=True)
        return {"provider": "test", "voice": "가짜 음성"}
    monkeypatch.setattr(audio_fx, "synthesize", fake)
    edl["overlays"] = [{"asset_id": st["assets"][0]["id"], "start": 9, "duration": 3}]
    client.post(f"/api/studio/{cid}/rerender", json=edl)
    r2 = wait()
    assert r2["status"] == "done", r2
    assert r2["edl"]["audio"]["narration"].startswith("test · 가짜 음성 · 2.0") and r2["edl"]["narration"].startswith("이 배우가")
    assert {o["kind"]: o["start"] for o in r2["edl"]["overlays"]} == {"product": 9.0, "logo": 0.3}
    probe = subprocess.run([ff, "-hide_banner", "-i", str(sorted((__import__("app.config", fromlist=["x"]).get_settings().media_dir / "renders").glob(f"shorts_c{cid}_*.mp4"),
                            key=lambda p: p.stat().st_mtime)[-1])], capture_output=True, text=True).stderr
    assert "Audio:" in probe and "1080x1920" in probe and abs(r2["output_info"]["duration"] - r2["edl"]["total_seconds"]) < 0.6
    # 정리
    st = client.delete(f"/api/studio/{cid}/assets/{st['assets'][0]['id']}").json()
    assert len(st["assets"]) == 1
    assert client.delete("/api/styles/bgm/my song.wav").json()["bgm"] == []
    client.delete(f"/api/styles/{sid}")
