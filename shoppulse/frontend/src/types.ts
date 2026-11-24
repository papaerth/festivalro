export type Category = 'beauty' | 'living' | 'food'
export type Slot = 'morning' | 'afternoon' | 'night'

export interface Celebrity { id: number; name: string; name_en: string | null; primary_field: string | null; age_group: string | null; audience_note: string | null; notes: string | null; channel_count: number; is_demo: boolean }

export interface Channel {
  id: number; celebrity_id: number | null; celebrity_name: string | null; channel_name: string; channel_id: string | null; handle: string | null;
  channel_url: string | null; channel_type: string; verification_status: 'unverified' | 'verified' | 'rejected'; primary_field: string | null;
  audience_note: string | null; relevance_beauty: number; relevance_living: number; relevance_food: number; subscriber_count: number | null;
  last_collected_at: string | null; collected_video_count: number; is_active: boolean; source: string; notes: string | null; is_demo: boolean
}

export interface GraphAnalysis {
  graph_type: 'spike_plateau' | 'resurgence' | 'steady_rise' | 'late_surge' | 'irregular' | 'insufficient'; label: string;
  confidence: string; reason: string; points: number; span_hours: number; first_observed: string | null; last_observed: string | null;
  total_growth: number | null; peak_rate_per_hour: number | null; current_rate_per_hour: number | null; growth_7d: number | null; growth_28d: number | null; sources: string[]
}

export interface MetricVal { value: number | null; basis: string; source: string; measured_at: string; note: string | null }

export interface VideoSummary {
  id: number; youtube_video_id: string; title: string; url: string | null; thumbnail_url: string; channel_id: number | null; channel_name: string | null;
  channel_verification: string | null; celebrity_name: string | null; published_at: string | null; duration_seconds: number | null; video_format: string;
  view_count: number | null; like_count: number | null; comment_count: number | null; stats_updated_at: string | null; source_type: string; access_status: string;
  data_source: string; is_demo: boolean; metrics: Record<string, MetricVal>; outlier: number | null; outlier_band: string | null; vph: number | null;
  vph_basis: string | null; vph_band: string | null; snapshot_count: number; sparkline: { observed_at: string; view_count: number; source: string }[]; original_video_id: number | null; celebrity_id: number | null; yt_channel_title: string | null; yt_channel_id: string | null; discovery_query: string | null; derived_count: number; is_derived: boolean; shopping_score: number | null; shopping_hits: string[]; is_shopping_manual: boolean | null; is_shopping: boolean | null; segment_count: number; candidate_count: number; graph: GraphAnalysis
}

export interface Segment {
  id: number; video_id: number; start_seconds: number | null; end_seconds: number | null; quote: string | null; context: string | null; content_type: string | null;
  content_type_label: string | null; sponsorship_status: string; is_recommendation: boolean | null; verification_status: string; source: string; notes: string | null; timestamp_url: string | null
}

export interface Offer { id: number; seller: string; url: string | null; price: number | null; currency: string; stock_status: string; affiliate_available: boolean | null; affiliate_program: string | null; checked_at: string; source: string; notes: string | null }
export interface Product { id: number; name: string; brand: string | null; model_name: string | null; category: Category; subcategory: string | null; image_url: string | null; features: string | null; identification_status: string; notes: string | null; is_demo: boolean; offers?: Offer[]; mention_count: number; segment_id?: number | null; mention_id?: number }

export interface VideoDetail extends VideoSummary {
  description: string | null; tags: string[] | null; notes: string | null; collected_at: string | null;
  snapshots: { observed_at: string; view_count: number; like_count: number | null; comment_count: number | null; source: string }[];
  metric_history: { id: number; metric_type: string; value: number | null; basis: string; source: string; measured_at: string; note: string | null }[];
  segments: Segment[]; products: Product[]; candidates: CandidateSummary[]; fetch_note?: string | null
  derived_shorts: VideoSummary[]; original: VideoSummary | null; evidence: Evidence
}

export interface Evidence { count: number; note?: string; total_views?: number; max_views?: number; graph_types?: Record<string, number>; best_outlier?: number | null; best_vph?: number | null; resurgence?: number; spike_plateau?: number; steady_rise?: number }

