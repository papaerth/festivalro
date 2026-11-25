import { useEffect, useRef, useState } from 'react'
import { api, LABELS } from '../api'
import type { InvestigateItem, InvestigateResult } from '../types'
import { Badge, Modal, useToast } from './ui'

/** 캡처 이미지(업로드 또는 Ctrl+V 붙여넣기)로 상품을 AI 조사하고 쿠팡·네이버 검색 링크를 제공한다. */
export default function CaptureInvestigateModal({ open, onClose, videoId, hintDefault, onAdopt }: {
  open: boolean; onClose: () => void; videoId?: number; hintDefault?: string
  onAdopt?: (it: InvestigateItem, category: 'beauty' | 'living' | 'food') => Promise<void>
}) {
  const [files, setFiles] = useState<File[]>([])
  const [hint, setHint] = useState(hintDefault || '')
  const [res, setRes] = useState<InvestigateResult | null>(null)
  const [busy, setBusy] = useState(false)
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
    if (!files.length) { toast('캡처 이미지를 올리거나 붙여넣으세요', 'err'); return }
    setBusy(true)
    try { setRes(await api.investigate(files, hint || undefined, videoId)) } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="캡처로 상품 조사 (AI)" wide>
      {node}
      <p className="mb-2 text-xs muted">영상 장면이나 쿠팡·네이버 상품 페이지를 <b>Win+Shift+S</b> 로 캡처한 뒤, 이 창이 열린 상태에서 <b>Ctrl+V</b> 로 붙여넣거나 파일을 올리세요(최대 4장). AI가 상품명·브랜드·옵션·보이는 가격을 읽고 검색어와 쿠팡·네이버쇼핑 검색 링크를 만듭니다. 결과는 추정이며 링크로 확인한 뒤 등록하세요.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files || [])].slice(0, 4)); e.target.value = '' }} />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>이미지 올리기</button>
        <input className="input flex-1" placeholder="힌트(선택): 예) 성시경이 먹은 라면, 쿠팡 페이지 캡처" value={hint} onChange={(e) => setHint(e.target.value)} />
        <button className="btn-primary" disabled={busy || files.length === 0} onClick={run}>{busy ? '조사 중…' : `조사 (${files.length}장)`}</button>
      </div>
      {files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((f, i) => <div key={i} className="relative"><img src={URL.createObjectURL(f)} alt="" className="h-20 rounded-lg border border-stone-200 object-cover dark:border-stone-700" /><button className="absolute -right-1 -top-1 rounded-full bg-stone-900 px-1.5 text-[10px] text-white" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}</div>}
      {res && (
        <div className="space-y-3">
          {res.items.length === 0 && <p className="text-sm muted">상품을 특정하지 못했습니다. {res.notes}</p>}
          {res.items.map((it, i) => (
            <div key={i} className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
              <div className="flex flex-wrap items-center gap-1"><span className="font-semibold">{it.brand ? `${it.brand} ` : ''}{it.name}</span>{it.model_or_option && <span className="muted">· {it.model_or_option}</span>}<Badge tone={it.confidence === 'high' ? 'green' : it.confidence === 'medium' ? 'amber' : 'gray'}>확신 {it.confidence}</Badge><Badge tone="gray">{it.category === 'unknown' ? '분류 미정' : LABELS.category[it.category]}</Badge>{it.visible_price && <Badge tone="blue">화면 가격 {it.visible_price}</Badge>}</div>
              <div className="mt-1 text-xs muted">근거: {it.evidence}{it.features ? ` · 특징: ${it.features}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                <a className="btn-primary px-2 py-1" href={it.links.coupang} target="_blank" rel="noreferrer">쿠팡에서 검색 ↗</a>
                <a className="btn-ghost px-2 py-1" href={it.links.naver_shopping} target="_blank" rel="noreferrer">네이버쇼핑에서 검색 ↗</a>
                <a className="btn-ghost px-2 py-1" href={it.links.google} target="_blank" rel="noreferrer">구글 ↗</a>
                {onAdopt && <button className="btn-ghost px-2 py-1" onClick={async () => { const cat = it.category === 'unknown' ? (prompt('분류: beauty / living / food', 'food') as any) : it.category; if (!['beauty', 'living', 'food'].includes(cat)) return; await onAdopt(it, cat); toast('유사 상품 후보로 등록') }}>상품 후보로 등록·연결</button>}
                <span className="muted self-center">검색어: {it.search_queries.join(' / ')}</span>
              </div>
              {it.naver_results && it.naver_results.length > 0 && (
                <div className="mt-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60">
                  <div className="mb-1 font-semibold">네이버쇼핑 API 결과 (조회 시점 가격)</div>
                  {it.naver_results.map((r, j) => <div key={j} className="flex items-center gap-2 py-0.5">{r.image && <img src={r.image} alt="" className="h-8 w-8 rounded object-cover" />}<a className="line-clamp-1 flex-1 underline" href={r.url || '#'} target="_blank" rel="noreferrer">{r.title}</a><span className="muted shrink-0">{r.price ? `${r.price.toLocaleString()}원` : ''} · {r.seller}</span></div>)}
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] muted">{res.model} · {res.disclaimer}{res.naver_api !== 'configured' ? ' · 네이버 API 키가 없어 자동 결과는 생략되고 검색 링크만 제공합니다.' : ''}</p>
        </div>
      )}
    </Modal>
  )
}
