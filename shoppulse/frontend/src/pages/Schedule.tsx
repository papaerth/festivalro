import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Select, Spinner, toneFor, useToast } from '../components/ui'
import type { Category, ScheduleSlot } from '../types'

const CATS: Category[] = ['beauty', 'living', 'food']

export default function Schedule() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cat, setCat] = useState<Category>('beauty')
  const sched = useAsync(() => api.schedule(date), [date])
  const pool = useAsync(() => api.candidates({ category: cat, sort: 'score', limit: 40, status: 'candidate,sourced,verifying_product,verifying_rights,scripting,editing,scheduled' }), [cat])
  const { toast, node } = useToast()
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); sched.reload() } catch (e: any) { toast(e.message, 'err') } }
  const assign = (slot: ScheduleSlot, candidate_id: number | null, status?: string) => act(() => api.assignSchedule({ schedule_date: date, channel_category: slot.channel_category, slot: slot.slot, candidate_id, status }), candidate_id ? '배정 완료' : '배정 해제')
  const onDrop = (e: React.DragEvent, slot: ScheduleSlot) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/plain')
    if (!data) return
    const { id, category } = JSON.parse(data)
    if (category !== slot.channel_category) { toast(`${LABELS.category[category]} 후보는 ${LABELS.category[slot.channel_category]} 채널에 배정할 수 없습니다`, 'err'); return }
    assign(slot, id)
  }
  const s = sched.data

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">하루 9편 편성표</h1><p className="text-sm muted">3개 채널 × 3개 시간대. 후보를 끌어다 놓거나 선택해 배정합니다. 시간대 배치는 운영 가설이며 성과에 따라 수정합니다.</p></div>
        <div className="flex items-center gap-2"><button className="btn-ghost" onClick={() => setDate(new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10))}>◀</button><input type="date" className="input w-44" value={date} onChange={(e) => setDate(e.target.value)} /><button className="btn-ghost" onClick={() => setDate(new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10))}>▶</button></div>
      </div>
      <ErrorBox error={sched.error} onRetry={sched.reload} />
      {!s ? <Spinner /> : (
        <div className="grid gap-4 xl:grid-cols-4">
          <div className="xl:col-span-3">
            <div className="grid grid-cols-[110px_repeat(3,1fr)] gap-2">
              <div />
              {s.slots.map((sl) => <div key={sl.key} className="text-center text-sm font-semibold">{sl.label}<div className="text-[11px] muted">{sl.time}</div></div>)}
              {CATS.map((c) => (
                <div key={c} className="contents">
                  <div className="flex items-center"><Badge tone={toneFor.category(c)}>{LABELS.category[c]}</Badge></div>
                  {s.slots.map((sl) => {
                    const cell = s.grid.find((g) => g.channel_category === c && g.slot === sl.key)!
                    return (
                      <div key={sl.key} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, cell)}
                        className={`card min-h-[150px] p-3 ${cell.candidate ? '' : 'border-dashed'}`}>
                        <div className="mb-1 text-[11px] muted">가설: {s.hypothesis[c]?.[sl.key]}</div>
                        {cell.candidate ? (
                          <div className="space-y-1">
                            {cell.candidate.video?.thumbnail_url && <img src={cell.candidate.video.thumbnail_url} alt="" className="w-full rounded-lg object-cover" style={{ aspectRatio: '16/9' }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                            <Link to={`/candidates/${cell.candidate.id}`} className="line-clamp-2 text-xs font-semibold hover:underline">{cell.candidate.video?.title || `후보 #${cell.candidate.id}`}</Link>
                            <div className="text-[11px] muted">{cell.candidate.celebrity_name} · {cell.candidate.product_name || '상품 미확인'} · {cell.candidate.score ?? '점수 없음'}점</div>
                            {!cell.candidate.production_ready && <Badge tone="amber">검증 {cell.candidate.unresolved_critical.length}건 미해결</Badge>}
                            <Select value={cell.status} onChange={(v) => assign(cell, cell.candidate_id, v)} options={s.statuses.filter((x) => !['candidate', 'rejected'].includes(x)).map((x) => [x, LABELS.status[x] || x])} />
                            <button className="text-[11px] text-red-600 underline" onClick={() => assign(cell, null)}>배정 해제</button>
                          </div>
                        ) : <div className="flex h-24 items-center justify-center text-xs muted">비어 있음 — 오른쪽 후보를 끌어오세요</div>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] muted">{s.hypothesis_note}</p>
          </div>
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">후보 풀</h2><Select value={cat} onChange={(v) => setCat(v as Category)} options={Object.entries(LABELS.category) as [string, string][]} /></div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {pool.data?.items.length === 0 && <p className="text-xs muted">후보 없음</p>}
              {pool.data?.items.map((c) => (
                <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: c.id, category: c.channel_category }))}
                  className="cursor-grab rounded-xl border border-stone-200 p-2 text-xs hover:bg-stone-50 active:cursor-grabbing dark:border-stone-800 dark:hover:bg-stone-800">
                  <div className="flex gap-2">{c.video?.thumbnail_url && <img src={c.video.thumbnail_url} alt="" className="h-10 w-16 rounded object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}<div className="min-w-0"><div className="line-clamp-2 font-medium">{c.video?.title}</div><div className="muted">{c.celebrity_name} · {c.score ?? '점수 없음'}점 · {LABELS.status[c.status]}{c.recommended_slot ? ` · 추천 ${LABELS.slot[c.recommended_slot]}` : ''}</div></div></div>
                  <div className="mt-1 flex gap-1">{s.slots.map((sl) => <button key={sl.key} className="btn-ghost px-1.5 py-0.5 text-[10px]" onClick={() => assign(s.grid.find((g) => g.channel_category === c.channel_category && g.slot === sl.key)!, c.id)}>{sl.label}</button>)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
