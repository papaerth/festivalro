import { useState } from 'react'
import { api, fmt } from '../api'
import type { OfferSearch, OfferSearchItem } from '../types'
import { Badge, Modal, useToast } from './ui'

/** 네이버 쇼핑·쿠팡 파트너스 공식 API 로 판매처를 찾아 상품의 판매처로 추가한다. */
export default function OfferSearchModal({ open, onClose, productId, initialQuery, onAdded }: { open: boolean; onClose: () => void; productId: number; initialQuery: string; onAdded: () => void }) {
  const [q, setQ] = useState(initialQuery)
  const [res, setRes] = useState<OfferSearch | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, node } = useToast()
  const run = async () => { setBusy(true); try { setRes(await api.searchOffers(q, 10)) } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) } }
  const add = async (it: OfferSearchItem) => {
    try {
      await api.addOffer(productId, { seller: it.seller, url: it.url, price: it.price, stock_status: 'in_stock', affiliate_available: it.affiliate_available, affiliate_program: it.affiliate_program, source: it.seller.startsWith('쿠팡') ? 'coupang_api' : 'naver_api', notes: `검색 결과: ${it.title}` })
      toast('판매처 추가 (조회 시점 가격)'); onAdded()
    } catch (e: any) { toast(e.message, 'err') }
  }
  const Block = ({ title, r }: { title: string; r: { status: string; items: OfferSearchItem[]; note: string } }) => (
    <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">{title} <Badge tone={r.status === 'ok' ? 'green' : r.status === 'not_configured' ? 'amber' : 'red'}>{r.status === 'ok' ? `${r.items.length}건` : r.status === 'not_configured' ? '키 미설정' : '오류'}</Badge></div>
      <p className="mb-2 text-[11px] muted">{r.note}</p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {r.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60">
            {it.image && <img src={it.image} alt="" className="h-10 w-10 rounded object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <div className="min-w-0 flex-1"><div className="line-clamp-1 font-medium">{it.title}</div><div className="muted">{it.seller} · {it.price ? `${it.price.toLocaleString()}원` : '가격 미표기'}{it.brand ? ` · ${it.brand}` : ''}{it.affiliate_available ? ' · 제휴 링크' : ''}</div></div>
            {it.url && <a className="underline" href={it.url} target="_blank" rel="noreferrer">열기</a>}
            <button className="btn-ghost px-2 py-1" onClick={() => add(it)}>판매처로 추가</button>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <Modal open={open} onClose={onClose} title="판매처 조회 (네이버 쇼핑 · 쿠팡 파트너스)" wide>
      {node}
      <div className="mb-3 flex gap-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="상품명·브랜드" /><button className="btn-primary" disabled={busy || !q.trim()} onClick={run}>{busy ? '조회 중…' : '조회'}</button></div>
      <p className="mb-3 text-[11px] muted">공식 API 만 사용합니다. 가격·재고는 조회 시점 기준이며 판매처로 추가할 때 확인 시각이 함께 저장됩니다. 쿠팡 파트너스 링크를 쓰면 제휴 고지가 필요합니다. 키는 .env 의 NAVER_CLIENT_ID/SECRET, COUPANG_ACCESS_KEY/SECRET.</p>
      {res && <div className="grid gap-3 md:grid-cols-2"><Block title="네이버 쇼핑" r={res.naver} /><Block title="쿠팡 파트너스" r={res.coupang} /></div>}
      {!res && <p className="text-sm muted">조회 버튼을 누르세요. 초기 검색어는 상품명입니다. {fmt.date(null) && ''}</p>}
    </Modal>
  )
}