export interface Score { id: number; scorer: 'ai' | 'human'; item_scores: Record<string, number | null>; rationale: Record<string, string>; total: number | null; grade_key: string | null; grade_label: string | null; created_at: string }
export interface Verification { item: string; label: string; status: 'pending' | 'passed' | 'failed' | 'na'; note: string | null; checked_by: string | null; checked_at: string | null }
export interface Plan { id: number; candidate_id: number; target_seconds: number; generated_by: string; plan: Record<string, any>; created_at: string }

export interface CandidateSummary {
  id: number; video_id: number; product_id: number | null; segment_id: number | null; celebrity_id: number | null; celebrity_name: string | null;
  channel_category: Category; content_type: string | null; content_type_label: string | null; status: string; recommended_slot: Slot | null; hook_idea: string | null;
  research_todo: string | null; notes: string | null; is_demo: boolean; last_recommended_date: string | null; recommendation_count: number; duplicate_reason: string | null;
  score: number | null; grade_key: string | null; grade_label: string | null; score_scorer: string | null; ai_score: number | null; human_score: number | null;
  production_ready: boolean; unresolved_critical: string[]; product_name: string | null; product_identification: string | null; offer_status: string | null;
  segment: Segment | null; evidence: Evidence; updated_at: string; created_at: string; video?: VideoSummary
}
export interface CandidateDetail extends CandidateSummary {
  video: VideoDetail; product: Product | null; scores: { ai: Score | null; human: Score | null; history: Score[] }; verification: Verification[]; plans: Plan[]
}

export interface ScoringItem { key: string; label: string; max: number; criteria: string }
export interface ScoringConfig { name: string; description?: string; items: ScoringItem[]; grades: { min: number; key: string; label: string }[] }
export interface CandidateMeta { statuses: string[]; content_types: Record<string, string>; scoring: ScoringConfig; verification_items: { key: string; label: string }[]; sorts: Record<string, string> }

export interface ScheduleSlot { id: number | null; schedule_date: string; channel_category: Category; slot: Slot; candidate_id: number | null; status: string; note: string | null; candidate: CandidateSummary | null }
export interface ScheduleView { date: string; slots: { key: Slot; label: string; time: string }[]; hypothesis: Record<Category, Record<Slot, string>>; hypothesis_note: string; grid: ScheduleSlot[]; statuses: string[] }

export interface Job { id: number; job_type: string; status: string; triggered_by: string; params: Record<string, any>; result: Record<string, any>; error: string | null; items_processed: number; quota_used: number; started_at: string; finished_at: string | null }
export interface Report { id: number; report_date: string; generated_at: string; trigger: string; summary: Record<string, any>; categories: any[]; note: string | null }
export interface DataSource { key: string; name: string; kind: string; status: string; note: string | null; checked_at: string }

export interface Stats {
  channels_total: number; channels_verified: number; celebrities_total: number; videos_total: number; videos_original: number; videos_derived: number; graph_derived: Record<string, number>; graph_original: Record<string, number>; videos_new_today: number; candidates_today: number; candidates_total: number;
  final_today: number; spike_plateau: number; resurgence: number; late_surge: number; steady_rise: number; insufficient: number; pending_verification: number;
  last_collection_at: string | null; last_snapshot_at: string | null; latest_report: Report | null; scheduler: { running: boolean; auto_enabled: boolean; next_run: string | null; schedule: string; note: string };
  season: { date: string; weekday: string; season: string; events: string[]; region: string; weather: { status: string; note: string }; note: string }; scoring_name: string
}

export interface Settings {
  env: { port: number; youtube_api_configured: boolean; ai_provider: string; anthropic_configured: boolean; timezone: string; data_dir: string };
  user: Record<string, any>; scoring: ScoringConfig; graph_rules: Record<string, any>; metric_bands: Record<string, any>; upload_slots: Record<string, any>
}

export interface BulkState { running: boolean; task: 'resolve' | 'collect' | 'discover' | null; total: number; done: number; current: string | null; started_at: string | null; finished_at: string | null; summary: Record<string, any>; error: string | null }
