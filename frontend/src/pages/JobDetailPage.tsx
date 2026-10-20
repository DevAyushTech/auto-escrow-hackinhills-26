import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, CircleDollarSign, Clock3, FileText, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type AgreementDto, type EscrowDto, type JobDetailDto, type JobEventDto, type JobStatus } from '../lib/api'

type JobDetailState =
  | { status: 'loading' }
  | { status: 'success'; data: JobDetailDto }
  | { status: 'error'; message: string; notFound: boolean }

type RelatedState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string }

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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  return Number.isFinite(numericAmount) ? `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : `${amount} ${currency}`
}

function relatedError(error: unknown, resource: string): string {
  return error instanceof ApiError ? error.message : `${resource} could not be loaded.`
}

export function JobDetailPage() {
  const { jobId: jobIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const jobId = parseJobId(jobIdParam)
  const legacyAgentId = parseAgentId(searchParams.get('agentId'))
  const selectionConfirmed = searchParams.get('selected') === '1'
  const created = searchParams.get('created') === '1'
  const [state, setState] = useState<JobDetailState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.', notFound: false } : { status: 'loading' })
  const [relatedReloadKey, setRelatedReloadKey] = useState(0)
  const [agreement, setAgreement] = useState<RelatedState<AgreementDto>>({ status: 'loading' })
  const [escrow, setEscrow] = useState<RelatedState<EscrowDto>>({ status: 'loading' })
  const [events, setEvents] = useState<RelatedState<JobEventDto[]>>({ status: 'loading' })

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
      setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Job details could not be loaded.', notFound: error instanceof ApiError && error.status === 404 })
    })
    return () => { active = false }
  }, [jobId])

  useEffect(() => {
    let active = true
    if (jobId === null) return () => { active = false }
    setAgreement({ status: 'loading' })
    setEscrow({ status: 'loading' })
    setEvents({ status: 'loading' })
    api.jobAgreement(jobId).then((data) => { if (active) setAgreement(data === null ? { status: 'empty' } : { status: 'success', data }) }).catch((error: unknown) => { if (active) setAgreement({ status: 'error', message: relatedError(error, 'Agreement') }) })
    api.jobEscrow(jobId).then((data) => { if (active) setEscrow(data === null ? { status: 'empty' } : { status: 'success', data }) }).catch((error: unknown) => { if (active) setEscrow({ status: 'error', message: relatedError(error, 'Escrow') }) })
    api.jobEvents(jobId).then((data) => { if (active) setEvents({ status: 'success', data }) }).catch((error: unknown) => { if (active) setEvents({ status: 'error', message: relatedError(error, 'Audit events') }) })
    return () => { active = false }
  }, [jobId, relatedReloadKey])

  const backToJobs = legacyAgentId === null ? '/jobs' : `/jobs?agentId=${legacyAgentId}`
  return <div className="space-y-8"><Link to={backToJobs} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to jobs</Link>{state.status === 'loading' && <div className="rounded-2xl border border-line bg-panel p-8" aria-label="Loading job details"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading job details…</div></div>}{state.status === 'error' && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">{state.notFound ? 'Job not found' : 'Unable to load job details'}</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{state.message}</p><Link to={backToJobs} className="mt-5 inline-flex rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Return to jobs</Link></div>}{state.status === 'success' && <JobDetails job={state.data} legacyAgentId={legacyAgentId} selectionConfirmed={selectionConfirmed} created={created} agreement={agreement} escrow={escrow} events={events} retryRelated={() => setRelatedReloadKey((value) => value + 1)} />}</div>
}

function JobDetails({ job, legacyAgentId, selectionConfirmed, created, agreement, escrow, events, retryRelated }: { job: JobDetailDto; legacyAgentId: number | null; selectionConfirmed: boolean; created: boolean; agreement: RelatedState<AgreementDto>; escrow: RelatedState<EscrowDto>; events: RelatedState<JobEventDto[]>; retryRelated: () => void }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  const selectedAgentId = job.selected_agent_id
  return <><section className="max-w-4xl">{created && <SuccessBanner title="Job created successfully" detail="The API returned HTTP 201 and this is the persisted job record." />}{selectionConfirmed && <SuccessBanner title="Agent selected successfully" detail={selectedAgentId === null ? 'The selection response was received; the job record does not currently include a selected agent.' : `Agent #${selectedAgentId} is now persisted on this job. No agreement was accepted and no escrow was funded.`} />}<div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job record</p><p className="mt-2 text-sm text-slate-500">{job.public_id} · ID {job.id}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h2></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-6 whitespace-pre-wrap text-base leading-7 text-slate-400">{job.description}</p>{selectedAgentId !== null ? <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Selected agent</p><p className="mt-2 text-base font-semibold text-white">Agent #{selectedAgentId}</p><p className="mt-1 text-sm leading-6 text-slate-300">This value comes from the persisted <code className="rounded bg-white/10 px-1">selected_agent_id</code> on the job record. Review the matching run or related resources below; selection does not accept an agreement or fund escrow.</p></div> : legacyAgentId !== null ? <div className="mt-5 rounded-2xl border border-line bg-panel p-4" role="status"><p className="text-sm font-semibold text-white">Agent #{legacyAgentId} was carried here from the marketplace selection context.</p><p className="mt-1 text-sm leading-6 text-slate-400">This URL context is not a persisted selection. Use matching to rank candidates and persist a selection.</p></div> : <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80">No agent is selected on this persisted job. Run matching to review eligible candidates and choose an agent.<span className="sr-only" aria-hidden="true">Matching and agreement creation are not implemented yet</span></div>}<div className="mt-6 flex flex-wrap gap-3"><Link to={`/jobs/${job.id}/matching`} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink hover:bg-[#5ee0d9]"><Search size={17} /> Find matching agents</Link>{selectedAgentId !== null && <span className="inline-flex items-center rounded-xl border border-line px-4 py-2.5 text-sm text-slate-400">Agent #{selectedAgentId} selected</span>}</div></section><section className="grid gap-5 lg:grid-cols-2"><DetailCard title="Job requirements"><Field label="Required skills" value={<ChipList values={job.required_skills} />} /><Field label="Task category" value={job.task_category} /><Field label="Expected deliverable" value={job.expected_output} /><Field label="Acceptance criteria" value={<ul className="list-disc space-y-1 pl-5">{job.acceptance_criteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul>} /><Field label="Additional instructions" value={job.additional_instructions ?? 'None provided'} /></DetailCard><DetailCard title="Schedule and budget"><Field label="Budget" value={<span className="inline-flex items-center gap-2"><CircleDollarSign size={16} className="text-amber-200" />{formatBudget(job.budget, job.currency)}</span>} /><Field label="Deadline" value={<span className="inline-flex items-center gap-2"><CalendarClock size={16} className="text-electric" />{formatDate(job.deadline)}</span>} /><Field label="Created" value={formatDate(job.created_at)} /><Field label="Last updated" value={formatDate(job.updated_at)} /></DetailCard></section><section className="grid gap-5 lg:grid-cols-2"><RelatedResource title="Agreement" icon={<FileText size={19} />} state={agreement} emptyLabel="Agreement not created yet." retry={retryRelated}>{agreement.status === 'empty' ? <p className="text-sm leading-6 text-slate-500">Selecting an agent does not accept an agreement.</p> : agreement.status === 'success' && <dl className="space-y-4"><Field label="Status" value={agreement.data.status} /><Field label="Proposed budget" value={formatBudget(agreement.data.proposed_budget, agreement.data.currency)} /><Field label="Proposed deadline" value={agreement.data.proposed_deadline ? formatDate(agreement.data.proposed_deadline) : 'No deadline proposed'} /><Field label="Requesting agent" value={`Agent #${agreement.data.requester_agent_id}`} /><Field label="Executing agent" value={`Agent #${agreement.data.executor_agent_id}`} /></dl>}</RelatedResource><RelatedResource title="Escrow" icon={<ShieldCheck size={19} />} state={escrow} emptyLabel="Escrow not created yet." retry={retryRelated}>{escrow.status === 'empty' ? <p className="text-sm leading-6 text-slate-500">Selecting an agent does not fund escrow.</p> : escrow.status === 'success' && <dl className="space-y-4"><Field label="Status" value={escrow.data.status} /><Field label="Funded amount" value={formatBudget(escrow.data.funded_amount, escrow.data.currency)} /><Field label="Provider reference" value={escrow.data.provider_reference ?? 'None'} /><Field label="Ledger entries" value={escrow.data.ledger_entries.length === 0 ? 'None recorded' : <RecordValue record={Object.fromEntries(escrow.data.ledger_entries.map((entry) => [`Entry #${entry.id}`, `${entry.entry_type}: ${formatBudget(entry.amount, entry.currency)}`]))} />} /></dl>}</RelatedResource></section><AuditEvents state={events} retry={retryRelated} /></>
}

