import { useState } from 'react'
import { api } from '../api'
import type { ResolvedLinks, VideoDetail } from '../types'
import { Badge, useToast } from './ui'

/** 설명란·인포크링크 등 링크 페이지에서 수집한 상품 링크 목록 + 상품 등록. */
export default function ProductLinks({ video, defaultCategory, onChanged }: { video: VideoDetail; defaultCategory: 'beauty' | 'living' | 'food'; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<ResolvedLinks | null>(video.resolved_links)
  const { toast, node } = useToast()
  const run = async () => { setBusy(true); try { const r = await api.resolveLinks(video.id); setLinks(r); toast(r.products.length ? `상품 링크 ${r.products.length}개 수집` : '상품 링크를 찾지 못함'); onChanged() } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) } }
  const register = async (url: string, title: string) => {
    const name = prompt('상품명(링크 제목을 참고해 수정)', title || '') ; if (!name) return
    const cat = prompt('분류: beauty / living / food', defaultCategory) as any; if (!['beauty', 'living', 'food'].includes(cat)) return
    try { await api.productFromLink(video.id, { url, name, category: cat }); toast('상품(유사 후보)·판매처 등록, 영상에 연결'); onChanged() } catch (e: any) { toast(e.message, 'err') }
  }
  const hubCount = (video.description || '').match(/inpock|linktr\.ee|litt\.ly|bio\.link|lnk\.bio|taplink|beacons\.ai|lit\.link/gi)?.length || 0
  return (
    <div className="rounded-xl border border-stone-200 p-2 text-xs dark:border-stone-800">
      {node}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">제품 링크 수집 <span className="muted font-normal">(설명란 · 채널 소개 · 인포크링크/링크트리 등 링크 페이지)</span>{hubCount > 0 && <Badge tone="blue">링크 페이지 {hubCount}</Badge>}</span>
        <button className="btn-primary px-2 py-1" disabled={busy} onClick={run}>{busy ? '수집 중…' : links ? '다시 수집' : '링크 수집'}</button>
      </div>
      {!links && <p className="muted">원 게시자가 설명란이나 프로필 링크 페이지에 걸어둔 쿠팡·스마트스토어 상품 링크를 따라가 모읍니다. 단축 링크는 실제 주소까지 확인합니다. 유튜브 쇼핑 '제품 태그'는 공식 API 가 제공하지 않아 포함되지 않습니다.</p>}
      {links && (
        <div className="space-y-1">
          {links.hubs.length > 0 && <div className="muted">링크 페이지: {links.hubs.map((h) => `${h.host} (링크 ${h.links_found}개 중 상품 ${h.shopping_links})`).join(' · ')}</div>}
          {links.products.length === 0 && <div className="muted">상품 링크 없음. {links.hubs.length === 0 ? '설명란·채널 소개에 링크 페이지나 상품 링크가 없습니다.' : '링크 페이지에 상품 링크가 없거나 화면에서만 렌더링되는 형식입니다 — 페이지를 열어 캡처로 조사하세요.'}</div>}
          {links.products.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60">
              <Badge tone={l.host.includes('coupang') ? 'amber' : 'green'}>{l.host.includes('coupang') ? '쿠팡' : l.host.includes('naver') ? '네이버' : l.host}</Badge>
              <div className="min-w-0 flex-1"><div className="line-clamp-1 font-medium">{l.title || '(제목 없음 — 링크 열어 확인)'}</div><div className="muted truncate">{l.final_url} · 출처 {l.via}</div></div>
              <a className="underline" href={l.final_url} target="_blank" rel="noreferrer">열기</a>
              <button className="btn-ghost px-2 py-1" onClick={() => register(l.final_url, l.title)}>상품으로 등록</button>
            </div>
          ))}
          {links.others.length > 0 && <details className="muted"><summary className="cursor-pointer">기타 링크 {links.others.length}개</summary>{links.others.map((o, i) => <div key={i} className="truncate">{o.title ? `${o.title} · ` : ''}<a className="underline" href={o.final_url} target="_blank" rel="noreferrer">{o.final_url}</a></div>)}</details>}
          <div className="muted">{links.resolved_at.slice(0, 16).replace('T', ' ')} 수집 · 타인 게시 링크이므로 제작 시 내 제휴 링크로 교체하세요.</div>
        </div>
      )}
    </div>
  )
}
