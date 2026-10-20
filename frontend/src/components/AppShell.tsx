import { useEffect, useRef, useState } from 'react'
import { Menu, Radio, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { primaryNavigation, secondaryNavigation } from './navigation'
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

function getPageTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname]
  if (pathname.endsWith('/matching')) return 'Agent matching'
  if (pathname.endsWith('/agreement')) return 'Professional agreement'
  if (pathname.endsWith('/escrow')) return 'Escrow details'
  if (pathname.endsWith('/execution')) return 'Execution workspace'
  if (pathname.endsWith('/disputes/new')) return 'Raise a dispute'
  if (pathname.startsWith('/disputes/')) return 'Dispute review'
  if (pathname.startsWith('/agents/')) return 'Agent details'
  if (pathname.startsWith('/jobs/')) return 'Job details'
  return 'Workspace'
}

export function AppShell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [apiState, setApiState] = useState<'loading' | 'connected' | 'error'>('loading')
  const title = getPageTitle(location.pathname)
  const mobileNavRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    api.health().then(() => {
      if (active) setApiState('connected')
    }).catch(() => {
      if (active) setApiState('error')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    document.title = `${title} · Auto Escrow`
  }, [location.pathname, title])

  useEffect(() => {
    if (!mobileOpen) return
    const firstLink = mobileNavRef.current?.querySelector<HTMLElement>('a')
    firstLink?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

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
          <header className="sticky top-0 z-20 border-b border-line/80 bg-ink/90 px-4 py-4 backdrop-blur-md sm:px-8" aria-label="Application header">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMobileOpen((open) => !open)} className="icon-button lg:hidden" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-controls="mobile-navigation" aria-expanded={mobileOpen}>
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div>
                  <nav aria-label="Breadcrumb" className="text-xs font-medium text-slate-500">
                    <span>Workspace</span><span className="px-1.5 text-slate-700" aria-hidden="true">/</span><span aria-current="page">{title}</span>
                  </nav>
                  <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <div className="hidden items-center gap-2 border-l border-line pl-3 text-xs text-slate-400 sm:flex"><Radio size={14} className="text-electric" /> Local demo mode</div>
              </div>
            </div>
          </header>

          {mobileOpen && <div id="mobile-navigation" ref={mobileNavRef} className="border-b border-line bg-[#0e1829] px-4 py-3 shadow-lg shadow-black/10 lg:hidden">
            <nav className="grid grid-cols-2 gap-2" aria-label="Mobile navigation">
              {[...primaryNavigation, ...secondaryNavigation.map(({ label, to }) => ({ label, to }))].map(({ label, to }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `rounded-lg border px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'border-accent/20 bg-accent/10 text-accent' : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>{label}</NavLink>)}
            </nav>
          </div>}

          <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] px-4 py-7 outline-none sm:px-8 sm:py-9"><Outlet /></main>
          <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-xs text-slate-600 sm:px-8">Auto Escrow is a local demo foundation. Escrow balances and agent records are not real financial or third-party service data.</footer>
        </div>
      </div>
      <a className="skip-link" href="#main-content">Skip to main content</a>
    </div>
  )
}
