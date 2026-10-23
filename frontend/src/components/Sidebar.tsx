import { NavLink } from 'react-router-dom'
import { ChevronRight, Mountain } from 'lucide-react'
import { primaryNavigation, secondaryNavigation } from './navigation'

export function Sidebar() {
  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <NavLink to="/" end className="workspace-brand focus-visible:ring-2 focus-visible:ring-electric">
          <div className="workspace-brand__mark">
          <Mountain size={20} strokeWidth={2.5} />
        </div>
        <div>
          <strong>Auto Escrow</strong>
          <small>Workspace</small>
        </div>
      </NavLink>

      <nav className="workspace-primary-nav" aria-label="Primary navigation">
        {primaryNavigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-sage ${isActive ? 'border-line bg-sky text-ink' : 'border-transparent text-slate-600 hover:bg-sky hover:text-ink'}`}
          >
            <span className="flex items-center gap-3"><Icon size={17} />{label}</span>
            <ChevronRight className="opacity-0 transition group-hover:opacity-50" size={14} />
          </NavLink>
        ))}
      </nav>

      <div className="workspace-sidebar__note">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">Demo workspace</span>
          <span className="h-2 w-2 rounded-full bg-electric" aria-label="Demo workspace active" />
        </div>
        <p className="text-xs leading-5 text-slate-600">Local records, simulated escrow, and no third-party execution.</p>
        {secondaryNavigation.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-electric ${isActive ? 'text-ink' : 'text-electric hover:text-ink'}`}><Icon size={14} />{label}</NavLink>)}
      </div>
    </aside>
  )
}
