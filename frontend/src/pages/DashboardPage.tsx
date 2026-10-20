import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BriefcaseBusiness, CalendarClock, CircleDollarSign, Gavel, ListChecks, LoaderCircle, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, DashboardExecutionDto, DashboardMetricsDto, JobListResponseDto } from '../lib/api'

type MetricsState =
  | { status: 'loading' }
  | { status: 'success'; data: DashboardMetricsDto }
  | { status: 'error'; message: string }

type JobsState =
  | { status: 'loading' }
  | { status: 'success'; data: JobListResponseDto }
  | { status: 'error'; message: string }

type ExecutionState =
  | { status: 'loading' }
  | { status: 'success'; data: DashboardExecutionDto }
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
  const [jobsReloadKey, setJobsReloadKey] = useState(0)
  const [jobsState, setJobsState] = useState<JobsState>({ status: 'loading' })
  const [executionState, setExecutionState] = useState<ExecutionState>({ status: 'loading' })

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

  useEffect(() => {
    let active = true
    setJobsState({ status: 'loading' })
    api.listJobs().then((data) => {
      if (active) setJobsState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setJobsState({ status: 'error', message: errorMessage(error).replace('Dashboard metrics', 'Jobs') })
    })
    return () => { active = false }
  }, [jobsReloadKey])

  useEffect(() => {
    let active = true
    setExecutionState({ status: 'loading' })
    api.dashboardExecution().then((data) => {
      if (active) setExecutionState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setExecutionState({ status: 'error', message: errorMessage(error).replace('Dashboard metrics', 'Execution metrics') })
    })
    return () => { active = false }
  }, [reloadKey, jobsReloadKey])

  const metrics = state.status === 'success' ? state.data : undefined
  const empty = metrics ? isEmptyMetrics(metrics) : false
  const recentJobs = useMemo(() => jobsState.status !== 'success' ? [] : [...jobsState.data.items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 3), [jobsState])
  const upcomingJobs = useMemo(() => jobsState.status !== 'success' ? [] : [...jobsState.data.items].filter((job) => new Date(job.deadline).getTime() > Date.now()).sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime()).slice(0, 3), [jobsState])

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-soft sm:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-electric/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent"><Sparkles size={14} /> Connected workspace</div>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Coordinate AI work with clarity, before money moves.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Review persisted dashboard metrics and job activity from the connected API. Create work here, then inspect its deadline, selected agent, and audit trail before later workflow phases.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/agents" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-[#5ee0d9]"><ListChecks size={17} /> Browse agents</Link>
            <Link to="/jobs/new" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"><Plus size={17} /> Create a job</Link>
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
        <DashboardJobs jobsState={jobsState} recentJobs={recentJobs} upcomingJobs={upcomingJobs} retry={() => setJobsReloadKey((value) => value + 1)} />
        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Trust layer</p><h2 className="mt-1 text-lg font-bold text-white">How the MVP works</h2></div><ShieldCheck className="text-accent" size={22} /></div><ol className="space-y-4 text-sm"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">1</span><span className="text-slate-400">Define the task and acceptance criteria.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-electric/10 text-xs font-bold text-electric">2</span><span className="text-slate-400">Compare explainable agent matches.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-300/10 text-xs font-bold text-amber-200">3</span><span className="text-slate-400">Verify the result before simulated settlement.</span></li></ol></div>
      </section>

      <ExecutionDashboard state={executionState} retry={() => setJobsReloadKey((value) => value + 1)} />
    </div>
  )
}

function MetricSkeleton() {
  return <div className="h-32 animate-pulse rounded-2xl border border-line bg-white/[0.02]" aria-hidden="true" />
}

