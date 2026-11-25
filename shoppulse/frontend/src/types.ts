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
  data_source: string; is_demo: boolean; metrics: Record<string, MetricVal>; computed: { vph_overall: ComputedVal | null; vph_recent: ComputedVal | null; outlier: ComputedOutlier | null }; outlier: number | null; outlier_band: string | null; outlier_source: 'vidiq' | 'computed' | null; outlier_basis: string | null; vph: number | null; vph_source: 'vidiq' | 'computed_recent' | 'computed_overall' | null;
  vph_basis: string | null; vph_band: string | null; snapshot_count: number; sparkline: { observed_at: string; view_count: number; source: string }[]; original_video_id: number | null; celebrity_id: number | null; yt_channel_title: string | null; yt_channel_id: string | null; discovery_query: string | null; derived_count: number; is_derived: boolean; shopping_score: number | null; shopping_hits: string[]; is_shopping_manual: boolean | null; is_shopping: boolean | null; product_status: 'confirmed' | 'candidate' | 'none'; product_names: string[]; shopping_link_count: number; segment_count: number; candidate_count: number; graph: GraphAnalysis
}

export interface Segment {
  id: number; video_id: number; start_seconds: number | null; end_seconds: number | null; quote: string | null; context: string | null; content_type: string | null;
  content_type_label: string | null; sponsorship_status: string; is_recommendation: boolean | null; verification_status: string; source: string; notes: string | null; timestamp_url: string | null; range_label?: string | null
}

export interface Offer { id: number; seller: string; url: string | null; price: number | null; currency: string; stock_status: string; affiliate_available: boolean | null; affiliate_program: string | null; checked_at: string; source: string; notes: string | null }
export interface Product { id: number; name: string; brand: string | null; model_name: string | null; category: Category; subcategory: string | null; image_url: string | null; features: string | null; identification_status: string; notes: string | null; is_demo: boolean; offers?: Offer[]; mention_count: number; segment_id?: number | null; mention_id?: number }

export interface VideoDetail extends VideoSummary {
  description: string | null; tags: string[] | null; notes: string | null; collected_at: string | null;
  snapshots: { observed_at: string; view_count: number; like_count: number | null; comment_count: number | null; source: string }[];
  metric_history: { id: number; metric_type: string; value: number | null; basis: string; source: string; measured_at: string; note: string | null }[];
  segments: Segment[]; products: Product[]; candidates: CandidateSummary[]; fetch_note?: string | null
  derived_shorts: VideoSummary[]; original: VideoSummary | null; original_products: Product[]; evidence: Evidence; description_links: { url: string; host: string; is_shopping_link: boolean }[]; ai_product_suggestions: AISuggestions | null; resolved_links: ResolvedLinks | null
}

export interface ResolvedLink { title: string; url: string; final_url: string; host: string; is_shopping: boolean; via: string }
export interface ResolvedLinks { resolved_at: string; hubs: { hub: string; host: string; links_found: number; shopping_links: number }[]; products: ResolvedLink[]; others: ResolvedLink[]; note: string }

export interface AISuggestion { name: string; brand: string; category: 'beauty' | 'living' | 'food' | 'unknown'; subcategory: string; confidence: 'high' | 'medium' | 'low'; reasoning: string; evidence: string }
export interface AISuggestions { video_is_shopping: boolean; suggestions: AISuggestion[]; notes: string; model?: string; image_sources?: string[]; disclaimer?: string }

export interface Evidence { count: number; unconfirmed_count?: number; note?: string; total_views?: number; max_views?: number; graph_types?: Record<string, number>; best_outlier?: number | null; best_vph?: number | null; resurgence?: number; spike_plateau?: number; steady_rise?: number }

export interface Score { id: number; scorer: 'ai' | 'human' | 'rule'; item_scores: Record<string, number | null>; rationale: Record<string, string>; total: number | null; grade_key: string | null; grade_label: string | null; created_at: string }
export interface Verification { item: string; label: string; status: 'pending' | 'passed' | 'failed' | 'na'; note: string | null; checked_by: string | null; checked_at: string | null }
export interface Plan { id: number; candidate_id: number; target_seconds: number; generated_by: string; plan: Record<string, any>; created_at: string }

