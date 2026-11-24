import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GraphAnalysis } from '../types'
import { LABELS, fmt } from '../api'
import { Badge, toneFor } from './ui'

/** 실제 관측 스냅샷만 그린다. 데이터 부족 시 그래프 대신 '판별 불가' 안내. */
export default function ViewGraph({ points, analysis, height = 180, compact = false }: {
  points: { observed_at: string; view_count: number; source: string }[]; analysis: GraphAnalysis; height?: number; compact?: boolean
}) {
  const data = points.map((p) => ({ t: new Date(p.observed_at.endsWith('Z') ? p.observed_at : p.observed_at + 'Z').getTime(), v: p.view_count, s: p.source }))
  const sources = Array.from(new Set(points.map((p) => LABELS.source[p.source] || p.source)))
  if (data.length < 2 && compact) {
    return <div className="flex items-center gap-2 text-[11px] muted"><Badge tone="gray">그래프 판별 불가</Badge>실제 관측 {data.length}개 — 추정 그래프를 그리지 않음</div>
  }
  if (data.length < 2) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 p-4 text-center dark:border-stone-700" style={{ height }}>
        <Badge tone="gray">판별 불가</Badge>
        <p className="mt-2 text-xs muted">실제 관측 {data.length}개. 과거 조회수는 추측해서 그리지 않습니다. 조회수를 주기적으로 갱신하면 그래프가 쌓입니다.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge tone={toneFor.graph(analysis.graph_type)}>{analysis.label}</Badge>
        {!compact && <span className="muted">신뢰도 {analysis.confidence} · 관측 {analysis.points}개 · {Math.round(analysis.span_hours / 24)}일</span>}
        <span className="muted">출처: {sources.join(', ')} (실제 관측)</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={(v) => fmt.compact(v)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
            <Tooltip cursor={{ stroke: 'var(--text-secondary)', strokeDasharray: '3 3' }}
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--grid)', borderRadius: 12, fontSize: 12, color: 'var(--text-primary)' }}
              labelFormatter={(t) => new Date(Number(t)).toLocaleString('ko-KR', { hour12: false })}
              formatter={(v: any, _n: any, p: any) => [`${Number(v).toLocaleString('ko-KR')} 회 (${LABELS.source[p.payload.s] || p.payload.s})`, '조회수']} />
            <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: 'var(--surface-2)', stroke: 'var(--series-1)', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!compact && <p className="mt-1 text-[11px] muted">{analysis.reason}</p>}
    </div>
  )
}
