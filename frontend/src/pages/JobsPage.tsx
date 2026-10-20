import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowUpDown, BriefcaseBusiness, CalendarClock, CircleDollarSign, LoaderCircle, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, JobListResponseDto, JobStatus } from '../lib/api'

type JobState =
  | { status: 'loading' }
  | { status: 'success'; data: JobListResponseDto }
  | { status: 'error'; message: string }

type JobSort = 'newest' | 'deadline'

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

function parseAgentId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string, includeTime = false): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function formatBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  return Number.isFinite(numericAmount) ? `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : `${amount} ${currency}`
}

function jobErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Job records could not be loaded.'
}

export function JobsPage() {
  const [searchParams] = useSearchParams()
  const selectedAgentId = parseAgentId(searchParams.get('agentId'))
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<JobState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [minBudget, setMinBudget] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [sort, setSort] = useState<JobSort>('newest')

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api.listJobs().then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: jobErrorMessage(error) })
    })
    return () => { active = false }
  }, [reloadKey])

  const categories = useMemo(() => state.status === 'success' ? Array.from(new Set(state.data.items.map((job) => job.task_category))).sort((left, right) => left.localeCompare(right)) : [], [state])
  const filteredJobs = useMemo(() => {
    if (state.status !== 'success') return []
    const normalizedQuery = query.trim().toLowerCase()
    const minimum = minBudget.trim() === '' ? null : Number(minBudget)
    const maximum = maxBudget.trim() === '' ? null : Number(maxBudget)
    return [...state.data.items].filter((job) => {
      const searchable = [job.public_id, job.title, job.description, job.task_category, job.expected_output, ...job.required_skills, ...job.acceptance_criteria].join(' ').toLowerCase()
      const budget = Number(job.budget)
      return (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (statusFilter === 'all' || job.status === statusFilter) &&
        (categoryFilter === 'all' || job.task_category === categoryFilter) &&
        (minimum === null || (Number.isFinite(minimum) && budget >= minimum)) &&
        (maximum === null || (Number.isFinite(maximum) && budget <= maximum))
    }).sort((left, right) => sort === 'deadline'
      ? new Date(left.deadline).getTime() - new Date(right.deadline).getTime()
      : new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  }, [categoryFilter, maxBudget, minBudget, query, sort, state, statusFilter])

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setMinBudget('')
    setMaxBudget('')
    setSort('newest')
  }
  const hasFilters = query !== '' || statusFilter !== 'all' || categoryFilter !== 'all' || minBudget !== '' || maxBudget !== '' || sort !== 'newest'

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl"><div className="mb-5 inline-flex rounded-2xl border border-line bg-panel p-4 text-accent"><BriefcaseBusiness size={28} /></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job workspace</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Persisted work agreements.</h2><p className="mt-5 text-base leading-7 text-slate-400">Browse jobs stored by the connected API, refine the registry, and open the complete record before matching or escrow begins.</p></div>
        <Link to="/jobs/new" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-[#5ee0d9]"><Plus size={17} /> Create job</Link>
      </section>

      {selectedAgentId !== null && <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5" role="status" aria-live="polite"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Selected agent</p><p className="mt-2 text-sm font-semibold text-white">Agent #{selectedAgentId} is selected for this job context.</p><p className="mt-2 text-sm leading-6 text-slate-300">This selection is carried in the URL only. Matching and agreement creation are not implemented yet, so no assignment or agreement has been created.</p></div>}

      <section aria-labelledby="job-list-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Registry</p><h2 id="job-list-heading" className="mt-1 text-lg font-bold text-white">Persisted job records</h2></div>{state.status === 'success' && <StatusPill tone="neutral">{`${state.data.total} persisted records`}</StatusPill>}</div>
        {state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading jobs"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted job records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><JobSkeleton /><JobSkeleton /></div></div>}
        {state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load job records</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Retry jobs request</button></div>}
        {state.status === 'success' && <>
          <div className="mb-5 rounded-2xl border border-line bg-panel p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300 sm:col-span-2 lg:col-span-2"><Search size={17} className="shrink-0 text-slate-500" /><span className="sr-only">Search jobs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, description, skill…" aria-label="Search jobs" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label>
              <FilterSelect label="Filter by status" value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | JobStatus)} options={Object.entries(jobStatusLabels).map(([value, label]) => ({ value, label }))} emptyLabel="All statuses" />
              <FilterSelect label="Filter by category" value={categoryFilter} onChange={setCategoryFilter} options={categories.map((category) => ({ value: category, label: `Category: ${category}` }))} emptyLabel="All categories" />
              <FilterInput label="Minimum budget" value={minBudget} onChange={setMinBudget} placeholder="Min budget" />
              <FilterInput label="Maximum budget" value={maxBudget} onChange={setMaxBudget} placeholder="Max budget" />
              <FilterSelect label="Sort jobs" value={sort} onChange={(value) => setSort(value as JobSort)} options={[{ value: 'newest', label: 'Newest' }, { value: 'deadline', label: 'Nearest deadline' }]} emptyLabel="Sort jobs" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-sm text-slate-400" aria-live="polite"><span className="font-semibold text-white">{filteredJobs.length} results</span> from {state.data.total} total jobs</p><button type="button" onClick={clearFilters} disabled={!hasFilters} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-electric hover:bg-electric/10 disabled:cursor-not-allowed disabled:text-slate-600"><SlidersHorizontal size={15} /> Clear filters</button></div>
          </div>
          {state.data.items.length === 0 && <EmptyJobs message="No persisted jobs are available yet." detail="The jobs API returned an empty list. Create the first job from this workspace." action={<Link to="/jobs/new" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink"><Plus size={16} /> Create job</Link>} />}
          {state.data.items.length > 0 && filteredJobs.length === 0 && <EmptyJobs message="No jobs match those filters." detail="Try a different search or range, or clear the filters." action={<button type="button" onClick={clearFilters} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]">Clear filters</button>} />}
          {filteredJobs.length > 0 && <div className="grid gap-4 md:grid-cols-2">{filteredJobs.map((job) => <JobCard key={job.id} job={job} selectedAgentId={selectedAgentId} />)}</div>}
        </>}
      </section>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, emptyLabel }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; emptyLabel: string }) {
  return <label className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><ArrowUpDown size={16} className="shrink-0 text-slate-500" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="min-w-0 flex-1 bg-transparent text-white outline-none"><option value="all" className="bg-panel">{emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value} className="bg-panel">{option.label}</option>)}</select></label>
}

function FilterInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-300"><CircleDollarSign size={16} className="shrink-0 text-slate-500" /><span className="sr-only">{label}</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600" /></label>
}

function JobCard({ job, selectedAgentId }: { job: JobListResponseDto['items'][number]; selectedAgentId: number | null }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  const detailPath = `/jobs/${job.id}${selectedAgentId === null ? '' : `?agentId=${selectedAgentId}`}`
  return <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{job.public_id}</p><h3 className="mt-2 text-base font-bold text-white">{job.title}</h3></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-400">{job.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{job.task_category}</span>{job.required_skills.map((skill) => <span key={skill} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{skill}</span>)}</div><div className="mt-5 rounded-xl border border-line bg-ink/30 p-3 text-sm"><p className="font-semibold text-slate-300">Expected deliverable</p><p className="mt-1 leading-6 text-slate-400">{job.expected_output}</p><p className="mt-3 font-semibold text-slate-300">Acceptance criteria</p><ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">{job.acceptance_criteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul></div><div className="mt-5 grid gap-3 rounded-xl border border-line bg-ink/30 p-3 text-xs text-slate-400 sm:grid-cols-2"><span className="inline-flex items-center gap-1.5"><CircleDollarSign size={14} className="text-amber-200" />{formatBudget(job.budget, job.currency)}</span><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-electric" />Deadline {formatDate(job.deadline)}</span><span>Created {formatDate(job.created_at, true)}</span><span>{job.selected_agent_id === null ? 'No agent selected' : `Selected agent #${job.selected_agent_id}`}</span></div><div className="mt-auto flex flex-wrap gap-3 border-t border-line pt-4"><Link to={detailPath} className="inline-flex items-center rounded-xl border border-line px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.05]">View job details</Link>{selectedAgentId !== null && <Link to={detailPath} className="inline-flex items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold text-electric hover:bg-electric/10">Select {job.title} for the selected agent</Link>}</div></article>
}

function EmptyJobs({ message, detail, action }: { message: string; detail: string; action: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center"><BriefcaseBusiness className="mx-auto text-slate-600" size={28} /><p className="mt-4 text-sm font-semibold text-white">{message}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>{action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}</div>
}

function JobSkeleton() {
  return <div className="h-64 animate-pulse rounded-2xl border border-line bg-white/[0.02]" aria-hidden="true" />
}
