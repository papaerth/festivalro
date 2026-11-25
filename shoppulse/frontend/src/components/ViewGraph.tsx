import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GraphAnalysis } from '../types'
import { LABELS, fmt } from '../api'
import { Badge, toneFor } from './ui'

const ts = (s: string) => new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z').getTime()

/** 실제 관측 스냅샷만 그린다. 데이터 부족 시 그래프 대신 '판별 불가' 안내.
 *  전체 기간 보기: 게시 시점(0회, 사실)부터 현재까지 가로축을 놓고, 기록이 없는 구간은 빗금으로 표시한다(추정선 없음). */
export default function ViewGraph({ points, analysis, height = 180, compact = false, publishedAt = null }: {
  points: { observed_at: string; view_count: number; source: string }[]; analysis: GraphAnalysis; height?: number; compact?: boolean; publishedAt?: string | null
}) {
  const obs = points.map((p) => ({ t: ts(p.observed_at), v: p.view_count, s: p.source })).sort((a, b) => a.t - b.t)
  const obsSpanDays = obs.length >= 2 ? (obs[obs.length - 1].t - obs[0].t) / 86400000 : 0
  const [full, setFull] = useState(obsSpanDays >= 3)
  const sources = Array.from(new Set(points.map((p) => LABELS.source[p.source] || p.source)))
  if (obs.length < 2 && compact) {
    return <div className="flex items-center gap-2 text-[11px] muted"><Badge tone="gray">그래프 판별 불가</Badge>실제 관측 {obs.length}개 — 추정 그래프를 그리지 않음</div>
  }
  if (obs.length < 1) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 p-4 text-center dark:border-stone-700" style={{ height }}>
        <Badge tone="gray">판별 불가</Badge>
        <p className="mt-2 text-xs muted">실제 관측 0개. 과거 조회수는 추측해서 그리지 않습니다. 조회수를 주기적으로 갱신하면 그래프가 쌓입니다.</p>
      </div>
    )
  }
  const pub = publishedAt ? ts(publishedAt) : null
  const showFull = full && pub !== null && pub < obs[0].t
  // 게시점과 첫 관측 사이는 선을 끊는다(null 점) — 직선으로 이으면 추정처럼 보이므로
  const data: { t: number; v: number | null; s: string }[] = showFull ? [{ t: pub!, v: 0, s: 'published' }, { t: pub! + 1, v: null, s: 'gap' }, ...obs] : obs
  const gapEnd = showFull ? obs[0].t : null
  const spanDays = (data[data.length - 1].t - data[0].t) / 86400000
  const fmtTick = (t: number) => new Date(t).toLocaleDateString('ko-KR', spanDays > 400 ? { year: '2-digit', month: 'numeric' } : spanDays > 2 ? { month: 'numeric', day: 'numeric' } : { hour: 'numeric', minute: '2-digit' })
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge tone={toneFor.graph(analysis.graph_type)}>{analysis.label}</Badge>
        {!compact && <span className="muted">신뢰도 {analysis.confidence} · 관측 {analysis.points}개 · {analysis.span_hours >= 48 ? `${Math.round(analysis.span_hours / 24)}일` : `${Math.round(analysis.span_hours)}시간`}</span>}
        <span className="muted">출처: {sources.join(', ')} (실제 관측)</span>
        {!compact && pub !== null && <button className="ml-auto underline" onClick={() => setFull(!full)}>{full ? '최근 관측만 보기' : '전체 기간 보기 (게시일부터)'}</button>}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtTick}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={(v) => fmt.compact(v)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={48} domain={showFull ? [0, 'auto'] : ['auto', 'auto']} />
            {showFull && gapEnd && <ReferenceArea x1={pub!} x2={gapEnd} fill="var(--text-secondary)" fillOpacity={0.06} strokeOpacity={0} label={compact ? undefined : { value: '기록 없음 구간 (추정하지 않음)', position: 'insideTop', fontSize: 10, fill: 'var(--text-secondary)' }} />}
            <Tooltip cursor={{ stroke: 'var(--text-secondary)', strokeDasharray: '3 3' }}
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--grid)', borderRadius: 12, fontSize: 12, color: 'var(--text-primary)' }}
              labelFormatter={(t) => new Date(Number(t)).toLocaleString('ko-KR', { hour12: false })}
              formatter={(v: any, _n: any, p: any) => [p.payload.s === 'published' ? '0 회 (게시 시점)' : `${Number(v).toLocaleString('ko-KR')} 회 (${LABELS.source[p.payload.s] || p.payload.s})`, '조회수']} />
            <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} strokeDasharray={showFull ? undefined : undefined}
              dot={(props: any) => { const { cx, cy, payload } = props; if (payload.s === 'gap' || payload.v === null) return <g key={payload.t} />; if (payload.s === 'published') return <circle key="pub" cx={cx} cy={cy} r={3} fill="var(--text-secondary)" />; return <circle key={payload.t} cx={cx} cy={cy} r={3} fill="var(--surface-2)" stroke="var(--series-1)" strokeWidth={2} /> }}
              activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!compact && <p className="mt-1 text-[11px] muted">{analysis.reason}{showFull ? <> · 게시 시점(0회)과 관측점만 사실이며, 회색 구간의 실제 추이는 기록이 없습니다. 과거 일별 기록은 <Link className="underline" to="/data#vidiq">vidIQ 시계열 가져오기</Link>로 채울 수 있습니다.</> : ''}</p>}
    </div>
  )
}
