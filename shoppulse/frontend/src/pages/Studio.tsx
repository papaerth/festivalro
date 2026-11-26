import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Spinner, useToast } from '../components/ui'
import CaptureOriginalModal from '../components/CaptureOriginal'
import type { EdlClip, EdlOverlay, EdlPip, EdlSticker, MidNarration, StudioRender, StudioSource, StudioState } from '../types'

const ts = (sec: number | null | undefined) => (sec === null || sec === undefined ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`)
const toSec = (t: string) => { const p = t.trim().split(':').map(Number); if (p.some(isNaN)) return NaN; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] }

/** 쇼츠 제작실: ① 원본 URL ② 원본 mp4 ③ 버튼 한 번 → 20~30초 쇼츠 */
export default function Studio() {
  const { id } = useParams()
  const cid = Number(id)
  const q = useAsync(() => api.studio(cid), [cid])
  const { toast, node } = useToast()
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [hints, setHints] = useState<Record<number, string>>({})
  const [up, setUp] = useState<{ slot: number; pct: number } | null>(null)
  const [upSlot, setUpSlot] = useState(1)
  const [moreSources, setMoreSources] = useState(false)
  const [editUrl, setEditUrl] = useState<Record<number, boolean>>({})
  const [capture, setCapture] = useState(false)
  const [edit, setEdit] = useState<{ hook: EdlClip | null; segments: EdlClip[]; title_lines: string[]; credit: string; end_caption: string; narration: string; overlays: EdlOverlay[]; mid_narrations: MidNarration[]; stickers: EdlSticker[]; pips: EdlPip[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const assetRef = useRef<HTMLInputElement>(null)
  const [assetKind, setAssetKind] = useState<'product' | 'logo' | 'sticker'>('product')
  const s = q.data
  const latest: StudioRender | undefined = s?.renders[0]
  const busy = latest && (latest.status === 'queued' || latest.status === 'running')

  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => { api.studio(cid).then(q.setData).catch(() => {}) }, 1500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, cid])
  useEffect(() => {
    if (latest?.status === 'done' && latest.edl) setEdit({ hook: latest.edl.hook, segments: latest.edl.segments, title_lines: latest.edl.title_lines, credit: latest.edl.credit, end_caption: latest.edl.end_caption || '', narration: latest.edl.narration || '', overlays: latest.edl.overlays || [], mid_narrations: latest.edl.mid_narrations || [], stickers: latest.edl.stickers || [], pips: latest.edl.pips || [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.status])

  const act = async (fn: () => Promise<StudioState>, ok?: string) => { try { q.setData(await fn()); if (ok) toast(ok) } catch (e: any) { toast(e.message, 'err') } }
  const upload = (f: File, slot: number) => {
    setUp({ slot, pct: 0 })
    api.studioUpload(cid, f, (pct) => setUp({ slot, pct }), slot).then((st) => { q.setData(st); toast(`원본 ${slot} 파일을 올렸습니다`) }).catch((e) => toast(e.message, 'err')).finally(() => setUp(null))
  }
  const copy = (t: string, label: string) => navigator.clipboard.writeText(t).then(() => toast(`${label} 복사됨`))

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />
  if (!s) return <Spinner />
  const c = s.candidate
  const ready = !!s.sources[0]?.exists
  const nSources = s.sources.filter((x) => x.exists).length
  const showMore = moreSources || s.sources.slice(1).some((x) => x.exists || x.url)
  const hintOf = (x: StudioSource) => hints[x.slot] ?? (x.hint_start != null ? ts(x.hint_start) : '')
  const allHints = () => Object.fromEntries(s.sources.map((x) => [x.slot, hintOf(x)])) as Record<number, string>
  const canMake = ready && !busy && s.ffmpeg.available
  const usedStyle = latest?.style_id ? s.styles.find((x) => x.id === latest.style_id)?.name : null
  const defStyle = s.styles.find((x) => x.id === s.default_style_id) || null
  const step = (n: number, done: boolean) => <span className={`mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'}`}>{done ? '✓' : n}</span>

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {node}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="btn-ghost">← 오늘의 6편</Link>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-1 text-xl font-bold tracking-tight">쇼츠 제작실</h1>
          <div className="line-clamp-1 text-sm muted">{c.celebrity_name || '연예인 미지정'} · {LABELS.category[c.channel_category]}{c.recommended_slot ? ` · ⏰ ${LABELS.slot[c.recommended_slot]}` : ''} · 참고 쇼츠: {c.title}</div>
        </div>
        {c.url && <a className="btn-ghost" href={c.url} target="_blank" rel="noreferrer">참고 쇼츠 보기 ↗</a>}
        <Link to={`/candidates/${c.id}`} className="text-xs underline muted">자세히</Link>
      </div>
      <p className="rounded-xl bg-stone-50 p-3 text-xs muted dark:bg-stone-800/60">{s.notice}</p>
      {!s.ffmpeg.available && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">영상 도구(ffmpeg)를 쓸 수 없습니다: {s.ffmpeg.reason}</div>}

      <div className="card space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="section-title">제작 계획</h2>
          <span className="text-xs muted">· 원본 파일만 주시면 나머지는 자동으로 준비합니다</span>
          <span className="ml-auto flex gap-1 text-[11px]"><Badge tone={s.brief.ready.ai ? 'green' : 'red'}>편집 AI {s.brief.ready.ai ? '준비됨' : '없음'}</Badge><Badge tone={s.brief.ready.tts ? 'green' : 'amber'}>AI 음성 {s.brief.ready.tts ? '준비됨' : '없음'}</Badge></span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold">① 필요한 원본</div>
            <ul className="space-y-1.5 text-xs">{s.brief.needs.map((n) => (
              <li key={n.slot} className="rounded-xl border border-stone-200 p-2 dark:border-stone-700">
                <div className="flex items-center gap-2"><span className="whitespace-nowrap"><Badge tone={n.status === 'ready' ? 'green' : n.status === 'need_file' ? 'amber' : 'red'}>{n.status === 'ready' ? '파일 준비됨' : n.status === 'need_file' ? 'mp4 파일만 필요' : '원본 주소 필요'}</Badge></span><span className="line-clamp-1 font-semibold">원본 {n.slot}{n.title ? ` · ${n.title}` : ''}</span>{n.url && <a className="ml-auto whitespace-nowrap underline" href={n.url} target="_blank" rel="noreferrer">열기 ↗</a>}</div>
                <div className="mt-0.5 muted">{n.channel ? `${n.channel} · ` : ''}{n.duration_seconds ? `${fmt.duration(Math.round(n.duration_seconds))} · ` : ''}{n.why}</div>
                {n.candidates && n.candidates.length > 0 && <ul className="mt-1 space-y-0.5">{n.candidates.map((cd, i) => <li key={i} className="flex items-center gap-2"><span className="muted">후보 {i + 1}</span><span className="line-clamp-1 flex-1">{cd.title}</span>{cd.url && <><a className="underline" href={cd.url} target="_blank" rel="noreferrer">보기</a><button className="underline" onClick={() => act(() => api.studioOriginal(cid, cd.url!, 1), '원본 연결됨')}>이걸로</button></>}</li>)}</ul>}
              </li>))}</ul>
            <div className="mt-2 text-xs"><b>자동으로 하는 것</b><ul className="mt-0.5 list-disc pl-4 muted">{s.brief.auto.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold">② 구성안 (3초 후킹 → 끝이 처음으로 이어지게)</div>
            <table className="w-full text-xs"><tbody>{s.brief.structure.map((x) => <tr key={x.name} className="border-t border-stone-100 align-top dark:border-stone-800"><td className="whitespace-nowrap py-1 pr-2 font-semibold">{x.name}</td><td className="whitespace-nowrap py-1 pr-2 muted">{x.at}</td><td className="py-1">{x.what}</td></tr>)}</tbody></table>
            <div className="mt-2 flex flex-wrap gap-1">{s.brief.rules.map((x, i) => <span key={i} className="rounded-lg bg-stone-100 px-2 py-0.5 text-[11px] dark:bg-stone-800">{x}</span>)}</div>
          </div>
        </div>
        {s.brief.limits.map((x, i) => <div key={i} className="text-[11px] text-amber-700 dark:text-amber-300">※ {x}</div>)}
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-2">{step(1, ready)}원본 영상 <span className="text-xs font-normal muted">· {s.sources[0].url ? 'mp4 파일만 올려 주세요' : '주소와 mp4 파일'} (프로그램은 유튜브 영상을 대신 내려받지 않습니다)</span></h2>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm,.m4v" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, upSlot); e.target.value = '' }} />
        <div className="space-y-3">
          {s.sources.filter((x) => x.slot === 1 || showMore).map((x) => (
            <div key={x.slot} className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-700">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-bold ${x.exists ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'}`}>원본 {x.slot}</span>
                {x.title ? <span className="line-clamp-1 min-w-0 flex-1 font-semibold">{x.title}<span className="ml-2 text-xs font-normal muted">{x.channel || ''}</span></span> : <span className="flex-1 text-xs muted">{x.slot === 1 ? '참고 쇼츠의 장면이 들어 있는 원본' : '같은 상품·같은 화제가 나오는 다른 원본(섞어 쓰기)'}</span>}
                {x.url && <a className="text-xs underline" href={x.url} target="_blank" rel="noreferrer">원본 열기 ↗</a>}
              </div>
              {x.url && !editUrl[x.slot] ? (
                <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-emerald-700 dark:text-emerald-400">✓ 원본 주소는 연결돼 있습니다 — {x.exists ? '파일도 준비됐습니다.' : '이제 mp4 파일만 올리면 됩니다.'}</span><button className="underline muted" onClick={() => setEditUrl({ ...editUrl, [x.slot]: true })}>다른 원본으로 바꾸기</button></div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input className="input min-w-52 flex-1" placeholder="원본 유튜브 주소 붙여넣기 (https://www.youtube.com/watch?v=…)" value={urls[x.slot] || ''} onChange={(e) => setUrls({ ...urls, [x.slot]: e.target.value })} />
                  <button className="btn-ghost border border-stone-300 dark:border-stone-600" disabled={!urls[x.slot]} onClick={() => act(() => api.studioOriginal(cid, urls[x.slot], x.slot), `원본 ${x.slot} 주소 연결됨`).then(() => { setUrls({ ...urls, [x.slot]: '' }); setEditUrl({ ...editUrl, [x.slot]: false }) })}>{x.url ? '주소 바꾸기' : '주소 연결'}</button>
                  {x.slot === 1 && <button className="btn-ghost" onClick={() => setCapture(true)}>캡처로 찾기(AI)</button>}
                  {x.url && <button className="text-xs underline muted" onClick={() => setEditUrl({ ...editUrl, [x.slot]: false })}>취소</button>}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button className="btn-primary" disabled={up !== null} onClick={() => { setUpSlot(x.slot); setTimeout(() => fileRef.current?.click(), 0) }}>{up?.slot === x.slot ? `올리는 중 ${up.pct}%` : x.exists ? '다른 파일로 바꾸기' : 'mp4 파일 선택'}</button>
                {x.exists && x.info && <span className="text-xs muted">{x.name} · {fmt.duration(Math.round(x.info.duration || 0))} · {x.info.width}×{x.info.height} · {((x.info.size || 0) / 1024 / 1024).toFixed(0)}MB</span>}
                <label className="flex items-center gap-1 text-xs"><span className="muted">상품이 나오는 대략 위치(선택)</span><input className="input w-24" placeholder="예: 12:30" value={hintOf(x)} onChange={(e) => setHints({ ...hints, [x.slot]: e.target.value })} /></label>
                {(x.exists || (x.slot > 1 && x.url)) && <button className="text-xs underline muted" onClick={() => act(async () => { await api.studioDeleteSource(cid, x.slot); return api.studio(cid) }, x.slot === 1 ? '원본 파일 삭제(디스크 정리)' : `원본 ${x.slot} 칸을 비웠습니다`)}>{x.slot === 1 ? '파일 지우기' : '이 칸 비우기'}</button>}
              </div>
              {x.warning && <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">⚠ {x.warning}</div>}
              {up?.slot === x.slot && <div className="mt-2 h-2 w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-700"><div className="h-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${up.pct}%` }} /></div>}
            </div>))}
        </div>
        {!showMore && <button className="btn-ghost mt-2 text-xs" onClick={() => setMoreSources(true)}>+ 원본 영상 추가 (2~3개를 섞어 한 편으로 만들기)</button>}
        {showMore && <p className="mt-2 text-[11px] muted">원본이 여러 개면 모두 훑어 본 뒤 섞어서 한 편으로 만듭니다. 화면 크기는 원본 1에 맞추고, 출처는 모두 표기합니다. AI 키가 없을 때는 위치를 적은 원본만 섞습니다.</p>}
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">상품 사진·로고·스티커를 직접 넣고 싶을 때만 열기 <span className="text-xs font-normal muted">· 안 넣어도 원본 화면에서 자동으로 만듭니다{s.assets.length ? ` · 올린 것 ${s.assets.length}개` : ''}</span></summary>
        <div className="mt-3">
        <h2 className="section-title mb-1"><span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-sm dark:bg-stone-800">＋</span>상품 사진·로고 띄우기 <span className="text-xs font-normal muted">· 선택</span></h2>
        <p className="mb-2 text-xs muted">올린 사진은 배경을 지워(누끼) 흰 테두리 스티커로 만들고, 영상에서 상품이 나오는 순간에 톡 튀어나오게 합니다. 흰 배경의 쇼핑몰 상품 사진이나 배경이 투명한 PNG 가 가장 깔끔합니다. 사용 권한이 있는 이미지만 올려 주세요.</p>
        <input ref={assetRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act(() => api.studioAddAsset(cid, f, assetKind), '사진을 올렸습니다') }} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost border border-stone-300 dark:border-stone-600" disabled={s.assets.length >= 6} onClick={() => { setAssetKind('product'); setTimeout(() => assetRef.current?.click(), 0) }}>+ 상품 사진</button>
          <button className="btn-ghost border border-stone-300 dark:border-stone-600" disabled={s.assets.length >= 6} onClick={() => { setAssetKind('logo'); setTimeout(() => assetRef.current?.click(), 0) }}>+ 브랜드 로고</button>
          <button className="btn-ghost border border-stone-300 dark:border-stone-600" disabled={s.assets.length >= 6} onClick={() => { setAssetKind('sticker'); setTimeout(() => assetRef.current?.click(), 0) }}>+ 내 스티커</button>
          {s.assets.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-xl border border-stone-200 p-1.5 pr-3 text-xs dark:border-stone-700">
              <img src={a.url} alt="" className="h-14 w-14 rounded-lg bg-stone-700 object-contain" />
              <div><div className="font-semibold">{a.kind === 'logo' ? '로고' : a.kind === 'sticker' ? '스티커' : '상품 사진'}</div><div className="muted">{a.method_label}</div></div>
              <button className="text-red-600" title="지우기" onClick={() => act(() => api.studioDeleteAsset(cid, a.id), '지웠습니다')}>✕</button>
            </div>
          ))}
        </div>
      </div>
      </details>

      <div className="card p-4">
        <h2 className="section-title mb-2">{step(2, latest?.status === 'done')}쇼츠 만들기</h2>
        <div className="flex flex-wrap items-end gap-3">
          <button className="btn-primary px-6 py-3 text-base" disabled={!canMake} onClick={() => act(() => api.studioMake(cid, allHints()))}>{busy ? '만드는 중…' : `▶ 쇼츠 만들기 (${defStyle ? defStyle.name : '기본 스타일'}${nSources > 1 ? ` · 원본 ${nSources}개 섞기` : ''})`}</button>
          <p className="max-w-xl text-xs muted">{s.ai ? '위치를 적은 원본은 그 주변만, 비운 원본은 전체를 AI 가 훑어 장면을 찾습니다(전체를 훑으면 조금 더 걸리고 비용이 더 듭니다).' : 'AI 키가 없어 원본 1의 대략 위치가 필요합니다. 그 주변을 규칙대로 잘라 만듭니다(자막·내레이션 없음).'} 3초 후킹 → 순서를 섞은 컷 편집 → 20~30초, 같은 장면은 두 번 쓰지 않습니다.</p>
        </div>
        <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
          <div className="mb-2 text-xs font-semibold">다른 스타일로 만들기 <span className="font-normal muted">· 위 버튼은 {defStyle ? `「${defStyle.name}」(레퍼런스 채널들을 분석해 만든 기본 스타일)` : '기본 스타일'}로 만듭니다</span></div>
          <div className="flex flex-wrap gap-2">
            {s.styles.filter((x) => x.status === 'ready' && x.id !== s.default_style_id).map((x) => (
              <button key={x.id} className="btn-ghost border border-stone-300 px-4 py-2 dark:border-stone-600" disabled={!canMake} title={x.summary || ''} onClick={() => act(() => api.studioMake(cid, allHints(), x.id), `「${x.name}」 스타일로 만드는 중`)}>🎨 「{x.name}」처럼 편집해줘</button>
            ))}
            {s.styles.filter((x) => x.status === 'learning').map((x) => <span key={x.id} className="rounded-xl bg-stone-100 px-3 py-2 text-xs muted dark:bg-stone-800">「{x.name}」 학습 중…</span>)}
            <Link to="/styles" className="btn-ghost text-xs">+ 레퍼런스 채널 추가·관리</Link>
          </div>
          <p className="mt-1 text-[11px] muted">🔊 AI 음성 내레이션: {s.tts.available ? `사용 가능 (${s.tts.provider === 'elevenlabs' ? 'ElevenLabs' : s.tts.provider === 'google' ? 'Google 음성' : 'Windows 내장 음성'}${s.tts.voice ? ' · ' + s.tts.voice : ''})` : `사용 불가 — ${s.tts.note}`} · 내레이션·효과음·배경음악은 스타일에서 켠 경우에 들어갑니다.</p>
          <p className="mt-1 text-[11px] muted">{s.styles.length === 0 ? '레퍼런스 채널을 3~4개 등록해 두면, 그 채널의 편집 방식(화면 배치·자막 모양·후킹 방식·컷 속도)으로 만드는 버튼이 여기에 생깁니다.' : '편집 방식만 따라 하고 문구·장면은 베끼지 않습니다. 스타일마다 우리만의 차별점(킥)이 함께 적용됩니다.'}</p>
        </div>
        {busy && latest && <div className="mt-3"><div className="flex justify-between text-sm"><span>{latest.step}</span><span className="tabular-nums">{latest.progress}%</span></div><div className="mt-1 h-2 w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-700"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${latest.progress}%` }} /></div></div>}
        {latest?.status === 'failed' && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <div>만들지 못했습니다: {latest.error}</div>
            {latest.output_info?.suggestions !== undefined && (
              <div className="mt-2 space-y-2 text-stone-800 dark:text-stone-100">
                <div className="flex flex-wrap gap-2 text-xs">
                  {s.sources[0].url && <a className="btn-ghost border border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900" href={s.sources[0].url} target="_blank" rel="noreferrer">연결된 원본 열어 확인 ↗</a>}
                  {c.url && <a className="btn-ghost border border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900" href={c.url} target="_blank" rel="noreferrer">참고 쇼츠 다시 보기 ↗</a>}
                </div>
                {latest.output_info.suggestions.length > 0 && (
                  <div className="text-xs">
                    <div className="mb-1 font-semibold">그래도 이 영상으로 만들려면 — AI 가 본 상품 소개 구간을 골라 주세요</div>
                    <div className="flex flex-wrap gap-2">{latest.output_info.suggestions.map((g, i) => (
                      <button key={i} className="btn-primary" disabled={!canMake} onClick={() => { setHints({ ...hints, 1: ts(g.start) }); act(() => api.studioMake(cid, { ...allHints(), 1: ts(g.start) }, latest.style_id, ts(g.end)), `${ts(g.start)}~${ts(g.end)} 구간으로 만드는 중`) }}>{ts(g.start)}~{ts(g.end)} · {g.what} 로 만들기</button>))}</div>
                    <div className="mt-1 muted">참고 쇼츠와 다른 상품일 수 있습니다. 올리기 전에 상품이 맞는지 꼭 확인하세요.</div>
                  </div>)}
              </div>)}
          </div>)}
      </div>

      {latest?.status === 'done' && latest.file_url && latest.edl && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="card p-3">
            <video key={latest.id} controls playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: '9/16' }} src={latest.file_url} />
            <div className="mt-2 flex flex-wrap gap-2">
              <a className="btn-primary flex-1 justify-center" href={`${latest.file_url}?download=true`}>⬇ mp4 내려받기</a>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!c.produced_at} onChange={(e) => api.setProduced(cid, { produced: e.target.checked }).then(() => q.reload())} /> 올렸음(제작함)</label>
            </div>
            <div className="mt-1 text-[11px] muted">{latest.output_info?.duration}초 · {latest.output_info?.width}×{latest.output_info?.height} · {((latest.output_info?.size || 0) / 1024 / 1024).toFixed(1)}MB · 스타일: {usedStyle ? `「${usedStyle}」` : '기본'} · 편집 근거: {latest.decided_by}</div>
            {latest.edl.audio && (latest.edl.audio.narration_count || latest.edl.audio.bgm || latest.edl.audio.sfx?.length) ? <div className="mt-1 text-[11px] muted">🔊 {[latest.edl.audio.narration_count ? `내레이션 ${latest.edl.audio.narration_count}문장(${latest.edl.audio.voice})` : null, latest.edl.audio.sfx?.length ? `효과음 ${latest.edl.audio.sfx.length}개` : null, latest.edl.audio.bgm ? `배경음악(${latest.edl.audio.bgm})` : null].filter(Boolean).join(' · ')}</div> : null}
          </div>
          <div className="space-y-4">
            {(latest.notes.length > 0 || latest.edl.reason || typeof latest.edl.shuffles === 'number') && <div className="card p-4 text-sm"><h3 className="mb-1 font-semibold">확인할 점</h3>{latest.edl.reason && <p className="text-xs muted">구성 이유: {latest.edl.reason}</p>}{typeof latest.edl.shuffles === 'number' && <p className="mt-1 text-xs muted">순서 섞기 {latest.edl.shuffles}번 · 총 {latest.edl.total_seconds}초{latest.edl.loop_note ? ` · 끝→처음: ${latest.edl.loop_note}` : ''}</p>}{latest.edl.audio?.lines?.length ? <p className="mt-1 text-xs muted">AI 음성: {latest.edl.audio.lines.map((l) => `${l.where} 「${l.text}」 ${l.seconds}초(속도 ${l.speed}배)`).join(' / ')}</p> : null}{latest.edl.quote_seen && <p className="mt-1 text-xs">화면에서 읽은 말: “{latest.edl.quote_seen}”</p>}<ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{latest.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
            {edit && (
              <div className="card p-4 text-sm">
                <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">편집안 고치기 <span className="muted text-xs font-normal">· AI 호출 없이 다시 렌더링</span></h3><button className="btn-primary" disabled={!!busy} onClick={() => act(() => api.studioRerender(cid, edit), '다시 렌더링 시작')}>이대로 다시 만들기</button></div>
                <div className="grid gap-2 md:grid-cols-2">{[0, 1].map((i) => <input key={i} className="input" placeholder={`상단 제목 ${i + 1}줄${i === 1 ? ' (강조할 단어는 *별표*)' : ''}`} value={edit.title_lines[i] || ''} onChange={(e) => { const t = [...edit.title_lines]; t[i] = e.target.value; setEdit({ ...edit, title_lines: t }) }} />)}</div>
                <table className="mt-2 w-full text-xs"><thead><tr><th className="th">구간(재생 순서)</th><th className="th">화면 초점</th><th className="th">시작</th><th className="th">끝</th><th className="th">자막</th><th className="th" /></tr></thead><tbody>
                  {edit.hook && <ClipRow label="후킹" clip={edit.hook} sources={s.sources} onChange={(h) => setEdit({ ...edit, hook: h })} />}
                  {edit.segments.map((sg, i) => <ClipRow key={i} label={`본편 ${i + 1}`} clip={sg} sources={s.sources} onChange={(n) => setEdit({ ...edit, segments: edit.segments.map((x, j) => (j === i ? n : x)) })} onRemove={edit.segments.length > 1 ? () => setEdit({ ...edit, segments: edit.segments.filter((_, j) => j !== i) }) : undefined}
                    onMove={(d) => { const k = i + d; if (k < 0 || k >= edit.segments.length) return; const arr = [...edit.segments]; [arr[i], arr[k]] = [arr[k], arr[i]]; setEdit({ ...edit, segments: arr }) }} />)}
                </tbody></table>
                <div className="mt-2 flex items-center gap-2"><button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const last = edit.segments[edit.segments.length - 1]; setEdit({ ...edit, segments: [...edit.segments, { start: last.end + 1, end: last.end + 6, caption: '' }] }) }}>+ 구간 추가</button><input className="input flex-1 text-xs" placeholder="출처 표기" value={edit.credit} onChange={(e) => setEdit({ ...edit, credit: e.target.value })} /></div>
                <input className="input mt-2 text-xs" placeholder="AI 음성 내레이션 (선택, 첫 장면에서 읽어 줄 한 문장 · 예: ○○이 10년째 쓴다는 물건이 있다는데)" maxLength={60} value={edit.narration} onChange={(e) => setEdit({ ...edit, narration: e.target.value })} />
                {edit.overlays.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">{edit.overlays.map((o, i) => (
                  <label key={o.asset_id} className="flex items-center gap-1">{o.kind === 'logo' ? '로고' : o.kind === 'sticker' ? '내 스티커' : '상품 사진'} 등장
                    <input type="number" step={0.5} min={0} className="input w-20" value={o.start} onChange={(e) => setEdit({ ...edit, overlays: edit.overlays.map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)) })} />초부터
                    <input type="number" step={0.5} min={1} max={8} className="input w-16" value={o.duration} onChange={(e) => setEdit({ ...edit, overlays: edit.overlays.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) } : x)) })} />초 동안
                  </label>))}<span className="muted">(완성 영상 기준 시각)</span></div>}
                <div className="mt-2 space-y-1 text-xs">
                  {edit.mid_narrations.map((m, i) => (
                    <div key={i} className="flex items-center gap-2"><span className="whitespace-nowrap">중간 내레이션</span>
                      <select className="input w-24" value={m.segment ?? 0} onChange={(e) => setEdit({ ...edit, mid_narrations: edit.mid_narrations.map((x, j) => (j === i ? { text: x.text, segment: Number(e.target.value) } : x)) })}>{edit.segments.map((_, k) => <option key={k} value={k}>본편 {k + 1}</option>)}</select>
                      <input className="input flex-1" maxLength={60} placeholder="그 컷에서 읽어 줄 한 문장 (원본 소리는 그동안 작아집니다)" value={m.text} onChange={(e) => setEdit({ ...edit, mid_narrations: edit.mid_narrations.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                      <button className="text-red-600" onClick={() => setEdit({ ...edit, mid_narrations: edit.mid_narrations.filter((_, j) => j !== i) })}>✕</button></div>))}
                  {edit.stickers.map((m, i) => (
                    <div key={i} className="flex items-center gap-2"><span className="whitespace-nowrap">움직이는 스티커</span>
                      <select className="input w-32" value={m.type} onChange={(e) => setEdit({ ...edit, stickers: edit.stickers.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>{STICKERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <input type="number" step={0.5} min={0} className="input w-20" value={m.start ?? 0} onChange={(e) => setEdit({ ...edit, stickers: edit.stickers.map((x, j) => (j === i ? { type: x.type, duration: x.duration, start: Number(e.target.value) } : x)) })} /><span>초에 등장</span>
                      <button className="text-red-600" onClick={() => setEdit({ ...edit, stickers: edit.stickers.filter((_, j) => j !== i) })}>✕</button></div>))}
                  {edit.pips.map((m, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap">원형 작은 화면</span>
                      <input type="number" step={0.5} min={0} className="input w-20" value={m.start ?? 0} onChange={(e) => setEdit({ ...edit, pips: edit.pips.map((x, j) => (j === i ? { src_start: x.src_start, focus: x.focus, duration: x.duration, start: Number(e.target.value) } : x)) })} /><span>초에 등장 · 원 안에 보여 줄 원본 시각</span>
                      <PipTime value={m.src_start} onChange={(v) => setEdit({ ...edit, pips: edit.pips.map((x, j) => (j === i ? { ...x, src_start: v } : x)) })} />
                      <select className="input w-28" value={m.focus} onChange={(e) => setEdit({ ...edit, pips: edit.pips.map((x, j) => (j === i ? { ...x, focus: e.target.value as EdlPip['focus'] } : x)) })}><option value="left">얼굴이 왼쪽</option><option value="center">얼굴이 가운데</option><option value="right">얼굴이 오른쪽</option></select>
                      <button className="text-red-600" onClick={() => setEdit({ ...edit, pips: edit.pips.filter((_, j) => j !== i) })}>✕</button></div>))}
                  <div className="flex gap-2">
                    <button className="btn-ghost px-2 py-1 text-xs" disabled={edit.mid_narrations.length >= 3} onClick={() => setEdit({ ...edit, mid_narrations: [...edit.mid_narrations, { segment: Math.min(edit.segments.length - 1, 2), text: '' }] })}>+ 중간 내레이션</button>
                    <button className="btn-ghost px-2 py-1 text-xs" disabled={edit.stickers.length >= 4} onClick={() => setEdit({ ...edit, stickers: [...edit.stickers, { type: 'exclaim', start: 5 }] })}>+ 움직이는 스티커</button>
                    <button className="btn-ghost px-2 py-1 text-xs" disabled={edit.pips.length >= 2} onClick={() => setEdit({ ...edit, pips: [...edit.pips, { start: 6, src_start: edit.hook ? edit.hook.start : edit.segments[0].start, focus: 'center' }] })}>+ 원형 작은 화면</button>
                  </div>
                </div>
                <input className="input mt-2 text-xs" placeholder="끝 질문 자막 (선택, 마지막 1.8초에 표시 · 예: 여러분이라면 살까요?)" maxLength={24} value={edit.end_caption} onChange={(e) => setEdit({ ...edit, end_caption: e.target.value })} />
                <p className="mt-1 text-[11px] muted">컷은 위에서 아래 순서로 재생됩니다(▲▼로 순서 바꾸기). 같은 장면을 두 컷에 쓰면 뒤 컷에서 겹친 부분을 잘라 냅니다. 시간은 원본 영상 기준 분:초(소수 가능, 예 12:31.5). 총 길이는 20~30초로 자동 조정됩니다. 자막에서 강조할 단어는 *별표*로 감싸면 스타일의 강조색으로 표시됩니다.</p>
              </div>
            )}
            <div className="card p-4 text-sm">
              <h3 className="mb-2 font-semibold">업로드용 글</h3>
              <div className="flex items-center gap-2"><input className="input flex-1" readOnly placeholder="영상을 만들면 우리가 쓴 제목이 여기에 나옵니다(참고 쇼츠 제목은 쓰지 않습니다)" value={s.upload_text.title_suggestion} /><button className="btn-ghost" onClick={() => copy(s.upload_text.title_suggestion, '제목')}>제목 복사</button></div>
              <textarea className="input mt-2 text-xs" rows={4} readOnly value={s.upload_text.description} />
              <button className="btn-ghost mt-1" onClick={() => copy(s.upload_text.description, '설명')}>설명 복사</button>
            </div>
          </div>
        </div>
      )}
      {s.renders.length > 1 && <details className="card p-4 text-xs"><summary className="cursor-pointer muted">이전에 만든 버전 {s.renders.length - 1}개</summary><ul className="mt-2 space-y-1">{s.renders.slice(1).map((r) => <li key={r.id}>{fmt.datetime(r.created_at)} · {r.status === 'done' ? <a className="underline" href={r.file_url || '#'} target="_blank" rel="noreferrer">{r.output_info?.duration}초 영상 보기</a> : r.status === 'failed' ? <span className="text-red-600">실패: {r.error?.slice(0, 80)}</span> : r.status} <Badge tone="gray">{r.decided_by || ''}</Badge></li>)}</ul></details>}
      <CaptureOriginalModal open={capture} onClose={() => setCapture(false)} candidateId={cid} onResult={() => q.reload()} />
    </div>
  )
}

function ClipRow({ label, clip, onChange, onRemove, onMove, sources }: { label: string; clip: EdlClip; onChange: (c: EdlClip) => void; onRemove?: () => void; onMove?: (d: number) => void; sources: StudioSource[] }) {
  const [a, setA] = useState(tsf(clip.start)); const [b, setB] = useState(tsf(clip.end))
  useEffect(() => { setA(tsf(clip.start)); setB(tsf(clip.end)) }, [clip.start, clip.end])
  const commit = (va: string, vb: string) => { const x = toSecF(va), y = toSecF(vb); if (!isNaN(x) && !isNaN(y) && y > x) onChange({ ...clip, start: x, end: y }) }
  const have = sources.filter((x) => x.exists)
  const url = sources[clip.src || 0]?.url
  return (
    <tr className="border-t border-stone-100 dark:border-stone-800">
      <td className="td whitespace-nowrap font-medium">{onMove && <span className="mr-1"><button className="px-0.5 muted" title="앞으로" onClick={() => onMove(-1)}>▲</button><button className="px-0.5 muted" title="뒤로" onClick={() => onMove(1)}>▼</button></span>}{label} <span className="muted">{(clip.end - clip.start).toFixed(1)}초</span></td>
      <td className="td whitespace-nowrap">{have.length > 1 ? <select className="input w-24" value={clip.src || 0} onChange={(e) => onChange({ ...clip, src: Number(e.target.value) })}>{have.map((x) => <option key={x.slot} value={x.slot - 1}>원본 {x.slot}</option>)}</select> : null}
        <select className="input ml-1 w-20" title="화면을 크게 자를 때 어느 쪽을 보여 줄지" value={clip.focus || 'center'} onChange={(e) => onChange({ ...clip, focus: e.target.value as 'left' | 'center' | 'right' })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></td>
      <td className="td"><input className="input w-20" value={a} onChange={(e) => setA(e.target.value)} onBlur={() => commit(a, b)} /></td>
      <td className="td"><input className="input w-20" value={b} onChange={(e) => setB(e.target.value)} onBlur={() => commit(a, b)} /></td>
      <td className="td w-full"><input className="input w-full min-w-36" value={clip.caption} maxLength={40} onChange={(e) => onChange({ ...clip, caption: e.target.value })} /></td>
      <td className="td whitespace-nowrap">{url && <a className="underline" href={`${url}&t=${Math.floor(clip.start)}s`} target="_blank" rel="noreferrer">원본에서 보기</a>} {onRemove && <button className="ml-1 text-red-600" onClick={onRemove}>✕</button>}</td>
    </tr>
  )
}
function PipTime({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [t, setT] = useState(tsf(value))
  useEffect(() => { setT(tsf(value)) }, [value])
  return <input className="input w-20" title="원본 영상 기준 분:초" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const v = toSecF(t); if (!isNaN(v) && v >= 0) onChange(v); else setT(tsf(value)) }} />
}
const STICKERS = [['exclaim', '놀람 (!)'], ['question', '궁금 (?)'], ['heart', '하트'], ['star', '별'], ['sparkle', '반짝'], ['fire', '불꽃']] as const
const tsf = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`
const toSecF = (t: string) => { const p = t.trim().split(':').map(Number); if (p.some(isNaN)) return NaN; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] }
void toSec
