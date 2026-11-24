import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, LABELS } from '../api'
import { useAsync } from '../hooks'
import { Badge, Confirm, ErrorBox, Field, Modal, Select, Spinner, toneFor, useToast } from '../components/ui'
import type { Product } from '../types'

export default function Products() {
  const [f, setF] = useState<Record<string, string>>({})
  const q = useAsync(() => api.products(f), [JSON.stringify(f)])
  const { toast, node } = useToast()
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [offerFor, setOfferFor] = useState<Product | null>(null)
  const [offer, setOffer] = useState<Record<string, any>>({ seller: '쿠팡', stock_status: 'unknown', currency: 'KRW' })
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); q.reload() } catch (e: any) { toast(e.message, 'err') } }

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">상품</h1><p className="text-sm muted">상품명이 모호하면 유사 제품을 동일 제품으로 확정하지 마세요. 가격·재고는 확인 시점 기준입니다. 쿠팡·네이버 자동 조회는 미구현(수동 입력).</p></div>
        <button className="btn-primary" onClick={() => setEdit({ name: '', category: 'food', identification_status: 'unidentified' })}>+ 상품 등록</button>
      </div>
      <div className="card grid gap-3 p-4 md:grid-cols-4">
        <Field label="검색"><input className="input" value={f.q || ''} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="카테고리"><Select value={f.category || ''} onChange={(v) => setF({ ...f, category: v })} placeholder="전체" options={Object.entries(LABELS.category) as [string, string][]} /></Field>
        <Field label="확인 상태"><Select value={f.identification_status || ''} onChange={(v) => setF({ ...f, identification_status: v })} placeholder="전체" options={Object.entries(LABELS.identification) as [string, string][]} /></Field>
        <div className="flex items-end"><button className="btn-ghost w-full" onClick={() => setF({})}>초기화</button></div>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {!q.data ? <Spinner /> : q.data.length === 0 ? <div className="card p-8 text-center text-sm muted">상품이 없습니다.</div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-xs muted">{p.brand || '브랜드 미확인'} {p.model_name ? `· ${p.model_name}` : ''}</div><div className="font-semibold">{p.name}</div></div>
                {p.image_url && <img src={p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
              </div>
              <div className="mt-2 flex flex-wrap gap-1"><Badge tone={toneFor.category(p.category)}>{LABELS.category[p.category]}</Badge>{p.subcategory && <Badge tone="gray">{p.subcategory}</Badge>}<Badge tone={toneFor.identification(p.identification_status)}>{LABELS.identification[p.identification_status]}</Badge><Badge tone="gray">언급 {p.mention_count}회</Badge>{p.is_demo && <Badge tone="red">DEMO</Badge>}</div>
              {p.features && <p className="mt-2 line-clamp-2 text-xs muted">{p.features}</p>}
              <div className="mt-2 space-y-1 text-xs">
                {(p.offers || []).map((o) => <div key={o.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-2 py-1 dark:bg-stone-800/60"><span>{o.seller} · {o.price ? `${o.price.toLocaleString()}원` : '가격 미확인'} · {LABELS.stock[o.stock_status]} · 제휴 {o.affiliate_available === null ? '미확인' : o.affiliate_available ? `가능${o.affiliate_program ? `(${o.affiliate_program})` : ''}` : '불가'} <span className="muted">· {fmt.date(o.checked_at)} 기준</span></span><span className="flex gap-2">{o.url && <a className="underline" href={o.url} target="_blank" rel="noreferrer">링크</a>}<button className="text-red-600" onClick={() => act(() => api.deleteOffer(p.id, o.id), '삭제')}>✕</button></span></div>)}
                {(p.offers || []).length === 0 && <div className="muted">판매처 미확인</div>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1 text-xs"><button className="btn-ghost px-2 py-1" onClick={() => setEdit(p)}>수정</button><button className="btn-ghost px-2 py-1" onClick={() => { setOffer({ seller: '쿠팡', stock_status: 'unknown', currency: 'KRW' }); setOfferFor(p) }}>+ 판매처</button><Link to={`/videos?q=`} className="btn-ghost px-2 py-1">영상에서 연결</Link><Confirm className="btn-danger px-2 py-1" onConfirm={() => act(() => api.deleteProduct(p.id), '삭제')}>삭제</Confirm></div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '상품 수정' : '상품 등록'}>
        {edit && <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="상품명 *" hint="미확인이면 '(미확정)' 등을 붙여 구분하세요."><input className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field></div>
          <Field label="브랜드"><input className="input" value={edit.brand || ''} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></Field>
          <Field label="모델명"><input className="input" value={edit.model_name || ''} onChange={(e) => setEdit({ ...edit, model_name: e.target.value })} /></Field>
          <Field label="카테고리 *"><Select value={edit.category || 'food'} onChange={(v) => setEdit({ ...edit, category: v as any })} options={Object.entries(LABELS.category) as [string, string][]} /></Field>
          <Field label="세부 분류"><input className="input" value={edit.subcategory || ''} onChange={(e) => setEdit({ ...edit, subcategory: e.target.value })} placeholder="스킨케어 / 주방용품 / 간편식 …" /></Field>
          <Field label="확인 상태"><Select value={edit.identification_status || 'unidentified'} onChange={(v) => setEdit({ ...edit, identification_status: v })} options={Object.entries(LABELS.identification) as [string, string][]} /></Field>
          <Field label="이미지 URL"><input className="input" value={edit.image_url || ''} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="제품 특징"><textarea className="input" rows={2} value={edit.features || ''} onChange={(e) => setEdit({ ...edit, features: e.target.value })} /></Field></div>
          <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>취소</button><button className="btn-primary" onClick={() => { const b: any = { ...edit }; delete b.id; delete b.offers; delete b.mention_count; delete b.updated_at; act(() => (edit.id ? api.patchProduct(edit.id, b) : api.createProduct(b)), '상품 저장').then(() => setEdit(null)) }}>저장</button></div>
        </div>}
      </Modal>
      <Modal open={!!offerFor} onClose={() => setOfferFor(null)} title={`판매처 추가 — ${offerFor?.name}`}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="판매처"><input className="input" value={offer.seller} onChange={(e) => setOffer({ ...offer, seller: e.target.value })} /></Field>
          <Field label="가격(원)"><input className="input" value={offer.price || ''} onChange={(e) => setOffer({ ...offer, price: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="판매 링크"><input className="input" value={offer.url || ''} onChange={(e) => setOffer({ ...offer, url: e.target.value })} /></Field></div>
          <Field label="재고·판매 상태"><Select value={offer.stock_status} onChange={(v) => setOffer({ ...offer, stock_status: v })} options={Object.entries(LABELS.stock) as [string, string][]} /></Field>
          <Field label="제휴 적용"><Select value={offer.affiliate_available === undefined ? '' : String(offer.affiliate_available)} onChange={(v) => setOffer({ ...offer, affiliate_available: v === '' ? undefined : v === 'true' })} placeholder="미확인" options={[['true', '가능'], ['false', '불가']]} /></Field>
          <Field label="제휴 프로그램"><input className="input" value={offer.affiliate_program || ''} onChange={(e) => setOffer({ ...offer, affiliate_program: e.target.value })} placeholder="쿠팡 파트너스 / 유튜브 쇼핑" /></Field>
          <Field label="확인 시각" hint="비우면 지금"><input type="datetime-local" className="input" value={offer.checked_at || ''} onChange={(e) => setOffer({ ...offer, checked_at: e.target.value })} /></Field>
          <div className="col-span-2 flex justify-end"><button className="btn-primary" onClick={() => offerFor && act(() => api.addOffer(offerFor.id, { ...offer, price: offer.price ? Number(offer.price) : null, affiliate_available: offer.affiliate_available ?? null, checked_at: offer.checked_at || null }), '판매처 저장').then(() => setOfferFor(null))}>저장</button></div>
        </div>
      </Modal>
    </div>
  )
}
