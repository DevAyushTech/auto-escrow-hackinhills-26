import { NavLink } from 'react-router-dom'
import { Bot, BriefcaseBusiness, ChevronRight, CircleDollarSign, Gavel, LayoutDashboard, Settings2, ShieldCheck } from 'lucide-react'

const navigation = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Jobs', to: '/jobs', icon: BriefcaseBusiness },
  { label: 'Escrow', to: '/escrow', icon: CircleDollarSign },
  { label: 'Disputes', to: '/disputes', icon: Gavel },
]

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-[#0e1829] px-4 py-5 lg:flex lg:flex-col">
      <div className="mb-9 flex items-center gap-3 px-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-ink shadow-lg shadow-accent/10">
          <ShieldCheck size={20} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide text-white">AUTO ESCROW</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Agent operations</p>
        </div>
      </div>

      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Workspace</p>
      <nav className="space-y-1" aria-label="Primary navigation">
        {navigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}
          >
            <span className="flex items-center gap-3"><Icon size={17} />{label}</span>
            <ChevronRight className="opacity-0 transition group-hover:opacity-50" size={14} />
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Demo workspace</span>
          <span className="h-2 w-2 rounded-full bg-accent" />
        </div>
        <p className="text-xs leading-5 text-slate-500">A local foundation for auditable AI-agent agreements and simulated escrow.</p>
        <NavLink to="/settings" className="mt-3 flex items-center gap-2 text-xs font-semibold text-electric hover:text-white"><Settings2 size={14} />Configuration</NavLink>
      </div>
    </aside>
  )
}
