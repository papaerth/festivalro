import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  ['/', '대시보드', '◈'], ['/candidates', '소싱 후보', '◇'], ['/videos', '영상', '▶'], ['/channels', '연예인·채널', '★'],
  ['/products', '상품', '◆'], ['/schedule', '하루 9편 편성표', '▦'], ['/data', '데이터 수집·가져오기', '⇅'], ['/settings', '설정·백업', '⚙'],
] as const

export default function Layout() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [open, setOpen] = useState(false)
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
        <div className="mt-6 px-2">
          <button className="btn-ghost w-full justify-center text-xs" onClick={() => setDark(!dark)}>{dark ? '☀ 라이트 모드' : '☾ 다크 모드'}</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <button className="btn-ghost mb-3 lg:hidden" onClick={() => setOpen(true)}>☰ 메뉴</button>
        <Outlet />
      </main>
    </div>
  )
}
