import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Confirm, ErrorBox, Field, MetricPill, Modal, ProductStatusBadge, Select, Spinner, toneFor, useToast } from '../components/ui'
import type { AISuggestion } from '../types'
import ViewGraph from '../components/ViewGraph'
import CaptureInvestigateModal from '../components/CaptureInvestigate'
import ProductLinks from '../components/ProductLinks'

const CT: [string, string][] = [['direct_recommend', '직접 추천형'], ['sponsored', '광고·협찬형'], ['long_term_love', '애정템형'], ['natural_use', '자연 사용형'], ['experience', '경험담형'], ['comparison', '비교형'], ['taste_reveal', '취향 공개형'], ['value_find', '가성비 발견형'], ['premium_taste', '프리미엄 취향형'], ['regret', '실패·후회형'], ['life_tip', '생활 노하우형'], ['curiosity_debate', '호기심·논쟁형'], ['accidental_find', '우연한 발견형'], ['repeat_buy', '반복 구매형'], ['gift', '선물 추천형']]
const toSec = (s: string) => { if (!s) return null; const p = s.split(':').map(Number); if (p.some(isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] }

export default function VideoDetail() {
  const vid = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(() => api.video(vid), [vid])
  const channels = useAsync(() => api.channels())
  const products = useAsync(() => api.products())
  const celebs = useAsync(() => api.celebrities())
  const originals = useAsync(() => api.videos({ source_type: 'original_celebrity', limit: 500, sort: 'view_count', with_graph: false }))
  const { toast, node } = useToast()
  const [modal, setModal] = useState<null | 'snapshot' | 'metric' | 'segment' | 'candidate' | 'product'>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const capRef = useRef<HTMLInputElement>(null)
  const [capture, setCapture] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const v = q.data
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); setModal(null); setForm({}); q.reload() } catch (e: any) { toast(e.detail?.message || e.message, 'err') } }

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />
  if (!v) return <Spinner />
  const open = (m: typeof modal, init: Record<string, any> = {}) => { setForm(init); setModal(m) }

  return (
    <div className="space-y-5">
      {node}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <img src={v.thumbnail_url} alt="" className="hidden w-56 rounded-xl object-cover md:block" style={{ aspectRatio: '16/9' }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          <div>
            <div className="mb-1 flex flex-wrap gap-1"><Badge tone={toneFor.graph(v.graph.graph_type)}>{v.graph.label}</Badge><Badge tone="gray">{LABELS.format[v.video_format]}</Badge><Badge tone={v.source_type === 'original_celebrity' ? 'green' : 'amber'}>{LABELS.sourceType[v.source_type]}</Badge><Badge tone="gray">{LABELS.access[v.access_status]}</Badge><Badge tone="gray">출처 {LABELS.source[v.data_source] || v.data_source}</Badge>{v.is_derived && <ProductStatusBadge status={v.product_status} names={v.product_names} />}{v.is_demo && <Badge tone="red">DEMO</Badge>}</div>
            <h1 className="text-xl font-bold leading-snug tracking-tight">{v.title}</h1>
            <p className="text-sm muted">{v.celebrity_name ? `${v.celebrity_name} · ` : ''}{v.channel_name ? <Link to="/channels" className="underline">{v.channel_name}</Link> : '채널 미확인'} {v.channel_verification && <Badge tone={toneFor.verification(v.channel_verification)}>{LABELS.verification[v.channel_verification]}</Badge>} · {fmt.date(v.published_at)} · {fmt.duration(v.duration_seconds)} · {v.youtube_video_id}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {v.url && <a className="btn-primary" href={v.url} target="_blank" rel="noreferrer">원본 열기 ↗</a>}
          <button className="btn-ghost" onClick={() => act(() => api.refreshStats({ video_ids: [v.id] }).then((j) => { if (j.status === 'failed') throw new Error(j.error || '실패') }), '조회수 갱신(스냅샷 추가)')}>조회수 갱신(API)</button>
          <Confirm onConfirm={() => act(async () => { await api.deleteVideo(v.id); nav('/videos') }, '삭제됨')}>영상 삭제</Confirm>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between"><h2 className="section-title">실제 조회수 그래프</h2><div className="flex gap-2"><button className="btn-ghost text-xs" onClick={() => open('snapshot', { observed_at: new Date().toISOString().slice(0, 16) })}>+ 조회수 관측 입력</button></div></div>
          <ViewGraph points={v.snapshots} analysis={v.graph} height={240} publishedAt={v.published_at} />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricPill label="누적 조회수" value={v.view_count} band={v.stats_updated_at ? `${fmt.datetime(v.stats_updated_at)} 기준` : undefined} />
            <MetricPill label="좋아요" value={v.like_count} /><MetricPill label="댓글" value={v.comment_count} />
            <MetricPill label="게시 후 경과" value={fmt.daysAgo(v.published_at)} band="일" />
            <MetricPill label="Outlier" value={v.outlier} band={v.outlier_band ? `${v.outlier_band} (운영 기준)` : undefined} />
            <MetricPill label="VPH" value={v.vph} basis={v.vph_basis} band={v.vph_band ? `${v.vph_band} (운영 기준)` : undefined} />
            <MetricPill label="최근 7일 증가" value={v.graph.growth_7d} missing="데이터 부족" /><MetricPill label="최근 28일 증가" value={v.graph.growth_28d} missing="데이터 부족" />
          </div>
          <div className="mt-3 flex items-center justify-between"><h3 className="text-sm font-semibold">vidIQ·외부 지표 이력</h3><button className="btn-ghost text-xs" onClick={() => open('metric', { metric_type: 'outlier', basis: 'unspecified', source: 'vidiq_manual' })}>+ 지표 입력</button></div>
          {v.metric_history.length === 0 ? <p className="text-xs muted">입력된 지표가 없습니다. 미확인 값은 0이 아니라 '미확인'으로 저장됩니다.</p> : (
            <table className="mt-1 w-full text-xs"><thead><tr><th className="th">지표</th><th className="th">값</th><th className="th">측정 기준</th><th className="th">출처</th><th className="th">측정 시각</th><th className="th"></th></tr></thead><tbody>
              {v.metric_history.slice().reverse().map((m) => <tr key={m.id} className="border-t border-stone-100 dark:border-stone-800"><td className="td">{m.metric_type}</td><td className="td tabular-nums">{m.value === null ? <span className="muted">미확인</span> : m.value}</td><td className="td">{m.metric_type !== 'vph' ? '—' : m.basis === 'unspecified' ? '기준 미확인' : m.basis}</td><td className="td">{LABELS.source[m.source] || m.source}</td><td className="td">{fmt.datetime(m.measured_at)}</td><td className="td"><button className="text-red-600 hover:underline" onClick={() => act(() => api.deleteMetric(v.id, m.id), '삭제')}>삭제</button></td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="card p-4 text-sm">
          <h2 className="section-title mb-2">설명·메모</h2>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs muted">{v.description || '설명 없음'}</p>
          {v.tags && v.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{v.tags.slice(0, 15).map((t) => <Badge key={t} tone="gray">{t}</Badge>)}</div>}
          <Field label="접근 상태"><Select value={v.access_status} onChange={(s) => act(() => api.patchVideo(v.id, { access_status: s }), '저장')} options={Object.entries(LABELS.access) as [string, string][]} /></Field>
          <div className="mt-2"><Field label="원본/재편집 구분"><Select value={v.source_type} onChange={(s) => act(() => api.patchVideo(v.id, { source_type: s }), '저장')} options={Object.entries(LABELS.sourceType) as [string, string][]} /></Field></div>
          <div className="mt-2"><Field label="채널 연결"><Select value={v.channel_id ? String(v.channel_id) : ''} onChange={(s) => act(() => api.patchVideo(v.id, { channel_id: s ? Number(s) : null }), '저장')} placeholder={v.yt_channel_title ? `미등록 채널: ${v.yt_channel_title}` : '미지정'} options={(channels.data || []).map((c) => [String(c.id), c.channel_name])} /></Field></div>
          {v.is_derived && <>
            <div className="mt-2"><Field label="연예인(재편집 쇼츠의 소재)"><Select value={v.celebrity_id ? String(v.celebrity_id) : ''} onChange={(s) => act(() => api.patchVideo(v.id, { celebrity_id: s ? Number(s) : null }), '저장')} placeholder="미지정" options={(celebs.data || []).map((c) => [String(c.id), c.name])} /></Field></div>
            <div className="mt-2"><Field label="원본 영상 연결" hint="이 쇼츠가 어떤 공식 원본 영상을 썼는지. 연결하면 원본 후보의 '바이럴 검증' 근거로 집계됩니다."><Select value={v.original_video_id ? String(v.original_video_id) : ''} onChange={(s) => act(() => api.patchVideo(v.id, { original_video_id: s ? Number(s) : null }), '원본 연결 저장')} placeholder="미연결" options={(originals.data?.items || []).filter((o) => !v.celebrity_id || o.celebrity_name === (celebs.data || []).find((c) => c.id === v.celebrity_id)?.name || o.id === v.original_video_id).map((o) => [String(o.id), `${o.celebrity_name || o.channel_name || ''} · ${o.title.slice(0, 50)}`])} /></Field></div>
            {v.original && <Link to={`/videos/${v.original.id}`} className="mt-1 block text-xs underline">원본: {v.original.title}</Link>}
            <div className="mt-2"><Field label="쇼핑 쇼츠 판정" hint={`규칙 점수 ${v.shopping_score ?? '미계산'}점 · 적중: ${v.shopping_hits.length ? v.shopping_hits.join(', ') : '없음'}`}><Select value={v.is_shopping_manual === null ? '' : String(v.is_shopping_manual)} onChange={(s) => act(() => api.patchVideo(v.id, { is_shopping: s === '' ? null : s === 'true' }), '판정 저장')} placeholder={`자동 (${v.is_shopping === null ? '미판별' : v.is_shopping ? '쇼핑 쇼츠' : '쇼핑 아님'})`} options={[['true', '쇼핑 쇼츠 맞음 (수동)'], ['false', '쇼핑 아님 (수동)']]} /></Field></div>
            {v.discovery_query && <div className="mt-1 text-[11px] muted">검색어로 발견: {v.discovery_query}</div>}
          </>}
          <div className="mt-2"><Field label="메모"><textarea className="input" rows={3} defaultValue={v.notes || ''} onBlur={(e) => e.target.value !== (v.notes || '') && act(() => api.patchVideo(v.id, { notes: e.target.value }), '저장')} /></Field></div>
        </div>
      </div>

      {!v.is_derived && (
        <div className="card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">이 원본 기반 재편집 쇼츠 — 바이럴 검증 <span className="muted text-sm font-normal">({v.derived_shorts.length}개)</span></h2>
            <Link to={`/videos?source_type=reedit_shorts`} className="text-xs underline">재편집 쇼츠 목록</Link>
          </div>
          <p className="mb-2 text-[11px] muted">{v.evidence.note}</p>
          {v.evidence.count > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="gray">합계 조회 {fmt.compact(v.evidence.total_views)}</Badge><Badge tone="gray">최대 {fmt.compact(v.evidence.max_views)}</Badge>
              <Badge tone="gray">최고 Outlier {v.evidence.best_outlier ?? '미확인'}</Badge><Badge tone="gray">최고 VPH {v.evidence.best_vph ?? '미확인'}</Badge>
              {Object.entries(v.evidence.graph_types || {}).map(([k, n]) => <Badge key={k} tone={toneFor.graph(k)}>{LABELS.graph[k]} {n}</Badge>)}
            </div>
          ) : <p className="mb-2 text-xs muted">「영상」 메뉴의 「재편집 쇼츠 검색」으로 찾은 뒤, 각 쇼츠 상세에서 이 영상을 원본으로 연결하고 상품을 확인·연결하세요.</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {v.derived_shorts.map((d) => (
              <Link key={d.id} to={`/videos/${d.id}`} className="rounded-xl border border-stone-200 p-3 text-xs hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800">
                <div className="line-clamp-2 font-medium">{d.title}</div>
                <div className="muted">{d.yt_channel_title || d.channel_name || '채널 미확인'} · {fmt.date(d.published_at)} · 조회 {fmt.compact(d.view_count)} · Outlier {d.outlier ?? '미확인'}</div>
                <div className="mt-1"><ProductStatusBadge status={d.product_status} names={d.product_names} /></div>
                <div className="mt-1"><ViewGraph points={d.sparkline} analysis={d.graph} height={56} compact /></div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="section-title">상품 관련 장면 (타임스탬프)</h2><button className="btn-ghost text-xs" onClick={() => open('segment', { sponsorship_status: 'unknown', verification_status: 'unverified', source: 'manual_check' })}>+ 장면 기록</button></div>
          <p className="mb-2 text-[11px] muted">실제 확인한 장면만 기록합니다. 발언은 원문 그대로 적으세요.</p>
          {v.segments.length === 0 ? <p className="text-sm muted">기록된 장면이 없습니다.</p> : v.segments.map((s) => (
            <div key={s.id} className="mb-2 rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
              <div className="flex flex-wrap items-center gap-1 text-xs">{s.timestamp_url ? <a className="font-mono font-semibold underline" href={s.timestamp_url} target="_blank" rel="noreferrer">{fmt.ts(s.start_seconds)}~{fmt.ts(s.end_seconds)} ↗</a> : <span className="font-mono muted">타임스탬프 미확인</span>}
                {s.content_type_label && <Badge tone="blue">{s.content_type_label}</Badge>}<Badge tone={toneFor.verification(s.verification_status)}>{LABELS.verification[s.verification_status]}</Badge><Badge tone={s.sponsorship_status === 'sponsored' || s.sponsorship_status === 'suspected' ? 'amber' : 'gray'}>{LABELS.sponsorship[s.sponsorship_status]}</Badge><Badge tone="gray">{s.is_recommendation === null ? '추천/언급 미확인' : s.is_recommendation ? '구매 추천' : '단순 언급'}</Badge></div>
              <p className="mt-1 font-medium">{s.quote ? `“${s.quote}”` : <span className="muted">발언 미기록</span>}</p>
              {s.context && <p className="text-xs muted">맥락: {s.context}</p>}
              <div className="mt-1 flex gap-2 text-xs"><button className="underline" onClick={() => open('segment', { ...s, id: s.id, start: fmt.ts(s.start_seconds), end: fmt.ts(s.end_seconds) })}>수정</button><button className="text-red-600 underline" onClick={() => act(() => api.deleteSegment(v.id, s.id), '삭제')}>삭제</button><button className="underline" onClick={() => open('candidate', { segment_id: s.id, content_type: s.content_type || '', channel_category: 'food' })}>이 장면으로 후보 등록</button></div>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="section-title">연결된 상품 {v.is_derived && <ProductStatusBadge status={v.product_status} />}</h2><div className="flex gap-1">{v.is_derived && v.original && v.original_products.length > 0 && <button className="btn-ghost text-xs" title={`원본 영상의 상품 ${v.original_products.length}개를 이 쇼츠에 연결`} onClick={() => act(() => api.copyOriginalProducts(v.id).then((r) => { if (!r.added) throw new Error('추가된 상품 없음(이미 연결됨)') }), '원본 상품 연결')}>원본의 상품 가져오기</button>}<button className="btn-ghost text-xs" onClick={() => open('product', {})}>+ 상품 연결</button></div></div>
          {v.is_derived && v.product_status !== 'confirmed' && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">이 쇼츠가 어떤 상품을 파는지 확인해 연결해야 바이럴 검증 근거로 집계됩니다. 아래 설명란 링크와 영상 내용을 보고 상품을 등록·연결하세요. 상품 확인 상태가 '정확한 상품' 또는 '브랜드만 확인'이어야 인정됩니다.</p>}
          {v.is_derived && <div className="mb-3"><ProductLinks video={v} defaultCategory="food" onChanged={() => q.reload()} /></div>}
          {v.is_derived && v.description_links.length > 0 && (
            <div className="mb-3 rounded-xl border border-stone-200 p-2 text-xs dark:border-stone-800">
              <div className="mb-1 font-semibold">설명란 링크 {v.description_links.filter((l) => l.is_shopping_link).length > 0 && <Badge tone="blue">구매 링크 {v.description_links.filter((l) => l.is_shopping_link).length}</Badge>}</div>
              <ul className="space-y-0.5">{v.description_links.map((l) => <li key={l.url} className="truncate"><a className={`underline ${l.is_shopping_link ? 'font-medium' : 'muted'}`} href={l.url} target="_blank" rel="noreferrer">{l.host}</a> <span className="muted">{l.url.slice(0, 70)}</span></li>)}</ul>
            </div>
          )}
          <div className="mb-3 rounded-xl border border-stone-200 p-3 text-xs dark:border-stone-800">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">AI 상품 추정 <span className="muted font-normal">(썸네일·설명·태그·구매 링크 + 올린 캡처 이미지)</span></span>
              <div className="flex gap-1">
                <button className="btn-ghost px-2 py-1" disabled={aiBusy} onClick={async () => { setAiBusy(true); try { const r = await api.identifyProduct(v.id, [], true); toast(r.suggestions.length ? `AI 추정 ${r.suggestions.length}건` : 'AI: 상품을 특정하지 못함'); q.reload() } catch (e: any) { toast(e.message, 'err') } finally { setAiBusy(false) } }}>{aiBusy ? '추정 중…' : '썸네일로 추정'}</button>
                <input ref={capRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return; setAiBusy(true); try { const r = await api.identifyProduct(v.id, files, true); toast(r.suggestions.length ? `AI 추정 ${r.suggestions.length}건` : 'AI: 상품을 특정하지 못함'); q.reload() } catch (e2: any) { toast(e2.message, 'err') } finally { setAiBusy(false) } }} />
                <button className="btn-primary px-2 py-1" disabled={aiBusy} onClick={() => capRef.current?.click()}>캡처 이미지 올려 추정</button>
                <button className="btn-ghost px-2 py-1" onClick={() => setCapture(true)}>캡처로 상품 조사(검색 링크)</button>
              </div></div>
            <p className="muted">영상을 보다가 제품이 나오는 장면을 <b>캡처(Win+Shift+S)</b>해 올리면 그 화면으로 추정합니다. 결과는 추정일 뿐이며 '유사 상품 후보'로 등록되고, 사람이 확인해 상태를 바꿔야 '확인됨'이 됩니다. Claude API 키가 필요합니다.</p>
            {v.ai_product_suggestions && (
              <div className="mt-2 space-y-2">
                {!v.ai_product_suggestions.video_is_shopping && <p className="text-amber-700 dark:text-amber-300">AI 판단: 상품 판매와 무관한 영상으로 보임. {v.ai_product_suggestions.notes}</p>}
                {v.ai_product_suggestions.suggestions.map((sg: AISuggestion, i: number) => (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60">
                    <div><div className="font-medium">{sg.brand ? `${sg.brand} ` : ''}{sg.name} <Badge tone={sg.confidence === 'high' ? 'green' : sg.confidence === 'medium' ? 'amber' : 'gray'}>확신 {sg.confidence}</Badge> <Badge tone="gray">{sg.category === 'unknown' ? '분류 미정' : LABELS.category[sg.category]}{sg.subcategory ? ` · ${sg.subcategory}` : ''}</Badge></div>
                      <div className="muted">근거: {sg.evidence} · {sg.reasoning}</div></div>
                    <button className="btn-ghost shrink-0 px-2 py-1" onClick={() => { const cat = sg.category === 'unknown' ? (prompt('분류를 입력하세요: beauty / living / food', 'food') as any) : sg.category; if (!['beauty', 'living', 'food'].includes(cat)) return; act(() => api.adoptSuggestion(v.id, { name: sg.name, brand: sg.brand || null, category: cat, subcategory: sg.subcategory || null, evidence: sg.evidence }), '유사 상품 후보로 등록·연결') }}>후보로 등록·연결</button>
                  </div>
                ))}
                {v.ai_product_suggestions.video_is_shopping && v.ai_product_suggestions.suggestions.length === 0 && <p className="muted">상품을 특정하지 못했습니다. {v.ai_product_suggestions.notes}</p>}
                <div className="muted">{v.ai_product_suggestions.model} · 이미지: {(v.ai_product_suggestions.image_sources || []).map((x) => x === 'thumbnail' ? '썸네일' : '캡처').join(', ') || '없음'} · {v.ai_product_suggestions.disclaimer}</div>
              </div>
            )}
          </div>
          {v.products.length === 0 ? <p className="text-sm muted">연결된 상품이 없습니다. 상품 메뉴에서 등록한 뒤 연결하세요.</p> : v.products.map((p) => (
            <div key={p.mention_id} className="mb-2 flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
              <div><div className="font-medium">{p.brand} {p.name}</div><div className="flex gap-1 text-xs"><Badge tone={toneFor.category(p.category)}>{LABELS.category[p.category]}</Badge><Badge tone={toneFor.identification(p.identification_status)}>{LABELS.identification[p.identification_status]}</Badge>{p.segment_id && <Badge tone="gray">장면 #{p.segment_id}</Badge>}</div></div>
              <div className="flex gap-2 text-xs"><button className="underline" onClick={() => open('candidate', { product_id: p.id, segment_id: p.segment_id || '', channel_category: p.category })}>후보 등록</button><button className="text-red-600 underline" onClick={() => act(() => api.deleteMention(p.mention_id!), '연결 해제')}>해제</button></div>
            </div>
          ))}
          <div className="mt-4 mb-2 flex items-center justify-between"><h2 className="section-title">소싱 후보</h2><button className="btn-primary text-xs" onClick={() => open('candidate', { channel_category: 'food' })}>+ 후보 등록</button></div>
          {v.candidates.length === 0 ? <p className="text-sm muted">후보 없음</p> : v.candidates.map((c) => <Link key={c.id} to={`/candidates/${c.id}`} className="mb-1 flex items-center justify-between rounded-xl border border-stone-200 p-2 text-sm hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800"><span><Badge tone={toneFor.category(c.channel_category)}>{LABELS.category[c.channel_category]}</Badge> {c.product_name || '상품 미확인'} · {c.content_type_label || '유형 미지정'}</span><span className="text-xs">{c.score ?? '점수 없음'} · {LABELS.status[c.status]}</span></Link>)}
        </div>
      </div>

      <CaptureInvestigateModal open={capture} onClose={() => setCapture(false)} videoId={v.id} onAdopt={async (it, cat) => { await api.adoptSuggestion(v.id, { name: it.name, brand: it.brand || null, category: cat, subcategory: it.model_or_option || null, evidence: it.evidence }); q.reload() }} />
      <Modal open={modal === 'snapshot'} onClose={() => setModal(null)} title="조회수 관측 입력">
        <div className="space-y-3">
          <Field label="관측 시각" hint="과거 그래프를 추측해 채우지 마세요. 실제로 확인한 시각과 조회수만 입력합니다."><input type="datetime-local" className="input" value={form.observed_at || ''} onChange={(e) => setForm({ ...form, observed_at: e.target.value })} /></Field>
          <Field label="조회수"><input className="input" value={form.view_count || ''} onChange={(e) => setForm({ ...form, view_count: e.target.value })} /></Field>
          <Field label="출처"><Select value={form.source || 'manual'} onChange={(s) => setForm({ ...form, source: s })} options={[['manual', '수동 입력(직접 확인)'], ['vidiq_manual', 'vidIQ 화면에서 확인'], ['imported_series', '가져온 시계열']]} /></Field>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => act(() => api.addSnapshot(v.id, { observed_at: form.observed_at, view_count: Number(form.view_count), source: form.source || 'manual' }), '관측 저장')}>저장</button></div>
        </div>
      </Modal>
      <Modal open={modal === 'metric'} onClose={() => setModal(null)} title="vidIQ 지표 입력">
        <div className="space-y-3">
          <Field label="지표"><Select value={form.metric_type} onChange={(s) => setForm({ ...form, metric_type: s })} options={[['outlier', 'Outlier(배)'], ['vph', 'VPH'], ['views_last_hour', '최근 1시간 조회수 증가'], ['growth_7d', '최근 7일 성장률'], ['growth_28d', '최근 28일 성장률'], ['engagement_rate', '참여율'], ['keyword_demand', '키워드 검색 수요']]} /></Field>
          <Field label="값 (비우면 '미확인'으로 저장, 0과 구분)"><input className="input" value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
          {form.metric_type === 'vph' && <Field label="VPH 측정 기준"><Select value={form.basis} onChange={(s) => setForm({ ...form, basis: s })} options={[['unspecified', '기준 미확인(vidIQ 화면 값)'], ['overall', '게시 후 전체 기간 평균'], ['recent', '최근 측정 구간'], ['last_hour', '최근 1시간 증가량']]} /></Field>}
          <Field label="출처"><Select value={form.source} onChange={(s) => setForm({ ...form, source: s })} options={[['vidiq_manual', 'vidIQ 화면 수동 입력'], ['computed', '직접 계산'], ['youtube_api', 'YouTube']]} /></Field>
          <Field label="메모"><input className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => act(() => api.addMetric(v.id, { metric_type: form.metric_type, value: form.value === '' || form.value === undefined ? null : Number(form.value), basis: form.basis || 'unspecified', source: form.source, note: form.note }), '지표 저장')}>저장</button></div>
        </div>
      </Modal>
      <Modal open={modal === 'segment'} onClose={() => setModal(null)} title={form.id ? '장면 수정' : '상품 관련 장면 기록'}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작 (mm:ss)"><input className="input" value={form.start || ''} onChange={(e) => setForm({ ...form, start: e.target.value })} placeholder="08:15" /></Field>
          <Field label="종료 (mm:ss)"><input className="input" value={form.end || ''} onChange={(e) => setForm({ ...form, end: e.target.value })} placeholder="08:42" /></Field>
          <div className="col-span-2"><Field label="연예인 실제 발언 (원문 그대로)"><textarea className="input" rows={2} value={form.quote || ''} onChange={(e) => setForm({ ...form, quote: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="언급 당시 맥락"><input className="input" value={form.context || ''} onChange={(e) => setForm({ ...form, context: e.target.value })} /></Field></div>
          <Field label="콘텐츠 유형"><Select value={form.content_type || ''} onChange={(s) => setForm({ ...form, content_type: s })} placeholder="미지정" options={CT} /></Field>
          <Field label="광고·협찬"><Select value={form.sponsorship_status} onChange={(s) => setForm({ ...form, sponsorship_status: s })} options={Object.entries(LABELS.sponsorship) as [string, string][]} /></Field>
          <Field label="추천/언급"><Select value={form.is_recommendation === null || form.is_recommendation === undefined ? '' : String(form.is_recommendation)} onChange={(s) => setForm({ ...form, is_recommendation: s === '' ? null : s === 'true' })} placeholder="미확인" options={[['true', '구매 추천'], ['false', '단순 언급']]} /></Field>
          <Field label="검증 상태"><Select value={form.verification_status} onChange={(s) => setForm({ ...form, verification_status: s })} options={[['unverified', '검증 전'], ['confirmed', '확인 완료'], ['needs_review', '재확인 필요']]} /></Field>
          <Field label="확인 방법"><Select value={form.source} onChange={(s) => setForm({ ...form, source: s })} options={[['manual_check', '영상 직접 확인'], ['captions', '자막'], ['description_only', '영상 설명'], ['user_provided', '사용자 제공 자료'], ['ai_extracted', 'AI 추출(재확인 필요)']]} /></Field>
          <div className="col-span-2 flex justify-end"><button className="btn-primary" onClick={() => { const body = { start_seconds: toSec(form.start), end_seconds: toSec(form.end), quote: form.quote || null, context: form.context || null, content_type: form.content_type || null, sponsorship_status: form.sponsorship_status, is_recommendation: form.is_recommendation ?? null, verification_status: form.verification_status, source: form.source }; act(() => form.id ? api.patchSegment(v.id, form.id, body) : api.addSegment(v.id, body), '장면 저장') }}>저장</button></div>
        </div>
      </Modal>
      <Modal open={modal === 'product'} onClose={() => setModal(null)} title="상품 연결">
        <div className="space-y-3">
          <Field label="상품"><Select value={form.product_id || ''} onChange={(s) => setForm({ ...form, product_id: s })} placeholder="선택" options={(products.data || []).map((p) => [String(p.id), `${p.brand || ''} ${p.name} (${LABELS.category[p.category]} · ${LABELS.identification[p.identification_status]})`])} /></Field>
          <Field label="장면(선택)"><Select value={form.segment_id || ''} onChange={(s) => setForm({ ...form, segment_id: s })} placeholder="없음" options={v.segments.map((s) => [String(s.id), `${fmt.ts(s.start_seconds)} ${s.quote?.slice(0, 30) || ''}`])} /></Field>
          <p className="text-xs muted">상품이 목록에 없으면 <Link to="/products" className="underline">상품 메뉴</Link>에서 먼저 등록하세요.</p>
          <div className="flex justify-end"><button className="btn-primary" disabled={!form.product_id} onClick={() => act(() => api.addMention({ video_id: v.id, product_id: Number(form.product_id), segment_id: form.segment_id ? Number(form.segment_id) : null }), '연결 완료')}>연결</button></div>
        </div>
      </Modal>
      <Modal open={modal === 'candidate'} onClose={() => setModal(null)} title="소싱 후보 등록">
        <div className="space-y-3">
          <Field label="채널 카테고리 *"><Select value={form.channel_category} onChange={(s) => setForm({ ...form, channel_category: s })} options={Object.entries(LABELS.category) as [string, string][]} /></Field>
          <Field label="상품"><Select value={form.product_id ? String(form.product_id) : ''} onChange={(s) => setForm({ ...form, product_id: s })} placeholder="미확인(나중에 연결)" options={v.products.map((p) => [String(p.id), `${p.brand || ''} ${p.name}`])} /></Field>
          <Field label="장면"><Select value={form.segment_id ? String(form.segment_id) : ''} onChange={(s) => setForm({ ...form, segment_id: s })} placeholder="없음" options={v.segments.map((s) => [String(s.id), `${fmt.ts(s.start_seconds)} ${s.quote?.slice(0, 30) || ''}`])} /></Field>
          <Field label="콘텐츠 유형"><Select value={form.content_type || ''} onChange={(s) => setForm({ ...form, content_type: s })} placeholder="미지정" options={CT} /></Field>
          <Field label="후킹 아이디어"><textarea className="input" rows={2} value={form.hook_idea || ''} onChange={(e) => setForm({ ...form, hook_idea: e.target.value })} /></Field>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => act(() => api.createCandidate({ video_id: v.id, channel_category: form.channel_category, product_id: form.product_id ? Number(form.product_id) : null, segment_id: form.segment_id ? Number(form.segment_id) : null, content_type: form.content_type || null, hook_idea: form.hook_idea || null }).then((c) => nav(`/candidates/${c.id}`)), '후보 등록')}>등록</button></div>
        </div>
      </Modal>
    </div>
  )
}
