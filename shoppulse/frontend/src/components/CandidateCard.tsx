import { Link } from 'react-router-dom'
import type { CandidateSummary } from '../types'
import { fmt, LABELS } from '../api'
import { Badge, toneFor } from './ui'
import ViewGraph from './ViewGraph'

export default function CandidateCard({ c, draggable, onDragStart }: { c: CandidateSummary; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const v = c.video
  return (
    <div className="card overflow-hidden transition hover:shadow-md" draggable={draggable} onDragStart={onDragStart}>
      <Link to={`/candidates/${c.id}`} className="block">
        <div className="relative aspect-video bg-stone-200 dark:bg-stone-800">
          {v?.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />}
          <div className="absolute left-2 top-2 flex gap-1"><Badge tone={toneFor.category(c.channel_category)}>{LABELS.category[c.channel_category]}</Badge>{c.is_demo && <Badge tone="red">DEMO</Badge>}</div>
          <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{fmt.duration(v?.duration_seconds)}</div>
          <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold text-stone-900">{c.score !== null ? `${c.score}점` : '점수 없음'}{c.grade_label ? ` · ${c.grade_label}` : ''}</div>
        </div>
      </Link>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{c.celebrity_name || '연예인 미지정'} <span className="muted">· {v?.channel_name || '채널 미확인'}</span></span>
          <Badge tone={toneFor.verification(v?.channel_verification || null)}>{LABELS.verification[v?.channel_verification || 'unverified']}</Badge>
        </div>
        <Link to={`/candidates/${c.id}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">{v?.title}</Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] muted">
          <span>{fmt.date(v?.published_at)}</span><span>조회 {fmt.compact(v?.view_count)}</span>
          <span>VPH {v?.vph === null || v?.vph === undefined ? '미확인' : v.vph.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
          <span>Outlier {v?.outlier === null || v?.outlier === undefined ? '미확인' : `${v.outlier}배`}</span>
        </div>
        {v && <ViewGraph points={v.sparkline} analysis={v.graph} height={70} compact />}
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Badge tone="gray">{c.product_name || '상품 미확인'}</Badge>
          <Badge tone={toneFor.identification(c.product_identification)}>{LABELS.identification[c.product_identification || 'unidentified']}</Badge>
          {c.content_type_label && <Badge tone="blue">{c.content_type_label}</Badge>}
          <Badge tone={toneFor.status(c.status)}>{LABELS.status[c.status] || c.status}</Badge>{c.notes?.includes('[자동 발굴') && <Badge tone="gray" title={c.notes || ''}>자동 발굴</Badge>}{c.score_scorer === 'ai' && <Badge tone="gray">AI 점수</Badge>}
          {c.recommended_slot && <Badge tone="violet">{LABELS.slot[c.recommended_slot]}</Badge>}
          {c.production_ready ? <Badge tone="green">제작 준비 완료</Badge> : <Badge tone="amber" title={c.unresolved_critical.join(', ')}>검증 {c.unresolved_critical.length}건 미해결</Badge>}
        </div>
      </div>
    </div>
  )
}
