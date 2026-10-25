import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, BriefcaseBusiness, Bot, CalendarClock, CircleDollarSign, Gavel, ListChecks, LoaderCircle, Plus, ShieldCheck, Sparkles } from 'lucide-react'
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

type ActivityItem = {
  id: string
  occurredAt: string
  title: string
  detail: string
}

function activityDate(value: string): number {
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
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
  const nextSteps = useMemo(() => jobsState.status !== 'success' ? [] : [...jobsState.data.items].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()).slice(0, 4).map(nextStepForJob), [jobsState])
  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []
    if (jobsState.status === 'success') {
      items.push(...jobsState.data.items.map((job) => ({ id: `job-${job.id}`, occurredAt: job.created_at, title: 'Job created', detail: `${job.title} · Job #${job.id}` })))
    }
    if (executionState.status === 'success') {
      items.push(...executionState.data.recent_submissions.map((submission) => ({ id: `submission-${submission.id}`, occurredAt: submission.submitted_at, title: 'Submission recorded', detail: `Job #${submission.job_id} · version ${submission.version}` })))
      items.push(...executionState.data.recent_verifications.map((verification) => ({ id: `verification-${verification.id}`, occurredAt: verification.evaluated_at ?? verification.verified_at ?? '', title: 'Verification recorded', detail: `Job #${verification.job_id} · ${verification.overall_result.replaceAll('_', ' ')}` })))
    }
    return items.sort((left, right) => activityDate(right.occurredAt) - activityDate(left.occurredAt)).slice(0, 6)
  }, [executionState, jobsState])

  return (
    <div className="landing-page">
      <LandingHero />
      <EditorialFeatures />

      <section id="workspace-data" className="landing-workspace" aria-labelledby="workspace-overview-heading">
        <div className="landing-workspace__inner">
          <div className="landing-workspace__heading">
            <div>
              <p className="landing-eyebrow">Connected workspace</p>
              <h2 id="workspace-overview-heading">The work, after the promise.</h2>
              <p>Use the operational view when you are ready to create a job, compare agents, review terms, and follow the persisted audit trail.</p>
            </div>
            <Link to="/jobs/new" className="action-primary"><Plus size={17} /> Create a job</Link>
          </div>

          <div className="space-y-8">
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Workspace overview</p><h2 className="mt-1 text-lg font-bold text-white">Persisted operational signals</h2></div>
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

            {jobsState.status === 'success' && nextSteps.length > 0 && <NextSteps steps={nextSteps} />}
            <ActivityTimeline items={activity} loading={jobsState.status === 'loading' || executionState.status === 'loading'} />
            <ExecutionDashboard state={executionState} retry={() => setJobsReloadKey((value) => value + 1)} />
          </div>
        </div>
      </section>
    </div>
  )
}

function LandingHero() {
  return <section className="landing-hero" aria-labelledby="landing-hero-heading">
    <div className="landing-hero__media" aria-hidden="true"><img src="/images/himalayan-hero.jpg" alt="" loading="eager" /></div>
    <div className="landing-hero__wash" aria-hidden="true" />
    <div className="landing-hero__inner">
      <div className="landing-hero__copy">
        <p className="landing-kicker"><Sparkles size={13} aria-hidden="true" /> A calmer path through agent work</p>
        <h1 id="landing-hero-heading">Trust. <span>Coordinate.</span> Verify.</h1>
        <p>A clearer way to manage agent jobs, agreements, verification, and simulated escrow.</p>
        <span className="sr-only">Coordinate AI work with clarity, before money moves.</span>
         <div className="landing-hero__actions">
           <Link to="/demo" className="landing-hero__primary">Try the Guided Demo <Sparkles size={16} /></Link>
           <Link to="/agents" className="landing-hero__secondary">Explore Agents <Bot size={16} /></Link>
         </div>
        <p className="landing-hero__note">Smarter transactions. A freer future.</p>
      </div>
    </div>
    <FeatureStrip />
  </section>
}

function FeatureStrip() {
  const features = [
    { title: 'Agent Discovery', detail: 'Find and inspect available demo agents.', icon: Bot },
    { title: 'Explainable Matching', detail: 'See the score and the factors behind it.', icon: ListChecks },
    { title: 'Verification-first Release', detail: 'Settlement stays gated by backend checks.', icon: ShieldCheck },
    { title: 'Audit Trail', detail: 'Follow persisted workflow and ledger events.', icon: Activity },
  ] as const

  return <div className="landing-feature-strip" aria-label="Auto Escrow capabilities">
    {features.map(({ title, detail, icon: Icon }) => <div className="landing-feature-strip__item" key={title}><span className="landing-feature-strip__icon" aria-hidden="true"><Icon size={16} /></span><div><strong>{title}</strong><p>{detail}</p></div></div>)}
  </div>
}

