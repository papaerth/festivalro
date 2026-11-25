import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  ['/', '오늘의 6편', '◈'], ['/settings', '설정·백업', '⚙'],
] as const
// 자동으로 처리되는 작업 화면. 평소에는 접어 둔다(대시보드의 추천 카드에서 상세로 바로 들어갈 수 있음).
const tools = [
  ['/candidates', '소싱 후보(전체)', '◇'], ['/videos', '영상(전체)', '▶'], ['/channels', '연예인·채널', '★'],
  ['/products', '상품', '◆'], ['/schedule', '하루 9편 편성표', '▦'], ['/data', '데이터 수집·가져오기', '⇅'],
] as const

export default function Layout() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [open, setOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(() => { try { return localStorage.getItem('sp-tools') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('sp-tools', toolsOpen ? '1' : '0') } catch {} }, [toolsOpen])
  const [down, setDown] = useState<null | { since: number; tries: number }>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    const probe = async (tries: number) => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (r.ok) { if (alive) { setDown(null); window.location.reload() } ; return }
      } catch {}
      if (alive) { setDown((d) => (d ? { ...d, tries } : d)); timer = setTimeout(() => probe(tries + 1), 3000) }
    }
    const onDown = () => { setDown((d) => { if (d) return d; timer = setTimeout(() => probe(1), 3000); return { since: Date.now(), tries: 0 } }) }
    window.addEventListener('sp-server-down', onDown)
    return () => { alive = false; window.removeEventListener('sp-server-down', onDown); if (timer) clearTimeout(timer) }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('sp-theme', dark ? 'dark' : 'light') } catch {}
  }, [dark])
  return (
    <div className="flex min-h-full">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-stone-200 bg-white p-4 transition dark:border-stone-800 dark:bg-stone-900 lg:static lg:translate-x-0 ${open ? '' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="mb-6 px-2">
          <div className="text-lg font-bold tracking-tight">SHOPPULSE <span className="text-stone-400">3.0</span></div>
          <div className="text-[11px] muted">연예인 유튜브 쇼핑 쇼츠 소싱</div>
        </div>
        <nav className="space-y-1">
          {nav.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
              <span className="w-4 text-center text-xs opacity-70">{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4">
          <button className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs muted hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => setToolsOpen(!toolsOpen)} title="접속할 때마다 자동으로 처리되는 작업들입니다. 확인이 필요할 때만 여세요.">
            <span>작업 도구 (자동 처리됨)</span><span>{toolsOpen ? '▾' : '▸'}</span>
          </button>
          {toolsOpen && <nav className="mt-1 space-y-1">
            {tools.map(([to, label, icon]) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs ${isActive ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                <span className="w-4 text-center text-xs opacity-70">{icon}</span>{label}
              </NavLink>
            ))}
          </nav>}
        </div>
        <div className="mt-6 px-2">
          <button className="btn-ghost w-full justify-center text-xs" onClick={() => setDark(!dark)}>{dark ? '☀ 라이트 모드' : '☾ 다크 모드'}</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        {down && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <b>서버에 연결할 수 없습니다.</b> 「SHOPPULSE server」 창이 닫혔거나 재시작 중입니다(업데이트 직후라면 잠시 기다리세요). 서버가 꺼져 있으면 바탕화면 아이콘 또는 start.bat 으로 다시 실행하세요. 연결되면 자동으로 새로고침합니다. <span className="muted">(재시도 {down.tries}회)</span>
          </div>
        )}
        <button className="btn-ghost mb-3 lg:hidden" onClick={() => setOpen(true)}>☰ 메뉴</button>
        <Outlet />
      </main>
    </div>
  )
}
