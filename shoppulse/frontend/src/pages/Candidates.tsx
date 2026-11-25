import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, LABELS } from '../api'
import { useAsync } from '../hooks'
import CandidateCard from '../components/CandidateCard'
import { Empty, ErrorBox, Field, Select, Spinner } from '../components/ui'

const GRAPHS = Object.entries(LABELS.graph) as [string, string][]
const FORMATS = Object.entries(LABELS.format) as [string, string][]

export default function Candidates() {
  const [sp] = useSearchParams()
  const [f, setF] = useState<Record<string, string>>({ sort: 'score', ...(sp.get('produced') ? { produced: sp.get('produced')!, status: 'published,analyzing' } : {}) })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const meta = useAsync(() => api.candidateMeta())
  const celebs = useAsync(() => api.celebrities())
  const q = useAsync(() => api.candidates({ ...f, limit: 90 }), [JSON.stringify(f)])
  const m = meta.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">소싱 후보</h1><p className="text-sm muted">후보의 주체는 <b>쇼핑 재편집 쇼츠</b>입니다. 들어가면 원본 영상·상품을 연결·확인할 수 있습니다. 「오늘 소싱 실행」이 자동 발굴하거나 영상 상세에서 직접 등록합니다. (저장된 후보의 필터·정렬, 외부 새 검색 아님)</p></div>
        <div className="text-sm muted">{q.data ? `${q.data.total}개 · ${q.data.sort_label}` : ''}</div>
      </div>
      <div className="card grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">
        <Field label="채널 카테고리"><Select value={f.category || ''} onChange={(v) => set('category', v)} placeholder="전체" options={Object.entries(LABELS.category) as [string, string][]} /></Field>
        <Field label="연예인"><Select value={f.celebrity_id || ''} onChange={(v) => set('celebrity_id', v)} placeholder="전체" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field>
        <Field label="콘텐츠 유형"><Select value={f.content_type || ''} onChange={(v) => set('content_type', v)} placeholder="전체" options={Object.entries(m?.content_types || {})} /></Field>
        <Field label="제작 상태"><Select value={f.status || ''} onChange={(v) => set('status', v)} placeholder="전체" options={(m?.statuses || []).map((s) => [s, LABELS.status[s] || s])} /></Field>
        <Field label="그래프 유형"><Select value={f.graph_type || ''} onChange={(v) => set('graph_type', v)} placeholder="전체" options={GRAPHS} /></Field>
        <Field label="영상 길이"><Select value={f.video_format || ''} onChange={(v) => set('video_format', v)} placeholder="전체" options={FORMATS} /></Field>
        <Field label="광고·협찬"><Select value={f.sponsorship || ''} onChange={(v) => set('sponsorship', v)} placeholder="전체" options={Object.entries(LABELS.sponsorship) as [string, string][]} /></Field>
        <Field label="상품 검증 상태"><Select value={f.product_identification || ''} onChange={(v) => set('product_identification', v)} placeholder="전체" options={Object.entries(LABELS.identification) as [string, string][]} /></Field>
        <Field label="점수 등급"><Select value={f.grade || ''} onChange={(v) => set('grade', v)} placeholder="전체" options={(m?.scoring.grades || []).map((g) => [g.key, `${g.label} (${g.min}+)`])} /></Field>
        <Field label="점수 범위"><div className="flex gap-1"><input className="input" placeholder="최소" value={f.min_score || ''} onChange={(e) => set('min_score', e.target.value)} /><input className="input" placeholder="최대" value={f.max_score || ''} onChange={(e) => set('max_score', e.target.value)} /></div></Field>
        <Field label="Outlier 최소"><input className="input" placeholder="예: 3" value={f.min_outlier || ''} onChange={(e) => set('min_outlier', e.target.value)} /></Field>
        <Field label="VPH 최소"><input className="input" placeholder="예: 500" value={f.min_vph || ''} onChange={(e) => set('min_vph', e.target.value)} /></Field>
        <Field label="조회수 최소"><input className="input" placeholder="예: 100000" value={f.min_views || ''} onChange={(e) => set('min_views', e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="게시 기간"><div className="flex gap-1 md:col-span-2"><input type="date" className="input" value={f.published_from || ''} onChange={(e) => set('published_from', e.target.value)} /><input type="date" className="input" value={f.published_to || ''} onChange={(e) => set('published_to', e.target.value)} /></div></Field></div>
        <Field label="제작 준비"><Select value={f.production_ready || ''} onChange={(v) => set('production_ready', v)} placeholder="전체" options={[['true', '준비 완료만'], ['false', '미해결만']]} /></Field>
        <Field label="제작 여부(내 체크)"><Select value={f.produced || ''} onChange={(v) => set('produced', v)} placeholder="전체" options={[['yes', '제작함'], ['no', '아직 안 만듦']]} /></Field>
        <Field label="정렬 (저장 데이터)"><Select value={f.sort} onChange={(v) => set('sort', v)} options={Object.entries(m?.sorts || {})} /></Field>
        <div className="flex items-end gap-2"><label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={f.include_demo === 'true'} onChange={(e) => set('include_demo', e.target.checked ? 'true' : '')} /> DEMO</label><label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={f.include_rejected === 'true'} onChange={(e) => set('include_rejected', e.target.checked ? 'true' : '')} /> 제외됨 포함</label><button className="btn-ghost w-full" onClick={() => setF({ sort: 'score' })}>필터 초기화</button></div>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !q.data ? <Spinner /> : q.data && q.data.items.length === 0 ? <Empty>조건에 맞는 후보가 없습니다.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{q.data?.items.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
      )}
    </div>
  )
}