export interface CandidateSummary {
  id: number; video_id: number; product_id: number | null; segment_id: number | null; celebrity_id: number | null; celebrity_name: string | null;
  channel_category: Category; content_type: string | null; content_type_label: string | null; status: string; recommended_slot: Slot | null; slot_reason?: string | null; slot_auto?: boolean; hook_idea: string | null;
  research_todo: string | null; notes: string | null; is_demo: boolean; last_recommended_date: string | null; recommendation_count: number; duplicate_reason: string | null;
  score: number | null; grade_key: string | null; grade_label: string | null; score_scorer: string | null; ai_score: number | null; human_score: number | null; rule_score?: number | null; rank?: number | null;
  production_ready: boolean; unresolved_critical: string[]; product_name: string | null; product_identification: string | null; offer_status: string | null;
  segment: Segment | null; plan_count: number; latest_plan_by: string | null; produced_at: string | null; produced_url: string | null; reason_summary: string | null; is_short_candidate: boolean; original_video: VideoSummary | null; original_match?: OriginalMatch | null; original_has_transcript?: boolean; original_status?: 'n/a' | 'linked' | 'needs_review' | 'searched' | 'none'; video_product_status: 'confirmed' | 'candidate' | 'none'; evidence: Evidence; updated_at: string; created_at: string; video?: VideoSummary
}
export interface CandidateDetail extends CandidateSummary {
  video: VideoDetail; original_detail: VideoDetail | null; product: Product | null; scores: { ai: Score | null; human: Score | null; rule: Score | null; history: Score[] }; verification: Verification[]; plans: Plan[]
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
  channels_total: number; channels_verified: number; celebrities_total: number; videos_total: number; videos_original: number; videos_derived: number; graph_derived: Record<string, number>; graph_derived_confirmed: Record<string, number>; videos_derived_confirmed: number; graph_original: Record<string, number>; videos_new_today: number; candidates_today: number; candidates_total: number;
  final_today: number; produced_total: number; spike_plateau: number; resurgence: number; late_surge: number; steady_rise: number; insufficient: number; pending_verification: number;
  last_collection_at: string | null; last_snapshot_at: string | null; latest_report: Report | null; scheduler: { running: boolean; auto_enabled: boolean; next_run: string | null; schedule: string; note: string };
  season: { date: string; weekday: string; season: string; events: string[]; region: string; weather: Weather; note: string }; scoring_name: string
}

export interface Settings {
  env: { port: number; youtube_api_configured: boolean; ai_provider: string; anthropic_configured: boolean; timezone: string; data_dir: string };
  user: Record<string, any>; scoring: ScoringConfig; graph_rules: Record<string, any>; metric_bands: Record<string, any>; upload_slots: Record<string, any>
}

export interface BulkState { running: boolean; task: 'resolve' | 'collect' | 'discover' | 'sourcing' | 'plans' | 'auto' | null; total: number; done: number; current: string | null; stage?: string | null; started_at: string | null; finished_at: string | null; summary: Record<string, any>; error: string | null }

export interface Weather { status: 'ok' | 'unavailable'; source: string; region: string; matched_region?: boolean; observed_at?: string; temperature?: number | null; apparent?: number | null; humidity?: number | null; precipitation_mm?: number | null; code?: number | null; label?: string; today_max?: number | null; today_min?: number | null; precip_prob_max?: number | null; is_rain_or_snow?: boolean; note: string }
export interface OfferSearchItem { seller: string; title: string; url: string | null; price: number | null; image: string | null; brand: string | null; category: string; affiliate_available: boolean | null; affiliate_program: string | null; product_id: string | null }
export interface OfferSearch { query: string; naver: { status: string; items: OfferSearchItem[]; note: string }; coupang: { status: string; items: OfferSearchItem[]; note: string } }

export interface InvestigateItem { name: string; brand: string; model_or_option: string; visible_price: string; category: 'beauty' | 'living' | 'food' | 'unknown'; features: string; confidence: 'high' | 'medium' | 'low'; evidence: string; search_queries: string[]; links: { coupang: string; naver_shopping: string; google: string }; naver_results?: OfferSearchItem[] }
export interface InvestigateResult { items: InvestigateItem[]; notes: string; model: string; disclaimer: string; naver_api: string }

export interface ComputedVal { value: number; basis: string; hours?: number; note: string }
export interface ComputedOutlier { value: number; basis: string; median_views: number; sample_size: number; sample_format: string; computed_at: string; note: string }
export interface OriginalMatch { confidence: string; reason: string | null; checked_at: string | null; candidates: { video_id: number; youtube_video_id: string; title: string; url: string | null; published_at: string | null; duration_seconds: number | null; channel: string | null; thumbnail_url: string | null; score: number; keyword_score?: number; hits: string[]; reasons?: string[]; how: string; rank?: number; is_long?: boolean; snippets?: string[] }[]; celebrities?: string[]; hashtags?: string[]; queries?: string[]; notes?: string[]; api_searches: number; linked: boolean; skipped_shorts?: number; method?: string; image_analysis?: { vision?: { youtube_ids: string[]; pages: { url: string; title: string | null }[]; entities: string[] }; ai?: { people: string[]; on_screen_text: string; program_guess: string; search_queries: string[]; notes: string; model?: string } } | null }
export interface SegmentProposal { status: string; basis?: string; start?: number; end?: number; quote?: string | null; matched?: string[]; link?: string | null; range_label?: string; note?: string; needs_transcript?: boolean; transcript_request?: string; chapter_title?: string; ai?: { confidence: string; reason: string; model?: string }; ai_note?: string }
export interface VidiqRequest { count: number; video_ids: string[]; prompt: string; note: string }

