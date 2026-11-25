import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Confirm, ErrorBox, Field, MetricPill, ProductStatusBadge, Select, Spinner, toneFor, useToast } from '../components/ui'
import ViewGraph from '../components/ViewGraph'
import OfferSearchModal from '../components/OfferSearch'
import CaptureInvestigateModal from '../components/CaptureInvestigate'
import ProductLinks from '../components/ProductLinks'
import MetricBlock from '../components/MetricBlock'
import type { CandidateDetail as CD, OriginalMatch, Score, SegmentProposal } from '../types'

export default function CandidateDetail() {
  const { id } = useParams()
  const cid = Number(id)
  const nav = useNavigate()
  const q = useAsync(() => api.candidate(cid), [cid])
  const meta = useAsync(() => api.candidateMeta())
  const originals = useAsync(() => api.videos({ source_type: 'original_celebrity', limit: 500, sort: 'view_count', with_graph: false }))
  const products = useAsync(() => api.products())
  const celebs = useAsync(() => api.celebrities())
  const { toast, node } = useToast()
  const c = q.data
  const cfg = meta.data?.scoring
  const [scores, setScores] = useState<Record<string, string>>({})
  const [rationale, setRationale] = useState<Record<string, string>>({})
  const [target, setTarget] = useState(25)
  const [aiBusy, setAiBusy] = useState(false)
  const [offerSearch, setOfferSearch] = useState(false)
  const [capture, setCapture] = useState(false)
  const [prodUrl, setProdUrl] = useState('')
  const [om, setOm] = useState<OriginalMatch | null>(null)
  const [prop, setProp] = useState<SegmentProposal | null>(null)
  const [origUrl, setOrigUrl] = useState('')
  const [finding, setFinding] = useState<'' | 'original' | 'segment'>('')
  const findOriginal = async () => { setFinding('original'); try { const r = await api.findOriginal(cid, true); setOm(r.match); toast(r.match.linked ? `원본 자동 연결(${r.match.confidence}) — ${r.match.reason}` : r.match.candidates.length ? `후보 ${r.match.candidates.length}개 — 아래에서 골라 연결하세요` : (r.match.reason || '원본을 찾지 못했습니다'), r.match.linked ? 'ok' : 'err'); q.reload() } catch (e: any) { toast(e.message, 'err') } finally { setFinding('') } }
  const findSegment = async (adopt: boolean) => { setFinding('segment'); try { const r = await api.findSegment(cid, adopt); setProp(r.proposal); if (r.proposal.status === 'found') toast(adopt ? `장면 저장: ${r.proposal.range_label}` : `구간 찾음: ${r.proposal.range_label}`); else toast(r.proposal.note || '구간을 찾지 못했습니다', 'err'); if (adopt) q.reload() } catch (e: any) { toast(e.message, 'err') } finally { setFinding('') } }

  useEffect(() => {
    if (!c || !cfg) return
    const base = c.scores.human || (c.scores.ai && c.scores.ai.total !== null ? c.scores.ai : null) || c.scores.rule || c.scores.ai
    const s: Record<string, string> = {}, r: Record<string, string> = {}
    cfg.items.forEach((i) => { s[i.key] = base?.item_scores[i.key] === null || base?.item_scores[i.key] === undefined ? '' : String(base.item_scores[i.key]); r[i.key] = base?.rationale?.[i.key] || '' })
    setScores(s); setRationale(r)
  }, [c?.id, c?.scores.human?.id, c?.scores.ai?.id, c?.scores.rule?.id, cfg])

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
          <p className="text-sm muted">{c.is_short_candidate && <Badge tone="amber">재편집 쇼츠</Badge>} {c.celebrity_name || '연예인 미지정'} · {v.channel_name || v.yt_channel_title || '채널 미확인'} · {fmt.date(v.published_at)} · {fmt.duration(v.duration_seconds)} · 조회 {fmt.compact(v.view_count)} · <Link className="underline" to={`/videos/${v.id}`}>영상 상세</Link></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${c.produced_at ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : 'border-stone-300 dark:border-stone-700'}`}>
            <input type="checkbox" checked={!!c.produced_at} onChange={(e) => act(() => api.setProduced(c.id, { produced: e.target.checked, produced_url: prodUrl || null }), e.target.checked ? '제작 완료로 표시' : '제작 표시 해제')} />
            {c.produced_at ? <span>✓ 제작함 · {fmt.date(c.produced_at)}{c.produced_url && <> · <a className="underline" href={c.produced_url} target="_blank" rel="noreferrer">내 쇼츠</a></>}</span> : <span>이 후보로 영상 만들었음</span>}
          </label>
          {!c.produced_at && <input className="input w-56" placeholder="올린 쇼츠 URL(선택)" value={prodUrl} onChange={(e) => setProdUrl(e.target.value)} />}
          {v.url && <a className="btn-ghost" href={v.url} target="_blank" rel="noreferrer">원본 영상 열기 ↗</a>}
          {c.segment?.timestamp_url ? <a className="btn-primary" href={c.segment.timestamp_url} target="_blank" rel="noreferrer">▶ 원본 장면 보기 {c.segment.range_label || fmt.ts(c.segment.start_seconds)} ↗</a> : c.is_short_candidate && (c.original_video ? <button className="btn-primary" disabled={finding === 'segment'} onClick={() => findSegment(true)}>{finding === 'segment' ? '구간 찾는 중…' : '원본 장면(몇 분~몇 초) 자동 찾기'}</button> : <button className="btn-primary" disabled={finding === 'original'} onClick={findOriginal}>{finding === 'original' ? '원본 찾는 중…' : '진짜 원본 영상 찾기'}</button>)}
          <Confirm onConfirm={() => act(async () => { await api.deleteCandidate(c.id); nav('/candidates') }, '삭제됨')}>후보 삭제</Confirm>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="section-title mb-2">실제 조회수 그래프</h2>
          <ViewGraph points={v.snapshots} analysis={v.graph} height={220} publishedAt={v.published_at} />
          <MetricBlock v={v} onChanged={() => q.reload()} extra={<MetricPill label="최근 7일 증가" value={v.graph.growth_7d} missing="데이터 부족" />} />
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-2">연예인 실제 발언·장면 {c.is_short_candidate && <span className="muted text-xs font-normal">(원본 영상 기준)</span>}</h2>
          {c.segment ? (
            <div className="space-y-2 text-sm">
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60">
                <div className="text-[11px] muted">{fmt.ts(c.segment.start_seconds)} ~ {fmt.ts(c.segment.end_seconds)} · <Badge tone={toneFor.verification(c.segment.verification_status)}>{LABELS.verification[c.segment.verification_status]}</Badge> · 근거 {c.segment.source === 'captions' ? '자막' : c.segment.source === 'description_only' ? '설명란 챕터' : c.segment.source === 'ai_extracted' ? 'AI' : '직접 확인'}{c.segment.timestamp_url && <> · <a className="underline" href={c.segment.timestamp_url} target="_blank" rel="noreferrer">여기서 재생 ↗</a></>}</div>
                <p className="mt-1 font-medium">{c.segment.quote ? `“${c.segment.quote}”` : <span className="muted">실제 발언 미기록</span>}</p>
                {c.segment.context && <p className="mt-1 text-xs muted">맥락: {c.segment.context}</p>}
              </div>
              <div className="flex flex-wrap gap-1"><Badge tone={c.segment.sponsorship_status === 'sponsored' || c.segment.sponsorship_status === 'suspected' ? 'amber' : 'gray'}>{LABELS.sponsorship[c.segment.sponsorship_status]}</Badge><Badge tone="gray">{c.segment.is_recommendation === null ? '추천/언급 미확인' : c.segment.is_recommendation ? '구매 추천' : '단순 언급'}</Badge><Badge tone="gray">{LABELS.access[v.access_status]}</Badge></div>
            </div>
          ) : <p className="text-sm muted">연결된 장면이 없습니다. {c.original_video ? '위의 「원본 장면 자동 찾기」를 누르거나, 아래 원본 영상 카드에서 구간을 확인하세요.' : '먼저 원본 영상을 찾아 연결하세요.'}</p>}
          <h2 className="section-title mb-2 mt-4">바이럴 검증 {c.is_short_candidate ? <span className="muted text-xs font-normal">(원본에 연결된 상품 확인 쇼츠 기준)</span> : <span className="muted text-xs font-normal">(재편집 쇼츠)</span>}</h2>
          <p className="mb-1 text-[11px] muted">{c.evidence.note}</p>
          {c.evidence.count > 0 ? (
            <div className="flex flex-wrap gap-1 text-xs">
              <Badge tone="gray">상품 확인 쇼츠 {c.evidence.count}개{c.evidence.unconfirmed_count ? ` (미확인 ${c.evidence.unconfirmed_count} 제외)` : ''}</Badge><Badge tone="gray">합계 조회 {fmt.compact(c.evidence.total_views)}</Badge>
              <Badge tone="gray">최고 Outlier {c.evidence.best_outlier ?? '미확인'}</Badge>
              {Object.entries(c.evidence.graph_types || {}).map(([k, n]) => <Badge key={k} tone={toneFor.graph(k)}>{LABELS.graph[k]} {n}</Badge>)}
              <Link to={`/videos/${c.original_video ? c.original_video.id : v.id}`} className="underline">목록 보기</Link>
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
              <button className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={() => setOfferSearch(true)}>판매처 조회(네이버·쿠팡)</button>
            </div>
          ) : <p className="text-sm muted">상품 미연결</p>}
        </div>
      </div>

      {c.is_short_candidate && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="section-title mb-2">원본 영상 {c.original_detail ? <Badge tone="green">연결됨</Badge> : <Badge tone="amber">미연결</Badge>}</h2>
            {c.original_detail ? (
              <div className="flex gap-3">
                <img src={c.original_detail.thumbnail_url} alt="" className="w-40 rounded-lg object-cover" style={{ aspectRatio: '16/9' }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                <div className="min-w-0 text-sm">
                  <Link to={`/videos/${c.original_detail.id}`} className="line-clamp-2 font-semibold hover:underline">{c.original_detail.title}</Link>
                  <div className="text-xs muted">{c.original_detail.celebrity_name} · {c.original_detail.channel_name} <Badge tone={toneFor.verification(c.original_detail.channel_verification)}>{LABELS.verification[c.original_detail.channel_verification || 'unverified']}</Badge> · {fmt.date(c.original_detail.published_at)} · {fmt.duration(c.original_detail.duration_seconds)} · 조회 {fmt.compact(c.original_detail.view_count)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{c.original_detail.url && <a className="btn-ghost px-2 py-1 text-xs" href={c.original_detail.url} target="_blank" rel="noreferrer">원본 열기 ↗</a>}<button className="btn-ghost px-2 py-1 text-xs" onClick={() => act(() => api.patchVideo(v.id, { original_video_id: null }), '원본 연결 해제')}>연결 해제</button><button className="btn-ghost px-2 py-1 text-xs" disabled={finding === 'segment'} onClick={() => findSegment(false)}>{finding === 'segment' ? '찾는 중…' : '장면 구간 찾기(미리보기)'}</button></div>
                  {c.original_match?.reason && <p className="mt-1 text-[11px] muted">연결 근거: {c.original_match.confidence === 'manual' ? '사용자 직접 연결' : `${c.original_match.reason} (확신도 ${c.original_match.confidence})`}</p>}
                  {prop && <div className="mt-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60">{prop.status === 'found' ? <><div className="font-semibold">제안 구간 {prop.range_label} <span className="muted font-normal">· 근거 {prop.basis === 'chapters' ? '설명란 챕터' : prop.basis === 'transcript+ai' ? '자막 + AI 검토' : '자막'}</span></div>{prop.quote && <p className="mt-1">“{prop.quote.slice(0, 300)}”</p>}<p className="muted mt-1">{prop.note}</p><div className="mt-1 flex gap-1">{prop.link && <a className="btn-ghost px-2 py-1" href={prop.link} target="_blank" rel="noreferrer">여기서 재생 ↗</a>}<button className="btn-primary px-2 py-1" onClick={() => act(() => api.adoptSegment(c.id, { start_seconds: prop.start!, end_seconds: prop.end ?? null, quote: prop.quote ?? null, basis: prop.basis, note: prop.note }), '장면 저장·연결')}>이 구간으로 저장</button></div></> : <><p>{prop.note}</p>{prop.needs_transcript && prop.transcript_request && <button className="btn-ghost mt-1 px-2 py-1" onClick={() => navigator.clipboard.writeText(prop.transcript_request!).then(() => toast('자막 요청 문구 복사됨 — vidIQ 연결된 채팅에 붙여넣고, 받은 JSON을 「데이터 수집 → vidIQ JSON 업로드」에 올리세요'))}>원본 자막 요청 문구 복사(vidIQ)</button>}</>}</div>}
                  {!c.original_has_transcript && !prop && <p className="mt-1 text-[11px] muted">원본 자막 없음 — 구간 찾기는 설명란 챕터로만 시도합니다. 자막은 「데이터 수집·가져오기 → vidIQ 자막 요청」으로 받아 올릴 수 있습니다.</p>}
                  <div className="mt-2"><Field label="원본 장면(발언·타임스탬프) 선택" hint="원본 영상 상세에서 장면을 기록한 뒤 여기서 고릅니다."><Select value={c.segment_id ? String(c.segment_id) : ''} onChange={(sid) => act(() => api.patchCandidate(c.id, { segment_id: sid ? Number(sid) : null }), '장면 연결')} placeholder={c.original_detail.segments.length ? '선택' : '기록된 장면 없음'} options={c.original_detail.segments.map((sg) => [String(sg.id), `${fmt.ts(sg.start_seconds)} ${sg.quote?.slice(0, 40) || '(발언 미기록)'}`])} /></Field></div>
                </div>
              </div>
            ) : (
              <div className="text-sm">
                <p className="mb-2 text-xs muted">이 쇼츠가 어떤 공식 원본 영상을 썼는지 연결하세요. 「진짜 원본 영상 찾기」는 설명란 출처 링크 → 제목·해시태그의 연예인 채널에서 수집된 영상 단어 일치 → 채널 안 YouTube 검색(할당량 100/회) → AI 재검토 순으로 찾습니다.</p>
                <div className="mb-2 flex flex-wrap gap-1"><button className="btn-primary px-2 py-1 text-xs" disabled={finding === 'original'} onClick={findOriginal}>{finding === 'original' ? '찾는 중…' : '진짜 원본 영상 찾기'}</button><input className="input w-64 text-xs" placeholder="원본 유튜브 URL 직접 입력" value={origUrl} onChange={(e) => setOrigUrl(e.target.value)} /><button className="btn-ghost px-2 py-1 text-xs" disabled={!origUrl} onClick={() => act(() => api.linkOriginal(c.id, { url_or_id: origUrl }), '원본 연결')}>이 URL로 연결</button></div>
                {(om || c.original_match) && (() => { const m = om || c.original_match!; return <div className="mb-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60"><div className="muted">{m.reason} {m.celebrities?.length ? `· 인식된 연예인: ${m.celebrities.join(', ')}` : ''} {m.api_searches ? `· YouTube 검색 ${m.api_searches}회` : ''}</div>{m.notes?.map((n, i) => <div key={i} className="text-amber-700 dark:text-amber-300">{n}</div>)}{m.candidates.map((o) => <div key={o.video_id} className="mt-1 flex items-center gap-2 border-t border-stone-200 pt-1 dark:border-stone-700">{o.thumbnail_url && <img src={o.thumbnail_url} alt="" className="h-9 w-16 rounded object-cover" />}<div className="min-w-0 flex-1"><div className="line-clamp-1 font-medium">{o.title}</div><div className="muted">{o.channel} · {fmt.date(o.published_at)} · {fmt.duration(o.duration_seconds)} · 일치 {o.hits.join(', ') || '없음'} · 점수 {o.score}</div></div>{o.url && <a className="underline" href={o.url} target="_blank" rel="noreferrer">열기</a>}<button className="btn-primary px-2 py-0.5" onClick={() => act(() => api.linkOriginal(c.id, { video_id: o.video_id }), '원본 연결')}>이 영상이 원본</button></div>)}</div> })()}
                <Field label="연예인"><Select value={v.celebrity_id ? String(v.celebrity_id) : ''} onChange={(s) => act(() => api.patchVideo(v.id, { celebrity_id: s ? Number(s) : null }), '저장')} placeholder="미지정" options={(celebs.data || []).map((x) => [String(x.id), x.name])} /></Field>
                <div className="mt-2"><Field label="원본 영상"><Select value="" onChange={(s) => s && act(() => api.patchVideo(v.id, { original_video_id: Number(s) }), '원본 연결')} placeholder="선택" options={(originals.data?.items || []).filter((o) => !v.celebrity_id || o.celebrity_name === (celebs.data || []).find((x) => x.id === v.celebrity_id)?.name).map((o) => [String(o.id), `${o.celebrity_name || o.channel_name || ''} · ${o.title.slice(0, 50)}`])} /></Field></div>
              </div>
            )}
          </div>
          <div className="card p-4">
            <h2 className="section-title mb-2">이 쇼츠의 상품 <ProductStatusBadge status={c.video_product_status} /></h2>
            <p className="mb-2 text-[11px] muted">「오늘 소싱 실행」이 후보 쇼츠의 상품을 AI로 추정해 확신도 중간 이상이면 '유사 상품 후보'로 자동 연결합니다. 사람이 확인해 '정확한 상품 확인'으로 바꿔야 인정됩니다.</p>
            {v.products.length > 0 ? (
              <ul className="space-y-1 text-sm">{v.products.map((p) => <li key={p.mention_id} className="flex items-center justify-between rounded-lg border border-stone-200 p-2 dark:border-stone-800"><span>{p.brand} {p.name} <Badge tone={toneFor.identification(p.identification_status)}>{LABELS.identification[p.identification_status]}</Badge></span><div className="flex gap-2 text-xs">{c.product_id !== p.id && <button className="underline" onClick={() => act(() => api.patchCandidate(c.id, { product_id: p.id }), '후보 상품으로 지정')}>후보 상품으로</button>}{c.product_id === p.id && <Badge tone="blue">후보 상품</Badge>}</div></li>)}</ul>
            ) : <p className="text-sm muted">상품이 연결되지 않았습니다.</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              <button className="btn-primary px-2 py-1 text-xs" disabled={aiBusy} onClick={async () => { setAiBusy(true); try { const r = await api.identifyProduct(v.id, [], true); toast(r.suggestions.length ? `AI 추정 ${r.suggestions.length}건 — 아래에서 등록·연결하세요` : 'AI: 상품을 특정하지 못함'); q.reload() } catch (e: any) { toast(e.message, 'err') } finally { setAiBusy(false) } }}>{aiBusy ? '추정 중…' : 'AI로 상품 찾기(썸네일·설명)'}</button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCapture(true)}>캡처로 상품 조사(쿠팡·네이버 검색)</button>
              <Link to={`/videos/${v.id}`} className="btn-ghost px-2 py-1 text-xs">쇼츠 상세 →</Link>
              {c.original_detail && c.original_detail.products.length > 0 && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act(() => api.copyOriginalProducts(v.id), '원본 상품 연결')}>원본의 상품 가져오기</button>}
            </div>
            <div className="mt-2"><Field label="등록된 상품 바로 연결"><Select value="" onChange={(pid) => pid && act(() => api.addMention({ video_id: v.id, product_id: Number(pid) }).then(() => api.patchCandidate(c.id, { product_id: Number(pid) })), '상품 연결')} placeholder="선택" options={(products.data || []).map((p) => [String(p.id), `${p.brand || ''} ${p.name} (${LABELS.identification[p.identification_status]})`])} /></Field></div>
            <div className="mt-2"><ProductLinks video={v} defaultCategory={c.channel_category} onChanged={() => q.reload()} /></div>
            {v.ai_product_suggestions && v.ai_product_suggestions.suggestions.length > 0 && (
              <div className="mt-2 text-xs">
                <div className="font-semibold">AI 추정 결과 <span className="muted font-normal">({v.ai_product_suggestions.model})</span></div>
                {v.ai_product_suggestions.suggestions.map((sg, i) => {
                  const already = v.products.some((p) => p.name === sg.name)
                  return (
                    <div key={i} className="mt-1 flex items-start justify-between gap-2 rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60">
                      <div><span className="font-medium">{sg.brand ? `${sg.brand} ` : ''}{sg.name}</span> <Badge tone={sg.confidence === 'high' ? 'green' : sg.confidence === 'medium' ? 'amber' : 'gray'}>확신 {sg.confidence}</Badge> <Badge tone="gray">{sg.category === 'unknown' ? '분류 미정' : LABELS.category[sg.category]}</Badge><div className="muted">근거: {sg.evidence}</div></div>
                      {already ? <Badge tone="green">연결됨</Badge> : <button className="btn-ghost shrink-0 px-2 py-1" onClick={() => { const cat = sg.category === 'unknown' ? (prompt('분류를 입력하세요: beauty / living / food', c.channel_category) as any) : sg.category; if (!['beauty', 'living', 'food'].includes(cat)) return; act(() => api.adoptSuggestion(v.id, { name: sg.name, brand: sg.brand || null, category: cat, subcategory: sg.subcategory || null, evidence: sg.evidence }).then((p) => api.patchCandidate(c.id, { product_id: p.id })), '유사 상품 후보로 등록·연결') }}>등록·연결</button>}
                    </div>
                  )
                })}
              </div>
            )}
            {v.ai_product_suggestions && !v.ai_product_suggestions.video_is_shopping && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">AI 판단: 상품 판매와 무관한 영상으로 보임. {v.ai_product_suggestions.notes}</p>}
            {v.description_links.filter((l) => l.is_shopping_link).length > 0 && <div className="mt-2 text-xs"><div className="font-semibold">설명란 구매 링크</div>{v.description_links.filter((l) => l.is_shopping_link).map((l) => <div key={l.url} className="truncate"><a className="underline" href={l.url} target="_blank" rel="noreferrer">{l.host}</a> <span className="muted">{l.url.slice(0, 60)}</span></div>)}</div>}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">소싱 점수 <span className="muted text-sm font-normal">· {cfg.name}</span></h2>
            <div className="flex gap-2 text-sm">
              <span className="muted">간이(규칙) {c.scores.rule?.total ?? '없음'} · AI {c.scores.ai?.total ?? '없음'} · 사람 {c.scores.human?.total ?? '없음'}</span>
              <button className="btn-ghost text-xs" onClick={() => act(() => api.suggestScore(c.id, 'rule'), '규칙 간이 채점을 다시 계산했습니다')} title="AI 없이 저장된 지표·상품·원본 연결로 6개 항목을 채점">간이 채점 다시 계산</button>
              <button className="btn-primary text-xs" onClick={() => act(() => api.suggestScore(c.id), 'AI 가 6개 항목을 채점했습니다 (AI 점수)')}>AI 채점 생성</button>
            </div>
          </div>
          {c.scores.ai?.rationale?._summary && <p className="mb-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60"><b>AI 총평:</b> {c.scores.ai.rationale._summary} <span className="muted">({c.scores.ai.rationale._model})</span></p>}
          {c.scores.rule && <p className="mb-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60"><b>간이 채점(규칙, AI 아님):</b> 총점 {c.scores.rule.total} {c.scores.rule.grade_label ? `· ${c.scores.rule.grade_label}` : ''} <span className="muted">— {c.scores.rule.rationale?._basis}</span></p>}
          <table className="w-full"><thead><tr><th className="th">항목</th><th className="th">배점</th><th className="th">간이(규칙)</th><th className="th">AI 점수</th><th className="th">사람 점수</th><th className="th">근거</th></tr></thead>
            <tbody>
              {cfg.items.map((i) => (
                <tr key={i.key} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="td"><div className="font-medium">{i.label}</div><div className="text-[11px] muted">{i.criteria}</div></td>
                  <td className="td tabular-nums">{i.max}</td>
                  <td className="td tabular-nums">{c.scores.rule?.item_scores[i.key] ?? <span className="muted">없음</span>}<div className="text-[11px] muted max-w-[220px]" title={c.scores.rule?.rationale?.[i.key]}>{c.scores.rule?.rationale?.[i.key]}</div></td>
                  <td className="td tabular-nums">{c.scores.ai?.item_scores[i.key] ?? <span className="muted">없음</span>}<div className="text-[11px] muted max-w-[200px]">{c.scores.ai?.rationale?.[i.key]}</div></td>
                  <td className="td"><input className="input w-20" type="number" min={0} max={i.max} value={scores[i.key] ?? ''} onChange={(e) => setScores({ ...scores, [i.key]: e.target.value })} /></td>
                  <td className="td"><input className="input" value={rationale[i.key] ?? ''} onChange={(e) => setRationale({ ...rationale, [i.key]: e.target.value })} placeholder="판단 근거" /></td>
                </tr>
              ))}
            </tbody></table>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">합계 <b className="tabular-nums">{sumEntered}</b> / 100 {allFilled ? '' : <span className="muted">(모든 항목을 채워야 총점·등급이 산출됩니다)</span>}</div>
            <div className="flex gap-2">{c.scores.ai && <button className="btn-ghost" onClick={() => { const s2: Record<string, string> = {}, r2: Record<string, string> = {}; cfg.items.forEach((i) => { const v2 = c.scores.ai!.item_scores[i.key]; s2[i.key] = v2 === null || v2 === undefined ? '' : String(v2); r2[i.key] = c.scores.ai!.rationale?.[i.key] || '' }); setScores(s2); setRationale(r2) }}>AI 점수 불러와 수정</button>}<button className="btn-primary" onClick={() => act(() => api.addScore(c.id, { scorer: 'human', item_scores: Object.fromEntries(cfg.items.map((i) => [i.key, scores[i.key] === '' ? null : Number(scores[i.key])])), rationale }), '사람 점수 저장')}>사람 점수 저장</button></div>
          </div>
          <div className="mt-2 text-[11px] muted">등급: {cfg.grades.map((g) => `${g.min}+ ${g.label}`).join(' · ')} · 최종 표시 점수 우선순위: 사람 점수 → AI 점수 → 규칙 간이 점수.</div>
          {c.scores.history.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer muted">점수 이력 {c.scores.history.length}건</summary><ul className="mt-1 space-y-0.5">{c.scores.history.map((s: Score) => <li key={s.id}>{fmt.datetime(s.created_at)} · {s.scorer === 'ai' ? 'AI' : s.scorer === 'rule' ? '간이(규칙)' : '사람'} · {s.total ?? '총점 없음'} {s.grade_label ? `(${s.grade_label})` : ''}</li>)}</ul></details>}
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
            <Field label="추천 업로드 시간 (운영 가설)" hint={c.slot_reason ? `${c.slot_reason}${c.slot_auto ? ' · 직접 고르면 사용자 지정으로 바뀌고, 비우면 다시 자동 추천됩니다' : ''}` : undefined}><Select value={c.recommended_slot || ''} onChange={(s) => act(() => api.patchCandidate(c.id, { recommended_slot: s || null }), '저장')} placeholder="미지정(자동 추천으로 되돌림)" options={Object.entries(LABELS.slot) as [string, string][]} /></Field>
            <Field label="쇼츠 후킹 아이디어"><textarea className="input" rows={3} defaultValue={c.hook_idea || ''} onBlur={(e) => e.target.value !== (c.hook_idea || '') && act(() => api.patchCandidate(c.id, { hook_idea: e.target.value }), '저장')} /></Field>
            <Field label="추가 조사할 정보"><textarea className="input" rows={3} defaultValue={c.research_todo || ''} onBlur={(e) => e.target.value !== (c.research_todo || '') && act(() => api.patchCandidate(c.id, { research_todo: e.target.value }), '저장')} /></Field>
          </div>
        </div>
      </div>

      <CaptureInvestigateModal open={capture} onClose={() => setCapture(false)} videoId={v.id} hintDefault={c.celebrity_name ? `${c.celebrity_name} 영상 속 상품` : ''} onAdopt={async (it, cat) => { const p = await api.adoptSuggestion(v.id, { name: it.name, brand: it.brand || null, category: cat, subcategory: it.model_or_option || null, evidence: it.evidence }); await api.patchCandidate(c.id, { product_id: p.id }); q.reload() }} />
      {c.product && <OfferSearchModal open={offerSearch} onClose={() => setOfferSearch(false)} productId={c.product.id} initialQuery={`${c.product.brand || ''} ${c.product.name}`.trim()} onAdded={() => q.reload()} />}
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
