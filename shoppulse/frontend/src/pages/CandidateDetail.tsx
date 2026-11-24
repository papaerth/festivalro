import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Confirm, ErrorBox, Field, MetricPill, Select, Spinner, toneFor, useToast } from '../components/ui'
import ViewGraph from '../components/ViewGraph'
import type { CandidateDetail as CD, Score } from '../types'

export default function CandidateDetail() {
  const { id } = useParams()
  const cid = Number(id)
  const nav = useNavigate()
  const q = useAsync(() => api.candidate(cid), [cid])
  const meta = useAsync(() => api.candidateMeta())
  const { toast, node } = useToast()
  const c = q.data
  const cfg = meta.data?.scoring
  const [scores, setScores] = useState<Record<string, string>>({})
  const [rationale, setRationale] = useState<Record<string, string>>({})
  const [target, setTarget] = useState(25)

  useEffect(() => {
    if (!c || !cfg) return
    const base = c.scores.human || c.scores.ai
    const s: Record<string, string> = {}, r: Record<string, string> = {}
    cfg.items.forEach((i) => { s[i.key] = base?.item_scores[i.key] === null || base?.item_scores[i.key] === undefined ? '' : String(base.item_scores[i.key]); r[i.key] = base?.rationale?.[i.key] || '' })
    setScores(s); setRationale(r)
  }, [c?.id, c?.scores.human?.id, c?.scores.ai?.id, cfg])

  const act = async (fn: () => Promise<any>, ok: string) => { try { const d = await fn(); if (d && 'verification' in d) q.setData(d as CD); else q.reload(); toast(ok) } catch (e: any) { toast(e.message, 'err') } }

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />
  if (!c || !cfg) return <Spinner />
  const v = c.video
  const sumEntered = cfg.items.reduce((a, i) => a + (scores[i.key] === '' ? 0 : Number(scores[i.key])), 0)
  const allFilled = cfg.items.every((i) => scores[i.key] !== '')

  return (
    <div className="space-y-5">
      {node}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap gap-1"><Badge tone={toneFor.category(c.channel_category)}>{LABELS.category[c.channel_category]}</Badge>{c.content_type_label && <Badge tone="blue">{c.content_type_label}</Badge>}<Badge tone={toneFor.status(c.status)}>{LABELS.status[c.status]}</Badge>{c.production_ready ? <Badge tone="green">제작 준비 완료</Badge> : <Badge tone="amber">중대 검증 {c.unresolved_critical.length}건 미해결 → 점수와 무관하게 제작 준비 아님</Badge>}{c.is_demo && <Badge tone="red">DEMO</Badge>}</div>
          <h1 className="text-xl font-bold leading-snug tracking-tight">{v.title}</h1>
          <p className="text-sm muted">{c.celebrity_name || '연예인 미지정'} · {v.channel_name || '채널 미확인'} · {fmt.date(v.published_at)} · {fmt.duration(v.duration_seconds)} · <Link className="underline" to={`/videos/${v.id}`}>영상 상세</Link></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {v.url && <a className="btn-ghost" href={v.url} target="_blank" rel="noreferrer">원본 영상 열기 ↗</a>}
          {c.segment?.timestamp_url && <a className="btn-primary" href={c.segment.timestamp_url} target="_blank" rel="noreferrer">장면으로 이동 {fmt.ts(c.segment.start_seconds)} ↗</a>}
          <Confirm onConfirm={() => act(async () => { await api.deleteCandidate(c.id); nav('/candidates') }, '삭제됨')}>후보 삭제</Confirm>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="section-title mb-2">실제 조회수 그래프</h2>
          <ViewGraph points={v.snapshots} analysis={v.graph} height={220} />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricPill label="누적 조회수" value={v.view_count} band={v.stats_updated_at ? `${fmt.datetime(v.stats_updated_at)} 기준` : undefined} />
            <MetricPill label="Outlier" value={v.outlier} band={v.outlier_band ? `${v.outlier_band} (운영 기준)` : undefined} />
            <MetricPill label="VPH" value={v.vph} basis={v.vph_basis} band={v.vph_band ? `${v.vph_band} (운영 기준)` : undefined} />
            <MetricPill label="최근 7일 증가" value={v.graph.growth_7d} missing="데이터 부족" />
          </div>
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-2">연예인 실제 발언·장면</h2>
          {c.segment ? (
            <div className="space-y-2 text-sm">
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60">
                <div className="text-[11px] muted">{fmt.ts(c.segment.start_seconds)} ~ {fmt.ts(c.segment.end_seconds)} · <Badge tone={toneFor.verification(c.segment.verification_status)}>{LABELS.verification[c.segment.verification_status]}</Badge></div>
                <p className="mt-1 font-medium">{c.segment.quote ? `“${c.segment.quote}”` : <span className="muted">실제 발언 미기록</span>}</p>
                {c.segment.context && <p className="mt-1 text-xs muted">맥락: {c.segment.context}</p>}
              </div>
              <div className="flex flex-wrap gap-1"><Badge tone={c.segment.sponsorship_status === 'sponsored' || c.segment.sponsorship_status === 'suspected' ? 'amber' : 'gray'}>{LABELS.sponsorship[c.segment.sponsorship_status]}</Badge><Badge tone="gray">{c.segment.is_recommendation === null ? '추천/언급 미확인' : c.segment.is_recommendation ? '구매 추천' : '단순 언급'}</Badge><Badge tone="gray">{LABELS.access[v.access_status]}</Badge></div>
            </div>
          ) : <p className="text-sm muted">연결된 장면이 없습니다. 영상 상세에서 타임스탬프와 발언을 기록한 뒤 후보에 연결하세요.</p>}
          <h2 className="section-title mb-2 mt-4">바이럴 검증 (재편집 쇼츠)</h2>
          <p className="mb-1 text-[11px] muted">{c.evidence.note}</p>
          {c.evidence.count > 0 ? (
            <div className="flex flex-wrap gap-1 text-xs">
              <Badge tone="gray">상품 확인 쇼츠 {c.evidence.count}개{c.evidence.unconfirmed_count ? ` (미확인 ${c.evidence.unconfirmed_count} 제외)` : ''}</Badge><Badge tone="gray">합계 조회 {fmt.compact(c.evidence.total_views)}</Badge>
              <Badge tone="gray">최고 Outlier {c.evidence.best_outlier ?? '미확인'}</Badge>
              {Object.entries(c.evidence.graph_types || {}).map(([k, n]) => <Badge key={k} tone={toneFor.graph(k)}>{LABELS.graph[k]} {n}</Badge>)}
              <Link to={`/videos/${v.id}`} className="underline">목록 보기</Link>
            </div>
          ) : null}
          <h2 className="section-title mb-2 mt-4">상품·판매처</h2>
          {c.product ? (
            <div className="text-sm">
              <div className="font-medium">{c.product.brand} {c.product.name} {c.product.model_name}</div>
              <Badge tone={toneFor.identification(c.product.identification_status)}>{LABELS.identification[c.product.identification_status]}</Badge>
              <ul className="mt-2 space-y-1 text-xs">
                {(c.product.offers || []).map((o) => <li key={o.id}>{o.seller} · {o.price ? `${o.price.toLocaleString()}원` : '가격 미확인'} · {LABELS.stock[o.stock_status]} · 제휴 {o.affiliate_available === null ? '미확인' : o.affiliate_available ? '가능' : '불가'} · <span className="muted">{fmt.date(o.checked_at)} 기준</span> {o.url && <a className="underline" href={o.url} target="_blank" rel="noreferrer">링크</a>}</li>)}
                {(c.product.offers || []).length === 0 && <li className="muted">판매처 미확인</li>}
              </ul>
            </div>
          ) : <p className="text-sm muted">상품 미연결</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">소싱 점수 <span className="muted text-sm font-normal">· {cfg.name}</span></h2>
            <div className="flex gap-2 text-sm">
              <span className="muted">AI 제안 {c.scores.ai?.total ?? '없음'} · 사람 {c.scores.human?.total ?? '없음'}</span>
              <button className="btn-ghost text-xs" onClick={() => act(() => api.suggestScore(c.id), 'AI 제안 생성(지표 있는 항목만)')}>AI 제안 생성</button>
            </div>
          </div>
          <table className="w-full"><thead><tr><th className="th">항목</th><th className="th">배점</th><th className="th">AI 제안</th><th className="th">사람 점수</th><th className="th">근거</th></tr></thead>
            <tbody>
              {cfg.items.map((i) => (
                <tr key={i.key} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="td"><div className="font-medium">{i.label}</div><div className="text-[11px] muted">{i.criteria}</div></td>
                  <td className="td tabular-nums">{i.max}</td>
                  <td className="td tabular-nums">{c.scores.ai?.item_scores[i.key] ?? <span className="muted">없음</span>}<div className="text-[11px] muted max-w-[160px]">{c.scores.ai?.rationale?.[i.key]}</div></td>
                  <td className="td"><input className="input w-20" type="number" min={0} max={i.max} value={scores[i.key] ?? ''} onChange={(e) => setScores({ ...scores, [i.key]: e.target.value })} /></td>
                  <td className="td"><input className="input" value={rationale[i.key] ?? ''} onChange={(e) => setRationale({ ...rationale, [i.key]: e.target.value })} placeholder="판단 근거" /></td>
                </tr>
              ))}
            </tbody></table>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">합계 <b className="tabular-nums">{sumEntered}</b> / 100 {allFilled ? '' : <span className="muted">(모든 항목을 채워야 총점·등급이 산출됩니다)</span>}</div>
            <button className="btn-primary" onClick={() => act(() => api.addScore(c.id, { scorer: 'human', item_scores: Object.fromEntries(cfg.items.map((i) => [i.key, scores[i.key] === '' ? null : Number(scores[i.key])])), rationale }), '사람 점수 저장')}>사람 점수 저장</button>
          </div>
          <div className="mt-2 text-[11px] muted">등급: {cfg.grades.map((g) => `${g.min}+ ${g.label}`).join(' · ')} · 최종 표시 점수는 사람 점수가 있으면 사람 점수.</div>
          {c.scores.history.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer muted">점수 이력 {c.scores.history.length}건</summary><ul className="mt-1 space-y-0.5">{c.scores.history.map((s: Score) => <li key={s.id}>{fmt.datetime(s.created_at)} · {s.scorer === 'ai' ? 'AI' : '사람'} · {s.total ?? '총점 없음'} {s.grade_label ? `(${s.grade_label})` : ''}</li>)}</ul></details>}
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-2">검증 체크리스트</h2>
          <ul className="space-y-2">
            {c.verification.map((vr) => (
              <li key={vr.item} className="flex items-center justify-between gap-2 text-sm">
                <span className={c.unresolved_critical.includes(vr.item) ? 'font-medium' : ''}>{vr.label}{['official_source', 'celebrity_appearance', 'statement_context', 'product_identity', 'footage_rights'].includes(vr.item) && <span className="text-[10px] text-red-600"> 중대</span>}</span>
                <select className="input w-28 py-1" value={vr.status} onChange={(e) => act(() => api.setVerification(c.id, { item: vr.item, status: e.target.value, note: vr.note }), '검증 상태 저장')}>
                  <option value="pending">대기</option><option value="passed">확인됨</option><option value="failed">문제 있음</option><option value="na">해당 없음</option>
                </select>
              </li>
            ))}
          </ul>
          <h2 className="section-title mb-2 mt-5">제작 상태·배정</h2>
          <div className="space-y-2">
            <Field label="제작 상태"><Select value={c.status} onChange={(s) => act(() => api.patchCandidate(c.id, { status: s }), '상태 변경')} options={(meta.data?.statuses || []).map((s) => [s, LABELS.status[s] || s])} /></Field>
            <Field label="추천 업로드 시간 (운영 가설)"><Select value={c.recommended_slot || ''} onChange={(s) => act(() => api.patchCandidate(c.id, { recommended_slot: s || null }), '저장')} placeholder="미지정" options={Object.entries(LABELS.slot) as [string, string][]} /></Field>
            <Field label="쇼츠 후킹 아이디어"><textarea className="input" rows={3} defaultValue={c.hook_idea || ''} onBlur={(e) => e.target.value !== (c.hook_idea || '') && act(() => api.patchCandidate(c.id, { hook_idea: e.target.value }), '저장')} /></Field>
            <Field label="추가 조사할 정보"><textarea className="input" rows={3} defaultValue={c.research_todo || ''} onBlur={(e) => e.target.value !== (c.research_todo || '') && act(() => api.patchCandidate(c.id, { research_todo: e.target.value }), '저장')} /></Field>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">AI 쇼츠 기획안</h2>
          <div className="flex items-center gap-2 text-sm"><span className="muted">목표 길이</span><input type="number" className="input w-20" value={target} min={10} max={90} onChange={(e) => setTarget(Number(e.target.value))} /><span className="muted">초</span>
            <button className="btn-ghost" onClick={() => act(() => api.createPlan(c.id, { target_seconds: target, provider: 'template' }), '템플릿 기획안 생성')}>템플릿 기획안</button>
            <button className="btn-primary" onClick={() => act(() => api.createPlan(c.id, { target_seconds: target, provider: 'auto' }), '기획안 생성')}>AI 기획안 생성</button></div>
        </div>
        <p className="mb-3 text-[11px] muted">원본에 없는 연예인 발언은 생성하지 않습니다. AI 키가 없으면 템플릿으로 동작하며 '[작성 필요]' 항목은 사용자가 채웁니다. 광고·협찬 사실을 숨기는 기능은 없습니다.</p>
        {c.plans.length === 0 ? <p className="text-sm muted">기획안이 없습니다.</p> : <PlanView plan={c.plans[0]} />}
        {c.plans.length > 1 && <details className="mt-2 text-xs"><summary className="cursor-pointer muted">이전 기획안 {c.plans.length - 1}건</summary>{c.plans.slice(1).map((p) => <div key={p.id} className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800"><PlanView plan={p} /></div>)}</details>}
      </div>
    </div>
  )
}

function PlanView({ plan }: { plan: { plan: Record<string, any>; generated_by: string; created_at: string; target_seconds: number } }) {
  const p = plan.plan
  const row = (k: string, label: string) => p[k] !== undefined && (
    <div key={k}><div className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</div>
      {Array.isArray(p[k]) ? <ul className="list-disc pl-5 text-sm">{p[k].map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p className="whitespace-pre-wrap text-sm">{String(p[k])}</p>}</div>
  )
  return (
    <div className="space-y-3">
      <div className="text-xs muted">{plan.generated_by === 'template' ? '템플릿' : plan.generated_by === 'anthropic' ? `AI (${p.model || 'Claude'})` : plan.generated_by} · {plan.target_seconds}초 · {fmt.datetime(plan.created_at)} {p.structure && <>· 구조: {p.structure.join(' → ')}</>}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {row('hook', '첫 2~3초 후킹')}{row('key_scene', '핵심 원본 장면')}{row('celebrity_statement', '연예인 실제 발언(원문 그대로)')}{row('added_commentary', '추가 해설')}
        {row('product_info', '상품 정보')}{row('purchase_points', '구매 판단 포인트')}{row('closing', '마무리 멘트')}{row('title_candidates', '제목 후보')}
        {row('thumbnail_texts', '썸네일 문구')}{row('description_draft', '설명란 초안')}{row('source_credit', '출처 표시')}{row('disclosure_checklist', '제휴·광고 표시 확인')}{row('research_todo', '추가 조사·주의')}
      </div>
      {p.caution && <p className="text-xs text-amber-700 dark:text-amber-300">⚠ {p.caution}</p>}
    </div>
  )
}
