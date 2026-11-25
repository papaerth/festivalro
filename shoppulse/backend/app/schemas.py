"""요청 스키마(Pydantic). 응답은 serializers.py 에서 dict 로 만든다."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Category = Literal["beauty", "living", "food"]


class CelebrityIn(BaseModel):
    name: str
    name_en: str | None = None
    primary_field: str | None = None
    age_group: str | None = None
    audience_note: str | None = None
    notes: str | None = None
    is_demo: bool = False


class CelebrityPatch(BaseModel):
    name: str | None = None
    name_en: str | None = None
    primary_field: str | None = None
    age_group: str | None = None
    audience_note: str | None = None
    notes: str | None = None


class ChannelIn(BaseModel):
    celebrity_id: int | None = None
    channel_name: str
    channel_id: str | None = None
    handle: str | None = None
    channel_url: str | None = None
    channel_type: str = "official_personal"
    verification_status: str = "unverified"
    primary_field: str | None = None
    audience_note: str | None = None
    relevance_beauty: int = Field(0, ge=0, le=3)
    relevance_living: int = Field(0, ge=0, le=3)
    relevance_food: int = Field(0, ge=0, le=3)
    is_active: bool = True
    notes: str | None = None
    is_demo: bool = False


class ChannelPatch(BaseModel):
    celebrity_id: int | None = None
    channel_name: str | None = None
    channel_id: str | None = None
    handle: str | None = None
    channel_url: str | None = None
    channel_type: str | None = None
    verification_status: str | None = None
    primary_field: str | None = None
    audience_note: str | None = None
    relevance_beauty: int | None = Field(None, ge=0, le=3)
    relevance_living: int | None = Field(None, ge=0, le=3)
    relevance_food: int | None = Field(None, ge=0, le=3)
    subscriber_count: int | None = None
    is_active: bool | None = None
    notes: str | None = None


class VideoIn(BaseModel):
    """영상 수동 등록. URL 또는 ID 필수. fetch=True 면 YouTube API 로 메타데이터 조회 시도."""
    url_or_id: str
    channel_id: int | None = None
    celebrity_id: int | None = None
    title: str | None = None
    description: str | None = None
    published_at: datetime | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    view_count: int | None = None
    source_type: str = "original_celebrity"
    access_status: str = "unknown"
    notes: str | None = None
    is_demo: bool = False
    fetch: bool = True


class VideoPatch(BaseModel):
    channel_id: int | None = None
    original_video_id: int | None = None
    celebrity_id: int | None = None
    is_shopping: bool | None = None
    title: str | None = None
    description: str | None = None
    published_at: datetime | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    source_type: str | None = None
    access_status: str | None = None
    notes: str | None = None


class SnapshotIn(BaseModel):
    observed_at: datetime
    view_count: int = Field(ge=0)
    like_count: int | None = None
    comment_count: int | None = None
    source: str = "manual"


class MetricIn(BaseModel):
    metric_type: Literal["outlier", "vph", "views_last_hour", "growth_7d", "growth_28d", "engagement_rate", "keyword_demand"]
    value: float | None = None  # None = 미확인
    basis: str = "unspecified"
    source: str = "vidiq_manual"
    measured_at: datetime | None = None
    note: str | None = None


class SegmentIn(BaseModel):
    start_seconds: int | None = Field(None, ge=0)
    end_seconds: int | None = Field(None, ge=0)
    quote: str | None = None
    context: str | None = None
    content_type: str | None = None
    sponsorship_status: str = "unknown"
    is_recommendation: bool | None = None
    verification_status: str = "unverified"
    source: str = "manual_check"
    notes: str | None = None


class SegmentPatch(BaseModel):
    start_seconds: int | None = None
    end_seconds: int | None = None
    quote: str | None = None
    context: str | None = None
    content_type: str | None = None
    sponsorship_status: str | None = None
    is_recommendation: bool | None = None
    verification_status: str | None = None
    source: str | None = None
    notes: str | None = None


class ProductIn(BaseModel):
    name: str
    brand: str | None = None
    model_name: str | None = None
    category: Category
    subcategory: str | None = None
    image_url: str | None = None
    features: str | None = None
    identification_status: str = "unidentified"
    notes: str | None = None
    is_demo: bool = False


class ProductPatch(BaseModel):
    name: str | None = None
    brand: str | None = None
    model_name: str | None = None
    category: Category | None = None
    subcategory: str | None = None
    image_url: str | None = None
    features: str | None = None
    identification_status: str | None = None
    notes: str | None = None


class OfferIn(BaseModel):
    seller: str
    url: str | None = None
    price: int | None = None
    currency: str = "KRW"
    stock_status: str = "unknown"
    affiliate_available: bool | None = None
    affiliate_program: str | None = None
    checked_at: datetime | None = None
    source: str = "manual"
    notes: str | None = None


class MentionIn(BaseModel):
    video_id: int
    product_id: int
    segment_id: int | None = None
    celebrity_id: int | None = None


class CandidateIn(BaseModel):
    video_id: int
    product_id: int | None = None
    segment_id: int | None = None
    celebrity_id: int | None = None
    channel_category: Category
    content_type: str | None = None
    status: str = "candidate"
    recommended_slot: str | None = None
    hook_idea: str | None = None
    research_todo: str | None = None
    notes: str | None = None
    is_demo: bool = False


class CandidatePatch(BaseModel):
    product_id: int | None = None
    segment_id: int | None = None
    celebrity_id: int | None = None
    channel_category: Category | None = None
    content_type: str | None = None
    status: str | None = None
    recommended_slot: str | None = None
    hook_idea: str | None = None
    research_todo: str | None = None
    notes: str | None = None


class ScoreIn(BaseModel):
    scorer: Literal["human", "ai", "rule"] = "human"
    item_scores: dict[str, int | None]
    rationale: dict[str, str] = {}


class LinkOriginalIn(BaseModel):
    video_id: int | None = None
    url_or_id: str | None = None


class AdoptSegmentIn(BaseModel):
    start_seconds: int = Field(..., ge=0)
    end_seconds: int | None = Field(None, ge=0)
    quote: str | None = None
    basis: str = "manual"
    note: str | None = None


class EdlClip(BaseModel):
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    caption: str = ""


class EdlIn(BaseModel):
    hook: EdlClip | None = None
    segments: list[EdlClip]
    title_lines: list[str] = []
    credit: str = ""
    end_caption: str = ""
    style_id: int | None = None


class StylePatch(BaseModel):
    name: str | None = None
    profile: dict | None = None


class VerificationIn(BaseModel):
    item: str
    status: Literal["pending", "passed", "failed", "na"]
    note: str | None = None
    checked_by: str | None = None


class PlanRequest(BaseModel):
    target_seconds: int = Field(25, ge=10, le=90)
    provider: Literal["auto", "template"] = "auto"


class ScheduleAssign(BaseModel):
    schedule_date: date
    channel_category: Category
    slot: Literal["morning", "afternoon", "night"]
    candidate_id: int | None = None
    status: str | None = None
    note: str | None = None


class SettingIn(BaseModel):
    value: Any


class ScoringConfigIn(BaseModel):
    name: str
    items: list[dict]
    grades: list[dict]
    description: str | None = None


class RunSourcingIn(BaseModel):
    report_date: date | None = None
    background: bool = True


class ChannelCollectIn(BaseModel):
    max_videos: int = Field(200, ge=1, le=1000)
    years: int | None = Field(None, ge=0, le=20)  # None = 설정의 조회 기간(기본 3개월 전~3년 전)


class RefreshStatsIn(BaseModel):
    video_ids: list[int] | None = None  # None = 전체(최대 limit)
    limit: int = Field(200, ge=1, le=20000)


class BulkResolveIn(BaseModel):
    limit: int = Field(30, ge=1, le=200)  # 채널당 할당량 100 → 기본 30개(3,000)


class BulkCollectIn(BaseModel):
    max_videos: int = Field(200, ge=1, le=1000)
    years: int | None = Field(None, ge=0, le=20)
    stale_days: int = Field(0, ge=0, le=365)  # 0 = 전체, N = 최근 N일 내 수집한 채널은 건너뜀


class DiscoverShortsIn(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    celebrity_id: int | None = None
    max_results: int = Field(25, ge=1, le=100)
    years: int | None = Field(None, ge=0, le=20)
    order: Literal["relevance", "viewCount", "date"] = "relevance"
    source_type: Literal["reedit_shorts", "competitor"] = "reedit_shorts"
    shopping_only: bool = True  # 쇼핑 신호가 없는 쇼츠는 등록하지 않음


class ShoppingFlagIn(BaseModel):
    is_shopping: bool | None  # None = 사람 판정 해제(규칙 점수로 복귀)


class BulkDeleteIn(BaseModel):
    video_ids: list[int] = Field(min_length=1, max_length=5000)
    source_type: Literal["reedit_shorts", "competitor"] = "reedit_shorts"
    shopping_only: bool = True  # 쇼핑 신호가 없는 쇼츠는 등록하지 않음


class BulkDiscoverIn(BaseModel):
    limit: int = Field(20, ge=1, le=200)  # 연예인 수. 연예인당 검색 1회(할당량 100)
    max_results: int = Field(25, ge=1, le=50)
    suffix: str = Field("추천템", max_length=100)  # 검색어 = 연예인 이름 + suffix
    years: int | None = Field(None, ge=0, le=20)
    order: Literal["relevance", "viewCount", "date"] = "relevance"
    shopping_only: bool = True


class ShoppingFlagIn(BaseModel):
    is_shopping: bool | None  # None = 사람 판정 해제(규칙 점수로 복귀)


class BulkDeleteIn(BaseModel):
    video_ids: list[int] = Field(min_length=1, max_length=5000)


class AdoptSuggestionIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    brand: str | None = None
    category: Category
    subcategory: str | None = None
    evidence: str | None = None


class ProducedIn(BaseModel):
    produced: bool
    produced_url: str | None = None


class OfferFromSearchIn(BaseModel):
    seller: str
    url: str | None = None
    price: int | None = None
    affiliate_available: bool | None = None
    affiliate_program: str | None = None
    notes: str | None = None


class ProductFromLinkIn(BaseModel):
    url: str = Field(min_length=8, max_length=600)
    name: str = Field(min_length=1, max_length=300)
    brand: str | None = None
    category: Category
