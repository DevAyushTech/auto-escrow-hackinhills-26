import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, ArrowUpDown, Bot, BriefcaseBusiness, CalendarClock, CircleDollarSign, FileWarning, LoaderCircle, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { AgentAvailability, AgentListResponseDto, AgentStatus, AgentSummaryDto, ApiError, api, JobListResponseDto, JobStatus } from '../lib/api'
import { JobsPage } from './JobsPage'

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

type AgentSort = 'name' | 'estimated_completion' | 'performance'

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

const selectClassName = 'min-w-0 flex-1 bg-transparent text-white outline-none'

function agentErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Agent records could not be loaded.'
}

function jobErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Job records could not be loaded.'
}

function hasDemoStats(stats: Record<string, unknown>): boolean {
  return Object.keys(stats).length > 0
}

function performanceValue(agent: AgentSummaryDto): number | null {
  const stats = agent.demo_performance_stats
  const successRate = stats.success_rate
  if (typeof successRate === 'number' && Number.isFinite(successRate)) return successRate
  const performanceScore = stats.performance_score
  if (typeof performanceScore === 'number' && Number.isFinite(performanceScore)) return performanceScore
  const completedJobs = stats.completed_jobs
  if (typeof completedJobs === 'number' && Number.isFinite(completedJobs)) return completedJobs
  return null
}

function formatStatValue(key: string, value: unknown): string {
  if (key === 'success_rate' && typeof value === 'number') return `${(value * 100).toFixed(0)}%`
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return 'Unavailable'
  }
}