export interface EdlClip { start: number; end: number; caption: string }
export interface EdlOverlay { asset_id: string; kind: 'product' | 'logo' | 'sticker'; name?: string | null; start: number; duration: number }
export interface MidNarration { text: string; segment?: number; start?: number }
export interface EdlPip { src_start: number; focus: 'left' | 'center' | 'right'; segment?: number; start?: number; duration?: number }
export interface EdlSticker { type: string; segment?: number; start?: number; duration?: number }
export interface TtsVoice { id: string; name: string; category?: string | null; gender?: string | null; language?: string | null }
export interface StudioAsset { id: string; kind: 'product' | 'logo' | 'sticker'; name: string | null; method: string | null; method_label: string; url: string }
export interface TtsStatus { available: boolean; provider: string | null; voice?: string; voice_id?: string | null; note: string }
export interface StudioRender { id: number; status: 'queued' | 'running' | 'done' | 'failed'; step: string | null; progress: number; decided_by: string | null; error: string | null; file_url: string | null; notes: string[]; created_at: string; finished_at: string | null;
  style_id: number | null;
  edl: { hook: EdlClip | null; segments: EdlClip[]; title_lines: string[]; credit: string; end_caption?: string; narration?: string; overlays?: EdlOverlay[]; mid_narrations?: MidNarration[]; stickers?: EdlSticker[]; pips?: EdlPip[]; audio?: { narration?: string | null; narration_count?: number; voice?: string; bgm?: string; sfx?: string[] }; reason?: string | null; quote_seen?: string | null; total_seconds: number } | null; output_info: { duration: number; width: number; height: number; size: number } | null }
export interface StudioState {
  candidate: { id: number; title: string; url: string | null; thumbnail_url: string | null; view_count: number | null; celebrity_name: string | null; channel_category: Category; recommended_slot: Slot | null; product_name: string | null; produced_at: string | null; duration_seconds: number | null }
  original: { id: number; title: string; url: string | null; thumbnail_url: string | null; channel: string | null; duration_seconds: number | null; has_transcript: boolean } | null
  segment: Segment | null
  source: { name: string | null; info: { duration?: number; width?: number; height?: number; size?: number; has_audio?: boolean } | null; exists: boolean; hint_start: number | null; hint_end: number | null; warning?: string | null } | null
  renders: StudioRender[]; ffmpeg: { available: boolean; reason?: string; version?: string; ass?: boolean }; ai: boolean
  styles: { id: number; name: string; status: string; summary: string | null }[]
  assets: StudioAsset[]; tts: TtsStatus
  upload_text: { title_suggestion: string; description: string; plan_titles: string[] | null }; notice: string
}

export interface StyleProfile {
  summary: string
  layout: { mode: 'blur_bg' | 'crop_fill' | 'color_bg'; bg_color: string; fg_zoom: number; fg_position: 'center' | 'upper' }
  title: { enabled: boolean; size: 'small' | 'medium' | 'large'; color: string; second_line_color: string; outline_color: string; box: boolean; box_color: string; tone: string; patterns: string[] }
  caption: { enabled: boolean; position: 'below_video' | 'bottom' | 'over_video'; size: 'small' | 'medium' | 'large'; color: string; outline_color: string; box: boolean; box_color: string; tone: string; max_chars: number; emoji: boolean; highlight_color: string; bounce: boolean; bounce_mode: 'line' | 'char' }
  hook: { seconds: number; pattern: string; zoom_punch: boolean; caption_color: string }
  pacing: { total_seconds: number; segments: number; max_clip_seconds: number; note: string }
  footer: { text: string; color: string }
  narration: { enabled: boolean; rate: number; pattern: string; mid_count: number }; sfx: { enabled: boolean }; stickers: { enabled: boolean }; pip: { enabled: boolean }
  bgm: { mode: 'none' | 'auto'; volume: number; track: string }; popup: { position: 'top_right' | 'top_left' | 'center'; size: 'small' | 'medium' | 'large'; motion: boolean }
  end_question: boolean; kick: string[]
}
export interface RefStyle {
  id: number; name: string; channel_url: string | null; channel_title: string | null; status: 'learning' | 'ready' | 'failed'; step: string | null
  profile: StyleProfile | null; error: string | null; created_at: string; updated_at: string
  stats: { sources?: string[]; notes?: string[]; evidence?: string[]; confidence?: string; shorts_analyzed?: number; avg_seconds?: number | null; avg_title_chars?: number | null; avg_hashtags?: number | null; sample_videos?: number; avg_shot_seconds?: number; cuts_per_10s?: number; avg_shot_seconds_est?: number; learned_by?: string } | null
}