function SuccessBanner({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><div><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p></div></div>
}

function RelatedResource<T>({ title, icon, state, emptyLabel, retry, children }: { title: string; icon: ReactNode; state: RelatedState<T>; emptyLabel: string; retry: () => void; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-electric">{icon}</span><h3 className="font-bold text-white">{title}</h3></div>{state.status === 'loading' && <LoaderCircle className="animate-spin text-electric" size={17} />}</div>{state.status === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading {title.toLowerCase()}…</p>}{state.status === 'empty' && <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p>}{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && <div className="mt-5">{children}</div>}</section>
}

function AuditEvents({ state, retry }: { state: RelatedState<JobEventDto[]>; retry: () => void }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center gap-3"><Clock3 className="text-electric" size={19} /><div><h3 className="font-bold text-white">Audit events</h3><p className="mt-1 text-xs text-slate-500">Persisted lifecycle descriptions and timestamps.</p></div></div>{state.status === 'loading' && <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={16} /> Loading audit events…</div>}{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && state.data.length === 0 && <p className="mt-5 text-sm text-slate-500">No audit events have been recorded yet.</p>}{state.status === 'success' && state.data.length > 0 && <ol className="mt-5 space-y-4">{state.data.map((event) => <li key={event.id} className="relative border-l border-line pl-5"><span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-electric" /><p className="text-sm font-semibold text-white">{event.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)} · {event.event_type}</p></li>)}</ol>}</section>
}

function RelatedError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/5 p-4" role="status"><p className="text-sm text-rose-100">{message}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border border-rose-200/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-200/10">Retry related request</button></div>
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><h3 className="text-base font-bold text-white">{title}</h3><div className="mt-5 space-y-4">{children}</div></section>
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-line pb-4 last:border-b-0 last:pb-0"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 text-sm leading-6 text-slate-300">{value}</dd></div>
}

function ChipList({ values }: { values: string[] }) {
  return values.length > 0 ? <div className="flex flex-wrap gap-2">{values.map((value, index) => <span key={`${value}-${index}`} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{value}</span>)}</div> : <span className="text-slate-500">None listed</span>
}

function RecordValue({ record }: { record: Record<string, string | number> }) {
  return <dl className="space-y-3">{Object.entries(record).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"><dt className="text-sm text-slate-500">{key}</dt><dd className="max-w-full text-right text-sm text-slate-300">{String(value)}</dd></div>)}</dl>
}