function DashboardJobs({ jobsState, recentJobs, upcomingJobs, retry }: { jobsState: JobsState; recentJobs: JobListResponseDto['items']; upcomingJobs: JobListResponseDto['items']; retry: () => void }) {
  return <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Recent work</p><h2 className="mt-1 text-lg font-bold text-white">Recent jobs</h2></div><BriefcaseBusiness className="text-slate-600" size={22} /></div>{jobsState.status === 'loading' && <div className="space-y-3" aria-label="Loading dashboard jobs"><div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" /><div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" /></div>}{jobsState.status === 'error' && <div className="rounded-xl border border-rose-300/25 bg-rose-300/5 p-4" role="status"><p className="text-sm font-semibold text-rose-100">Unable to load dashboard jobs</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{jobsState.message}</p><button type="button" onClick={retry} className="mt-4 rounded-lg border border-rose-200/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-200/10">Retry jobs request</button></div>}{jobsState.status === 'success' && jobsState.data.items.length === 0 && <div className="rounded-xl border border-dashed border-line bg-ink/30 p-5 text-center"><p className="text-sm font-semibold text-white">No recent jobs</p><p className="mt-2 text-sm leading-6 text-slate-500">Persisted job records will appear here after the first job is created.</p><Link to="/jobs/new" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><Plus size={15} /> Create a job</Link></div>}{jobsState.status === 'success' && jobsState.data.items.length > 0 && <div className="space-y-3">{recentJobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-xl border border-line bg-ink/30 p-4 transition hover:border-electric/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-white">{job.title}</p><span className="shrink-0 text-xs text-slate-500">{job.status.replaceAll('_', ' ')}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Created {formatShortDate(job.created_at)}</span><span>{job.selected_agent_id === null ? 'No agent selected' : `Agent #${job.selected_agent_id}`}</span></div></Link>)}</div>}{jobsState.status === 'success' && <div className="mt-6 border-t border-line pt-5"><div className="flex items-center gap-2"><CalendarClock size={16} className="text-electric" /><h3 className="text-sm font-semibold text-white">Upcoming deadlines</h3></div>{upcomingJobs.length === 0 ? <p className="mt-3 text-sm text-slate-500">No upcoming deadlines in the persisted records.</p> : <div className="mt-3 space-y-2">{upcomingJobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/[0.04]"><span className="min-w-0 truncate text-slate-300">{job.title}</span><span className="shrink-0 text-xs text-electric">{formatShortDate(job.deadline)}</span></Link>)}</div>}</div>}<Link to="/jobs" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white">Open job workspace <ArrowUpRight size={15} /></Link></div>
}

function ExecutionDashboard({ state, retry }: { state: ExecutionState; retry: () => void }) {
  if (state.status === 'loading') return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-label="Loading execution dashboard"><div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={17} /> Loading execution signals…</div></section>
  if (state.status === 'error') return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Execution signals</p><h2 className="mt-1 text-lg font-bold text-white">Execution data unavailable</h2></div><button type="button" onClick={retry} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">Retry</button></div><p className="mt-3 text-sm leading-6 text-slate-500">{state.message}</p></section>
  const { data } = state
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Execution signals</p><h2 className="mt-1 text-lg font-bold text-white">Persisted task outcomes</h2></div><span className="text-xs text-slate-500">No client-side status fabrication</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ExecutionMetric label="Jobs running" value={data.jobs_running} /><ExecutionMetric label="Awaiting submission" value={data.jobs_awaiting_submission} /><ExecutionMetric label="Awaiting verification" value={data.jobs_awaiting_verification} /><ExecutionMetric label="Eligible for settlement" value={data.jobs_eligible_for_settlement} /></div><div className="mt-6 grid gap-5 lg:grid-cols-2"><RecentSubmissions submissions={data.recent_submissions} /><RecentVerifications verifications={data.recent_verifications} /></div></section>
}

function ExecutionMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line bg-ink/30 p-4"><p className="text-xs uppercase tracking-[0.12em] text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">From persisted records</p></div>
}

function RecentSubmissions({ submissions }: { submissions: DashboardExecutionDto['recent_submissions'] }) {
  return <div><h3 className="text-sm font-bold text-white">Recent submissions</h3>{submissions.length === 0 ? <p className="mt-3 text-sm text-slate-500">No submissions yet.</p> : <ul className="mt-3 space-y-2">{submissions.map((submission) => <li key={submission.id} className="rounded-xl border border-line bg-ink/30 p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-200">Job #{submission.job_id} · v{submission.version}</span><span className="text-xs text-slate-500">{submission.status}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(submission.submitted_at).toLocaleString()}</p></li>)}</ul>}</div>
}

function RecentVerifications({ verifications }: { verifications: DashboardExecutionDto['recent_verifications'] }) {
  return <div><h3 className="text-sm font-bold text-white">Recent verification outcomes</h3>{verifications.length === 0 ? <p className="mt-3 text-sm text-slate-500">No verifications yet.</p> : <ul className="mt-3 space-y-2">{verifications.map((verification) => <li key={verification.id} className="rounded-xl border border-line bg-ink/30 p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-200">Job #{verification.job_id} · v{verification.submission_version}</span><span className="text-xs text-slate-500">{verification.overall_result.replaceAll('_', ' ')}</span></div><p className="mt-1 text-xs text-slate-500">{verification.evaluator_type} · {verification.evaluated_at ? new Date(verification.evaluated_at).toLocaleString() : 'Not evaluated'}</p></li>)}</ul>}</div>
}

function formatShortDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
