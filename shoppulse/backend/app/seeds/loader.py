"""시드 데이터 적재(연예인 채널 목록, 데이터 소스 상태). 시드 채널은 모두 '검증 전' 이며 채널 ID 는 비어 있다."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import utcnow
from ..config import get_settings
from ..models import Celebrity, DataSource, ScoringVersion, YoutubeChannel
from ..config import load_config_json

SEED_FILE = Path(__file__).with_name("celebrity_channels_seed.json")


def seed_channels(db: Session) -> int:
    if db.query(YoutubeChannel).filter(YoutubeChannel.source == "seed").count() > 0:
        return 0
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    n = 0
    for row in data["channels"]:
        celeb = None
        if row.get("celebrity"):
            celeb = db.query(Celebrity).filter(Celebrity.name == row["celebrity"]).first()
            if not celeb:
                celeb = Celebrity(name=row["celebrity"], primary_field=row.get("field"))
                db.add(celeb)
                db.flush()
        ch = YoutubeChannel(
            celebrity_id=celeb.id if celeb else None,
            channel_name=row["channel_name"],
            channel_type=row.get("channel_type", "official_personal"),
            verification_status="unverified",
            primary_field=row.get("field"),
            relevance_beauty=row.get("beauty", 0), relevance_living=row.get("living", 0), relevance_food=row.get("food", 0),
            source="seed",
            notes=data["note"],
        )
        db.add(ch)
        n += 1
    db.commit()
    return n


def ensure_scoring_version(db: Session) -> None:
    if db.query(ScoringVersion).count() == 0:
        cfg = load_config_json("scoring.json")
        db.add(ScoringVersion(name=cfg.get("name", "기본 평가 모델"), config=cfg, is_active=True))
        db.commit()


def _ai_note() -> str:
    from ..services.claude_client import transport_status

    t = transport_status()
    how = "공식 SDK 사용." if t["sdk_available"] else f"SDK 를 불러올 수 없어 직접 HTTP 호출로 동작합니다(원인: {(t['sdk_error'] or '')[:120]})."
    return f"{how} 모델 {t['model']}. 키 없으면 템플릿 기획안만 동작(발언 생성 없음)."


def refresh_data_sources(db: Session) -> None:
    s = get_settings()
    rows = [
        ("youtube_api", "YouTube Data API v3", "youtube_api",
         "configured" if s.youtube_api_key else "not_configured",
         "영상·채널 메타데이터, 조회수 스냅샷 수집. 키가 없으면 수동 등록·JSON 가져오기만 가능."),
        ("vidiq_mcp_json", "vidIQ (MCP 응답 JSON 가져오기)", "import",
         "configured",
         "vidIQ 는 외부 프로그램용 공개 REST API 를 제공하지 않습니다. 공식 경로는 ChatGPT/Claude 등 AI 어시스턴트에 연결된 vidIQ MCP 서버입니다. "
         "거기서 받은 vidiq_get_videos_by_ids / vidiq_video_stats 응답 JSON 을 그대로 가져옵니다."),
        ("vidiq_csv", "vidIQ CSV / 수동 입력", "import", "configured", "Outlier·VPH·조회수를 CSV 또는 화면에서 직접 입력."),
        ("anthropic", "AI(Claude): 기획안·채점·상품 추정", "ai",
         "configured" if s.anthropic_api_key else "not_configured",
         _ai_note()),
        ("naver_shopping", "네이버 쇼핑 검색 API", "commerce",
         "configured" if (s.naver_client_id and s.naver_client_secret) else "not_configured",
         "상품 화면 「판매처 조회」로 최저가·판매처 검색. developers.naver.com 에서 키 발급 후 .env 의 NAVER_CLIENT_ID/SECRET."),
        ("google_vision", "Google Cloud Vision (캡처로 원본 찾기)", "ai",
         "configured" if s.google_vision_api_key else "not_configured",
         "캡처 화면과 같은 장면을 쓴 유튜브 페이지를 찾습니다(구글 렌즈 방식). Google Cloud 콘솔에서 Cloud Vision API 사용 설정 후 .env 의 GOOGLE_VISION_API_KEY. 없으면 AI 화면 읽기+YouTube 검색으로 대체."),
        ("coupang_partners", "쿠팡 파트너스 Open API", "commerce",
         "configured" if (s.coupang_access_key and s.coupang_secret_key) else "not_configured",
         "상품 화면 「판매처 조회」로 쿠팡 상품·제휴 링크 검색. partners.coupang.com 에서 키 발급 후 .env 의 COUPANG_ACCESS_KEY/SECRET."),
        ("weather", "날씨 (Open-Meteo)", "weather", "configured",
         "키 없이 쓰는 공개 기상 API. 설정의 기본 지역(시·도) 기준 현재 기온·습도·강수와 오늘 최고/최저. 기상 모델 값이며 실측이 아님."),
    ]
    for key, name, kind, status, note in rows:
        ds = db.query(DataSource).filter(DataSource.key == key).first()
        if not ds:
            ds = DataSource(key=key, name=name, kind=kind, status=status, note=note)
            db.add(ds)
        else:
            ds.status, ds.note, ds.checked_at = status, note, utcnow()
    db.commit()