function parseId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function WorkspacePage() {
  const { pathname } = useLocation()
  if (pathname === '/agents') return <AgentsWorkspace />
  if (pathname === '/jobs') return <JobsPage />

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
  const [skillFilter, setSkillFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<AgentSort>('name')

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

  const agents = useMemo(() => state.status === 'success' ? state.data.items : [], [state])
  const skills = useMemo(() => Array.from(new Set(agents.flatMap((agent) => agent.skills))).sort((a, b) => a.localeCompare(b)), [agents])
  const categories = useMemo(() => Array.from(new Set(agents.flatMap((agent) => agent.task_categories))).sort((a, b) => a.localeCompare(b)), [agents])
  const availabilities = useMemo(() => Array.from(new Set(agents.map((agent) => agent.availability))).sort(), [agents])
  const hasEstimatedCompletion = agents.some((agent) => agent.estimated_completion_minutes !== null)
  const hasPerformanceStats = agents.some((agent) => performanceValue(agent) !== null)

  const filteredAgents = useMemo(() => {
    if (state.status !== 'success') return []
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = state.data.items.filter((agent) => {
      const matchesQuery = !normalizedQuery || [agent.name, agent.description, ...agent.skills, ...agent.task_categories].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter
      const matchesAvailability = availabilityFilter === 'all' || agent.availability === availabilityFilter
      const matchesSkill = skillFilter === 'all' || agent.skills.includes(skillFilter)
      const matchesCategory = categoryFilter === 'all' || agent.task_categories.includes(categoryFilter)
      return matchesQuery && matchesStatus && matchesAvailability && matchesSkill && matchesCategory
    })

    return [...filtered].sort((left, right) => {
      if (sort === 'estimated_completion') {
        const leftMinutes = left.estimated_completion_minutes
        const rightMinutes = right.estimated_completion_minutes
        if (leftMinutes === null && rightMinutes !== null) return 1
        if (leftMinutes !== null && rightMinutes === null) return -1
        if (leftMinutes !== null && rightMinutes !== null && leftMinutes !== rightMinutes) return leftMinutes - rightMinutes
      }
      if (sort === 'performance') {
        const leftPerformance = performanceValue(left)
        const rightPerformance = performanceValue(right)
        if (leftPerformance === null && rightPerformance !== null) return 1
        if (leftPerformance !== null && rightPerformance === null) return -1
        if (leftPerformance !== null && rightPerformance !== null && leftPerformance !== rightPerformance) return rightPerformance - leftPerformance
      }
      return left.name.localeCompare(right.name)
    })
  }, [availabilityFilter, categoryFilter, query, skillFilter, sort, state, statusFilter])

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setAvailabilityFilter('all')
    setSkillFilter('all')
    setCategoryFilter('all')
    setSort('name')
  }

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <div className="mb-5 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><Bot size={28} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Agent marketplace</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Find the right operator for the job.</h2>
        <p className="mt-5 text-base leading-7 text-slate-400">Agent cards are loaded from <code className="rounded bg-white/5 px-1.5 py-0.5 text-sm text-slate-300">GET /api/v1/agents</code>. Search and filters operate only on records returned by the backend.</p>
      </section>

      <section aria-labelledby="agent-list-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Registry</p><h2 id="agent-list-heading" className="mt-1 text-lg font-bold text-white">Persisted agent records</h2></div>
          {state.status === 'success' && <StatusPill tone="neutral">{`${state.data.total} total agents`}</StatusPill>}
        </div>

        {state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading agents"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted agent records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><AgentSkeleton /><AgentSkeleton /></div></div>}

        {state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load agent records</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry agents request</button></div>}

        {state.status === 'success' && <>
          <div className="mb-5 rounded-2xl border border-line bg-panel p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300 sm:col-span-2 lg:col-span-2"><Search size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Search agents</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, description, skill, or category" aria-label="Search agents" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label>
              <FilterSelect label="Filter by skill" value={skillFilter} onChange={setSkillFilter} icon={<SlidersHorizontal size={17} />} options={skills.map((skill) => ({ value: skill, label: skill }))} emptyLabel="All skills" />
              <FilterSelect label="Filter by task category" value={categoryFilter} onChange={setCategoryFilter} icon={<SlidersHorizontal size={17} />} options={categories.map((category) => ({ value: category, label: category }))} emptyLabel="All task categories" />
              <FilterSelect label="Filter by availability" value={availabilityFilter} onChange={(value) => setAvailabilityFilter(value as 'all' | AgentAvailability)} icon={<SlidersHorizontal size={17} />} options={availabilities.map((availability) => ({ value: availability, label: availabilityLabels[availability] }))} emptyLabel="All availability" />
              <FilterSelect label="Filter by status" value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | AgentStatus)} icon={<SlidersHorizontal size={17} />} options={(['active', 'inactive', 'suspended'] as AgentStatus[]).map((status) => ({ value: status, label: statusLabels[status] }))} emptyLabel="All statuses" />
              <FilterSelect label="Sort agents" value={sort} onChange={(value) => setSort(value as AgentSort)} icon={<ArrowUpDown size={17} />} options={[{ value: 'name', label: 'Name' }, ...(hasEstimatedCompletion ? [{ value: 'estimated_completion', label: 'Estimated completion' }] : []), ...(hasPerformanceStats ? [{ value: 'performance', label: 'Performance' }] : [])]} emptyLabel="Sort by" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-sm text-slate-400" aria-live="polite"><span className="font-semibold text-white">{filteredAgents.length} results</span> from {state.data.total} total agents</p><button type="button" onClick={clearFilters} disabled={query === '' && statusFilter === 'all' && availabilityFilter === 'all' && skillFilter === 'all' && categoryFilter === 'all' && sort === 'name'} className="rounded-lg px-2 py-1 text-sm font-semibold text-electric hover:bg-electric/10 disabled:cursor-not-allowed disabled:text-slate-600">Clear filters</button></div>
          </div>

          {state.data.items.length === 0 && <EmptyAgents message="No persisted agents are available yet." detail="The agent registry returned an empty list. Synthetic demo profiles are not invented in the frontend." />}
          {state.data.items.length > 0 && filteredAgents.length === 0 && <EmptyAgents message="No agents match those filters." detail="Try a different search term or filter, or clear the filters." />}
          {filteredAgents.length > 0 && <div className="grid gap-4 md:grid-cols-2">{filteredAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>}
        </>}
      </section>
    </div>
  )
}

function FilterSelect({ label, value, onChange, icon, options, emptyLabel }: { label: string; value: string; onChange: (value: string) => void; icon: ReactNode; options: { value: string; label: string }[]; emptyLabel: string }) {
  return <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><span className="shrink-0 text-slate-500" aria-hidden="true">{icon}</span><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={selectClassName}><option value="all" className="bg-panel">{emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value} className="bg-panel">{option.label}</option>)}</select></label>
}

