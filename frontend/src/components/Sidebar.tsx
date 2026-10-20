import { NavLink } from 'react-router-dom'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { primaryNavigation, secondaryNavigation } from './navigation'

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-[#0e1829] px-4 py-5 lg:flex lg:flex-col" aria-label="Workspace navigation">
      <NavLink to="/" className="mb-9 flex items-center gap-3 rounded-xl px-3 py-1.5 focus-visible:ring-2 focus-visible:ring-accent">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-ink shadow-lg shadow-accent/10">
          <ShieldCheck size={20} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide text-white">AUTO ESCROW</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Agent operations</p>
        </div>
      </NavLink>

      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Workspace</p>
      <nav className="space-y-1" aria-label="Primary navigation">
        {primaryNavigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'border-accent/20 bg-accent/10 text-accent' : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}
          >
            <span className="flex items-center gap-3"><Icon size={17} />{label}</span>
            <ChevronRight className="opacity-0 transition group-hover:opacity-50" size={14} />
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Demo workspace</span>
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(53,198,192,0.12)]" aria-label="Demo workspace active" />
        </div>
        <p className="text-xs leading-5 text-slate-500">A local foundation for auditable AI-agent agreements and simulated escrow.</p>
        {secondaryNavigation.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'text-white' : 'text-electric hover:text-white'}`}><Icon size={14} />{label}</NavLink>)}
      </div>
    </aside>
  )
}
