"""데이터 모델. 모든 기록에는 출처(source)·수집/갱신 시각·검증 상태를 둔다.

원칙
- 미확인 값은 NULL 로 저장한다. 0 과 구분한다.
- 시연용 데이터는 is_demo=True 로 운영 데이터와 분리한다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


# ---------------------------------------------------------------- 연예인·채널
class Celebrity(TimestampMixin, Base):
    __tablename__ = "celebrities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name_en: Mapped[str | None] = mapped_column(String(100))
    primary_field: Mapped[str | None] = mapped_column(String(50))  # 배우/가수/방송인/셰프 등
    age_group: Mapped[str | None] = mapped_column(String(30))  # 확인 가능한 경우만
    audience_note: Mapped[str | None] = mapped_column(Text)  # 주요 시청자층 메모
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    channels: Mapped[list["YoutubeChannel"]] = relationship(back_populates="celebrity")


class YoutubeChannel(TimestampMixin, Base):
    __tablename__ = "youtube_channels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    celebrity_id: Mapped[int | None] = mapped_column(ForeignKey("celebrities.id", ondelete="SET NULL"))
    channel_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    channel_id: Mapped[str | None] = mapped_column(String(64), unique=True)  # UC... (미확인 시 NULL)
    handle: Mapped[str | None] = mapped_column(String(100))
    channel_url: Mapped[str | None] = mapped_column(String(300))
    # official_personal(연예인 본인) / official_broadcaster(방송·제작사) / agency / fan_or_other
    channel_type: Mapped[str] = mapped_column(String(40), default="official_personal", nullable=False)
    # unverified(검증 전) / verified(검증 완료) / rejected(공식 아님)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    primary_field: Mapped[str | None] = mapped_column(String(50))
    audience_note: Mapped[str | None] = mapped_column(Text)
    relevance_beauty: Mapped[int] = mapped_column(Integer, default=0)  # 0~3 운영자 판단
    relevance_living: Mapped[int] = mapped_column(Integer, default=0)
    relevance_food: Mapped[int] = mapped_column(Integer, default=0)
    subscriber_count: Mapped[int | None] = mapped_column(Integer)
    last_collected_at: Mapped[datetime | None] = mapped_column(DateTime)
    collected_video_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)  # seed/manual/youtube_api
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    celebrity: Mapped["Celebrity | None"] = relationship(back_populates="channels")
    videos: Mapped[list["Video"]] = relationship(back_populates="channel")


# ---------------------------------------------------------------- 영상
class Video(TimestampMixin, Base):
    __tablename__ = "videos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    youtube_video_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    channel_id: Mapped[int | None] = mapped_column(ForeignKey("youtube_channels.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    # long / short / short_or_long(61~180초, 미확정) / unknown
    video_format: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    view_count: Mapped[int | None] = mapped_column(Integer)
    like_count: Mapped[int | None] = mapped_column(Integer)
    comment_count: Mapped[int | None] = mapped_column(Integer)
    tags: Mapped[list | None] = mapped_column(JSON)
    url: Mapped[str | None] = mapped_column(String(300))
    # original_celebrity(제작용 원본) / reedit_shorts(타인 재편집) / competitor(경쟁·바이럴 검증) / unknown
    source_type: Mapped[str] = mapped_column(String(30), default="original_celebrity", nullable=False)
    # captions / description_only / user_provided / manual_check_needed / inaccessible / unknown
    access_status: Mapped[str] = mapped_column(String(30), default="unknown", nullable=False)
    data_source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime)
    stats_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 재편집 쇼츠(reedit_shorts/competitor)용: 어떤 원본 영상·연예인을 기반으로 했는지
    original_video_id: Mapped[int | None] = mapped_column(ForeignKey("videos.id", ondelete="SET NULL"), index=True)
    celebrity_id: Mapped[int | None] = mapped_column(ForeignKey("celebrities.id", ondelete="SET NULL"), index=True)
    # 등록되지 않은 채널의 영상일 때 YouTube 채널 정보만 보관
    yt_channel_id: Mapped[str | None] = mapped_column(String(64))
    yt_channel_title: Mapped[str | None] = mapped_column(String(200))
    discovery_query: Mapped[str | None] = mapped_column(String(300))  # 어떤 검색어로 발견했는지
    # 쇼핑 쇼츠 판별: 규칙 점수·적중 키워드, 사람이 직접 정한 판정(NULL=미지정)
    shopping_score: Mapped[int | None] = mapped_column(Integer)
    shopping_hits: Mapped[list | None] = mapped_column(JSON)
    is_shopping: Mapped[bool | None] = mapped_column(Boolean)
    ai_product_suggestions: Mapped[dict | None] = mapped_column(JSON)  # 마지막 AI 상품 추정 결과(추정일 뿐, 확정 아님)

    channel: Mapped["YoutubeChannel | None"] = relationship(back_populates="videos")
    original: Mapped["Video | None"] = relationship(remote_side="Video.id", foreign_keys=[original_video_id],
                                                    back_populates="derived")
    derived: Mapped[list["Video"]] = relationship(foreign_keys=[original_video_id], back_populates="original")
    celebrity: Mapped["Celebrity | None"] = relationship()
    metrics: Mapped[list["VideoMetric"]] = relationship(back_populates="video", cascade="all, delete-orphan")
    snapshots: Mapped[list["ViewSnapshot"]] = relationship(
        back_populates="video", cascade="all, delete-orphan", order_by="ViewSnapshot.observed_at"
    )
    segments: Mapped[list["VideoSegment"]] = relationship(back_populates="video", cascade="all, delete-orphan")
    mentions: Mapped[list["ProductMention"]] = relationship(back_populates="video", cascade="all, delete-orphan")
    candidates: Mapped[list["SourcingCandidate"]] = relationship(back_populates="video", cascade="all, delete-orphan")


class VideoMetric(Base):
    """vidIQ 등 외부 지표. 측정 기준(basis)·출처·측정 시각을 함께 저장한다."""

    __tablename__ = "video_metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True, nullable=False)
    # outlier / vph / views_last_hour / growth_7d / growth_28d / engagement_rate / keyword_demand
    metric_type: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[float | None] = mapped_column(Float)  # NULL = 미확인
    # VPH 측정 기준: overall(게시 후 전체 평균) / recent(최근 구간) / last_hour / unspecified
    basis: Mapped[str] = mapped_column(String(40), default="unspecified", nullable=False)
    # vidiq_mcp_json / vidiq_csv / vidiq_manual / youtube_api / computed
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    video: Mapped["Video"] = relationship(back_populates="metrics")


class ViewSnapshot(Base):
    """실제 관측된 조회수 기록. 그래프는 이 테이블만으로 그린다."""

    __tablename__ = "view_snapshots"
    __table_args__ = (UniqueConstraint("video_id", "observed_at", name="uq_snapshot_video_time"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False)
    like_count: Mapped[int | None] = mapped_column(Integer)
    comment_count: Mapped[int | None] = mapped_column(Integer)
    # youtube_api / manual / vidiq_mcp_json / vidiq_csv / imported_series
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    video: Mapped["Video"] = relationship(back_populates="snapshots")


class VideoSegment(TimestampMixin, Base):
    """영상 속 상품 관련 장면. 실제 확인한 타임스탬프만 기록한다."""

    __tablename__ = "video_segments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True, nullable=False)
    start_seconds: Mapped[int | None] = mapped_column(Integer)
    end_seconds: Mapped[int | None] = mapped_column(Integer)
    quote: Mapped[str | None] = mapped_column(Text)  # 연예인의 실제 발언
    context: Mapped[str | None] = mapped_column(Text)  # 언급 당시 맥락
    content_type: Mapped[str | None] = mapped_column(String(40))  # 15개 유형 키
    # unknown / sponsored / not_sponsored / suspected
    sponsorship_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    # True=구매 추천, False=단순 언급, NULL=미확인
    is_recommendation: Mapped[bool | None] = mapped_column(Boolean)
    # unverified / confirmed / needs_review
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    # captions / description_only / user_provided / manual_check / ai_extracted
    source: Mapped[str] = mapped_column(String(30), default="manual_check", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    video: Mapped["Video"] = relationship(back_populates="segments")


# ---------------------------------------------------------------- 상품
class Product(TimestampMixin, Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    brand: Mapped[str | None] = mapped_column(String(150))
    model_name: Mapped[str | None] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(20), nullable=False)  # beauty / living / food
    subcategory: Mapped[str | None] = mapped_column(String(80))
    image_url: Mapped[str | None] = mapped_column(String(500))
    features: Mapped[str | None] = mapped_column(Text)
    # exact(정확한 상품 확인) / brand_only / similar_candidate / unidentified / discontinued
    identification_status: Mapped[str] = mapped_column(String(30), default="unidentified", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    offers: Mapped[list["ProductOffer"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    mentions: Mapped[list["ProductMention"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductMention(Base):
    """영상 ↔ 상품 다대다 연결(+장면, 연예인)."""

    __tablename__ = "product_mentions"
    __table_args__ = (UniqueConstraint("video_id", "product_id", "segment_id", name="uq_mention"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("video_segments.id", ondelete="SET NULL"))
    celebrity_id: Mapped[int | None] = mapped_column(ForeignKey("celebrities.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    video: Mapped["Video"] = relationship(back_populates="mentions")
    product: Mapped["Product"] = relationship(back_populates="mentions")


class ProductOffer(Base):
    """판매처 정보. 가격·재고는 checked_at 시점 기준."""

    __tablename__ = "product_offers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    seller: Mapped[str] = mapped_column(String(100), nullable=False)  # 쿠팡 / 네이버쇼핑 / 공식몰 등
    url: Mapped[str | None] = mapped_column(String(600))
    price: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    # in_stock / out_of_stock / discontinued / unknown
    stock_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    affiliate_available: Mapped[bool | None] = mapped_column(Boolean)  # NULL=미확인
    affiliate_program: Mapped[str | None] = mapped_column(String(80))  # 쿠팡 파트너스 / 유튜브 쇼핑 등
    checked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    product: Mapped["Product"] = relationship(back_populates="offers")


# ---------------------------------------------------------------- 소싱 후보
CANDIDATE_STATUSES = [
    "candidate",        # 후보(미검토)
    "sourced",          # 소싱 완료
    "verifying_product",  # 상품 검증 중
    "verifying_rights",   # 원본 사용 권한 확인 중
    "scripting",        # 대본 작성
    "editing",          # 편집 중
    "scheduled",        # 업로드 예약
    "published",        # 게시 완료
    "analyzing",        # 성과 분석
    "hold",             # 보류
    "rejected",         # 제외
]


class SourcingCandidate(TimestampMixin, Base):
    __tablename__ = "sourcing_candidates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("video_segments.id", ondelete="SET NULL"))
    celebrity_id: Mapped[int | None] = mapped_column(ForeignKey("celebrities.id", ondelete="SET NULL"))
    channel_category: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # beauty/living/food
    content_type: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="candidate", nullable=False, index=True)
    recommended_slot: Mapped[str | None] = mapped_column(String(20))  # morning/afternoon/night
    hook_idea: Mapped[str | None] = mapped_column(Text)
    research_todo: Mapped[str | None] = mapped_column(Text)  # 추가 조사할 정보
    notes: Mapped[str | None] = mapped_column(Text)
    last_recommended_date: Mapped[datetime | None] = mapped_column(Date)
    recommendation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_reason: Mapped[str | None] = mapped_column(Text)  # 재추천 사유
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    video: Mapped["Video"] = relationship(back_populates="candidates")
    product: Mapped["Product | None"] = relationship()
    segment: Mapped["VideoSegment | None"] = relationship()
    celebrity: Mapped["Celebrity | None"] = relationship()
    scores: Mapped[list["SourcingScore"]] = relationship(back_populates="candidate", cascade="all, delete-orphan")
    verifications: Mapped[list["VerificationRecord"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )
    plans: Mapped[list["ShortsPlan"]] = relationship(back_populates="candidate", cascade="all, delete-orphan")


class ScoringVersion(Base):
    __tablename__ = "scoring_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)  # items/grades
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class SourcingScore(Base):
    __tablename__ = "sourcing_scores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("sourcing_candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scoring_version_id: Mapped[int | None] = mapped_column(ForeignKey("scoring_versions.id", ondelete="SET NULL"))
    scorer: Mapped[str] = mapped_column(String(10), nullable=False)  # ai / human
    item_scores: Mapped[dict] = mapped_column(JSON, nullable=False)  # {key: int|None}
    rationale: Mapped[dict] = mapped_column(JSON, default=dict)  # {key: str}
    total: Mapped[float | None] = mapped_column(Float)  # 항목 하나라도 NULL 이면 NULL
    grade_key: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    candidate: Mapped["SourcingCandidate"] = relationship(back_populates="scores")


VERIFICATION_ITEMS = [
    ("official_source", "공식 원본 출처 확인"),
    ("celebrity_appearance", "연예인 실제 출연 여부"),
    ("statement_context", "실제 발언과 맥락 확인"),
    ("product_identity", "정확한 상품 식별"),
    ("sponsorship", "광고·협찬 여부"),
    ("sellable", "판매 가능 여부"),
    ("footage_rights", "영상 자료 이용 권한"),
]
CRITICAL_VERIFICATION_ITEMS = {
    "official_source",
    "celebrity_appearance",
    "statement_context",
    "product_identity",
    "footage_rights",
}


class VerificationRecord(Base):
    __tablename__ = "verification_records"
    __table_args__ = (UniqueConstraint("candidate_id", "item", name="uq_verification_item"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("sourcing_candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending/passed/failed/na
    note: Mapped[str | None] = mapped_column(Text)
    checked_by: Mapped[str | None] = mapped_column(String(50))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime)

    candidate: Mapped["SourcingCandidate"] = relationship(back_populates="verifications")


class ShortsPlan(Base):
    __tablename__ = "shorts_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("sourcing_candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_seconds: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    generated_by: Mapped[str] = mapped_column(String(30), nullable=False)  # template / anthropic / human
    plan: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    candidate: Mapped["SourcingCandidate"] = relationship(back_populates="plans")


# ---------------------------------------------------------------- 운영
class DailyReport(Base):
    __tablename__ = "daily_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    trigger: Mapped[str] = mapped_column(String(20), nullable=False)  # manual / scheduled
    summary: Mapped[dict] = mapped_column(JSON, nullable=False)
    candidates: Mapped[list] = mapped_column(JSON, nullable=False)  # 카테고리별 후보·추천 id 목록
    note: Mapped[str | None] = mapped_column(Text)


class UploadSchedule(Base):
    __tablename__ = "upload_schedule"
    __table_args__ = (UniqueConstraint("schedule_date", "channel_category", "slot", name="uq_schedule_slot"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    channel_category: Mapped[str] = mapped_column(String(20), nullable=False)
    slot: Mapped[str] = mapped_column(String(20), nullable=False)
    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("sourcing_candidates.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30), default="sourced", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    candidate: Mapped["SourcingCandidate | None"] = relationship()


class ProductionTask(TimestampMixin, Base):
    __tablename__ = "production_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("sourcing_candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)  # manual_video_check / rights_check ...
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)  # open / done / skipped
    note: Mapped[str | None] = mapped_column(Text)


class DataSource(Base):
    __tablename__ = "data_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)  # configured / not_configured / unavailable
    note: Mapped[str | None] = mapped_column(Text)
    checked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class CollectionJob(Base):
    __tablename__ = "collection_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # queued/running/success/partial/failed
    triggered_by: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    items_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quota_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)


class UserSetting(Base):
    __tablename__ = "user_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


Index("ix_videos_view_count", Video.view_count)
