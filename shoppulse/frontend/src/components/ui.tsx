import { useEffect, useState, type ReactNode } from 'react'
import { LABELS } from '../api'

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`badge-${tone}`} title={title}>{children}</span>
}

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet'
export const toneFor = {
  verification: (s: string | null): Tone => (s === 'verified' || s === 'confirmed' ? 'green' : s === 'rejected' ? 'red' : 'amber'),
  graph: (g: string): Tone => (g === 'spike_plateau' ? 'violet' : g === 'resurgence' || g === 'late_surge' ? 'green' : g === 'steady_rise' ? 'blue' : 'gray'),
  grade: (g: string | null): Tone => (g === 'top' ? 'green' : g === 'active' ? 'blue' : g === 'watch' ? 'amber' : 'gray'),
  status: (s: string): Tone => (s === 'published' || s === 'analyzing' ? 'green' : s === 'rejected' ? 'red' : s === 'hold' || s === 'candidate' || s === 'empty' ? 'gray' : 'blue'),
  identification: (s: string | null): Tone => (s === 'exact' ? 'green' : s === 'discontinued' ? 'red' : s === 'unidentified' || !s ? 'gray' : 'amber'),
  category: (c: string): Tone => (c === 'beauty' ? 'violet' : c === 'living' ? 'blue' : 'amber'),
  job: (s: string): Tone => (s === 'success' ? 'green' : s === 'failed' ? 'red' : s === 'partial' ? 'amber' : 'gray'),
}

export function CategoryBadge({ c }: { c: string }) {
  return <Badge tone={toneFor.category(c)}>{LABELS.category[c] || c}</Badge>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] muted">{hint}</p>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-8 text-center text-sm muted">{children}</div>
}

export function Spinner() {
  return <div className="p-8 text-center text-sm muted">불러오는 중…</div>
}

export function ErrorBox({ error, onRetry }: { error: any; onRetry?: () => void }) {
  if (!error) return null
  const msg = typeof error === 'string' ? error : error?.message || String(error)
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {msg} {onRetry && <button className="ml-2 underline" onClick={onRetry}>다시 시도</button>}
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3500)
    return () => clearTimeout(t)
  }, [msg])
  const node = msg ? (
    <div className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-2.5 text-sm shadow-lg ${msg.tone === 'ok' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-red-600 text-white'}`}>{msg.text}</div>
  ) : null
  return { toast: (text: string, tone: 'ok' | 'err' = 'ok') => setMsg({ text, tone }), node }
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' }) {
  const ring = tone === 'violet' ? 'border-l-violet-500' : tone === 'green' ? 'border-l-emerald-500' : tone === 'amber' ? 'border-l-amber-500' : tone === 'red' ? 'border-l-red-500' : tone === 'blue' ? 'border-l-blue-500' : 'border-l-stone-300 dark:border-l-stone-700'
  return (
    <div className={`card border-l-4 ${ring} p-4`}>
      <div className="text-xs muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] muted">{sub}</div>}
    </div>
  )
}

export function MetricPill({ label, value, band, basis, missing = '미확인' }: { label: string; value: number | null; band?: string | null; basis?: string | null; missing?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-800">
      <div className="text-[11px] muted">{label}{basis && basis !== 'unspecified' ? ` · ${basis}` : basis === 'unspecified' ? ' · 기준 미확인' : ''}</div>
      <div className={`text-base font-semibold tabular-nums ${value === null ? 'muted' : ''}`}>{value === null ? missing : value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</div>
      {band && <div className="text-[11px] text-stone-600 dark:text-stone-400">{band}</div>}
    </div>
  )
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

export function Confirm({ onConfirm, children, className = 'btn-danger' }: { onConfirm: () => void; children: ReactNode; className?: string }) {
  const [arm, setArm] = useState(false)
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 3000); return () => clearTimeout(t) }, [arm])
  return <button className={className} onClick={() => (arm ? onConfirm() : setArm(true))}>{arm ? '정말 삭제? (다시 클릭)' : children}</button>
}
