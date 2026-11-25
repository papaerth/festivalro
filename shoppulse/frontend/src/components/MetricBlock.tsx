import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt } from '../api'
import type { VideoSummary } from '../types'
import { MetricPill, useToast } from './ui'

/** Outlier·VPH 표시: vidIQ 값 우선, 없으면 계산값(출처 명시). 계산 불가 시 계산 버튼·안내. */
export default function MetricBlock({ v, onChanged, extra }: { v: VideoSummary; onChanged: () => void; extra?: React.ReactNode }) {
  const [busy, setBusy] = useState(false)
  const { toast, node } = useToast()
  const vphLabel = v.vph_source === 'vidiq' ? 'VPH (vidIQ)' : v.vph_source === 'computed_recent' ? `VPH 계산 · 최근 ${v.computed.vph_recent?.hours ?? ''}h 실측` : v.vph_source === 'computed_overall' ? 'VPH 계산 · 게시 후 전체 평균' : 'VPH'
  const outLabel = v.outlier_source === 'vidiq' ? 'Outlier (vidIQ)' : v.outlier_source === 'computed' ? 'Outlier 계산 · 채널 중앙값 대비' : 'Outlier'
  const outSub = v.outlier_source === 'computed' && v.computed.outlier ? `${v.outlier_band || ''} · 중앙값 ${fmt.compact(v.computed.outlier.median_views)} (${v.computed.outlier.sample_format} ${v.computed.outlier.sample_size}개)` : (v.outlier_band ? `${v.outlier_band} (운영 기준)` : undefined)
  return (
    <div>
      {node}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricPill label="누적 조회수" value={v.view_count} band={v.stats_updated_at ? `${fmt.datetime(v.stats_updated_at)} 기준` : undefined} />
        <div className="rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-800">
          <div className="text-[11px] muted">{outLabel}</div>
          <div className={`text-base font-semibold tabular-nums ${v.outlier === null ? 'muted' : ''}`}>{v.outlier === null ? '미확인' : `${v.outlier.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}배`}</div>
          {outSub && <div className="text-[11px] text-stone-600 dark:text-stone-400">{outSub}</div>}
          {v.outlier === null && <button className="mt-1 text-[11px] underline" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api.computeOutlier(v.id); toast(`Outlier 계산 ${r.outlier.value}배 (할당량 ${r.quota_used})`); onChanged() } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) } }}>{busy ? '계산 중…' : '채널 중앙값으로 계산'}</button>}
        </div>
        <div className="rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-800">
          <div className="text-[11px] muted">{vphLabel}</div>
          <div className={`text-base font-semibold tabular-nums ${v.vph === null ? 'muted' : ''}`}>{v.vph === null ? '미확인' : v.vph.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</div>
          <div className="text-[11px] text-stone-600 dark:text-stone-400">{v.vph_band ? `${v.vph_band} (운영 기준)` : ''}{v.vph_source === 'computed_overall' && v.computed.vph_recent === null ? ' · 관측이 2회 이상 쌓이면 최근 구간 VPH 로 바뀜' : ''}</div>
          {v.vph_source !== 'vidiq' && v.computed.vph_overall && v.vph_source === 'computed_recent' && <div className="text-[11px] muted">전체 평균 {v.computed.vph_overall.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}/h</div>}
        </div>
        {extra}
      </div>
      <p className="mt-1 text-[11px] muted">계산값은 SHOPPULSE 가 우리 데이터로 산출한 값이며 vidIQ 지표와 다를 수 있습니다. vidIQ 값은 <Link className="underline" to="/data">데이터 수집 → vidIQ JSON</Link> 으로 가져오면 우선 표시됩니다.</p>
    </div>
  )
}
