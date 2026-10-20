import { useEffect, useState } from 'react'
import { Menu, Radio, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { api } from '../lib/api'
import { StatusPill } from './StatusPill'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/agents': 'Agent marketplace',
  '/jobs': 'Jobs',
  '/jobs/new': 'Create job',
  '/escrow': 'Escrow ledger',
  '/disputes': 'Disputes',
  '/settings': 'Settings',
}

export function AppShell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [apiState, setApiState] = useState<'loading' | 'connected' | 'error'>('loading')
  const title = titles[location.pathname] ?? (location.pathname.endsWith('/matching') ? 'Agent matching' : location.pathname.endsWith('/agreement') ? 'Professional agreement' : location.pathname.endsWith('/escrow') ? 'Escrow details' : location.pathname.startsWith('/agents/') ? 'Agent details' : location.pathname.startsWith('/jobs/') ? 'Job details' : 'Workspace')

  useEffect(() => {
    let active = true
    api.health().then(() => {
      if (active) setApiState('connected')
    }).catch(() => {
      if (active) setApiState('error')
    })
    return () => { active = false }
  }, [])

  const status = apiState === 'connected'
    ? { tone: 'success' as const, label: 'API connected' }
    : apiState === 'loading'
      ? { tone: 'warning' as const, label: 'Connecting' }
      : { tone: 'danger' as const, label: 'API offline' }

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-line/80 bg-ink/90 px-4 py-4 backdrop-blur-md sm:px-8">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMobileOpen(!mobileOpen)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}>
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div>
                  <p className="text-xs font-medium text-slate-500">Workspace / {title}</p>
                  <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <div className="hidden items-center gap-2 border-l border-line pl-3 text-xs text-slate-400 sm:flex"><Radio size={14} className="text-electric" /> Local demo mode</div>
              </div>
            </div>
          </header>

          {mobileOpen && <div className="border-b border-line bg-[#0e1829] px-4 py-3 lg:hidden">
            <nav className="grid grid-cols-2 gap-2" aria-label="Mobile navigation">
              {['/', '/agents', '/jobs', '/escrow', '/disputes', '/settings'].map((to) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-accent/10 text-accent' : 'text-slate-400'}`}>{titles[to]}</NavLink>)}
            </nav>
          </div>}

          <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9"><Outlet /></main>
          <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-xs text-slate-600 sm:px-8">Auto Escrow is a local demo foundation. Escrow balances and agent records are not real financial or third-party service data.</footer>
        </div>
      </div>
      <Link className="sr-only" to="/">Skip to dashboard</Link>
    </div>
  )
}