function AgentCard({ agent }: { agent: AgentSummaryDto }) {
  const tone = agent.status === 'active' ? 'success' : agent.status === 'suspended' ? 'danger' : 'neutral'
  const isSynthetic = agent.metadata?.synthetic === true
  const stats = agent.demo_performance_stats
  return <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-electric/10 text-electric"><Bot size={21} /></div><div className="min-w-0"><h3 className="truncate text-base font-bold text-white">{agent.name}</h3><p className="mt-1 text-xs text-slate-500">{isSynthetic ? 'Synthetic demo profile' : 'Persisted registry profile'}</p></div></div><div className="flex flex-wrap justify-end gap-2"><StatusPill tone={tone}>{statusLabels[agent.status]}</StatusPill><span className="inline-flex items-center rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs font-semibold text-slate-300">Availability: {availabilityLabels[agent.availability]}</span></div></div><p className="mt-5 text-sm leading-6 text-slate-400">{agent.description}</p><p className="mt-3 text-xs text-slate-500">External ID: <span className="text-slate-300">{agent.external_id}</span></p><div className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Skills</p>{agent.skills.length > 0 ? <div className="flex flex-wrap gap-2">{agent.skills.map((skill) => <span key={skill} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{skill}</span>)}</div> : <p className="text-sm text-slate-500">No skills listed</p>}</div><div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Task categories</p>{agent.task_categories.length > 0 ? <div className="flex flex-wrap gap-2">{agent.task_categories.map((category) => <span key={category} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{category}</span>)}</div> : <p className="text-sm text-slate-500">No task categories listed</p>}</div><div className="mt-4 space-y-2 text-xs text-slate-500"><p>Output formats: <span className="text-slate-300">{agent.supported_output_formats.join(', ') || 'Not specified'}</span></p>{agent.estimated_completion_minutes !== null && <p>Estimated completion: <span className="text-slate-300">{agent.estimated_completion_minutes} minutes</span></p>}</div>{hasDemoStats(stats) && <DemoStats stats={stats} />}{isSynthetic && <span className="mt-4 inline-flex w-fit rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Synthetic demo</span>}<div className="mt-auto flex flex-wrap gap-3 border-t border-line pt-5"><Link to={`/agents/${agent.id}`} className="inline-flex items-center rounded-xl border border-line px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5" aria-label={`View details for ${agent.name}`}>View details</Link><Link to={`/jobs?agentId=${agent.id}`} className="inline-flex items-center rounded-xl bg-accent px-3 py-2 text-sm font-bold text-ink hover:bg-[#5ee0d9]" aria-label={`Select ${agent.name} for Job`}>Select for Job</Link></div></article>
}

