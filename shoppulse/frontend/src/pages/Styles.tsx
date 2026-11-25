import { useEffect, useRef, useState } from 'react'
import { api, fmt } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Spinner, useToast } from '../components/ui'
import type { RefStyle, StyleProfile } from '../types'

const LAYOUT = { blur_bg: '흐린 배경 + 가운데 화면', crop_fill: '세로로 꽉 채움', color_bg: '단색 배경 + 가운데 화면' } as const
const CAP_POS = { below_video: '화면 바로 아래', bottom: '맨 아래', over_video: '화면 위에 겹침' } as const
const SIZE = { small: '작게', medium: '보통', large: '크게' } as const
const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.mkv,.webm,.m4v,image/png,image/jpeg,image/webp'

/** 레퍼런스 채널의 편집 방식을 학습해 저장하는 화면. 제작실에서 「○○처럼 편집해줘」 버튼으로 쓴다. */
export default function Styles() {
  const q = useAsync(() => api.styles(), [])
  const { toast, node } = useToast()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const bgmRef = useRef<HTMLInputElement>(null)
  const au = useAsync(() => api.styleAudio(), [])
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const testVoice = async () => { setVoiceBusy(true); try { setVoiceUrl(await api.ttsTest('이 목소리로 첫 장면을 소개합니다')) } catch (e: any) { toast(e.message, 'err') } finally { setVoiceBusy(false) } }
  const learning = q.data?.styles.some((s) => s.status === 'learning')

  useEffect(() => {
    if (!learning) return
    const t = setInterval(() => { api.styles().then(q.setData).catch(() => {}) }, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning])

  const create = async () => {
    setSending(true)
    try { await api.styleCreate(name, url, files); setName(''); setUrl(''); setFiles([]); toast('학습을 시작했습니다(1~2분)'); q.reload() }
    catch (e: any) { toast(e.message, 'err') } finally { setSending(false) }
  }

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />
  if (!q.data) return <Spinner />
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {node}
      <div>
        <h1 className="text-xl font-bold tracking-tight">편집 스타일 <span className="text-sm font-normal muted">· 레퍼런스 채널처럼 편집하기</span></h1>
        <p className="mt-1 text-sm muted">참고하고 싶은 쇼츠 채널을 3~4개 등록하면 편집 방식을 학습합니다. 제작실에서 「○○처럼 편집해줘」 버튼을 누르면 그 방식으로 쇼츠를 만듭니다.</p>
      </div>
      <p className="rounded-xl bg-stone-50 p-3 text-xs muted dark:bg-stone-800/60">{q.data.note} 똑같이 복제하지 않고, 스타일마다 「우리만의 킥」을 함께 적용합니다.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) api.stylesImport(f).then((r) => { toast(`스타일 ${r.created}개 추가, ${r.updated}개 갱신`); q.reload() }).catch((er) => toast(er.message, 'err')) }} />
        <button className="btn-primary" onClick={() => importRef.current?.click()}>📂 스타일 파일 가져오기</button>
        <a className="btn-ghost" href="/api/styles/export" download="shoppulse_styles.json">내 스타일 내보내기</a>
        <span className="text-xs muted">이미 분석해 둔 스타일 파일(.json)이 있으면 여기로 한 번에 넣을 수 있습니다.</span>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="section-title">레퍼런스 채널 추가</h2>
        <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
          <input className="input" placeholder="이름 (예: A채널 스타일)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="채널 주소 (https://www.youtube.com/@… 또는 그 채널의 쇼츠 주소)" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 9)); e.target.value = '' }} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn-ghost border border-stone-300 dark:border-stone-600" onClick={() => fileRef.current?.click()}>+ 샘플 쇼츠 mp4 · 캡처 추가 (선택)</button>
          {files.map((f, i) => <span key={i} className="rounded-lg bg-stone-100 px-2 py-1 text-xs dark:bg-stone-800">{f.name} <button className="text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>)}
          <button className="btn-primary ml-auto px-5" disabled={sending || (!url.trim() && files.length === 0)} onClick={create}>{sending ? '올리는 중…' : '이 채널 스타일 학습하기'}</button>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-[11px] muted">
          <li><b>채널 주소만</b> 넣으면: 인기 쇼츠의 길이·제목 형태와 썸네일(화면 배치·제목 띠·자막 모양)을 보고 배웁니다. 컷 속도는 추정입니다.</li>
          <li><b>샘플 쇼츠 mp4(최대 3개)</b>를 함께 올리면: 컷이 몇 초마다 바뀌는지 실제로 재고, 자막이 바뀌는 방식과 초반 후킹 구성까지 배웁니다. 가장 정확합니다.</li>
          <li>유튜브 영상을 프로그램이 대신 내려받지는 않습니다. 샘플 파일은 직접 준비해 올려 주세요. 올린 샘플은 학습 후 바로 지웁니다.</li>
        </ul>
      </div>

      {au.data && (
        <div className="card space-y-3 p-4 text-sm">
          <h2 className="section-title">소리 재료 <span className="text-xs font-normal muted">· AI 음성 · 효과음 · 배경음악</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <b>🔊 AI 음성 내레이션</b>
            {au.data.tts.available ? <Badge tone="green">{au.data.tts.provider === 'elevenlabs' ? 'ElevenLabs' : au.data.tts.provider === 'google' ? 'Google 음성' : 'Windows 내장 음성'} · {au.data.tts.voice}</Badge> : <Badge tone="red">사용 불가</Badge>}
            <button className="btn-ghost border border-stone-300 text-xs dark:border-stone-600" disabled={voiceBusy || !au.data.tts.available} onClick={testVoice}>{voiceBusy ? '만드는 중…' : '▶ 목소리 미리 듣기'}</button>
            {voiceUrl && <audio src={voiceUrl} controls autoPlay className="h-8" />}
            {au.data.voices.length > 0 && (
              <label className="flex items-center gap-2 text-xs">목소리
                <select className="input w-64" disabled={au.data.voice_locked} value={au.data.tts.voice_id || ''} onChange={(e) => api.setVoice(e.target.value).then(() => { toast('목소리를 바꿨습니다'); setVoiceUrl(null); au.reload() }).catch((er) => toast(er.message, 'err'))}>
                  {au.data.voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${v.gender === 'female' ? '여성' : v.gender === 'male' ? '남성' : v.gender}` : ''}{v.language ? ` · ${v.language}` : ''}</option>)}
                </select>
                {au.data.voice_locked && <span className="muted">(.env 의 ELEVENLABS_VOICE_ID 로 고정됨)</span>}
              </label>)}
            {au.data.voices_error && <span className="w-full text-xs text-red-600">{au.data.voices_error}</span>}
            <span className="w-full text-xs muted">{au.data.tts.note}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b>🎵 배경음악 보관함</b><span className="text-xs muted">{au.data.bgm.length ? `${au.data.bgm.length}곡 — 만들 때마다 돌아가며 사용` : '비어 있음 — 내장 합성 반주 사용'}</span>
              <input ref={bgmRef} type="file" multiple accept="audio/*,.mp3,.m4a,.wav" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) api.bgmAdd(fs).then(() => { toast('배경음악을 넣었습니다'); au.reload() }).catch((er) => toast(er.message, 'err')) }} />
              <button className="btn-ghost border border-stone-300 text-xs dark:border-stone-600" onClick={() => bgmRef.current?.click()}>+ 음악 파일 넣기</button>
            </div>
            {au.data.bgm.length > 0 && <ul className="mt-2 space-y-1 text-xs">{au.data.bgm.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-2"><span className="min-w-40">{b.name}</span><audio src={`/api/styles/bgm/${encodeURIComponent(b.name)}`} controls preload="none" className="h-7" /><button className="text-red-600 underline" onClick={() => api.bgmDelete(b.name).then(() => au.reload())}>삭제</button></li>))}</ul>}
            <p className="mt-1 text-xs muted">{au.data.note}</p>
          </div>
        </div>
      )}

      {q.data.styles.length === 0 && <div className="card p-6 text-center text-sm muted">아직 등록한 레퍼런스 채널이 없습니다.</div>}
      {q.data.styles.map((s) => <StyleCard key={s.id} s={s} onChange={q.reload} toast={toast} />)}
    </div>
  )
}

function Swatch({ c }: { c: string }) { return c ? <span className="inline-block h-3.5 w-3.5 rounded border border-stone-300 align-middle" style={{ background: c }} title={c} /> : null }

function StyleCard({ s, onChange, toast }: { s: RefStyle; onChange: () => void; toast: (m: string, t?: 'ok' | 'err') => void }) {
  const [p, setP] = useState<StyleProfile | null>(s.profile)
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setP(s.profile); setDirty(false) }, [s.profile, s.updated_at])
  const set = (fn: (d: StyleProfile) => void) => { if (!p) return; const d = JSON.parse(JSON.stringify(p)) as StyleProfile; fn(d); setP(d); setDirty(true) }
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); onChange() } catch (e: any) { toast(e.message, 'err') } }
  const st = s.stats || {}
  return (
    <div className="card space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">{s.name}</h2>
        {s.status === 'ready' ? <Badge tone="green">사용 가능</Badge> : s.status === 'learning' ? <Badge tone="amber">학습 중 · {s.step}</Badge> : <Badge tone="red">학습 실패</Badge>}
        {st.confidence && <Badge tone="gray">확신도 {st.confidence === 'high' ? '높음' : st.confidence === 'medium' ? '보통' : '낮음'}</Badge>}
        {s.channel_url && <a className="text-xs underline muted" href={s.channel_url.startsWith('http') ? s.channel_url : `https://www.youtube.com/${s.channel_url}`} target="_blank" rel="noreferrer">{s.channel_title || '채널 열기'} ↗</a>}
        <span className="ml-auto text-[11px] muted">{fmt.datetime(s.updated_at)}</span>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; run(() => api.styleRelearn(s.id, fs), '다시 학습 시작') }} />
        <button className="btn-ghost text-xs" disabled={s.status === 'learning'} onClick={() => fileRef.current?.click()} title="샘플 쇼츠 mp4·캡처를 더 넣어 다시 학습">샘플 넣고 다시 학습</button>
        <button className="text-xs text-red-600 underline" onClick={() => { if (confirm(`「${s.name}」 스타일을 지울까요?`)) run(() => api.styleDelete(s.id), '삭제됨') }}>삭제</button>
      </div>
      {s.status === 'failed' && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{s.error}</div>}
      {p && s.status !== 'learning' && (<>
        <p>{p.summary}</p>
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="space-y-1">
            <div><b>화면 배치</b> · {LAYOUT[p.layout.mode]}{p.layout.fg_zoom > 1 ? ` · ${p.layout.fg_zoom}배 확대` : ''}</div>
            <div><b>상단 제목</b> · {p.title.enabled ? <>{SIZE[p.title.size]} <Swatch c={p.title.color} /> <Swatch c={p.title.second_line_color} />{p.title.box ? ' · 박스' : ''} · {p.title.tone}</> : '없음'}</div>
            <div><b>자막</b> · {p.caption.enabled ? <>{CAP_POS[p.caption.position]} · {SIZE[p.caption.size]} <Swatch c={p.caption.color} />{p.caption.box ? ' · 박스' : ''} · {p.caption.tone}{p.caption.highlight_color ? <> · 강조 <Swatch c={p.caption.highlight_color} /></> : null}</> : '없음'}</div>
            <div><b>후킹</b> · 처음 {p.hook.seconds}초 · {p.hook.pattern}{p.hook.zoom_punch ? ' · 확대 강조' : ''}</div>
            <div><b>속도</b> · 총 {p.pacing.total_seconds}초 · 본편 {p.pacing.segments}컷 · 컷당 최대 {p.pacing.max_clip_seconds}초{p.pacing.note ? ` · ${p.pacing.note}` : ''}</div>
            <div><b>소리</b> · 내레이션 {p.narration?.enabled ? `켬${p.narration.mid_count ? `(+중간 ${p.narration.mid_count}문장)` : ''}` : '끔'} · 스티커 {p.stickers?.enabled ? '켬' : '끔'} · 원형 화면 {p.pip?.enabled ? '켬' : '끔'} · 자막 튀는 효과 {p.caption.bounce ? (p.caption.bounce_mode === 'char' ? '글자 하나씩' : '한 줄씩') : '끔'} · 효과음 {p.sfx?.enabled ? '켬' : '끔'} · 배경음악 {p.bgm?.mode === 'auto' ? `켬(크기 ${Math.round((p.bgm.volume || 0) * 100)}%)` : '끔'}</div>
            {p.title.patterns.length > 0 && <div><b>제목 구조</b> · {p.title.patterns.join(' / ')}</div>}
          </div>
          <div className="space-y-1">
            <div className="rounded-xl bg-amber-50 p-2 dark:bg-amber-950/40"><b>우리만의 킥</b>{p.kick.length ? <ul className="mt-0.5 list-disc pl-4">{p.kick.map((k, i) => <li key={i}>{k}</li>)}</ul> : <span className="muted"> · 없음</span>}</div>
            <div className="muted"><b>배운 재료</b> · {(st.sources || []).join(', ') || '없음'}{st.avg_seconds ? ` · 평균 ${st.avg_seconds}초` : ''}{st.avg_shot_seconds ? ` · 컷 간격 평균 ${st.avg_shot_seconds}초(실측)` : ''}{st.avg_shot_seconds_est ? ` · 컷 간격 약 ${st.avg_shot_seconds_est}초(영상 분석)` : ''}{st.learned_by ? ` · ${st.learned_by}` : ''}</div>
            {(st.notes || []).map((n, i) => <div key={i} className="text-amber-700 dark:text-amber-300">※ {n}</div>)}
            {st.evidence && st.evidence.length > 0 && <details><summary className="cursor-pointer muted">판단 근거 보기</summary><ul className="mt-1 list-disc pl-4 muted">{st.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
          </div>
        </div>
        <details className="rounded-xl border border-stone-200 p-3 text-xs dark:border-stone-700">
          <summary className="cursor-pointer font-semibold">직접 고치기 (마음에 안 드는 부분만)</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <label>화면 배치<select className="input mt-0.5" value={p.layout.mode} onChange={(e) => set((d) => { d.layout.mode = e.target.value as any })}>{Object.entries(LAYOUT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>화면 확대 ({p.layout.fg_zoom}배)<input type="range" min={1} max={1.8} step={0.05} className="mt-2 w-full" value={p.layout.fg_zoom} onChange={(e) => set((d) => { d.layout.fg_zoom = Number(e.target.value) })} /></label>
            <label>자막 위치<select className="input mt-0.5" value={p.caption.position} onChange={(e) => set((d) => { d.caption.position = e.target.value as any })}>{Object.entries(CAP_POS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>제목 크기<select className="input mt-0.5" value={p.title.size} onChange={(e) => set((d) => { d.title.size = e.target.value as any })}>{Object.entries(SIZE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>자막 크기<select className="input mt-0.5" value={p.caption.size} onChange={(e) => set((d) => { d.caption.size = e.target.value as any })}>{Object.entries(SIZE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <div className="flex items-end gap-3">
              <label>제목색<input type="color" className="mt-0.5 block h-9 w-12" value={p.title.color} onChange={(e) => set((d) => { d.title.color = e.target.value })} /></label>
              <label>둘째 줄<input type="color" className="mt-0.5 block h-9 w-12" value={p.title.second_line_color || p.title.color} onChange={(e) => set((d) => { d.title.second_line_color = e.target.value })} /></label>
              <label>자막색<input type="color" className="mt-0.5 block h-9 w-12" value={p.caption.color} onChange={(e) => set((d) => { d.caption.color = e.target.value })} /></label>
              <label>강조색<input type="color" className="mt-0.5 block h-9 w-12" value={p.caption.highlight_color || '#FFD400'} onChange={(e) => set((d) => { d.caption.highlight_color = e.target.value })} /></label>
            </div>
            <label>후킹 길이(초)<input type="number" step={0.5} min={1.5} max={5} className="input mt-0.5" value={p.hook.seconds} onChange={(e) => set((d) => { d.hook.seconds = Number(e.target.value) })} /></label>
            <label>총 길이(초)<input type="number" min={18} max={60} className="input mt-0.5" value={p.pacing.total_seconds} onChange={(e) => set((d) => { d.pacing.total_seconds = Number(e.target.value) })} /></label>
            <label>본편 컷 수<input type="number" min={1} max={10} className="input mt-0.5" value={p.pacing.segments} onChange={(e) => set((d) => { d.pacing.segments = Number(e.target.value) })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.title.box} onChange={(e) => set((d) => { d.title.box = e.target.checked })} /> 제목 박스</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.hook.zoom_punch} onChange={(e) => set((d) => { d.hook.zoom_punch = e.target.checked })} /> 후킹 컷 확대 강조</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.narration?.enabled} onChange={(e) => set((d) => { d.narration = { ...(d.narration || { rate: 1.12, pattern: '' }), enabled: e.target.checked } })} /> AI 음성 내레이션(첫 장면 한 문장)</label>
            <label>영상 중간 내레이션<select className="input mt-0.5" value={p.narration?.mid_count ?? 0} onChange={(e) => set((d) => { d.narration = { ...(d.narration || { enabled: true, rate: 1.12, pattern: '' }), mid_count: Number(e.target.value) } })}><option value={0}>넣지 않음</option><option value={1}>1문장</option><option value={2}>2문장</option></select></label>
            <label>자막 튀는 효과<select className="input mt-0.5" value={p.caption.bounce ? (p.caption.bounce_mode || 'line') : 'none'} onChange={(e) => set((d) => { d.caption.bounce = e.target.value !== 'none'; if (e.target.value !== 'none') d.caption.bounce_mode = e.target.value as 'line' | 'char' })}><option value="none">없음</option><option value="line">한 줄이 통통</option><option value="char">글자가 하나씩 통통</option></select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.pip?.enabled} onChange={(e) => set((d) => { d.pip = { enabled: e.target.checked } })} /> 원형 작은 화면(반응 얼굴 함께 보여 주기)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.stickers?.enabled} onChange={(e) => set((d) => { d.stickers = { enabled: e.target.checked } })} /> 움직이는 스티커(반응·상품 장면)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.popup?.motion !== false} onChange={(e) => set((d) => { d.popup = { ...(d.popup || { position: 'top_right', size: 'medium' }), motion: e.target.checked } })} /> 사진·스티커 통통 튀는 움직임</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.sfx?.enabled} onChange={(e) => set((d) => { d.sfx = { enabled: e.target.checked } })} /> 효과음(휙·팝·딩)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.bgm?.mode === 'auto'} onChange={(e) => set((d) => { d.bgm = { ...(d.bgm || { volume: 0.1, track: '' }), mode: e.target.checked ? 'auto' : 'none' } })} /> 배경음악</label>
            <label>배경음악 크기 ({Math.round((p.bgm?.volume ?? 0.1) * 100)}%)<input type="range" min={0.03} max={0.35} step={0.01} className="mt-2 w-full" value={p.bgm?.volume ?? 0.1} onChange={(e) => set((d) => { d.bgm = { ...(d.bgm || { mode: 'none', track: '' }), volume: Number(e.target.value) } })} /></label>
            <label>상품 사진 위치<select className="input mt-0.5" value={p.popup?.position || 'top_right'} onChange={(e) => set((d) => { d.popup = { ...(d.popup || { size: 'medium' }), position: e.target.value as any } })}><option value="top_right">화면 오른쪽 위</option><option value="top_left">화면 왼쪽 위</option><option value="center">화면 가운데</option></select></label>
            <label>상품 사진 크기<select className="input mt-0.5" value={p.popup?.size || 'medium'} onChange={(e) => set((d) => { d.popup = { ...(d.popup || { position: 'top_right' }), size: e.target.value as any } })}>{Object.entries(SIZE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.end_question} onChange={(e) => set((d) => { d.end_question = e.target.checked })} /> 끝에 질문 자막</label>
          </div>
          <label className="mt-2 block">하단 고정 문구 (선택 · 내 채널 이름이나 「상품 정보는 프로필 링크 12번」 같은 안내)
            <input className="input mt-0.5" maxLength={40} placeholder="비워 두면 표시하지 않습니다" value={p.footer?.text || ''} onChange={(e) => set((d) => { d.footer = { text: e.target.value, color: d.footer?.color || '#FFFFFF' } })} />
          </label>
          <button className="btn-primary mt-3" disabled={!dirty} onClick={() => run(() => api.stylePatch(s.id, { profile: p }), '스타일 저장됨')}>고친 내용 저장</button>
        </details>
      </>)}
    </div>
  )
}