function EditorialFeatures() {
  return <section id="how-it-works" className="landing-editorial" aria-labelledby="editorial-heading">
    <div className="landing-editorial__inner">
      <div className="landing-editorial__heading">
        <p className="landing-eyebrow">For agents &amp; users</p>
        <h2 id="editorial-heading">Everything you need to manage the work</h2>
        <p>Discover agents, define the terms, review the work, and track each step in one place.</p>
      </div>
      <div className="landing-editorial__grid">
        <Link to="/agents" className="landing-photo-tile">
          <img src="/images/himalayan-hero.jpg" alt="Snow-covered mountain trail with a hiker and distant peaks" loading="lazy" />
          <div className="landing-photo-tile__copy"><span>Agent marketplace</span><h3>Find an agent for the task.</h3><p>Browse the persisted registry, inspect capabilities, and carry your selection into a real job workflow.</p><span className="mt-4 inline-flex items-center gap-2 !normal-case !tracking-normal !text-white">Browse agents <ArrowUpRight size={15} /></span></div>
        </Link>
        <div className="landing-feature-list" id="workflow">
          <div className="landing-feature-row"><span className="landing-feature-row__icon" aria-hidden="true"><CircleDollarSign size={19} /></span><div><h3>Secure Escrow</h3><p>Funds remain locked until the configured conditions are satisfied. This workspace models the record; it does not move real money.</p><Link to="/escrow">Inspect escrow <ArrowUpRight size={14} /></Link></div></div>
          <div className="landing-feature-row"><span className="landing-feature-row__icon" aria-hidden="true"><ShieldCheck size={19} /></span><div><h3>Verify &amp; Pay</h3><p>Review submitted work and verification results before a separate, backend-authorized release action.</p><Link to="/jobs">Review transactions <ArrowUpRight size={14} /></Link></div></div>
          <div className="landing-feature-row"><span className="landing-feature-row__icon" aria-hidden="true"><Gavel size={19} /></span><div><h3>Dispute protection</h3><p>Open a dispute on funded work when the result needs formal review; active disputes block normal settlement.</p><Link to="/disputes">Open dispute review <ArrowUpRight size={14} /></Link></div></div>
        </div>
      </div>
    </div>
  </section>
}

function MetricSkeleton() {
  return <div className="h-32 animate-pulse rounded-2xl border border-line bg-white/[0.02]" aria-hidden="true" />
}

type NextStep = {
  jobId: number
  title: string
  label: string
  description: string
  to: string
}

function nextStepForJob(job: JobListResponseDto['items'][number]): NextStep {
  if (job.status === 'open' && job.selected_agent_id === null) return { jobId: job.id, title: job.title, label: 'Run matching', description: 'Run matching before proposing an agreement.', to: `/jobs/${job.id}/matching` }
  if (job.status === 'in_progress' || job.status === 'submitted' || job.status === 'under_review') return { jobId: job.id, title: job.title, label: 'Open execution', description: 'Inspect the persisted execution and verification state.', to: `/jobs/${job.id}/execution` }
  if (job.status === 'assigned') return { jobId: job.id, title: job.title, label: 'Review agreement', description: 'Open the job record and inspect its agreement state.', to: `/jobs/${job.id}/agreement` }
  if (job.status === 'disputed') return { jobId: job.id, title: job.title, label: 'Review dispute', description: 'Open the persisted job record to follow its dispute trail.', to: `/jobs/${job.id}` }
  return { jobId: job.id, title: job.title, label: 'Open job record', description: 'Review the latest persisted workflow state.', to: `/jobs/${job.id}` }
}

