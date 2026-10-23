import { useEffect, useRef, useState } from 'react'
import { Menu, Mountain, Radio, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const isLanding = location.pathname === '/'
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const wasMobileOpen = useRef(false)

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
    wasMobileOpen.current = true
    const firstLink = mobileNavRef.current?.querySelector<HTMLElement>('a')
    firstLink?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if (event.key !== 'Tab') return
      const focusable = Array.from(mobileNavRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen && wasMobileOpen.current) {
      wasMobileOpen.current = false
      mobileTriggerRef.current?.focus()
    }
  }, [mobileOpen])

  const status = apiState === 'connected'
    ? { tone: 'success' as const, label: 'API connected' }
    : apiState === 'loading'
      ? { tone: 'warning' as const, label: 'Connecting' }
      : { tone: 'danger' as const, label: 'API offline' }

  return (
    <div className={`min-h-screen text-ink ${isLanding ? 'landing-shell' : 'bg-ivory'}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="flex min-h-screen">
        <div className="min-w-0 flex-1">
          <header className={isLanding ? 'landing-header' : 'workspace-header'} aria-label="Application header">
            <div className={isLanding ? 'landing-header__inner' : 'workspace-header__inner'}>
              {isLanding ? <>
                <div className="flex items-center gap-3">
                  <button ref={mobileTriggerRef} type="button" onClick={() => setMobileOpen((open) => !open)} className="icon-button landing-menu-button lg:hidden" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-controls="mobile-navigation" aria-expanded={mobileOpen}>
                    {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                  </button>
                  <NavLink to="/" end className="landing-brand focus-visible:ring-2 focus-visible:ring-electric">
                    <span className="landing-brand__mark" aria-hidden="true"><Mountain size={20} strokeWidth={2.4} /></span>
                    <span><strong>Auto Escrow</strong><small>clearer work, safer release</small></span>
                  </NavLink>
                </div>
                <nav className="landing-desktop-nav hidden lg:flex" aria-label="Primary navigation">
                  <NavLink to="/" end>Home</NavLink>
                  <NavLink to="/agents">Agents</NavLink>
                  <NavLink to="/jobs">Transactions</NavLink>
                  <a href="#how-it-works">How it works</a>
                </nav>
                <div className="flex items-center gap-2 sm:gap-3">
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  <Link to="/agents" className="landing-header__action hidden sm:inline-flex">Open workspace</Link>
                </div>
              </> : <>
                <div className="workspace-header__brand-group">
                  <button ref={mobileTriggerRef} type="button" onClick={() => setMobileOpen((open) => !open)} className="icon-button lg:hidden" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-controls="mobile-navigation" aria-expanded={mobileOpen}>
                    {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                  </button>
                  <NavLink to="/" end className="workspace-brand focus-visible:ring-2 focus-visible:ring-electric">
                    <span className="workspace-brand__mark" aria-hidden="true"><Mountain size={19} strokeWidth={2.4} /></span>
                    <span><strong>Auto Escrow</strong><small>workspace</small></span>
                  </NavLink>
                </div>
                <nav className="workspace-primary-nav hidden lg:flex" aria-label="Primary navigation">
                  {[...primaryNavigation].map(({ label, to }) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
                  <NavLink to="/settings">Settings</NavLink>
                </nav>
                <div className="workspace-header__actions">
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  <Link to="/jobs/new" className="workspace-new-job hidden sm:inline-flex">New job</Link>
                </div>
              </>}
            </div>
            {!isLanding && <div className="workspace-context-bar"><nav aria-label="Breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong aria-current="page">{title}</strong></nav><span className="workspace-context-bar__note"><Radio size={14} className="text-electric" /> Local demo · simulated records</span></div>}
          </header>

          {mobileOpen && <>
            {isLanding && <button type="button" className="landing-mobile-backdrop lg:hidden" aria-label="Close navigation" tabIndex={-1} onClick={() => setMobileOpen(false)} />}
            <div id="mobile-navigation" ref={mobileNavRef} className={isLanding ? 'landing-mobile-panel lg:hidden' : 'workspace-mobile-panel lg:hidden'}>
            {isLanding ? <nav className="landing-mobile-nav" aria-label="Mobile navigation">
              <NavLink to="/" end onClick={() => setMobileOpen(false)}>Home</NavLink>
              <NavLink to="/agents" onClick={() => setMobileOpen(false)}>Agents</NavLink>
              <NavLink to="/jobs" onClick={() => setMobileOpen(false)}>Transactions</NavLink>
              <a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a>
              <NavLink to="/settings" onClick={() => setMobileOpen(false)}>Settings</NavLink>
            </nav> : <nav className="workspace-mobile-nav" aria-label="Mobile navigation">
               {[...primaryNavigation, ...secondaryNavigation.map(({ label, to }) => ({ label, to }))].map(({ label, to }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)}>{label}</NavLink>)}
               <NavLink to="/jobs/new" onClick={() => setMobileOpen(false)} className="workspace-mobile-nav__action">Create a job</NavLink>
            </nav>}
            </div>
          </>}

           <main id="main-content" tabIndex={-1} className={isLanding ? 'app-content landing-main outline-none' : 'app-content workspace-main outline-none'}><Outlet /></main>
           <footer className={isLanding ? 'landing-footer' : 'workspace-footer'}>
             {isLanding ? <div className="landing-footer__inner"><span>Auto Escrow</span><p>Local demo · simulated records · no real funds move here.</p></div> : 'Auto Escrow is a local demo. Balances, agent records, and execution results are simulated or persisted by the connected API; no real funds move here.'}
           </footer>
         </div>
       </div>
    </div>
  )
}
