import { useRef, useState } from 'react'
import type { VidiqRequest } from '../types'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Field, Select, toneFor, useToast } from '../components/ui'
import BulkPanel from '../components/BulkPanel'

export default function DataPage() {
  const jobs = useAsync(() => api.jobs())
  const sources = useAsync(() => api.dataSources())
  const channels = useAsync(() => api.channels({ active_only: true }))
  const health = useAsync(() => api.health())
  const reports = useAsync(() => api.reports())
  const { toast, node } = useToast()
  const [ch, setCh] = useState('')
  const [maxVideos, setMaxVideos] = useState(200)
  const [limit, setLimit] = useState(200)
  const jsonRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [vq, setVq] = useState<VidiqRequest | null>(null)
  const [vqLimit, setVqLimit] = useState(30)
  const act = async (fn: () => Promise<any>, ok: (r: any) => string) => { try { const r = await fn(); toast(ok(r), r?.status === 'failed' ? 'err' : 'ok'); jobs.reload() } catch (e: any) { toast(e.message, 'err') } }
  const yt = health.data?.youtube_api

  return (
    <div className="space-y-5">
      {node}
      <div><h1 className="text-2xl font-bold tracking-tight">데이터 수집·가져오기</h1><p className="text-sm muted">모든 작업은 작업 이력에 기록됩니다. 실패는 실패로 표시하며 성공으로 꾸미지 않습니다.</p></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="section-title mb-1">YouTube Data API 수집 {yt ? <Badge tone="green">키 설정됨</Badge> : <Badge tone="amber">키 미설정 — .env 의 YOUTUBE_API_KEY</Badge>}</h2>
          <p className="mb-3 text-xs muted">채널 영상 수집(설정의 조회 기간: 기본 3개월 전~3년 전, 업로드 목록 기반)과 기존 영상 조회수 갱신(스냅샷 축적). 할당량: 채널 검색 100, 영상/채널 조회 1 (일 10,000 기본).</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2"><Field label="채널 (채널 ID가 있는 채널만 수집 가능)"><Select value={ch} onChange={setCh} placeholder="선택" options={(channels.data || []).map((c) => [String(c.id), `${c.channel_name}${c.celebrity_name ? ` (${c.celebrity_name})` : ''}${c.channel_id ? '' : ' — ID 미확인'}`])} /></Field></div>
            <Field label="최대 영상 수"><input type="number" className="input" value={maxVideos} onChange={(e) => setMaxVideos(Number(e.target.value))} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!ch} onClick={() => act(() => api.collectChannel(Number(ch), { max_videos: maxVideos }), (j) => j.status === 'failed' ? `수집 실패: ${j.error}` : `수집 ${LABELS.jobStatus[j.status]}: 신규 ${j.result.created} · 갱신 ${j.result.updated} (할당량 ${j.quota_used})`)}>선택 채널 영상 수집</button>
            <div className="flex items-center gap-2"><input type="number" className="input w-24" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /><button className="btn-ghost" onClick={() => act(() => api.refreshStats({ limit }), (j) => j.status === 'failed' ? `갱신 실패: ${j.error}` : `조회수 갱신 ${LABELS.jobStatus[j.status]}: ${j.result.updated}개 (할당량 ${j.quota_used})`)}>오래된 영상부터 조회수 갱신</button></div>
          </div>
          <p className="mt-2 text-[11px] muted">「오늘 소싱 실행」을 누르면 조회수 갱신(기본 300개)이 먼저 자동 실행됩니다. 조회수 갱신을 매일 실행하면 실제 시계열이 쌓여 그래프 유형(급등 후 평탄화·재상승 등)을 판별할 수 있습니다. 과거 기록은 복원되지 않습니다.</p>
        </div>

        <div className="card p-4" id="vidiq">
          <h2 className="section-title mb-1">vidIQ 지표·과거 시계열 가져오기</h2>
          <div className="mb-3 rounded-xl bg-stone-50 p-3 text-xs dark:bg-stone-800/60">
            <div className="mb-1 font-semibold">1단계 · 요청 문구 만들기</div>
            <p className="muted">전체 기간 조회수 그래프(게시일부터)는 vidIQ 가 보유한 과거 일별 기록으로만 채울 수 있습니다. 아래 버튼으로 후보 영상 ID 목록과 요청 문구를 만들어 vidIQ 가 연결된 ChatGPT/Claude 대화에 붙여넣으세요. 영상 1개당 vidIQ 크레딧 5.</p>
            <div className="mt-2 flex items-center gap-2"><span className="muted">관측이 적은 후보 영상부터 최대</span><input type="number" className="input w-20" value={vqLimit} min={1} max={200} onChange={(e) => setVqLimit(Number(e.target.value))} /><span className="muted">개</span><button className="btn-primary" onClick={async () => { try { setVq(await api.vidiqRequest(vqLimit, true)) } catch (e: any) { toast(e.message, 'err') } }}>요청 문구 만들기</button></div>
            {vq && <div className="mt-2">
              <div className="mb-1 flex items-center justify-between"><span>영상 {vq.count}개</span><div className="flex gap-1"><button className="btn-primary px-2 py-1" onClick={() => { navigator.clipboard.writeText(vq.video_ids.join('\n')).then(() => toast(`영상 ID ${vq.count}개 복사됨 — 채팅에 붙여넣으세요`)) }}>ID만 복사</button><button className="btn-ghost px-2 py-1" onClick={() => { navigator.clipboard.writeText(vq.prompt).then(() => toast('요청 문구 복사됨')) }}>문구 전체 복사</button></div></div>
              <textarea className="input mb-2 font-mono text-[11px]" rows={4} readOnly value={vq.video_ids.join('\n')} />
              <textarea className="input font-mono text-[11px]" rows={8} readOnly value={vq.prompt} />
              <p className="mt-1 muted">{vq.note}</p>
            </div>}
            <div className="mt-2 font-semibold">2단계 · 받은 JSON 업로드 (아래 버튼)</div>
          </div>
          <p className="mb-3 text-xs muted">vidIQ 는 외부 프로그램용 공개 REST API 를 제공하지 않습니다. 공식 경로는 ChatGPT·Claude 등에 연결된 <b>vidIQ MCP</b>입니다. 그 대화에서 받은 <code>vidiq_get_videos_by_ids</code>(최신 VPH·Outlier) / <code>vidiq_video_stats</code>(일별 조회수 시계열) 응답 JSON을 파일로 저장해 올리세요. Outlier가 null 이면 0이 아닌 '미확인'으로 저장됩니다. VPH 측정 구간은 vidIQ 가 명시하지 않아 '기준 미확인'으로 표시합니다.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={jsonRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) act(() => api.importVidiqJson(f), (j) => `JSON 가져오기 ${LABELS.jobStatus[j.status]}: 영상 신규 ${j.result.videos_created} · 갱신 ${j.result.videos_updated} · 지표 ${j.result.metrics_added} · 관측 ${j.result.snapshots_added}${j.result.skipped?.length ? ` · 건너뜀 ${j.result.skipped.length}` : ''}`); e.target.value = '' }} />
            <button className="btn-primary" onClick={() => jsonRef.current?.click()}>vidIQ JSON 업로드</button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) act(() => api.importCsv(f), (j) => `CSV 가져오기 ${LABELS.jobStatus[j.status]}: ${j.result.rows}행 · 지표 ${j.result.metrics_added} · 관측 ${j.result.snapshots_added}${j.result.skipped?.length ? ` · 건너뜀 ${j.result.skipped.length}` : ''}`); e.target.value = '' }} />
            <button className="btn-ghost" onClick={() => csvRef.current?.click()}>CSV 업로드</button>
            <a className="btn-ghost" href="/api/import/template.csv">CSV 양식 받기</a>
          </div>
          <p className="mt-2 text-[11px] muted">CSV 열: video_id(또는 url), outlier, vph, vph_basis(overall/recent/last_hour/unspecified), views, measured_at(ISO). 수동 1건 입력은 영상 상세 화면에서.</p>
        </div>
      </div>

      <BulkPanel onDone={() => { jobs.reload(); channels.reload() }} unresolvedCount={(channels.data || []).filter((c) => !c.channel_id).length} collectableCount={(channels.data || []).filter((c) => !!c.channel_id).length} celebrityCount={new Set((channels.data || []).filter((c) => c.celebrity_id).map((c) => c.celebrity_id)).size} />

      <div className="card p-4">
        <h2 className="section-title mb-2">데이터 소스 상태</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(sources.data || []).map((d) => <div key={d.key} className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800"><div className="flex items-center justify-between"><span className="font-medium">{d.name}</span><Badge tone={d.status === 'configured' ? 'green' : d.status === 'unavailable' ? 'gray' : 'amber'}>{d.status === 'configured' ? '사용 가능' : d.status === 'unavailable' ? '미구현' : '미설정'}</Badge></div><p className="mt-1 text-[11px] muted">{d.note}</p></div>)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="section-title">작업 이력</h2><button className="btn-ghost text-xs" onClick={jobs.reload}>새로고침</button></div>
          <ErrorBox error={jobs.error} />
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs"><thead><tr><th className="th">시각</th><th className="th">작업</th><th className="th">상태</th><th className="th">결과</th></tr></thead><tbody>
              {(jobs.data || []).map((j) => <tr key={j.id} className="border-t border-stone-100 dark:border-stone-800"><td className="td whitespace-nowrap">{fmt.datetime(j.started_at)}</td><td className="td">{j.job_type}<div className="muted">{j.params.channel_name || j.params.filename || ''}</div></td><td className="td"><Badge tone={toneFor.job(j.status)}>{LABELS.jobStatus[j.status]}</Badge></td><td className="td">{j.error ? <span className="text-red-600">{j.error}</span> : <span className="muted">{j.items_processed}건{j.quota_used ? ` · 할당량 ${j.quota_used}` : ''}</span>}</td></tr>)}
              {jobs.data?.length === 0 && <tr><td className="td muted" colSpan={4}>작업 이력 없음</td></tr>}
            </tbody></table>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-2">일일 소싱 보고서 이력</h2>
          <div className="max-h-[420px] space-y-2 overflow-y-auto text-sm">
            {(reports.data || []).map((r) => <div key={r.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-800"><div className="flex justify-between"><span className="font-medium">{r.report_date} <span className="muted text-xs">({r.trigger === 'manual' ? '수동' : '자동'} · {fmt.datetime(r.generated_at)})</span></span><span className="text-xs">후보 {r.summary.total_candidates}/27 · 추천 {r.summary.total_final}/9</span></div><div className="mt-1 text-[11px] muted">{r.categories.map((c: any) => `${c.label} ${c.found}→${c.final_ids.length}`).join(' · ')}</div></div>)}
            {reports.data?.length === 0 && <p className="muted text-xs">아직 보고서가 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
