import type * as T from './types'

export class ApiError extends Error {
  status: number
  detail: any
  constructor(status: number, detail: any) {
    super(typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail))
    this.status = status
    this.detail = detail
  }
}

async function req<R>(method: string, url: string, body?: unknown, isForm = false): Promise<R> {
  const init: RequestInit = { method, headers: {} }
  if (body !== undefined) {
    if (isForm) init.body = body as FormData
    else { (init.headers as any)['Content-Type'] = 'application/json'; init.body = JSON.stringify(body) }
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e: any) {
    // 네트워크 단계 실패(Failed to fetch): 서버가 꺼졌거나 재시작 중
    window.dispatchEvent(new CustomEvent('sp-server-down'))
    throw new ApiError(0, '서버에 연결할 수 없습니다. SHOPPULSE 서버 창이 닫혔거나 재시작 중입니다(업데이트 직후라면 10~20초 뒤 자동 복구). 바탕화면 아이콘 또는 start.bat 으로 다시 실행하세요.')
  }
  if (res.status === 204) return undefined as R
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data)
  return data as R
}

const qs = (params: Record<string, any>) => {
  const u = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.set(k, String(v)) })
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => req<any>('GET', '/api/health'),
  stats: () => req<T.Stats>('GET', '/api/dashboard/stats'),
  dataSources: () => req<T.DataSource[]>('GET', '/api/dashboard/data-sources'),

  celebrities: (q?: string) => req<T.Celebrity[]>('GET', `/api/celebrities${qs({ q })}`),
  createCelebrity: (b: Partial<T.Celebrity>) => req<T.Celebrity>('POST', '/api/celebrities', b),
  patchCelebrity: (id: number, b: Partial<T.Celebrity>) => req<T.Celebrity>('PATCH', `/api/celebrities/${id}`, b),
  deleteCelebrity: (id: number) => req<void>('DELETE', `/api/celebrities/${id}`),

  channels: (p: Record<string, any> = {}) => req<T.Channel[]>('GET', `/api/channels${qs(p)}`),
  createChannel: (b: Partial<T.Channel>) => req<T.Channel>('POST', '/api/channels', b),
  patchChannel: (id: number, b: Partial<T.Channel>) => req<T.Channel>('PATCH', `/api/channels/${id}`, b),
  deleteChannel: (id: number) => req<void>('DELETE', `/api/channels/${id}`),
  resolveChannel: (id: number) => req<{ candidates: any[]; quota_used: number }>('POST', `/api/channels/${id}/resolve`),
  collectChannel: (id: number, b: { max_videos?: number; years?: number }) => req<T.Job>('POST', `/api/channels/${id}/collect`, b),
  bulkStatus: () => req<T.BulkState>('GET', '/api/channels/bulk/status'),
  bulkResolve: (limit: number) => req<T.BulkState>('POST', '/api/channels/bulk/resolve', { limit }),
  bulkCollect: (b: { max_videos?: number; years?: number | null; stale_days?: number }) => req<T.BulkState>('POST', '/api/channels/bulk/collect', b),
  bulkDiscover: (b: { limit?: number; max_results?: number; suffix?: string; years?: number | null; order?: string; shopping_only?: boolean }) => req<T.BulkState>('POST', '/api/channels/bulk/discover', b),
  discoverShorts: (b: { query: string; celebrity_id?: number | null; max_results?: number; years?: number | null; order?: string; source_type?: string; shopping_only?: boolean }) => req<T.Job>('POST', '/api/videos/discover-shorts', b),
  copyOriginalProducts: (id: number) => req<{ added: number }>('POST', `/api/videos/${id}/copy-original-products`),
  reclassifyShopping: (scope: 'all' | 'derived' = 'all') => req<{ total: number; shopping: number; non_shopping: number; threshold: number }>('POST', `/api/videos/reclassify-shopping?scope=${scope}`),
  identifyProduct: (id: number, files: File[], useThumbnail = true) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); return req<T.AISuggestions>('POST', `/api/videos/${id}/identify-product?use_thumbnail=${useThumbnail}`, fd, true) },
  adoptSuggestion: (id: number, b: { name: string; brand?: string | null; category: 'beauty' | 'living' | 'food'; subcategory?: string | null; evidence?: string | null }) => req<T.Product>('POST', `/api/videos/${id}/adopt-suggestion`, b),
  bulkDeleteVideos: (video_ids: number[]) => req<{ deleted: number; skipped: any[] }>('POST', '/api/videos/bulk-delete', { video_ids }),

  videos: (p: Record<string, any> = {}) => req<{ total: number; items: T.VideoSummary[]; sort_label: string; note: string }>('GET', `/api/videos${qs(p)}`),
  video: (id: number) => req<T.VideoDetail>('GET', `/api/videos/${id}`),
  createVideo: (b: Record<string, any>) => req<T.VideoDetail>('POST', '/api/videos', b),
  patchVideo: (id: number, b: Record<string, any>) => req<T.VideoDetail>('PATCH', `/api/videos/${id}`, b),
  deleteVideo: (id: number) => req<void>('DELETE', `/api/videos/${id}`),
  graph: (id: number) => req<{ analysis: T.GraphAnalysis; points: { observed_at: string; view_count: number; source: string }[] }>('GET', `/api/videos/${id}/graph`),
  addSnapshot: (id: number, b: Record<string, any>) => req<T.VideoDetail>('POST', `/api/videos/${id}/snapshots`, b),
  addMetric: (id: number, b: Record<string, any>) => req<T.VideoDetail>('POST', `/api/videos/${id}/metrics`, b),
  deleteMetric: (vid: number, mid: number) => req<void>('DELETE', `/api/videos/${vid}/metrics/${mid}`),
  addSegment: (id: number, b: Record<string, any>) => req<T.Segment>('POST', `/api/videos/${id}/segments`, b),
  patchSegment: (vid: number, sid: number, b: Record<string, any>) => req<T.Segment>('PATCH', `/api/videos/${vid}/segments/${sid}`, b),
  deleteSegment: (vid: number, sid: number) => req<void>('DELETE', `/api/videos/${vid}/segments/${sid}`),
  refreshStats: (b: { video_ids?: number[]; limit?: number }) => req<T.Job>('POST', '/api/videos/refresh-stats', b),

  products: (p: Record<string, any> = {}) => req<T.Product[]>('GET', `/api/products${qs(p)}`),
  product: (id: number) => req<T.Product & { videos: T.VideoSummary[] }>('GET', `/api/products/${id}`),
  createProduct: (b: Record<string, any>) => req<T.Product>('POST', '/api/products', b),
  patchProduct: (id: number, b: Record<string, any>) => req<T.Product>('PATCH', `/api/products/${id}`, b),
  deleteProduct: (id: number) => req<void>('DELETE', `/api/products/${id}`),
  addOffer: (pid: number, b: Record<string, any>) => req<T.Product>('POST', `/api/products/${pid}/offers`, b),
  deleteOffer: (pid: number, oid: number) => req<void>('DELETE', `/api/products/${pid}/offers/${oid}`),
  addMention: (b: { video_id: number; product_id: number; segment_id?: number | null }) => req<any>('POST', '/api/products/mentions', b),
  deleteMention: (id: number) => req<void>('DELETE', `/api/products/mentions/${id}`),

  candidateMeta: () => req<T.CandidateMeta>('GET', '/api/candidates/meta'),
  candidates: (p: Record<string, any> = {}) => req<{ total: number; items: T.CandidateSummary[]; sort_label: string; ranked?: number; note: string }>('GET', `/api/candidates${qs(p)}`),
  candidate: (id: number) => req<T.CandidateDetail>('GET', `/api/candidates/${id}`),
  createCandidate: (b: Record<string, any>) => req<T.CandidateDetail>('POST', '/api/candidates', b),
  patchCandidate: (id: number, b: Record<string, any>) => req<T.CandidateDetail>('PATCH', `/api/candidates/${id}`, b),
  deleteCandidate: (id: number) => req<void>('DELETE', `/api/candidates/${id}`),
  prepareAll: (force = false) => req<{ rule_scores: { scored: number; unchanged: number; total: number }; template_plans: { generated: number; total: number } }>('POST', `/api/candidates/prepare-all?force=${force}`),
  generateAllPlans: (max_calls = 40) => req<T.BulkState>('POST', `/api/candidates/plans/generate-all?max_calls=${max_calls}`),
  addScore: (id: number, b: { scorer: 'human' | 'ai'; item_scores: Record<string, number | null>; rationale?: Record<string, string> }) => req<T.CandidateDetail>('POST', `/api/candidates/${id}/scores`, b),
  suggestScore: (id: number, mode: 'ai' | 'rule' = 'ai') => req<T.CandidateDetail>('POST', `/api/candidates/${id}/scores/suggest?mode=${mode}`),
  setVerification: (id: number, b: { item: string; status: string; note?: string | null }) => req<T.CandidateDetail>('PUT', `/api/candidates/${id}/verification`, b),
  setProduced: (id: number, b: { produced: boolean; produced_url?: string | null }) => req<T.CandidateDetail>('PUT', `/api/candidates/${id}/produced`, b),
  computeOutlier: (id: number) => req<{ outlier: T.ComputedOutlier; quota_used: number }>('POST', `/api/videos/${id}/compute-outlier`),
  findOriginal: (id: number, use_api = true) => req<{ match: T.OriginalMatch; candidate: T.CandidateDetail }>('POST', `/api/candidates/${id}/find-original?use_api=${use_api}`),
  findOriginalByImage: (id: number, files: File[], useThumbnail = true) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); return req<{ match: T.OriginalMatch; candidate: T.CandidateDetail }>('POST', `/api/candidates/${id}/find-original-by-image?use_thumbnail=${useThumbnail}`, fd, true) },
  linkOriginal: (id: number, b: { video_id?: number; url_or_id?: string }) => req<T.CandidateDetail>('POST', `/api/candidates/${id}/link-original`, b),
  findSegment: (id: number, adopt = false) => req<{ proposal: T.SegmentProposal; candidate: T.CandidateDetail }>('POST', `/api/candidates/${id}/find-segment?adopt=${adopt}`),
  adoptSegment: (id: number, b: { start_seconds: number; end_seconds?: number | null; quote?: string | null; basis?: string; note?: string }) => req<T.CandidateDetail>('POST', `/api/candidates/${id}/adopt-segment`, b),
  vidiqTranscriptRequest: (limit = 30) => req<T.VidiqRequest>('GET', `/api/videos/vidiq-transcript-request${qs({ limit })}`),
  vidiqRequest: (limit = 30, only_candidates = true) => req<T.VidiqRequest>('GET', `/api/videos/vidiq-request${qs({ limit, only_candidates })}`),
  resolveLinks: (id: number) => req<T.ResolvedLinks>('POST', `/api/videos/${id}/resolve-links`),
  productFromLink: (id: number, b: { url: string; name: string; brand?: string | null; category: 'beauty' | 'living' | 'food' }) => req<T.Product>('POST', `/api/videos/${id}/product-from-link`, b),
  investigate: (files: File[], hint?: string, video_id?: number) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); if (hint) fd.append('hint', hint); if (video_id) fd.append('video_id', String(video_id)); return req<T.InvestigateResult>('POST', '/api/products/investigate', fd, true) },
  searchOffers: (q: string, limit = 10) => req<T.OfferSearch>('GET', `/api/products/search-offers${qs({ q, limit })}`),
  createPlan: (id: number, b: { target_seconds: number; provider: 'auto' | 'template' }) => req<T.Plan>('POST', `/api/candidates/${id}/plans`, b),

  schedule: (date?: string) => req<T.ScheduleView>('GET', `/api/schedule${qs({ schedule_date: date })}`),
  assignSchedule: (b: Record<string, any>) => req<T.ScheduleSlot>('PUT', '/api/schedule', b),

  importVidiqJson: (f: File) => { const fd = new FormData(); fd.append('file', f); return req<T.Job>('POST', '/api/import/vidiq-json', fd, true) },
  importCsv: (f: File, source = 'vidiq_csv') => { const fd = new FormData(); fd.append('file', f); return req<T.Job>('POST', `/api/import/metrics-csv?source=${source}`, fd, true) },
  jobs: () => req<T.Job[]>('GET', '/api/import/jobs'),

  studio: (id: number) => req<T.StudioState>('GET', `/api/studio/${id}`),
  studioOriginal: (id: number, url_or_id: string, slot = 1) => req<T.StudioState>('POST', `/api/studio/${id}/original?slot=${slot}`, { url_or_id }),
  studioMake: (id: number, hints: Record<number, string>, styleId?: number | null) => { const fd = new FormData(); if (hints[1]) fd.append('hint', hints[1]); if (hints[2]) fd.append('hint2', hints[2]); if (hints[3]) fd.append('hint3', hints[3]); if (styleId) fd.append('style_id', String(styleId)); return req<T.StudioState>('POST', `/api/studio/${id}/make`, fd, true) },
  studioRerender: (id: number, edl: { hook: T.EdlClip | null; segments: T.EdlClip[]; title_lines: string[]; credit: string; end_caption?: string; narration?: string; overlays?: T.EdlOverlay[]; mid_narrations?: T.MidNarration[]; stickers?: T.EdlSticker[]; pips?: T.EdlPip[]; brand_text?: string | null }) => req<T.StudioState>('POST', `/api/studio/${id}/rerender`, edl),
  styles: () => req<{ styles: T.RefStyle[]; default: T.StyleProfile; note: string }>('GET', '/api/styles'),
  styleCreate: (name: string, channel_url: string, files: File[]) => { const fd = new FormData(); fd.append('name', name); fd.append('channel_url', channel_url); files.forEach((f) => fd.append('files', f)); return req<T.RefStyle>('POST', '/api/styles', fd, true) },
  styleRelearn: (id: number, files: File[]) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); return req<T.RefStyle>('POST', `/api/styles/${id}/relearn`, fd, true) },
  stylePatch: (id: number, body: { name?: string; profile?: T.StyleProfile }) => req<T.RefStyle>('PATCH', `/api/styles/${id}`, body),
  stylesImport: (file: File) => { const fd = new FormData(); fd.append('file', file); return req<{ created: number; updated: number; styles: T.RefStyle[] }>('POST', '/api/styles/import', fd, true) },
  styleDelete: (id: number) => req<void>('DELETE', `/api/styles/${id}`),
  studioAddAsset: (id: number, file: File, kind: 'product' | 'logo' | 'sticker') => { const fd = new FormData(); fd.append('file', file); fd.append('kind', kind); return req<T.StudioState>('POST', `/api/studio/${id}/assets`, fd, true) },
  studioDeleteAsset: (id: number, aid: string) => req<T.StudioState>('DELETE', `/api/studio/${id}/assets/${aid}`),
  styleAudio: () => req<{ tts: T.TtsStatus; bgm: { name: string; size: number }[]; note: string; voices: T.TtsVoice[]; voices_error: string | null; voice_locked: boolean }>('GET', '/api/styles/audio'),
  setVoice: (voiceId: string) => req<{ tts: T.TtsStatus }>('PUT', '/api/styles/voice', { value: voiceId }),
  bgmAdd: (files: File[]) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); return req<{ saved: number }>('POST', '/api/styles/bgm', fd, true) },
  bgmDelete: (name: string) => req<unknown>('DELETE', `/api/styles/bgm/${encodeURIComponent(name)}`),
  ttsTest: async (text: string, voiceId?: string) => { const fd = new FormData(); fd.append('text', text); if (voiceId) fd.append('voice_id', voiceId); const res = await fetch('/api/styles/tts-test', { method: 'POST', body: fd }); if (!res.ok) { let d: any = null; try { d = await res.json() } catch {} ; throw new ApiError(res.status, d?.detail ?? '목소리를 만들지 못했습니다') } return URL.createObjectURL(await res.blob()) },
  studioDeleteSource: (id: number, slot = 1) => req<void>('DELETE', `/api/studio/${id}/source?slot=${slot}`),
  studioUpload: (id: number, file: File, onProgress: (pct: number) => void, slot = 1) => new Promise<T.StudioState>((resolve, reject) => {
    // 큰 파일 진행률 표시를 위해 XHR 사용
    const xhr = new XMLHttpRequest(); const fd = new FormData(); fd.append('file', file); fd.append('slot', String(slot))
    xhr.open('POST', `/api/studio/${id}/source`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => { let d: any = null; try { d = JSON.parse(xhr.responseText) } catch {} ; if (xhr.status >= 200 && xhr.status < 300) resolve(d); else reject(new ApiError(xhr.status, d?.detail ?? xhr.responseText)) }
    xhr.onerror = () => reject(new ApiError(0, '업로드 실패: 서버에 연결할 수 없습니다'))
    xhr.send(fd)
  }),
  autoOnOpen: (force = false) => req<{ started: boolean; reason: string; enabled: boolean; hours: number; last_run: string | null; state: T.BulkState }>('POST', `/api/sourcing/auto-on-open?force=${force}`),
  runSourcing: (report_date?: string) => req<T.BulkState>('POST', '/api/sourcing/run', { report_date, background: true }),
  reports: () => req<T.Report[]>('GET', '/api/sourcing/reports'),
  schedulerStatus: () => req<any>('GET', '/api/sourcing/scheduler'),
  setScheduler: (v: boolean) => req<any>('PUT', '/api/sourcing/scheduler', { value: v }),

  settings: () => req<T.Settings>('GET', '/api/settings'),
  setUserSetting: (k: string, v: any) => req<any>('PUT', `/api/settings/user/${k}`, { value: v }),
  newScoring: (b: T.ScoringConfig) => req<any>('POST', '/api/settings/scoring', b),
  putConfig: (name: string, v: any) => req<any>('PUT', `/api/settings/config/${name}`, { value: v }),

  backups: () => req<{ dir: string; files: { name: string; size: number; modified_at: string }[] }>('GET', '/api/backup'),
  createBackup: () => req<{ file: string; path: string }>('POST', '/api/backup'),
  restore: (f: File, mode: 'replace' | 'merge') => { const fd = new FormData(); fd.append('file', f); return req<any>('POST', `/api/backup/restore?mode=${mode}`, fd, true) },
}

