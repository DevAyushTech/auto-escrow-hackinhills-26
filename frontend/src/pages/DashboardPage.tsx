import { useEffect, useState } from 'react'
import { ArrowUpRight, BriefcaseBusiness, CircleDollarSign, Gavel, ListChecks, LoaderCircle, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, DashboardMetricsDto } from '../lib/api'

type MetricsState =
  | { status: 'loading' }
  | { status: 'success'; data: DashboardMetricsDto }
  | { status: 'error'; message: string }

const metricCards = [
  { key: 'total_jobs', label: 'Total jobs', icon: BriefcaseBusiness, tone: 'text-electric', format: formatCount },
  { key: 'jobs_in_progress', label: 'Jobs in progress', icon: ListChecks, tone: 'text-accent', format: formatCount },
  { key: 'completed_jobs', label: 'Completed jobs', icon: ShieldCheck, tone: 'text-accent', format: formatCount },
  { key: 'open_disputes', label: 'Open disputes', icon: Gavel, tone: 'text-rose-200', format: formatCount },
  { key: 'total_simulated_escrow_funded', label: 'Simulated escrow funded', icon: CircleDollarSign, tone: 'text-amber-200', format: formatCurrency },
  { key: 'total_simulated_escrow_settled', label: 'Simulated escrow settled', icon: CircleDollarSign, tone: 'text-electric', format: formatCurrency },
] as const

function formatCount(value: number | string): string {
  return Number(value).toLocaleString()
}

function formatCurrency(value: number | string): string {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }) : String(value)
}

function isEmptyMetrics(metrics: DashboardMetricsDto): boolean {
  return metrics.total_jobs === 0 && metrics.jobs_in_progress === 0 && metrics.completed_jobs === 0 && metrics.open_disputes === 0 && Number(metrics.total_simulated_escrow_funded) === 0 && Number(metrics.total_simulated_escrow_settled) === 0
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Dashboard metrics could not be loaded.'
}

export function DashboardPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<MetricsState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    api.dashboardMetrics().then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error) })
    })

    return () => { active = false }
  }, [reloadKey])

  const metrics = state.status === 'success' ? state.data : undefined
  const empty = metrics ? isEmptyMetrics(metrics) : false

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-soft sm:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-electric/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent"><Sparkles size={14} /> Connected workspace</div>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Coordinate AI work with clarity, before money moves.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Review persisted dashboard metrics, agent registry records, and simulated escrow signals from the connected API. Creation, matching, and settlement workflows remain unavailable until their backend endpoints are implemented.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/agents" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-[#5ee0d9]"><ListChecks size={17} /> Browse agents</Link>
            <Link to="/jobs" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"><Plus size={17} /> Open jobs</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="workspace-overview-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Workspace overview</p><h2 id="workspace-overview-heading" className="mt-1 text-lg font-bold text-white">Persisted operational signals</h2></div>
          {state.status === 'loading' && <StatusPill tone="warning">Loading metrics</StatusPill>}
          {state.status === 'success' && <StatusPill tone={empty ? 'neutral' : 'success'}>{empty ? 'No persisted activity' : 'Metrics loaded'}</StatusPill>}
          {state.status === 'error' && <StatusPill tone="danger">Metrics unavailable</StatusPill>}
        </div>

        {state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading dashboard metrics"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted dashboard metrics…</div><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div></div>}

        {state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load dashboard metrics</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry metrics request</button></div>}

        {state.status === 'success' && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {metricCards.map(({ key, label, icon: Icon, tone, format }) => <div key={key} className="rounded-2xl border border-line bg-panel p-5"><div className="mb-6 flex items-center justify-between"><span className="text-sm text-slate-400">{label}</span><Icon size={18} className={tone} /></div><div className="text-3xl font-bold tracking-tight text-white">{format(state.data[key])}</div><p className="mt-2 text-xs text-slate-500">From persisted API metrics</p></div>)}
          </div>
          {empty && <div className="mt-4 rounded-2xl border border-dashed border-line bg-panel/60 p-5"><p className="text-sm font-semibold text-white">No persisted dashboard activity yet</p><p className="mt-2 text-sm leading-6 text-slate-400">The API returned zero jobs, disputes, and simulated escrow totals. Create and settlement workflows are not available in this workspace yet.</p></div>}
        </>}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Recent work</p><h2 className="mt-1 text-lg font-bold text-white">{state.status === 'success' && !empty ? 'Job activity is reported' : 'No job activity yet'}</h2></div><BriefcaseBusiness className="text-slate-600" size={22} /></div><div className="rounded-xl border border-dashed border-line bg-ink/30 p-6 text-center"><p className="text-sm text-slate-400">{state.status === 'success' && !empty ? 'Open the jobs workspace to connect record-level views when that endpoint is available.' : 'Persisted job records will appear here after the backend stores activity.'}</p><Link to="/jobs" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white">Open job workspace <ArrowUpRight size={15} /></Link></div></div>
        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Trust layer</p><h2 className="mt-1 text-lg font-bold text-white">How the MVP works</h2></div><ShieldCheck className="text-accent" size={22} /></div><ol className="space-y-4 text-sm"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">1</span><span className="text-slate-400">Define the task and acceptance criteria.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-electric/10 text-xs font-bold text-electric">2</span><span className="text-slate-400">Compare explainable agent matches.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-300/10 text-xs font-bold text-amber-200">3</span><span className="text-slate-400">Verify the result before simulated settlement.</span></li></ol></div>
      </section>
    </div>
  )
}

function MetricSkeleton() {
  return <div className="h-32 animate-pulse rounded-2xl border border-line bg-white/[0.02]" aria-hidden="true" />
}
