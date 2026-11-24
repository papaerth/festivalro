import { useState } from 'react'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Confirm, ErrorBox, Field, Modal, Select, Spinner, toneFor, useToast } from '../components/ui'
import type { Channel } from '../types'

export default function Channels() {
  const [f, setF] = useState<Record<string, string>>({})
  const q = useAsync(() => api.channels(f), [JSON.stringify(f)])
  const celebs = useAsync(() => api.celebrities())
  const { toast, node } = useToast()
  const [edit, setEdit] = useState<Partial<Channel> | null>(null)
  const [celebModal, setCelebModal] = useState(false)
  const [celebForm, setCelebForm] = useState<Record<string, string>>({})
  const [resolve, setResolve] = useState<{ ch: Channel; cands: any[] } | null>(null)

  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); q.reload(); celebs.reload() } catch (e: any) { toast(e.detail?.message || e.message, 'err') } }
  const save = () => {
    if (!edit) return
    const body: any = { ...edit }; delete body.celebrity_name; delete body.id
    if (body.celebrity_id === '' ) body.celebrity_id = null
    act(() => (edit.id ? api.patchChannel(edit.id, body) : api.createChannel(body)), '채널 저장').then(() => setEdit(null))
  }
  const doResolve = async (ch: Channel) => {
    try { const r = await api.resolveChannel(ch.id); setResolve({ ch, cands: r.candidates }); toast(`YouTube 조회 완료 (할당량 ${r.quota_used} 사용)`) } catch (e: any) { toast(e.message, 'err') }
  }

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">연예인·공식 채널</h1><p className="text-sm muted">시드 채널은 모두 '검증 전'입니다. 채널 ID를 확인한 뒤 '검증 완료'로 바꾸세요.</p></div>
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => { setCelebForm({}); setCelebModal(true) }}>+ 연예인</button><button className="btn-primary" onClick={() => setEdit({ channel_name: '', channel_type: 'official_personal', verification_status: 'unverified', relevance_beauty: 0, relevance_living: 0, relevance_food: 0, is_active: true })}>+ 채널 등록</button></div>
      </div>
      <div className="card grid gap-3 p-4 md:grid-cols-5">
        <Field label="검색(채널명·연예인)"><input className="input" value={f.q || ''} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="검증 상태"><Select value={f.verification_status || ''} onChange={(v) => setF({ ...f, verification_status: v })} placeholder="전체" options={[['unverified', '검증 전'], ['verified', '검증 완료'], ['rejected', '공식 아님']]} /></Field>
        <Field label="관련 카테고리"><Select value={f.category || ''} onChange={(v) => setF({ ...f, category: v })} placeholder="전체" options={Object.entries(LABELS.category) as [string, string][]} /></Field>
        <Field label="연예인"><Select value={f.celebrity_id || ''} onChange={(v) => setF({ ...f, celebrity_id: v })} placeholder="전체" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field>
        <div className="flex items-end"><button className="btn-ghost w-full" onClick={() => setF({})}>초기화</button></div>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {!q.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]"><thead><tr className="border-b border-stone-200 dark:border-stone-800"><th className="th">연예인</th><th className="th">채널</th><th className="th">채널 ID</th><th className="th">유형</th><th className="th">검증</th><th className="th">관련성 (뷰/생/먹)</th><th className="th">구독자</th><th className="th">수집</th><th className="th"></th></tr></thead>
            <tbody>{q.data.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 dark:border-stone-800/60">
                <td className="td font-medium">{c.celebrity_name || <span className="muted">—</span>}</td>
                <td className="td">{c.channel_url ? <a href={c.channel_url} target="_blank" rel="noreferrer" className="hover:underline">{c.channel_name} ↗</a> : c.channel_name}{c.handle && <div className="text-[11px] muted">{c.handle}</div>}{!c.is_active && <Badge tone="gray">비활성</Badge>}{c.is_demo && <Badge tone="red">DEMO</Badge>}</td>
                <td className="td font-mono text-xs">{c.channel_id || <span className="muted">미확인</span>}</td>
                <td className="td text-xs">{LABELS.channelType[c.channel_type]}</td>
                <td className="td"><Badge tone={toneFor.verification(c.verification_status)}>{LABELS.verification[c.verification_status]}</Badge></td>
                <td className="td text-xs tabular-nums">{c.relevance_beauty}/{c.relevance_living}/{c.relevance_food}</td>
                <td className="td text-xs tabular-nums">{fmt.compact(c.subscriber_count)}</td>
                <td className="td text-xs">{c.collected_video_count}개<div className="muted">{c.last_collected_at ? fmt.date(c.last_collected_at) : '미수집'}</div></td>
                <td className="td"><div className="flex flex-wrap gap-1 text-xs">
                  <button className="btn-ghost px-2 py-1" onClick={() => setEdit(c)}>수정</button>
                  <button className="btn-ghost px-2 py-1" title="YouTube API 로 채널 후보 검색(할당량 100)" onClick={() => doResolve(c)}>ID 조회</button>
                  <button className="btn-ghost px-2 py-1" disabled={!c.channel_id} title={c.channel_id ? '최근 3년 영상 수집' : '채널 ID 필요'} onClick={() => act(() => api.collectChannel(c.id, { max_videos: 200, years: 3 }).then((j) => { if (j.status === 'failed') throw new Error(j.error || '수집 실패') }), '수집 완료')}>영상 수집</button>
                  <Confirm className="btn-danger px-2 py-1" onConfirm={() => act(() => api.deleteChannel(c.id), '삭제')}>삭제</Confirm>
                </div></td>
              </tr>
            ))}</tbody></table>
          {q.data.length === 0 && <p className="p-6 text-center text-sm muted">채널이 없습니다.</p>}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '채널 수정' : '채널 등록'}>
        {edit && <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="채널명 *"><input className="input" value={edit.channel_name || ''} onChange={(e) => setEdit({ ...edit, channel_name: e.target.value })} /></Field></div>
          <Field label="연예인"><Select value={edit.celebrity_id ? String(edit.celebrity_id) : ''} onChange={(v) => setEdit({ ...edit, celebrity_id: v ? Number(v) : null })} placeholder="없음(방송·제작사 채널 등)" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field>
          <Field label="채널 ID 또는 채널 URL" hint="UC로 시작하는 24자. 미확인이면 비워두세요."><input className="input" value={edit.channel_id || ''} onChange={(e) => setEdit({ ...edit, channel_id: e.target.value || null })} /></Field>
          <Field label="핸들(@...)"><input className="input" value={edit.handle || ''} onChange={(e) => setEdit({ ...edit, handle: e.target.value || null })} /></Field>
          <Field label="채널 유형"><Select value={edit.channel_type || 'official_personal'} onChange={(v) => setEdit({ ...edit, channel_type: v })} options={Object.entries(LABELS.channelType) as [string, string][]} /></Field>
          <Field label="공식 채널 검증"><Select value={edit.verification_status || 'unverified'} onChange={(v) => setEdit({ ...edit, verification_status: v as any })} options={[['unverified', '검증 전'], ['verified', '검증 완료(직접 확인함)'], ['rejected', '공식 아님']]} /></Field>
          <Field label="주 활동 분야"><input className="input" value={edit.primary_field || ''} onChange={(e) => setEdit({ ...edit, primary_field: e.target.value })} /></Field>
          <Field label="주요 시청자층(확인된 경우만)"><input className="input" value={edit.audience_note || ''} onChange={(e) => setEdit({ ...edit, audience_note: e.target.value })} /></Field>
          {([['relevance_beauty', '뷰티·패션'], ['relevance_living', '생활용품'], ['relevance_food', '먹거리']] as [keyof Channel, string][]).map(([k, label]) => <Field key={k} label={`${label} 관련성 (0~3)`}><input type="number" min={0} max={3} className="input" value={(edit as any)[k] ?? 0} onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })} /></Field>)}
          <Field label="활성"><label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> 수집 대상</label></Field>
          <div className="col-span-2"><Field label="메모"><textarea className="input" rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
          <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>취소</button><button className="btn-primary" onClick={save}>저장</button></div>
        </div>}
      </Modal>
      <Modal open={celebModal} onClose={() => setCelebModal(false)} title="연예인 등록">
        <div className="space-y-3">
          <Field label="이름 *"><input className="input" value={celebForm.name || ''} onChange={(e) => setCelebForm({ ...celebForm, name: e.target.value })} /></Field>
          <Field label="영문 이름"><input className="input" value={celebForm.name_en || ''} onChange={(e) => setCelebForm({ ...celebForm, name_en: e.target.value })} /></Field>
          <Field label="주 활동 분야"><input className="input" value={celebForm.primary_field || ''} onChange={(e) => setCelebForm({ ...celebForm, primary_field: e.target.value })} /></Field>
          <Field label="연령대·시청자층(확인된 경우)"><input className="input" value={celebForm.age_group || ''} onChange={(e) => setCelebForm({ ...celebForm, age_group: e.target.value })} /></Field>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => act(() => api.createCelebrity(celebForm as any), '연예인 등록').then(() => setCelebModal(false))}>등록</button></div>
        </div>
      </Modal>
      <Modal open={!!resolve} onClose={() => setResolve(null)} title={`YouTube 채널 후보 — ${resolve?.ch.channel_name}`} wide>
        {resolve && <div className="space-y-2">
          <p className="text-xs muted">자동으로 확정하지 않습니다. 공식 채널인지 직접 확인한 뒤 선택하세요. 선택하면 채널 ID·URL·구독자 수가 저장되고 검증 상태는 '검증 전'으로 유지됩니다.</p>
          {resolve.cands.length === 0 && <p className="text-sm">후보를 찾지 못했습니다.</p>}
          {resolve.cands.map((c) => (
            <div key={c.channel_id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
              <div className="flex items-center gap-3">{c.thumbnail && <img src={c.thumbnail} className="h-10 w-10 rounded-full" alt="" />}<div><a href={c.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{c.title} ↗</a><div className="text-xs muted">{c.handle} · 구독자 {fmt.compact(c.subscriber_count)} · 영상 {c.video_count ?? '?'}개 · <span className="font-mono">{c.channel_id}</span></div><div className="line-clamp-2 text-[11px] muted">{c.description}</div></div></div>
              <button className="btn-primary shrink-0" onClick={() => act(() => api.patchChannel(resolve.ch.id, { channel_id: c.channel_id, channel_url: c.url, handle: c.handle, subscriber_count: c.subscriber_count }), '채널 ID 저장(검증 전 유지)').then(() => setResolve(null))}>이 채널로 저장</button>
            </div>
          ))}
        </div>}
      </Modal>
    </div>
  )
}