export const fmt = {
  num: (n: number | null | undefined, unit = '') => (n === null || n === undefined ? '미확인' : n.toLocaleString('ko-KR') + unit),
  compact: (n: number | null | undefined) => {
    if (n === null || n === undefined) return '미확인'
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '억'
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '만'
    return n.toLocaleString('ko-KR')
  },
  date: (s: string | null | undefined) => (s ? s.slice(0, 10) : '미확인'),
  datetime: (s: string | null | undefined) => (s ? new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z').toLocaleString('ko-KR', { hour12: false }) : '없음'),
  duration: (sec: number | null | undefined) => {
    if (sec === null || sec === undefined) return '미확인'
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  },
  ts: (sec: number | null | undefined) => (sec === null || sec === undefined ? '--:--' : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`),
  daysAgo: (s: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null),
}

export const LABELS = {
  category: { beauty: '뷰티·패션', living: '생활용품', food: '먹거리' } as Record<string, string>,
  slot: { morning: '오전 11시', afternoon: '오후 5시', night: '밤 9시' } as Record<string, string>,
  status: {
    candidate: '후보', sourced: '소싱 완료', verifying_product: '상품 검증 중', verifying_rights: '원본 사용 권한 확인 중', scripting: '대본 작성',
    editing: '편집 중', scheduled: '업로드 예약', published: '게시 완료', analyzing: '성과 분석', hold: '보류', rejected: '제외', empty: '비어 있음',
  } as Record<string, string>,
  verification: { unverified: '검증 전', verified: '검증 완료', rejected: '공식 아님', confirmed: '확인 완료', needs_review: '재확인 필요' } as Record<string, string>,
  channelType: { official_personal: '연예인 공식', official_broadcaster: '방송·제작사 공식', agency: '소속사', fan_or_other: '기타' } as Record<string, string>,
  format: { long: '롱폼', short: '쇼츠', short_or_long: '쇼츠/롱폼 미확정', unknown: '미확인' } as Record<string, string>,
  sourceType: { original_celebrity: '연예인 원본', reedit_shorts: '타인 재편집', competitor: '경쟁·바이럴 참고', unknown: '미분류' } as Record<string, string>,
  access: { captions: '자막 접근 가능', description_only: '영상 설명만 확인', user_provided: '사용자 자료 제공', manual_check_needed: '영상 직접 확인 필요', inaccessible: '접근 불가', unknown: '미확인' } as Record<string, string>,
  sponsorship: { unknown: '미확인', sponsored: '광고·협찬', not_sponsored: '협찬 아님', suspected: '협찬 의심' } as Record<string, string>,
  identification: { exact: '정확한 상품 확인', brand_only: '브랜드만 확인', similar_candidate: '유사 상품 후보', unidentified: '미확인', discontinued: '단종·판매 종료' } as Record<string, string>,
  stock: { in_stock: '판매 중', out_of_stock: '품절', discontinued: '단종', unknown: '미확인' } as Record<string, string>,
  graph: { spike_plateau: '급등 후 평탄화', resurgence: '재상승', steady_rise: '꾸준히 상승', late_surge: '뒤늦은 급상승', irregular: '분류 보류', insufficient: '판별 불가' } as Record<string, string>,
  jobStatus: { queued: '대기', running: '실행 중', success: '성공', partial: '부분 성공', failed: '실패' } as Record<string, string>,
  source: { youtube_api: 'YouTube API', manual: '수동 입력', vidiq_mcp_json: 'vidIQ JSON', vidiq_csv: 'vidIQ CSV', vidiq_manual: 'vidIQ 수동', computed: '계산값', imported_series: '가져온 시계열', seed: '시드' } as Record<string, string>,
}
