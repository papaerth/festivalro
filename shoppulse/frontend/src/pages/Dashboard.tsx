import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Spinner, Stat, toneFor, useToast } from '../components/ui'
import type { BulkState } from '../types'
import CandidateCard from '../components/CandidateCard'

export default function Dashboard() {
  const stats = useAsync(() => api.stats())
  const sources = useAsync(() => api.dataSources())
  const [cat, setCat] = useState<'beauty' | 'living' | 'food'>('beauty')
  const cands = useAsync(() => api.candidates({ sort: 'score', limit: 6, category: cat, produced: 'no' }), [cat])
  const producedList = useAsync(() => api.candidates({ sort: 'updated', limit: 6, produced: 'yes', status: 'published,analyzing' }))
  const { toast, node } = useToast()
  const s = stats.data

  const [job, setJob] = useState<BulkState | null>(null)
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let running = false
      try { const st = await api.bulkStatus(); if (alive) { running = st.running; setJob((prev) => { if (prev?.running && !st.running && st.task === 'sourcing') { const sm = st.summary || {}; const rf = sm.stats_refresh; const ad = sm.auto_discovery; const ai = sm.ai_scoring; const ap = sm.ai_products; toast(`소싱 완료 — ${rf?.skipped ? `갱신 건너뜀(${rf.reason})` : `조회수 ${rf?.updated ?? 0}개 갱신`} · 자동 발굴 ${ad ? Object.values(ad.created as Record<string, number>).reduce((a, b) => a + b, 0) : 0}개 · AI 상품 추정 ${ap?.skipped ? '건너뜀' : `${ap?.identified ?? 0}건(연결 ${ap?.linked ?? 0})`} · AI 채점 ${ai?.skipped ? `건너뜀(${ai.reason})` : `${ai?.scored ?? 0}건`} · 기획안 ${sm.ai_plans?.skipped ? '건너뜀' : `${sm.ai_plans?.generated ?? 0}건`} · 후보 ${sm.total_candidates}/27, 추천 ${sm.total_final}/9`); stats.reload(); cands.reload() } return st }) } } catch {}
      if (alive) timer = setTimeout(tick, running ? 2000 : 15000)
    }
    tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const run = async () => {
    try { setJob(await api.runSourcing()); toast('소싱 실행 시작 — 조회수 갱신 후 후보를 평가합니다') } catch (e: any) { toast(e.message, 'err') }
  }
  const running = !!job?.running

  if (stats.error) return <ErrorBox error={stats.error} onRetry={stats.reload} />
  if (!s) return <Spinner />
  const rep = s.latest_report

  return (
    <div className="space-y-6">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">오늘의 소싱</h1>
          <p className="text-sm muted">{s.season.date} ({s.season.weekday}) · {s.season.season} · {s.season.region} · {s.season.events.length ? s.season.events.join(', ') : '특별 이벤트 없음'}</p>
          <p className="text-sm">{s.season.weather.status === 'ok' ? <>{s.season.weather.is_rain_or_snow ? '☔' : '☀'} {s.season.weather.label} · 현재 {s.season.weather.temperature}°C (체감 {s.season.weather.apparent}°C) · 습도 {s.season.weather.humidity}% · 오늘 {s.season.weather.today_min}~{s.season.weather.today_max}°C · 강수확률 {s.season.weather.precip_prob_max ?? '?'}% <span className="muted text-xs">· {s.season.weather.source}</span></> : <span className="muted">날씨 조회 불가: {s.season.weather.note}</span>}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={running} onClick={run}>{running ? '실행 중…' : '▶ 오늘 소싱 실행 (수동)'}</button>
          <Link to="/data" className="btn-ghost">데이터 수집</Link>
        </div>
      </div>

      {job?.running && (
        <div className="card p-3 text-sm">
          <div className="flex items-center justify-between"><span>{job.task === 'sourcing' ? '오늘 소싱 실행' : job.task === 'collect' ? '영상 일괄 수집' : job.task === 'discover' ? '재편집 쇼츠 일괄 검색' : 'ID 일괄 조회'} <Badge tone="blue">진행 중</Badge> {job.current && <span className="muted">· {job.current}</span>}</span><span className="tabular-nums">{job.done} / {job.total}</span></div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-700"><div className="h-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="등록된 연예인 채널" value={s.channels_total} sub={`검증 완료 ${s.channels_verified}개 · 연예인 ${s.celebrities_total}명`} />
        <Stat label="누적 분석 영상" value={s.videos_total} sub={`원본 ${s.videos_original} · 재편집 쇼츠 ${s.videos_derived} (상품 확인 ${s.videos_derived_confirmed}) · 오늘 새로 발견 ${s.videos_new_today}`} />
        <Stat label="오늘 소싱 후보" value={s.candidates_today} sub={`전체 후보 ${s.candidates_total}개`} />
        <Stat label="오늘 최종 추천" value={s.final_today} sub="목표 9개 (3채널×3)" tone="green" />
        <Stat label="검증 대기 후보" value={s.pending_verification} sub={`중대 검증 항목 미해결 · 제작 완료 ${s.produced_total}개`} tone="amber" />
        <Stat label="급등 후 평탄화 (재편집 쇼츠)" value={s.graph_derived?.spike_plateau || 0} sub={`상품 확인 ${s.graph_derived_confirmed?.spike_plateau || 0} · 원본 영상 ${s.graph_original?.spike_plateau || 0}`} tone="violet" />
        <Stat label="재상승 (재편집 쇼츠)" value={(s.graph_derived?.resurgence || 0) + (s.graph_derived?.late_surge || 0)} tone="green" sub={`상품 확인 ${(s.graph_derived_confirmed?.resurgence || 0) + (s.graph_derived_confirmed?.late_surge || 0)} · 뒤늦은 급상승 ${s.graph_derived?.late_surge || 0} · 원본 ${(s.graph_original?.resurgence || 0) + (s.graph_original?.late_surge || 0)}`} />
        <Stat label="꾸준히 상승 (재편집 쇼츠)" value={s.graph_derived?.steady_rise || 0} tone="blue" sub={`상품 확인 ${s.graph_derived_confirmed?.steady_rise || 0} · 원본 영상 ${s.graph_original?.steady_rise || 0}`} />
        <Stat label="그래프 판별 불가" value={s.insufficient} sub={`재편집 ${s.graph_derived?.insufficient || 0} · 원본 ${s.graph_original?.insufficient || 0} — 관측 부족`} />
        <Stat label="마지막 데이터 수집" value={<span className="text-base">{fmt.datetime(s.last_collection_at)}</span>} sub={`최근 조회수 관측: ${fmt.datetime(s.last_snapshot_at)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">최근 소싱 보고서 {rep ? <span className="muted text-sm font-normal">· {rep.report_date} ({rep.trigger === 'manual' ? '수동' : '자동'})</span> : null}</h2>
            <Link to="/candidates" className="text-sm underline">후보 전체 보기</Link>
          </div>
          {rep && (rep.summary.auto_discovery || rep.summary.ai_scoring) && (
            <p className="mb-2 text-[11px] muted">
              {rep.summary.auto_discovery && <>자동 발굴 {Object.entries(rep.summary.auto_discovery.created as Record<string, number>).map(([k, n]) => `${LABELS.category[k]} ${n}`).join(' · ')} (쇼핑 재편집 쇼츠 풀 {Object.values(rep.summary.auto_discovery.pool as Record<string, number>).reduce((a, b) => a + b, 0)}개 · 제외: 쇼핑 아님 {rep.summary.auto_discovery.skipped.not_shopping}, 분류 불가 {rep.summary.auto_discovery.skipped.no_category}, 기간 밖 {rep.summary.auto_discovery.skipped.out_of_window ?? 0}{rep.summary.auto_discovery.legacy_retired ? `, 구버전 원본 후보 정리 ${rep.summary.auto_discovery.legacy_retired}` : ''}) · </>}
              {rep.summary.computed_outliers && <>계산 Outlier {rep.summary.computed_outliers.with_outlier}/{rep.summary.computed_outliers.candidates}{rep.summary.computed_outliers.api_channels ? ` (채널 ${rep.summary.computed_outliers.api_channels}개 API 조회, 할당량 ${rep.summary.computed_outliers.quota_used})` : ''} · </>}
              {rep.summary.ai_products && (rep.summary.ai_products.skipped ? <>AI 상품 추정 건너뜀 · </> : <>AI 상품 추정 {rep.summary.ai_products.identified}건(자동 연결 {rep.summary.ai_products.linked}) · </>)}
              {rep.summary.ai_plans && (rep.summary.ai_plans.skipped ? <>기획안 건너뜀 · </> : <>AI 기획안 {rep.summary.ai_plans.generated}건 생성{rep.summary.ai_plans.existing_today ? ` (오늘 생성된 ${rep.summary.ai_plans.existing_today}건 유지)` : ''} · </>)}
              {rep.summary.ai_scoring && (rep.summary.ai_scoring.skipped ? <>AI 채점 건너뜀: {rep.summary.ai_scoring.reason}</> : <>AI 1차 채점 {rep.summary.ai_scoring.scored}건{rep.summary.ai_scoring.failed?.length ? ` · 실패 ${rep.summary.ai_scoring.failed.length}` : ''}</>)}
            </p>
          )}
          {rep && [rep.summary.ai_scoring?.failed?.[0]?.error, rep.summary.ai_products?.failed?.[0]?.error, rep.summary.ai_plans?.failed?.[0]?.error].some(Boolean) && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <b>AI 호출 실패 사유</b> (첫 사례): {rep.summary.ai_scoring?.failed?.[0]?.error || rep.summary.ai_products?.failed?.[0]?.error || rep.summary.ai_plans?.failed?.[0]?.error}
              <div className="mt-1 text-[11px]">키 인증 실패면 .env 의 ANTHROPIC_API_KEY 를, "DLL" 이나 "import" 오류면 update.bat 로 최신 버전(직접 HTTP 호출 대체) 적용 후 다시 실행하세요.</div>
            </div>
          )}
          {!rep ? <p className="text-sm muted">아직 소싱을 실행하지 않았습니다. 「오늘 소싱 실행」을 눌러 저장된 후보를 평가하세요.</p> : (
            <div className="grid gap-3 md:grid-cols-3">
              {rep.categories.map((c: any) => (
                <div key={c.category} className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                  <div className="flex items-center justify-between"><Badge tone={toneFor.category(c.category)}>{c.label}</Badge><span className="text-xs muted">후보 {c.found}/9{c.shorts !== undefined ? ` (쇼츠 ${c.shorts})` : ''} · 추천 {c.final_ids.length}/3</span></div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {c.rows.slice(0, 3).map((r: any) => (
                      <li key={r.candidate_id} className="flex items-center gap-2"><div className="h-8 w-14 shrink-0 overflow-hidden rounded bg-stone-200 dark:bg-stone-800">{r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />}</div><div className="min-w-0"><Link to={`/candidates/${r.candidate_id}`} className="line-clamp-1 hover:underline">{r.title}</Link><div className="text-[11px] muted">{r.is_short ? '재편집 쇼츠' : '원본 영상'} · 조회 {fmt.compact(r.view_count)} · {r.score ?? '점수 없음'}{r.score !== null && r.score !== undefined && r.scorer ? `(${r.scorer === 'human' ? '사람' : r.scorer === 'ai' ? 'AI' : '간이'})` : ''}{r.grade ? ` · ${r.grade}` : ''}{r.recommended_slot ? <span title={r.slot_reason || ''}> · ⏰ {LABELS.slot[r.recommended_slot]}</span> : null}</div></div></li>
                    ))}
                    {c.rows.length === 0 && <li className="muted text-xs">후보 없음</li>}
                  </ul>
                  {c.note && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{c.note}</p>}
                  {c.duplicates_from_previous_day?.length > 0 && <p className="mt-1 text-[11px] muted">전날 중복 {c.duplicates_from_previous_day.length}건(사유 기록)</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-title mb-3">데이터 연결 상태</h2>
          <ul className="space-y-2 text-sm">
            {(sources.data || []).map((d) => (
              <li key={d.key} className="flex items-start justify-between gap-2">
                <div><div className="font-medium">{d.name}</div><div className="text-[11px] muted">{d.note}</div></div>
                <Badge tone={d.status === 'configured' ? 'green' : d.status === 'unavailable' ? 'gray' : 'amber'}>{d.status === 'configured' ? '사용 가능' : d.status === 'unavailable' ? '미구현' : '미설정'}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-stone-50 p-3 text-xs dark:bg-stone-800/60">
            <div className="font-medium">자동 소싱 스케줄러</div>
            <div className="muted">{s.scheduler.schedule} · {s.scheduler.auto_enabled ? `활성 (다음 실행 ${fmt.datetime(s.scheduler.next_run)})` : '비활성 (설정에서 켤 수 있음)'}</div>
            <div className="muted mt-1">{s.scheduler.note}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">오늘의 Top 6 <span className="muted text-sm font-normal">· 소싱 점수 순 · 아직 안 만든 후보</span></h2>
          <div className="flex gap-1">{(['beauty', 'living', 'food'] as const).map((k) => <button key={k} className={cat === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setCat(k)}>{LABELS.category[k]}</button>)}</div>
        </div>
        {cands.data && cands.data.items.length === 0 && <div className="card p-6 text-sm muted">{LABELS.category[cat]} 후보가 없습니다. 「오늘 소싱 실행」으로 자동 발굴하거나 영상 상세에서 등록하세요.</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(cands.data?.items || []).map((c, i) => <CandidateCard key={c.id} c={c} rank={i + 1} showReason />)}
        </div>
        <p className="mt-2 text-[11px] muted">점수 없는 후보는 뒤로 밀립니다. 선정 이유는 AI 채점 요약(있으면) 또는 자동 발굴 신호입니다. 카드의 체크박스로 「제작함」을 표시하면 목록에서 빠지고 아래 「제작한 영상」에 쌓입니다.</p>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">제작한 영상 <span className="muted text-sm font-normal">· 최근 6개</span></h2><Link to="/candidates?produced=yes" className="text-sm underline">전체 보기</Link></div>
        {producedList.data && producedList.data.items.length === 0 ? <div className="card p-4 text-sm muted">아직 「제작함」으로 체크한 후보가 없습니다.</div> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(producedList.data?.items || []).map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        )}
      </div>
      <p className="text-[11px] muted">점수 모델: {s.scoring_name} · Outlier/VPH 등급은 SHOPPULSE 운영 참고 기준이며 vidIQ 공식 등급이 아닙니다. 그래프는 실제 관측 데이터만 사용합니다. 시간대 배치는 운영 가설입니다.</p>
    </div>
  )
}
