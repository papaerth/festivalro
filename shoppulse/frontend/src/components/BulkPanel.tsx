import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BulkState } from '../types'
import { Badge, useToast } from './ui'

/** 채널 일괄 작업(ID 조회·영상 수집) 버튼 + 진행 상태. 완료 시 onDone 호출. */
export default function BulkPanel({ onDone, unresolvedCount, collectableCount, celebrityCount = 0 }: { onDone: () => void; unresolvedCount: number; collectableCount: number; celebrityCount?: number }) {
  const [st, setSt] = useState<BulkState | null>(null)
  const [limit, setLimit] = useState(30)
  const [stale, setStale] = useState(1)
  const [suffix, setSuffix] = useState('추천템')
  const [dLimit, setDLimit] = useState(20)
  const [shopOnly, setShopOnly] = useState(true)
  const { toast, node } = useToast()
  const [wasRunning, setWasRunning] = useState(false)

  useEffect(() => {
    // 작업 중일 때만 2초마다, 평소에는 15초마다 상태 확인
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let running = false
      try { const s = await api.bulkStatus(); if (alive) { setSt(s); running = s.running } } catch {}
      if (alive) timer = setTimeout(tick, running ? 2000 : 15000)
    }
    tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])
  useEffect(() => {
    if (st?.running) setWasRunning(true)
    else if (wasRunning && st && !st.running) { setWasRunning(false); onDone() }
  }, [st?.running])

  const run = async (fn: () => Promise<BulkState>) => { try { setSt(await fn()); setTimeout(async () => { try { setSt(await api.bulkStatus()) } catch {} }, 1500) } catch (e: any) { toast(e.message, 'err') } }
  const sum = st?.summary || {}
  return (
    <div className="card p-4">
      {node}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button className="btn-primary" disabled={!!st?.running || unresolvedCount === 0} onClick={() => run(() => api.bulkResolve(limit))}>ID 없는 채널 일괄 조회 ({unresolvedCount}개)</button>
          <span className="muted">최대</span><input type="number" className="input w-20" value={limit} min={1} max={200} onChange={(e) => setLimit(Number(e.target.value))} /><span className="muted text-xs">개 · 채널당 할당량 100</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button className="btn-primary" disabled={!!st?.running || collectableCount === 0} onClick={() => run(() => api.bulkCollect({ max_videos: 200, years: 3, stale_days: stale }))}>ID 있는 채널 전체 영상 수집 ({collectableCount}개)</button>
          <span className="muted">최근</span><input type="number" className="input w-16" value={stale} min={0} max={365} onChange={(e) => setStale(Number(e.target.value))} /><span className="muted text-xs">일 내 수집한 채널은 건너뜀 (0=전부)</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 text-sm dark:border-stone-800">
        <button className="btn-primary" disabled={!!st?.running || celebrityCount === 0} onClick={() => run(() => api.bulkDiscover({ limit: dLimit, max_results: 25, suffix, years: 3, order: 'relevance', shopping_only: shopOnly }))}>연예인별 재편집 쇼츠 일괄 검색 ({celebrityCount}명)</button>
        <span className="muted">검색어: 이름 +</span><input className="input w-32" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        <span className="muted">최대</span><input type="number" className="input w-20" value={dLimit} min={1} max={200} onChange={(e) => setDLimit(Number(e.target.value))} /><span className="muted text-xs">명 · 1명당 할당량 100, 쇼츠 25개</span>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={shopOnly} onChange={(e) => setShopOnly(e.target.checked)} /> 쇼핑 쇼츠만 등록(제목·설명의 쇼핑 신호 기준)</label>
      </div>
      <p className="mt-2 text-[11px] muted">재편집 쇼츠 검색은 "연예인 이름 + 키워드"로 YouTube 쇼츠를 찾아 <b>재편집 쇼츠(바이럴 검증 자료)</b>로 등록합니다. 등록된 공식 채널의 영상이 섞여 나오면 자동으로 원본으로 분류됩니다. 이 쇼츠들의 조회수를 매일 갱신하면 급등 후 평탄화·재상승 패턴을 판별할 수 있습니다. 어떤 원본 영상을 썼는지는 영상 상세에서 연결하세요.</p>
      <p className="mt-2 text-[11px] muted">일괄 ID 조회는 가장 유력한 채널을 저장하되 <b>검증 상태는 '검증 전'으로 둡니다</b>. '확인 필요'로 표시된 채널과 구독자 수가 이상한 채널은 직접 확인한 뒤 「검증 완료」를 누르세요. 수집은 백그라운드에서 진행되며 이 화면을 떠나도 계속됩니다.</p>
      {st && (st.running || st.finished_at) && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
          <div className="flex items-center justify-between">
            <span>{st.task === 'resolve' ? 'ID 일괄 조회' : st.task === 'discover' ? '재편집 쇼츠 일괄 검색' : '영상 일괄 수집'} {st.running ? <Badge tone="blue">진행 중</Badge> : <Badge tone="green">완료</Badge>} {st.current && <span className="muted">· {st.current}</span>}</span>
            <span className="tabular-nums">{st.done} / {st.total}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-700"><div className="h-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} /></div>
          {st.error && <p className="mt-2 text-red-600">{st.error}</p>}
          {!st.running && st.task === 'resolve' && sum.saved && (
            <div className="mt-2 text-xs">
              <div>유력 저장 {sum.saved.length}개 · 확인 필요 {sum.needs_review?.length || 0}개 · 실패 {sum.failed?.length || 0}개 · 할당량 {sum.quota_used}</div>
              {sum.needs_review?.length > 0 && <div className="mt-1 text-amber-700 dark:text-amber-300">확인 필요: {sum.needs_review.map((r: any) => `${r.channel} → ${r.saved} (${r.verdict})`).join(' / ')}</div>}
              {sum.failed?.length > 0 && <div className="mt-1 text-red-600">실패: {sum.failed.map((r: any) => `${r.channel}: ${r.reason}`).join(' / ')}</div>}
            </div>
          )}
          {!st.running && st.task === 'discover' && sum.results && (
            <div className="mt-2 text-xs">
              <div>연예인 {sum.celebrities}명 검색 · 새 쇼츠 {sum.created}개 등록 · 쇼핑 신호 없어 제외 {sum.skipped_non_shopping ?? 0}개 · 할당량 {sum.quota_used}</div>
              {sum.failed?.length > 0 && <div className="mt-1 text-red-600">실패: {sum.failed.map((r: any) => `${r.celebrity}: ${r.error}`).join(' / ')}</div>}
            </div>
          )}
          {!st.running && st.task === 'collect' && sum.results && (
            <div className="mt-2 text-xs">
              <div>채널 {sum.channels}개 중 성공 {sum.success}개 · 할당량 {sum.quota_used}</div>
              {sum.failed?.length > 0 && <div className="mt-1 text-red-600">실패: {sum.failed.map((r: any) => `${r.channel}: ${r.error}`).join(' / ')}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
