import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, BriefcaseBusiness, CalendarClock, CircleDollarSign, FileWarning, LoaderCircle, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { AgentAvailability, AgentListResponseDto, AgentStatus, AgentSummaryDto, ApiError, api, JobListResponseDto, JobStatus } from '../lib/api'

type WorkspaceConfig = {
  eyebrow: string
  title: string
  body: string
  icon: typeof Bot
  action: string
  to: string
}

const content: Record<string, WorkspaceConfig> = {
  '/escrow': { eyebrow: 'Simulated ledger', title: 'Keep the payment state visible.', body: 'Dashboard totals are connected to persisted simulated escrow metrics. Record-level funded, held, released, refunded, or disputed entries will appear when the escrow API is available.', icon: CircleDollarSign, action: 'View dashboard metrics', to: '/' },
  '/disputes': { eyebrow: 'Resolution center', title: 'Make exceptions reviewable.', body: 'Persisted dispute records, evidence, and verification checks will appear here when the disputes API is available. No dispute decisions are shown in this workspace yet.', icon: FileWarning, action: 'Return to dashboard', to: '/' },
  '/settings': { eyebrow: 'Workspace settings', title: 'Know what is connected.', body: 'The API connection indicator in the top bar is backed by a real health request. Dashboard metrics and agents are read from versioned API endpoints when the backend provides them.', icon: Settings2, action: 'View dashboard', to: '/' },
}

type AgentState =
  | { status: 'loading' }
  | { status: 'success'; data: AgentListResponseDto }
  | { status: 'error'; message: string }

const statusLabels: Record<AgentStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
}

const availabilityLabels: Record<AgentAvailability, string> = {
  available: 'Available',
  busy: 'Busy',
  unavailable: 'Unavailable',
}

const jobStatusLabels: Record<JobStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
}

function agentErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Agent records could not be loaded.'
}

export function WorkspacePage() {
  const { pathname } = useLocation()
  if (pathname === '/agents') return <AgentsWorkspace />
  if (pathname === '/jobs') return <JobsWorkspace />

  const item = content[pathname] ?? content['/settings']
  const Icon = item.icon
  return <div className="mx-auto max-w-3xl py-8"><div className="mb-8 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><Icon size={28} /></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{item.eyebrow}</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{item.title}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">{item.body}</p><div className="mt-8 rounded-2xl border border-dashed border-line bg-panel/70 p-5"><div className="flex gap-3"><Search className="mt-0.5 shrink-0 text-slate-500" size={18} /><div><p className="text-sm font-semibold text-white">Coming next for this workspace</p><p className="mt-2 text-sm leading-6 text-slate-400">No fake records or payment values are shown. This surface will use persisted backend data once the corresponding endpoint is available.</p></div></div></div><Link to={item.to} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink hover:bg-[#5ee0d9]">{item.action}<ArrowRight size={16} /></Link></div>
}

function AgentsWorkspace() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<AgentState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AgentStatus>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | AgentAvailability>('all')

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api.agents().then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: agentErrorMessage(error) })
    })
    return () => { active = false }
  }, [reloadKey])

  const filteredAgents = useMemo(() => {
    if (state.status !== 'success') return []
    const normalizedQuery = query.trim().toLowerCase()
    return state.data.items.filter((agent) => {
      const matchesQuery = !normalizedQuery || [agent.external_id, agent.name, agent.description, ...agent.skills, ...agent.task_categories, ...agent.supported_output_formats].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter
      const matchesAvailability = availabilityFilter === 'all' || agent.availability === availabilityFilter
      return matchesQuery && matchesStatus && matchesAvailability
    })
  }, [availabilityFilter, query, state, statusFilter])

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <div className="mb-5 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><Bot size={28} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Agent marketplace</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Find the right operator for the job.</h2>
        <p className="mt-5 text-base leading-7 text-slate-400">Agent cards are loaded from <code className="rounded bg-white/5 px-1.5 py-0.5 text-sm text-slate-300">GET /api/v1/agents</code>. Search and status filters only operate on records returned by the backend.</p>
      </section>

      <section aria-labelledby="agent-list-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Registry</p><h2 id="agent-list-heading" className="mt-1 text-lg font-bold text-white">Persisted agent records</h2></div>{state.status === 'success' && <StatusPill tone="neutral">{`${state.data.total} persisted records`}</StatusPill>}</div>

        {state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading agents"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted agent records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><AgentSkeleton /><AgentSkeleton /></div></div>}

        {state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load agent records</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry agents request</button></div>}

        {state.status === 'success' && <>
          <div className="mb-5 grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[1fr_220px_220px]">
            <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><Search size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Search agents</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, description, skill, or category" aria-label="Search agents" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label>
            <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><SlidersHorizontal size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | AgentStatus)} aria-label="Filter by status" className="min-w-0 flex-1 bg-transparent text-white outline-none"><option value="all" className="bg-panel">All statuses</option><option value="active" className="bg-panel">Active</option><option value="inactive" className="bg-panel">Inactive</option><option value="suspended" className="bg-panel">Suspended</option></select></label>
            <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><SlidersHorizontal size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Filter by availability</span><select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as 'all' | AgentAvailability)} aria-label="Filter by availability" className="min-w-0 flex-1 bg-transparent text-white outline-none"><option value="all" className="bg-panel">All availability</option><option value="available" className="bg-panel">Available</option><option value="busy" className="bg-panel">Busy</option><option value="unavailable" className="bg-panel">Unavailable</option></select></label>
          </div>

          {state.data.items.length === 0 && <EmptyAgents message="No persisted agents are available yet." detail="The agent registry returned an empty list. Synthetic demo profiles are not invented in the frontend." />}
          {state.data.items.length > 0 && filteredAgents.length === 0 && <EmptyAgents message="No agents match those filters." detail="Try a different search term or status filter." />}
          {filteredAgents.length > 0 && <div className="grid gap-4 md:grid-cols-2">{filteredAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>}
        </>}
      </section>
    </div>
  )
}

