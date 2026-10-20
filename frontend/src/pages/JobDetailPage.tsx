import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, CircleDollarSign, LoaderCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, JobDetailDto, JobStatus, api } from '../lib/api'

type JobDetailState =
  | { status: 'loading' }
  | { status: 'success'; data: JobDetailDto }
  | { status: 'error'; message: string; notFound: boolean }

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

function parseJobId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parseAgentId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  return Number.isFinite(numericAmount) ? `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : `${amount} ${currency}`
}

export function JobDetailPage() {
  const { jobId: jobIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const jobId = parseJobId(jobIdParam)
  const selectedAgentId = parseAgentId(searchParams.get('agentId'))
  const [state, setState] = useState<JobDetailState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.', notFound: false } : { status: 'loading' })

  useEffect(() => {
    let active = true
    if (jobId === null) {
      setState({ status: 'error', message: 'The job ID is invalid.', notFound: false })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    api.job(jobId).then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (!active) return
      const notFound = error instanceof ApiError && error.status === 404
      setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Job details could not be loaded.', notFound })
    })
    return () => { active = false }
  }, [jobId])

  const backToJobs = selectedAgentId === null ? '/jobs' : `/jobs?agentId=${selectedAgentId}`
  return <div className="space-y-8"><Link to={backToJobs} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to jobs</Link>{state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-8" aria-label="Loading job details"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading job details…</div></div>}{state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">{state.notFound ? 'Job not found' : 'Unable to load job details'}</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><Link to={backToJobs} className="mt-5 inline-flex rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Return to jobs</Link></div>}{state.status === 'success' && <JobDetails job={state.data} selectedAgentId={selectedAgentId} />}</div>
}

function JobDetails({ job, selectedAgentId }: { job: JobDetailDto; selectedAgentId: number | null }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  return <><section className="max-w-4xl"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job record</p><p className="mt-2 text-sm text-slate-500">{job.public_id} · ID {job.id}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h2></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-6 text-base leading-7 text-slate-400">{job.description}</p>{selectedAgentId !== null && <p className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm leading-6 text-slate-300">Agent #{selectedAgentId} was carried here from the marketplace selection. Matching and agreement creation are not implemented yet; this page only displays the persisted job.</p>}{selectedAgentId === null && <p className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80">Matching and agreement creation are not implemented yet. Viewing this persisted job does not assign an agent or create an agreement.</p>}</section><section className="grid gap-4 lg:grid-cols-2"><DetailCard title="Task fields"><Field label="Task category" value={job.task_category} /><Field label="Required skills" value={<ChipList values={job.required_skills} />} /><Field label="Expected output" value={job.expected_output} /><Field label="Acceptance criteria" value={<ul className="list-disc space-y-1 pl-5">{job.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>} />{job.additional_instructions !== null && <Field label="Additional instructions" value={job.additional_instructions} />}</DetailCard><DetailCard title="Budget and timing"><Field label="Budget" value={<span className="inline-flex items-center gap-2"><CircleDollarSign size={15} />{formatBudget(job.budget, job.currency)}</span>} /><Field label="Deadline" value={<span className="inline-flex items-center gap-2"><CalendarClock size={15} />{formatDate(job.deadline)}</span>} /><Field label="Created at" value={formatDate(job.created_at)} /><Field label="Updated at" value={formatDate(job.updated_at)} /></DetailCard><DetailCard title="Agent relationships"><Field label="Requester agent ID" value={job.requester_agent_id === null ? 'None' : job.requester_agent_id} /><Field label="Executor agent ID" value={job.executor_agent_id === null ? 'None' : job.executor_agent_id} /><Field label="Selected agent ID" value={job.selected_agent_id === null ? 'None' : job.selected_agent_id} /></DetailCard><DetailCard title="Compatibility requirements"><RecordValue record={job.requirements ?? {}} emptyLabel="No compatibility requirements provided." /></DetailCard></section></>
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><h3 className="text-base font-bold text-white">{title}</h3><div className="mt-5 space-y-4">{children}</div></section>
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-line pb-4 last:border-b-0 last:pb-0"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 text-sm leading-6 text-slate-300">{value}</dd></div>
}

function ChipList({ values }: { values: string[] }) {
  return values.length > 0 ? <div className="flex flex-wrap gap-2">{values.map((value) => <span key={value} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{value}</span>)}</div> : <span className="text-slate-500">None listed</span>
}

function RecordValue({ record, emptyLabel }: { record: Record<string, unknown>; emptyLabel: string }) {
  const entries = Object.entries(record)
  if (entries.length === 0) return <p className="text-sm text-slate-500">{emptyLabel}</p>
  return <dl className="space-y-3">{entries.map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"><dt className="text-sm text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="max-w-full text-right text-sm text-slate-300">{typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)}</dd></div>)}</dl>
}