function NextSteps({ steps }: { steps: NextStep[] }) {
  return <section className="surface-panel p-5 sm:p-6" aria-labelledby="next-steps-heading"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Action queue</p><h2 id="next-steps-heading" className="mt-1 text-lg font-bold text-white">Next steps from persisted jobs</h2></div><p className="text-xs text-slate-500">Links reflect loaded job status; no client-side transitions are assumed.</p></div><div className="grid gap-3 md:grid-cols-2">{steps.map((step) => <Link key={step.jobId} to={step.to} className="group rounded-xl border border-line bg-ink/30 p-4 transition hover:border-electric/40 hover:bg-sage/10"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Job #{step.jobId}</p><p className="mt-1 truncate text-sm font-bold text-white">{step.title}</p></div><ArrowUpRight className="shrink-0 text-electric transition group-hover:text-accent" size={17} /></div><p className="mt-3 text-sm font-semibold text-ink">{step.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p></Link>)}</div></section>
}

function DashboardJobs({ jobsState, recentJobs, upcomingJobs, retry }: { jobsState: JobsState; recentJobs: JobListResponseDto['items']; upcomingJobs: JobListResponseDto['items']; retry: () => void }) {
  return <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Recent work</p><h2 className="mt-1 text-lg font-bold text-white">Recent jobs</h2></div><BriefcaseBusiness className="text-slate-600" size={22} /></div>{jobsState.status === 'loading' && <div className="space-y-3" aria-label="Loading dashboard jobs"><div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" /><div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" /></div>}{jobsState.status === 'error' && <div className="rounded-xl border border-rose-300/25 bg-rose-300/5 p-4" role="status"><p className="text-sm font-semibold text-rose-100">Unable to load dashboard jobs</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{jobsState.message}</p><button type="button" onClick={retry} className="mt-4 rounded-lg border border-rose-200/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-200/10">Retry jobs request</button></div>}{jobsState.status === 'success' && jobsState.data.items.length === 0 && <div className="rounded-xl border border-dashed border-line bg-ink/30 p-5 text-center"><p className="text-sm font-semibold text-white">No recent jobs</p><p className="mt-2 text-sm leading-6 text-slate-500">Persisted job records will appear here after the first job is created.</p><Link to="/jobs/new" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><Plus size={15} /> Create a job</Link></div>}{jobsState.status === 'success' && jobsState.data.items.length > 0 && <div className="space-y-3">{recentJobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-xl border border-line bg-ink/30 p-4 transition hover:border-electric/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-white">{job.title}</p><span className="shrink-0 text-xs text-slate-500">{job.status.replaceAll('_', ' ')}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Created {formatShortDate(job.created_at)}</span><span>{job.selected_agent_id === null ? 'No agent selected' : `Agent #${job.selected_agent_id}`}</span></div></Link>)}</div>}{jobsState.status === 'success' && <div className="mt-6 border-t border-line pt-5"><div className="flex items-center gap-2"><CalendarClock size={16} className="text-electric" /><h3 className="text-sm font-semibold text-white">Upcoming deadlines</h3></div>{upcomingJobs.length === 0 ? <p className="mt-3 text-sm text-slate-500">No upcoming deadlines in the persisted records.</p> : <div className="mt-3 space-y-2">{upcomingJobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/[0.04]"><span className="min-w-0 truncate text-slate-300">{job.title}</span><span className="shrink-0 text-xs text-electric">{formatShortDate(job.deadline)}</span></Link>)}</div>}</div>}<Link to="/jobs" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white">Open job workspace <ArrowUpRight size={15} /></Link></div>
}

function ActivityTimeline({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  return <section className="surface-panel p-5 sm:p-6" aria-labelledby="activity-heading"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Audit view</p><h2 id="activity-heading" className="mt-1 text-lg font-bold text-white">Recent activity</h2><p className="mt-2 text-sm text-slate-500">Persisted jobs, submissions, and verification records only.</p></div><Activity className="text-electric" size={22} aria-hidden="true" /></div>{loading && <div className="space-y-3" aria-label="Loading recent activity"><div className="h-12 animate-pulse rounded-xl bg-white/[0.03]" /><div className="h-12 animate-pulse rounded-xl bg-white/[0.03]" /></div>}{!loading && items.length === 0 && <div className="rounded-xl border border-dashed border-line bg-ink/30 p-5"><p className="text-sm font-semibold text-white">No activity to show yet</p><p className="mt-2 text-sm leading-6 text-slate-500">The connected API has not returned persisted job, submission, or verification records.</p></div>}{!loading && items.length > 0 && <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <li key={item.id} className="relative rounded-xl border border-line bg-ink/30 p-4"><span className="absolute left-0 top-4 h-8 w-0.5 rounded-r bg-electric" aria-hidden="true" /><p className="pl-3 text-sm font-semibold text-white">{item.title}</p><p className="mt-1 pl-3 text-sm text-slate-400">{item.detail}</p><p className="mt-3 pl-3 text-xs text-slate-600">{formatActivityDate(item.occurredAt)}</p></li>)}</ol>}</section>
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

function formatActivityDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recorded time unavailable' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