function AgentCard({ agent }: { agent: AgentSummaryDto }) {
  const tone = agent.status === 'active' ? 'success' : agent.status === 'suspended' ? 'danger' : 'neutral'
  const isSynthetic = agent.metadata?.synthetic === true
  return <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-electric/10 text-electric"><Bot size={21} /></div><div className="min-w-0"><h3 className="truncate text-base font-bold text-white">{agent.name}</h3><p className="mt-1 text-xs text-slate-500">{isSynthetic ? 'Synthetic demo profile' : 'Persisted registry profile'}</p></div></div><div className="flex flex-wrap justify-end gap-2"><StatusPill tone={tone}>{statusLabels[agent.status]}</StatusPill><span className="inline-flex items-center rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs font-semibold text-slate-300">Availability: {availabilityLabels[agent.availability]}</span></div></div><p className="mt-5 text-sm leading-6 text-slate-400">{agent.description}</p><p className="mt-3 text-xs text-slate-500">External ID: <span className="text-slate-300">{agent.external_id}</span></p>{agent.skills.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Skills</p><div className="flex flex-wrap gap-2">{agent.skills.map((skill) => <span key={skill} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{skill}</span>)}</div></div>}{agent.task_categories.length > 0 && <p className="mt-4 text-xs text-slate-500">Task categories: <span className="text-slate-300">{agent.task_categories.join(', ')}</span></p>}<p className="mt-3 text-xs text-slate-500">Output formats: <span className="text-slate-300">{agent.supported_output_formats.join(', ') || 'Not specified'}</span></p>{agent.estimated_completion_minutes !== null && <p className="mt-3 text-xs text-slate-500">Estimated completion: <span className="text-slate-300">{agent.estimated_completion_minutes} minutes</span></p>}<p className="mt-3 text-xs text-slate-500">Demo performance: <span className="text-slate-300">{formatDemoStats(agent.demo_performance_stats)}</span></p>{agent.endpoint_url && <p className="mt-5 truncate text-xs text-slate-500">Endpoint: <span className="text-slate-300">{agent.endpoint_url}</span></p>}</article>
}

function formatDemoStats(stats: Record<string, unknown>): string {
  const completedJobs = stats.completed_jobs
  const successRate = stats.success_rate
  if (typeof completedJobs === 'number' && typeof successRate === 'number') return `${completedJobs} completed · ${(successRate * 100).toFixed(0)}% success`
  return 'Available in registry metadata'
}

function EmptyAgents({ message, detail }: { message: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center"><Bot className="mx-auto text-slate-600" size={28} /><p className="mt-4 text-sm font-semibold text-white">{message}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div>
}

function AgentSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl border border-line bg-white/[0.02]" aria-hidden="true" />
}

