import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { OriginalMatch } from '../types'
import { Modal, useToast } from './ui'

/** 캡처 화면(또는 쇼츠 썸네일)으로 원본 영상 찾기 — Google Vision 같은 장면 검색(키 있을 때) + AI 화면 읽기 → YouTube 검색 */
export default function CaptureOriginalModal({ open, onClose, candidateId, onResult }: {
  open: boolean; onClose: () => void; candidateId: number; onResult: (m: OriginalMatch) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [useThumb, setUseThumb] = useState(true)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<OriginalMatch | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, node } = useToast()
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { setFiles((p) => [...p, ...imgs].slice(0, 4)); toast(`붙여넣은 이미지 ${imgs.length}장 추가`) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])
  const run = async () => {
    if (!files.length && !useThumb) { toast('캡처를 붙여넣거나 「쇼츠 썸네일 사용」을 켜세요', 'err'); return }
    setBusy(true)
    try {
      const r = await api.findOriginalByImage(candidateId, files, useThumb)
      setRes(r.match); onResult(r.match)
      toast(r.match.linked ? `원본 자동 연결(${r.match.confidence})` : r.match.candidates.length ? `롱폼 후보 ${r.match.candidates.length}개 — 뒤 화면 목록에서 고르세요` : (r.match.reason || '찾지 못했습니다'), r.match.linked ? 'ok' : 'err')
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const ai = res?.image_analysis?.ai
  const vis = res?.image_analysis?.vision
  return (
    <Modal open={open} onClose={onClose} title="캡처로 원본 영상 찾기 (이미지 검색 + AI)" wide>
      {node}
      <p className="mb-2 text-xs muted">쇼츠를 재생하다 인물 얼굴·자막·로고가 잘 보이는 장면을 <b>Win+Shift+S</b> 로 캡처한 뒤 이 창에서 <b>Ctrl+V</b> 로 붙여넣으세요(최대 4장). Google Vision 키가 있으면 같은 장면을 쓴 유튜브 페이지를 직접 찾고(구글 렌즈 방식), 없으면 AI가 화면 속 인물·자막을 읽어 검색어를 만들고 YouTube 에서 찾습니다. 검색 1회당 YouTube 할당량 100.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files || [])].slice(0, 4)); e.target.value = '' }} />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>이미지 올리기</button>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={useThumb} onChange={(e) => setUseThumb(e.target.checked)} /> 쇼츠 썸네일도 사용</label>
        <button className="btn-primary" disabled={busy} onClick={run}>{busy ? '찾는 중… (최대 1분)' : `원본 찾기 (${files.length}장${useThumb ? ' + 썸네일' : ''})`}</button>
      </div>
      {files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((f, i) => <div key={i} className="relative"><img src={URL.createObjectURL(f)} alt="" className="h-20 rounded-lg border border-stone-200 object-cover dark:border-stone-700" /><button className="absolute -right-1 -top-1 rounded-full bg-stone-900 px-1.5 text-[10px] text-white" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}</div>}
      {res && (
        <div className="space-y-2 text-xs">
          {vis && <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60"><b>Google Vision:</b> 유튜브 일치 {vis.youtube_ids?.length || 0}건{vis.entities?.length ? ` · 인식 개체: ${vis.entities.slice(0, 6).join(', ')}` : ''}{vis.pages?.length ? <ul className="mt-1">{vis.pages.slice(0, 5).map((p, i) => <li key={i} className="truncate"><a className="underline" href={p.url} target="_blank" rel="noreferrer">{p.title || p.url}</a></li>)}</ul> : null}</div>}
          {ai && <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60"><b>AI 화면 읽기</b> <span className="muted">({ai.model})</span><div>인물: {ai.people?.length ? ai.people.join(', ') : '불명'} · 프로그램/채널 추정: {ai.program_guess || '불명'}</div>{ai.on_screen_text && <div>화면 글자: {ai.on_screen_text}</div>}<div>검색어: {(ai.search_queries || []).join(' / ')}</div>{ai.notes && <div className="muted">{ai.notes}</div>}</div>}
          <div><b>결과:</b> {res.reason} {res.api_searches ? `· YouTube 검색 ${res.api_searches}회` : ''}</div>
          {res.notes?.map((n, i) => <div key={i} className="text-amber-700 dark:text-amber-300">{n}</div>)}
          {res.candidates.length > 0 && <div className="muted">롱폼 후보 {res.candidates.length}개가 뒤 화면 「원본 영상」 카드에 순위대로 표시됩니다. 창을 닫고 「이 영상이 원본」을 누르세요.</div>}
        </div>
      )}
    </Modal>
  )
}
