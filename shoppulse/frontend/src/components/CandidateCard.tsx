import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CandidateSummary } from '../types'
import { api, fmt, LABELS } from '../api'
import { Badge, ProductStatusBadge, toneFor } from './ui'
import ViewGraph from './ViewGraph'

const SCORER_LABEL: Record<string, string> = { rule: '간이 점수(규칙)', ai: 'AI 점수', human: '사람 점수' }

export default function CandidateCard({ c, draggable, onDragStart, rank, rankPrefix = 'Top ', rankLabel, showReason, showGraph = true }: { c: CandidateSummary; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; rank?: number | null; rankPrefix?: string; rankLabel?: string; showReason?: boolean; showGraph?: boolean }) {
  const v = c.video
  const [produced, setProduced] = useState<string | null>(c.produced_at)
  const toggle = async (on: boolean) => { try { const d = await api.setProduced(c.id, { produced: on }); setProduced(d.produced_at) } catch {} }
  return (
    <div className="card overflow-hidden transition hover:shadow-md" draggable={draggable} onDragStart={onDragStart}>
      <Link to={`/candidates/${c.id}`} className="block">
        <div className="relative aspect-video bg-stone-200 dark:bg-stone-800">
          {v?.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />}
          <div className="absolute left-2 top-2 flex gap-1">{(rankLabel || rank) && <span className="rounded-md bg-stone-900/90 px-2 py-0.5 text-xs font-bold text-white">{rankLabel || `${rankPrefix}${rank}`}</span>}<Badge tone={toneFor.category(c.channel_category)}>{LABELS.category[c.channel_category]}</Badge>{c.is_demo && <Badge tone="red">DEMO</Badge>}{produced && <Badge tone="green">✓ 제작함</Badge>}</div>
          <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{fmt.duration(v?.duration_seconds)}</div>
          <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold text-stone-900">{c.score !== null ? `${c.score}점` : '점수 없음'}{c.grade_label ? ` · ${c.grade_label}` : ''}</div>
        </div>
      </Link>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{c.celebrity_name || '연예인 미지정'} <span className="muted">· {v?.channel_name || v?.yt_channel_title || '채널 미확인'}</span></span>
          {c.is_short_candidate ? <Badge tone="amber">재편집 쇼츠</Badge> : <Badge tone={toneFor.verification(v?.channel_verification || null)}>{LABELS.verification[v?.channel_verification || 'unverified']}</Badge>}
        </div>
        <Link to={`/candidates/${c.id}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">{v?.title}</Link>
        {c.is_short_candidate && <div className="text-[11px] muted">{c.original_video ? <>원본: <span className="text-stone-700 dark:text-stone-300">{c.original_video.title.slice(0, 40)}</span>{c.original_video.url && <> <a className="underline" href={c.original_video.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>↗</a></>}</> : c.original_status === 'needs_review' ? <span className="text-amber-700 dark:text-amber-300">원본 후보 {c.original_match?.candidates.length}개 — 상세에서 확인</span> : c.original_status === 'searched' ? <span className="text-amber-700 dark:text-amber-300">원본 자동 탐색: 미발견</span> : <span className="text-amber-700 dark:text-amber-300">원본 영상 미연결</span>}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] muted">
          <span>{fmt.date(v?.published_at)}</span><span>조회 {fmt.compact(v?.view_count)}</span>
          <span>VPH {v?.vph === null || v?.vph === undefined ? '미확인' : v.vph.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
          <span>Outlier {v?.outlier === null || v?.outlier === undefined ? '미확인' : `${v.outlier}배`}</span>
        </div>
        {v && showGraph && <ViewGraph points={v.sparkline} analysis={v.graph} height={70} compact />}
        <div className="flex flex-wrap gap-1 text-[11px]">
          {c.is_short_candidate ? <ProductStatusBadge status={c.video_product_status} names={c.product_name ? [c.product_name] : undefined} /> : <><Badge tone="gray">{c.product_name || '상품 미확인'}</Badge><Badge tone={toneFor.identification(c.product_identification)}>{LABELS.identification[c.product_identification || 'unidentified']}</Badge></>}
          {c.content_type_label && <Badge tone="blue">{c.content_type_label}</Badge>}
          <Badge tone={toneFor.status(c.status)}>{LABELS.status[c.status] || c.status}</Badge>{c.notes?.includes('[자동 발굴') && <Badge tone="gray" title={c.notes || ''}>자동 발굴</Badge>}{c.score_scorer && <Badge tone={c.score_scorer === 'human' ? 'green' : c.score_scorer === 'ai' ? 'violet' : 'gray'}>{SCORER_LABEL[c.score_scorer] || c.score_scorer}</Badge>}{c.plan_count > 0 && <Badge tone="blue">기획안 {c.latest_plan_by === 'anthropic' ? 'AI' : ''}</Badge>}
          {c.recommended_slot && <Badge tone="violet" title={c.slot_reason || ''}>⏰ 업로드 {LABELS.slot[c.recommended_slot]}{c.slot_auto ? ' (자동 추천)' : ''}</Badge>}
          {c.production_ready ? <Badge tone="green">제작 준비 완료</Badge> : <Badge tone="amber" title={c.unresolved_critical.join(', ')}>검증 {c.unresolved_critical.length}건 미해결</Badge>}
        </div>
        {showReason && c.reason_summary && <p className="line-clamp-3 rounded-lg bg-stone-50 p-2 text-[11px] text-stone-700 dark:bg-stone-800/60 dark:text-stone-300"><b>선정 이유:</b> {c.reason_summary}</p>}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!produced} onChange={(e) => toggle(e.target.checked)} /> {produced ? `제작함 · ${fmt.date(produced)}` : '이 후보로 영상 만들었음'}</label>
      </div>
    </div>
  )
}
