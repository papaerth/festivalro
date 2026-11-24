import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Empty, ErrorBox, Field, Modal, Select, Spinner, toneFor, useToast } from '../components/ui'
import ViewGraph from '../components/ViewGraph'

const SORTS: [string, string][] = [['view_count', '조회수 높은 순'], ['outlier', 'Outlier 높은 순'], ['vph', 'VPH 높은 순'], ['published_desc', '최근 업로드순'], ['published_asc', '오래된 영상순'], ['growth_7d', '최근 7일 증가량순(데이터 있을 때만)'], ['updated', '최근 갱신순']]

export default function Videos() {
  const [f, setF] = useState<Record<string, string>>({ sort: 'view_count' })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const q = useAsync(() => api.videos({ ...f, limit: 60 }), [JSON.stringify(f)])
  const channels = useAsync(() => api.channels())
  const celebs = useAsync(() => api.celebrities())
  const [add, setAdd] = useState(false)
  const [disc, setDisc] = useState(false)
  const [dform, setDform] = useState<Record<string, any>>({ query: '', celebrity_id: '', max_results: 25, order: 'relevance', source_type: 'reedit_shorts' })
  const [form, setForm] = useState<Record<string, any>>({ url_or_id: '', fetch: true, source_type: 'original_celebrity' })
  const { toast, node } = useToast()

  const submit = async () => {
    try {
      const body: Record<string, any> = { ...form }
      if (body.channel_id) body.channel_id = Number(body.channel_id); else delete body.channel_id
      if (body.duration_seconds) body.duration_seconds = Number(body.duration_seconds); else delete body.duration_seconds
      if (body.view_count) body.view_count = Number(body.view_count); else delete body.view_count
      if (!body.title) delete body.title
      if (!body.published_at) delete body.published_at
      const v = await api.createVideo(body)
      toast(v.fetch_note || '영상 등록 완료'); setAdd(false); q.reload()
    } catch (e: any) { toast(e.detail?.message || e.message, 'err') }
  }

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">영상</h1><p className="text-sm muted">저장된 영상의 검색·필터·정렬 (외부 새 검색 아님). 수집은 데이터 메뉴에서.</p></div>
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => setDisc(true)}>재편집 쇼츠 검색(YouTube)</button><button className="btn-primary" onClick={() => setAdd(true)}>+ 영상 등록</button></div>
      </div>
      <div className="card grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-6">
        <Field label="검색(제목·설명·ID)"><input className="input" value={f.q || ''} onChange={(e) => set('q', e.target.value)} /></Field>
        <Field label="연예인"><Select value={f.celebrity_id || ''} onChange={(v) => set('celebrity_id', v)} placeholder="전체" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field>
        <Field label="채널"><Select value={f.channel_id || ''} onChange={(v) => set('channel_id', v)} placeholder="전체" options={(channels.data || []).map((c) => [String(c.id), c.channel_name])} /></Field>
        <Field label="길이 형식"><Select value={f.video_format || ''} onChange={(v) => set('video_format', v)} placeholder="전체" options={Object.entries(LABELS.format) as [string, string][]} /></Field>
        <Field label="원본/재편집"><Select value={f.source_type || ''} onChange={(v) => set('source_type', v)} placeholder="전체" options={Object.entries(LABELS.sourceType) as [string, string][]} /></Field>
        <Field label="그래프 유형"><Select value={f.graph_type || ''} onChange={(v) => set('graph_type', v)} placeholder="전체" options={Object.entries(LABELS.graph) as [string, string][]} /></Field>
        <Field label="콘텐츠 유형(장면)"><Select value={f.content_type || ''} onChange={(v) => set('content_type', v)} placeholder="전체" options={[['direct_recommend', '직접 추천형'], ['sponsored', '광고·협찬형'], ['long_term_love', '애정템형'], ['natural_use', '자연 사용형'], ['experience', '경험담형'], ['comparison', '비교형'], ['taste_reveal', '취향 공개형'], ['value_find', '가성비 발견형'], ['premium_taste', '프리미엄 취향형'], ['regret', '실패·후회형'], ['life_tip', '생활 노하우형'], ['curiosity_debate', '호기심·논쟁형'], ['accidental_find', '우연한 발견형'], ['repeat_buy', '반복 구매형'], ['gift', '선물 추천형']]} /></Field>
        <Field label="광고·협찬(장면)"><Select value={f.sponsorship || ''} onChange={(v) => set('sponsorship', v)} placeholder="전체" options={Object.entries(LABELS.sponsorship) as [string, string][]} /></Field>
        <div className="md:col-span-2"><Field label="게시 기간"><div className="flex gap-1"><input type="date" className="input" value={f.published_from || ''} onChange={(e) => set('published_from', e.target.value)} /><input type="date" className="input" value={f.published_to || ''} onChange={(e) => set('published_to', e.target.value)} /></div></Field></div>
        <Field label="조회수 범위"><div className="flex gap-1"><input className="input" placeholder="최소" value={f.min_views || ''} onChange={(e) => set('min_views', e.target.value)} /><input className="input" placeholder="최대" value={f.max_views || ''} onChange={(e) => set('max_views', e.target.value)} /></div></Field>
        <Field label="Outlier 범위"><div className="flex gap-1"><input className="input" placeholder="최소" value={f.min_outlier || ''} onChange={(e) => set('min_outlier', e.target.value)} /><input className="input" placeholder="최대" value={f.max_outlier || ''} onChange={(e) => set('max_outlier', e.target.value)} /></div></Field>
        <Field label="VPH 범위"><div className="flex gap-1"><input className="input" placeholder="최소" value={f.min_vph || ''} onChange={(e) => set('min_vph', e.target.value)} /><input className="input" placeholder="최대" value={f.max_vph || ''} onChange={(e) => set('max_vph', e.target.value)} /></div></Field>
        <Field label="길이(초) 범위"><div className="flex gap-1"><input className="input" placeholder="최소" value={f.min_duration || ''} onChange={(e) => set('min_duration', e.target.value)} /><input className="input" placeholder="최대" value={f.max_duration || ''} onChange={(e) => set('max_duration', e.target.value)} /></div></Field>
        <Field label="정렬 (저장 데이터)"><Select value={f.sort} onChange={(v) => set('sort', v)} options={SORTS} /></Field>
        <Field label="재편집 쇼츠 연결"><Select value={f.unlinked_derived || ''} onChange={(v) => set('unlinked_derived', v)} placeholder="전체" options={[['true', '원본 미연결 재편집만']]} /></Field>
        <div className="flex items-end gap-2"><label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={f.include_demo === 'true'} onChange={(e) => set('include_demo', e.target.checked ? 'true' : '')} /> DEMO 포함</label><button className="btn-ghost w-full" onClick={() => setF({ sort: 'view_count' })}>초기화</button></div>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.data && <div className="text-sm muted">{q.data.total}개 · {q.data.sort_label}</div>}
      {q.loading && !q.data ? <Spinner /> : q.data?.items.length === 0 ? <Empty>영상이 없습니다. 「영상 등록」 또는 데이터 메뉴의 채널 수집을 이용하세요.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data?.items.map((v) => (
            <Link key={v.id} to={`/videos/${v.id}`} className="card flex gap-3 p-3 transition hover:shadow-md">
              <div className="relative w-40 shrink-0 overflow-hidden rounded-lg bg-stone-200 dark:bg-stone-800" style={{ aspectRatio: '16/9' }}>
                <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{fmt.duration(v.duration_seconds)}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="line-clamp-2 text-sm font-semibold leading-snug">{v.title}</div>
                <div className="text-[11px] muted">{v.celebrity_name ? `${v.celebrity_name} · ` : ''}{v.channel_name || v.yt_channel_title || '채널 미확인'} · {fmt.date(v.published_at)}</div>
                <div className="flex flex-wrap gap-x-3 text-[11px]"><span>조회 {fmt.compact(v.view_count)}</span><span>VPH {v.vph === null ? '미확인' : Math.round(v.vph).toLocaleString()}</span><span>Outlier {v.outlier === null ? '미확인' : v.outlier + '배'}</span></div>
                <div className="flex flex-wrap gap-1"><Badge tone={toneFor.graph(v.graph.graph_type)}>{v.graph.label}</Badge><Badge tone="gray">{LABELS.format[v.video_format]}</Badge>{v.source_type !== 'original_celebrity' && <Badge tone="amber">{LABELS.sourceType[v.source_type]}{v.is_derived && (v.original_video_id ? ' · 원본 연결됨' : ' · 원본 미연결')}</Badge>}{v.derived_count > 0 && <Badge tone="violet">재편집 쇼츠 {v.derived_count}</Badge>}{v.candidate_count > 0 && <Badge tone="blue">후보 {v.candidate_count}</Badge>}{v.is_demo && <Badge tone="red">DEMO</Badge>}</div>
                <div className="pt-1"><ViewGraph points={v.sparkline} analysis={v.graph} height={48} compact /></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={disc} onClose={() => setDisc(false)} title="재편집 쇼츠 검색 (YouTube)">
        <div className="space-y-3">
          <p className="text-xs muted">"연예인 이름 + 키워드"로 YouTube 쇼츠를 검색해 <b>재편집 쇼츠(바이럴 검증 자료)</b>로 등록합니다. 검색 1회 = 할당량 100. 등록된 공식 채널 영상이 섞이면 원본으로 자동 분류됩니다.</p>
          <Field label="연예인(선택)"><Select value={dform.celebrity_id} onChange={(v) => { const c = (celebs.data || []).find((x) => String(x.id) === v); setDform({ ...dform, celebrity_id: v, query: c && !dform.query ? `${c.name} 추천템` : dform.query }) }} placeholder="미지정" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field>
          <Field label="검색어 *" hint="예: 성시경 추천템 / 이서진 콜라 / 한예슬 스킨케어"><input className="input" value={dform.query} onChange={(e) => setDform({ ...dform, query: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="최대 개수"><input type="number" className="input" value={dform.max_results} min={1} max={100} onChange={(e) => setDform({ ...dform, max_results: Number(e.target.value) })} /></Field>
            <Field label="정렬"><Select value={dform.order} onChange={(v) => setDform({ ...dform, order: v })} options={[['relevance', '관련성'], ['viewCount', '조회수'], ['date', '최신']]} /></Field>
            <Field label="분류"><Select value={dform.source_type} onChange={(v) => setDform({ ...dform, source_type: v })} options={[['reedit_shorts', '타인 재편집'], ['competitor', '경쟁·바이럴 참고']]} /></Field>
          </div>
          <div className="flex justify-end"><button className="btn-primary" disabled={!dform.query} onClick={async () => { try { const j = await api.discoverShorts({ query: dform.query, celebrity_id: dform.celebrity_id ? Number(dform.celebrity_id) : null, max_results: dform.max_results, years: 3, order: dform.order, source_type: dform.source_type }); if (j.status === 'failed') throw new Error(j.error || '실패'); toast(`검색 ${j.result.found}개 · 새로 등록 ${j.result.created}개 · 갱신 ${j.result.updated}개${j.result.official_channel_videos ? ` · 공식 채널 원본 ${j.result.official_channel_videos}개` : ''} (할당량 ${j.quota_used})`); setDisc(false); setF({ ...f, source_type: dform.source_type, sort: 'updated' }) } catch (e: any) { toast(e.message, 'err') } }}>검색·등록</button></div>
        </div>
      </Modal>
      <Modal open={add} onClose={() => setAdd(false)} title="영상 등록">
        <div className="space-y-3">
          <Field label="유튜브 URL 또는 영상 ID *" hint="같은 영상은 중복 등록되지 않습니다."><input className="input" value={form.url_or_id} onChange={(e) => setForm({ ...form, url_or_id: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." /></Field>
          <Field label="채널"><Select value={form.channel_id || ''} onChange={(v) => setForm({ ...form, channel_id: v })} placeholder="미지정(API 조회 시 자동 연결 시도)" options={(channels.data || []).map((c) => [String(c.id), `${c.channel_name}${c.celebrity_name ? ` (${c.celebrity_name})` : ''}`])} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.fetch} onChange={(e) => setForm({ ...form, fetch: e.target.checked })} /> YouTube API 로 메타데이터 자동 조회 (키 없으면 아래 수동 입력값 사용)</label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="제목(수동)"><input className="input" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="게시일(수동)"><input type="datetime-local" className="input" value={form.published_at || ''} onChange={(e) => setForm({ ...form, published_at: e.target.value })} /></Field>
            <Field label="길이(초, 수동)"><input className="input" value={form.duration_seconds || ''} onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })} /></Field>
            <Field label="현재 조회수(수동, 지금 시각 관측으로 저장)"><input className="input" value={form.view_count || ''} onChange={(e) => setForm({ ...form, view_count: e.target.value })} /></Field>
            <Field label="원본/재편집"><Select value={form.source_type} onChange={(v) => setForm({ ...form, source_type: v })} options={Object.entries(LABELS.sourceType) as [string, string][]} /></Field>
            <Field label="시연용(DEMO)"><label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={!!form.is_demo} onChange={(e) => setForm({ ...form, is_demo: e.target.checked })} /> 운영 데이터와 분리</label></Field>
          </div>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdd(false)}>취소</button><button className="btn-primary" onClick={submit}>등록</button></div>
        </div>
      </Modal>
    </div>
  )
}