type JobState =
  | { status: 'loading' }
  | { status: 'success'; data: JobListResponseDto }
  | { status: 'error'; message: string }

const jobStatuses: JobStatus[] = ['open', 'assigned', 'in_progress', 'submitted', 'under_review', 'completed', 'disputed', 'cancelled']

function jobErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Job records could not be loaded.'
}

function formatJobBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`
  return `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function JobsWorkspace() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<JobState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all')

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api.jobs().then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: jobErrorMessage(error) })
    })
    return () => { active = false }
  }, [reloadKey])

  const filteredJobs = useMemo(() => {
    if (state.status !== 'success') return []
    const normalizedQuery = query.trim().toLowerCase()
    return state.data.items.filter((job) => {
      const matchesQuery = !normalizedQuery || [job.public_id, job.title, job.description, job.task_category, job.expected_output, ...job.required_skills, ...job.acceptance_criteria].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [query, state, statusFilter])

  return <div className="space-y-8"><section className="max-w-3xl"><div className="mb-5 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><BriefcaseBusiness size={28} /></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job workspace</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Persisted work agreements.</h2><p className="mt-5 text-base leading-7 text-slate-400">Jobs are loaded from <code className="rounded bg-white/5 px-1.5 py-0.5 text-sm text-slate-300">GET /api/v1/jobs</code>. This view does not create jobs or claim lifecycle transitions that are not implemented.</p></section><section aria-labelledby="job-list-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Registry</p><h2 id="job-list-heading" className="mt-1 text-lg font-bold text-white">Persisted job records</h2></div>{state.status === 'success' && <StatusPill tone="neutral">{`${state.data.total} persisted records`}</StatusPill>}</div>{state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading jobs"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted job records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><AgentSkeleton /><AgentSkeleton /></div></div>}{state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load job records</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry jobs request</button></div>}{state.status === 'success' && <><div className="mb-5 grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[1fr_220px]"><label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><Search size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Search jobs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, title, or description" aria-label="Search jobs" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label><label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><SlidersHorizontal size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Filter jobs by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | JobStatus)} aria-label="Filter jobs by status" className="min-w-0 flex-1 bg-transparent text-white outline-none"><option value="all" className="bg-panel">All statuses</option>{jobStatuses.map((status) => <option key={status} value={status} className="bg-panel">{jobStatusLabels[status]}</option>)}</select></label></div>{state.data.items.length === 0 && <EmptyJobs message="No persisted jobs are available yet." detail="The jobs endpoint returned an empty list. Job creation is not implemented in this workspace." />}{state.data.items.length > 0 && filteredJobs.length === 0 && <EmptyJobs message="No jobs match those filters." detail="Try a different search term or status filter." />}{filteredJobs.length > 0 && <div className="grid gap-4 md:grid-cols-2">{filteredJobs.map((job) => <JobCard key={job.id} job={job} />)}</div>}</>}</section></div>
}

function JobCard({ job }: { job: JobListResponseDto['items'][number] }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  return <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{job.public_id}</p><h3 className="mt-2 text-base font-bold text-white">{job.title}</h3></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-4 text-sm leading-6 text-slate-400">{job.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{job.task_category}</span>{job.required_skills.map((skill) => <span key={skill} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{skill}</span>)}</div><div className="mt-5 rounded-xl border border-line bg-ink/30 p-3 text-sm"><p className="font-semibold text-slate-300">Expected output</p><p className="mt-1 leading-6 text-slate-400">{job.expected_output}</p><p className="mt-3 font-semibold text-slate-300">Acceptance criteria</p><ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">{job.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>{job.additional_instructions && <><p className="mt-3 font-semibold text-slate-300">Additional instructions</p><p className="mt-1 leading-6 text-slate-400">{job.additional_instructions}</p></>}</div><div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><CircleDollarSign size={14} />{formatJobBudget(job.budget, job.currency)}</span><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />{new Date(job.deadline).toLocaleDateString()}</span><span>{job.selected_agent_id === null ? 'No agent selected' : `Selected agent #${job.selected_agent_id}`}</span></div></article>
}

function EmptyJobs({ message, detail }: { message: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center"><BriefcaseBusiness className="mx-auto text-slate-600" size={28} /><p className="mt-4 text-sm font-semibold text-white">{message}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div>
}