function DemoStats({ stats }: { stats: Record<string, unknown> }) {
  const completedJobs = stats.completed_jobs
  const successRate = stats.success_rate
  const compactSummary = typeof completedJobs === 'number' && typeof successRate === 'number' ? `${completedJobs} completed · ${(successRate * 100).toFixed(0)}% success` : null
  const entries = Object.entries(stats).filter(([key]) => !(compactSummary && (key === 'completed_jobs' || key === 'success_rate')))
  return <div className="mt-4 rounded-xl border border-line bg-ink/30 p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Demo performance</p>{compactSummary && <p className="mt-2 text-sm text-slate-300">{compactSummary}</p>}{entries.length > 0 && <dl className="mt-2 space-y-1 text-xs text-slate-400">{entries.map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt>{key.replaceAll('_', ' ')}</dt><dd className="text-right text-slate-300">{formatStatValue(key, value)}</dd></div>)}</dl>}</div>
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

function formatJobBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`
  return `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export function JobsWorkspace() {
  const [searchParams] = useSearchParams()
  const selectedAgentId = parseId(searchParams.get('agentId'))
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

  return <div className="space-y-8"><section className="max-w-3xl"><div className="mb-5 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><BriefcaseBusiness size={28} /></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job workspace</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Persisted work agreements.</h2><p className="mt-5 text-base leading-7 text-slate-400">Jobs are loaded from <code className="rounded bg-white/5 px-1.5 py-0.5 text-sm text-slate-300">GET /api/v1/jobs</code>. This view does not create jobs or claim lifecycle transitions that are not implemented.</p></section>{selectedAgentId !== null && <SelectedAgentBanner agentId={selectedAgentId} /> }<section aria-labelledby="job-list-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Registry</p><h2 id="job-list-heading" className="mt-1 text-lg font-bold text-white">Persisted job records</h2></div>{state.status === 'success' && <StatusPill tone="neutral">{`${state.data.total} persisted records`}</StatusPill>}</div>{state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading jobs"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted job records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><AgentSkeleton /><AgentSkeleton /></div></div>}{state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load job records</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry jobs request</button></div>}{state.status === 'success' && <>{state.data.items.length === 0 ? <EmptyJobs message="No persisted jobs are available yet." detail="There are no jobs to select. No job or agreement has been fabricated for this agent selection." action={<><Link to="/jobs" className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">Open jobs workspace</Link><Link to="/agents" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink hover:bg-[#5ee0d9]">Return to marketplace</Link></>} /> : filteredJobs.length === 0 ? <EmptyJobs message="No jobs match those filters." detail="Try another search or status filter." action={undefined} /> : <div className="space-y-4"><div className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[1fr_220px]"><label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><Search size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Search jobs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs" aria-label="Search jobs" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label><label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><SlidersHorizontal size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Filter jobs by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | JobStatus)} aria-label="Filter jobs by status" className={selectClassName}><option value="all" className="bg-panel">All statuses</option>{Object.entries(jobStatusLabels).map(([value, label]) => <option key={value} value={value} className="bg-panel">{label}</option>)}</select></label></div><p className="text-sm text-slate-400" aria-live="polite"><span className="font-semibold text-white">{filteredJobs.length} results</span> from {state.data.total} persisted jobs</p><div className="grid gap-4 md:grid-cols-2">{filteredJobs.map((job) => <JobCard key={job.id} job={job} selectedAgentId={selectedAgentId} />)}</div></div>}</>}</section></div>
}

function SelectedAgentBanner({ agentId }: { agentId: number }) {
  return <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5" role="status" aria-live="polite"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Selection context</p><p className="mt-2 text-sm font-semibold text-white">Agent #{agentId} is carried into this job workspace.</p><p className="mt-2 text-sm leading-6 text-slate-300">This URL context is not a persisted assignment. Open the job, run matching, and use the agreement workspace after the server persists a selected agent.</p></div>
}

function JobCard({ job, selectedAgentId }: { job: JobListResponseDto['items'][number]; selectedAgentId: number | null }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  const detailPath = `/jobs/${job.id}${selectedAgentId === null ? '' : `?agentId=${selectedAgentId}`}`
  return <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{job.public_id}</p><h3 className="mt-2 text-base font-bold text-white">{job.title}</h3></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-4 text-sm leading-6 text-slate-400">{job.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{job.task_category}</span>{job.required_skills.map((skill) => <span key={skill} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{skill}</span>)}</div><div className="mt-5 rounded-xl border border-line bg-ink/30 p-3 text-sm"><p className="font-semibold text-slate-300">Expected output</p><p className="mt-1 leading-6 text-slate-400">{job.expected_output}</p><p className="mt-3 font-semibold text-slate-300">Acceptance criteria</p><ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">{job.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>{job.additional_instructions && <><p className="mt-3 font-semibold text-slate-300">Additional instructions</p><p className="mt-1 leading-6 text-slate-400">{job.additional_instructions}</p></>}</div><div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><CircleDollarSign size={14} />{formatJobBudget(job.budget, job.currency)}</span><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />{new Date(job.deadline).toLocaleDateString()}</span><span>{job.selected_agent_id === null ? 'No agent selected' : `Selected agent #${job.selected_agent_id}`}</span></div><div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4"><Link to={detailPath} className="inline-flex items-center rounded-xl border border-line px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5" aria-label={`View details for ${job.title}`}>View details</Link>{selectedAgentId !== null && <Link to={detailPath} className="inline-flex items-center rounded-xl bg-accent px-3 py-2 text-sm font-bold text-ink hover:bg-[#5ee0d9]" aria-label={`Select ${job.title} for the selected agent`}>Select this job</Link>}</div></article>
}

function EmptyJobs({ message, detail, action }: { message: string; detail: string; action: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center"><BriefcaseBusiness className="mx-auto text-slate-600" size={28} /><p className="mt-4 text-sm font-semibold text-white">{message}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>{action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}</div>
}
