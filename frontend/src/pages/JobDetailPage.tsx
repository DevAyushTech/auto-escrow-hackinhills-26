import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, FileText, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type AgreementDto, type DisputeDto, type EscrowDto, type ExecutionDto, type JobDetailDto, type JobEventDto, type JobStatus } from '../lib/api'

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

function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBudget(amount: string, currency: string): string {
  return `${amount} ${currency}`
}

function relatedError(error: unknown, resource: string): string {
  return error instanceof ApiError ? error.message : `${resource} could not be loaded.`
}

export function JobDetailPage() {
  const { jobId: jobIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const jobId = parseId(jobIdParam)
  const legacyAgentId = parseId(searchParams.get('agentId'))
  const selectionConfirmed = searchParams.get('selected') === '1'
  const created = searchParams.get('created') === '1'
  const [state, setState] = useState<JobDetailState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.', notFound: false } : { status: 'loading' })
  const [relatedReloadKey, setRelatedReloadKey] = useState(0)
  const [agreement, setAgreement] = useState<RelatedState<AgreementDto>>({ status: 'loading' })
  const [escrow, setEscrow] = useState<RelatedState<EscrowDto>>({ status: 'loading' })
  const [execution, setExecution] = useState<RelatedState<ExecutionDto>>({ status: 'loading' })
  const [disputes, setDisputes] = useState<RelatedState<DisputeDto[]>>({ status: 'loading' })
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
    setExecution({ status: 'loading' })
    setDisputes({ status: 'loading' })
    setEvents({ status: 'loading' })
    api.agreement(jobId).then((data) => { if (active) setAgreement(data === null ? { status: 'empty' } : { status: 'success', data }) }).catch((error: unknown) => { if (active) setAgreement({ status: 'error', message: relatedError(error, 'Agreement') }) })
    api.jobEscrow(jobId).then((data) => { if (active) setEscrow(data === null ? { status: 'empty' } : { status: 'success', data }) }).catch((error: unknown) => { if (active) setEscrow({ status: 'error', message: relatedError(error, 'Escrow') }) })
    api.execution(jobId).then((data) => { if (active) setExecution({ status: 'success', data }) }).catch((error: unknown) => { if (active) setExecution({ status: 'error', message: relatedError(error, 'Execution') }) })
    api.jobDisputes(jobId).then((data) => { if (active) setDisputes({ status: 'success', data }) }).catch((error: unknown) => { if (active) setDisputes({ status: 'error', message: relatedError(error, 'Disputes') }) })
    api.jobEvents(jobId).then((data) => { if (active) setEvents({ status: 'success', data }) }).catch((error: unknown) => { if (active) setEvents({ status: 'error', message: relatedError(error, 'Audit events') }) })
    return () => { active = false }
  }, [jobId, relatedReloadKey])

  const backToJobs = legacyAgentId === null ? '/jobs' : `/jobs?agentId=${legacyAgentId}`
  return <div className="space-y-8"><Link to={backToJobs} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to jobs</Link>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} notFound={state.notFound} backToJobs={backToJobs} />}{state.status === 'success' && <JobDetails job={state.data} legacyAgentId={legacyAgentId} selectionConfirmed={selectionConfirmed} created={created} agreement={agreement} escrow={escrow} execution={execution} disputes={disputes} events={events} retryRelated={() => setRelatedReloadKey((value) => value + 1)} />}</div>
}

function JobDetails({ job, legacyAgentId, selectionConfirmed, created, agreement, escrow, execution, disputes, events, retryRelated }: { job: JobDetailDto; legacyAgentId: number | null; selectionConfirmed: boolean; created: boolean; agreement: RelatedState<AgreementDto>; escrow: RelatedState<EscrowDto>; execution: RelatedState<ExecutionDto>; disputes: RelatedState<DisputeDto[]>; events: RelatedState<JobEventDto[]>; retryRelated: () => void }) {
  const tone = job.status === 'completed' ? 'success' : job.status === 'disputed' || job.status === 'cancelled' ? 'danger' : job.status === 'in_progress' || job.status === 'under_review' ? 'warning' : 'neutral'
  const selectedAgentId = job.selected_agent_id
  return <>
    <section className="max-w-4xl">{created && <SuccessBanner title="Job created successfully" detail="The API returned HTTP 201 and this is the persisted job record." />}{selectionConfirmed && <SuccessBanner title="Agent selected successfully" detail={selectedAgentId === null ? 'The selection response was received; the job record does not currently include a selected agent.' : `Agent #${selectedAgentId} is now persisted on this job. No agreement was accepted and no escrow was funded.`} />}<div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job record</p><p className="mt-2 text-sm text-slate-500">{job.public_id} · ID {job.id}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h2></div><StatusPill tone={tone}>{jobStatusLabels[job.status]}</StatusPill></div><p className="mt-6 whitespace-pre-wrap text-base leading-7 text-slate-400">{job.description}</p><div className="mt-5 grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2"><Field label="Expected output" value={job.expected_output} /><Field label="Acceptance criteria" value={<ul className="list-disc space-y-1 pl-5">{job.acceptance_criteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul>} /><Field label="Budget" value={formatBudget(job.budget, job.currency)} /><Field label="Deadline" value={formatDate(job.deadline)} /><Field label="Task category" value={job.task_category} /><Field label="Required skills" value={<ChipList values={job.required_skills} />} />{job.additional_instructions && <Field label="Additional instructions" value={job.additional_instructions} />}</div>{selectedAgentId !== null ? <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Selected agent</p><p className="mt-2 text-base font-semibold text-white">Agent #{selectedAgentId}</p><p className="mt-1 text-sm leading-6 text-slate-300">This value comes from the persisted <code className="rounded bg-white/10 px-1">selected_agent_id</code> on the job record. Review the matching run or related agreement below; selection does not accept an agreement or fund escrow.</p></div> : legacyAgentId !== null ? <div className="mt-5 rounded-2xl border border-line bg-panel p-4" role="status"><p className="text-sm font-semibold text-white">Agent #{legacyAgentId} was carried here from the marketplace selection context.</p><p className="mt-1 text-sm leading-6 text-slate-400">This URL context is not a persisted selection. Use matching to rank candidates and persist a selection.</p></div> : <div className="mt-5 rounded-2xl border border-line bg-panel p-4" role="status"><p className="text-sm font-semibold text-white">Run matching before proposing an agreement or funding escrow.</p><p className="mt-1 text-sm leading-6 text-slate-400">Only persisted job, agreement, escrow, and audit records are shown on this page.</p></div>}<div className="mt-6 flex flex-wrap gap-3"><Link to={`/jobs/${job.id}/matching`} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink hover:bg-[#5ee0d9]">Open matching <ArrowRight size={16} /></Link><Link to={`/jobs/${job.id}/agreement`} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/[0.05]">Agreement workspace <FileText size={16} /></Link><Link to={`/jobs/${job.id}/escrow`} className="inline-flex items-center gap-2 rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric hover:bg-electric/10">Escrow details <CircleDollarSign size={16} /></Link></div></section>
      <div className="grid gap-5 xl:grid-cols-2"><RelatedResource title="Agreement" icon={<FileText size={19} />} state={agreement} emptyLabel="Agreement not created yet." retry={retryRelated}>{agreement.status === 'success' && <AgreementSummary agreement={agreement.data} />}</RelatedResource><RelatedResource title="Escrow" icon={<CircleDollarSign size={19} />} state={escrow} emptyLabel="Escrow not created yet." emptyAction={<Link to={`/jobs/${job.id}/escrow`} className="mt-4 inline-flex text-sm font-semibold text-electric hover:text-white">Open escrow details</Link>} retry={retryRelated}>{escrow.status === 'success' && <EscrowSummary escrow={escrow.data} jobId={job.id} />}</RelatedResource></div><ExecutionSummary state={execution} jobId={job.id} retry={retryRelated} /><DisputeSummary state={disputes} job={job} escrow={escrow} retry={retryRelated} /><AuditEvents state={events} retry={retryRelated} />
  </>
}

function ExecutionSummary({ state, jobId, retry }: { state: RelatedState<ExecutionDto>; jobId: number; retry: () => void }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Execution</p><h3 className="mt-1 font-bold text-white">Backend execution state</h3></div>{state.status === 'loading' && <LoaderCircle className="animate-spin text-electric" size={17} />}{state.status === 'success' && <StatusPill tone={state.data.execution_status === 'settlement_ready' || state.data.execution_status === 'completed' ? 'success' : state.data.execution_status === 'blocked' || state.data.execution_status === 'manual_review' ? 'danger' : 'warning'}>{state.data.execution_status.replaceAll('_', ' ')}</StatusPill>}</div>{state.status === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading execution eligibility…</p>}{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && <><p className="mt-4 text-sm leading-6 text-slate-400">{state.data.execution_status === 'settlement_ready' ? 'Verification passed and the funded escrow is eligible for a separate settlement action.' : state.data.start_reason}</p><Link to={`/jobs/${jobId}/execution`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric hover:bg-electric/10">Open execution workspace <ArrowRight size={16} /></Link></>}</section>
}

function DisputeSummary({ state, job, escrow, retry }: { state: RelatedState<DisputeDto[]>; job: JobDetailDto; escrow: RelatedState<EscrowDto>; retry: () => void }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Disputes</p><h3 className="mt-1 font-bold text-white">Escrow protection and review</h3></div>{state.status === 'loading' && <LoaderCircle className="animate-spin text-electric" size={17} />}</div>{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && state.data.length === 0 && <><p className="mt-4 text-sm leading-6 text-slate-500">No disputes are recorded for this job.</p>{escrow.status === 'success' && ['funded', 'held'].includes(escrow.data.status) && ['assigned', 'in_progress', 'submitted', 'under_review', 'completed'].includes(job.status) && <Link to={`/jobs/${job.id}/disputes/new`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/30 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-300/10">Open a dispute</Link>}</>}{state.status === 'success' && state.data.length > 0 && <div className="mt-4 space-y-3">{state.data.map((dispute) => <Link key={dispute.id} to={`/disputes/${dispute.id}`} className={`block rounded-xl border p-4 ${['open', 'under_review'].includes(dispute.status) ? 'border-amber-300/30 bg-amber-300/5' : 'border-line bg-ink/30'}`}><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">Dispute #{dispute.id} · {dispute.category.replaceAll('_', ' ')}</p><StatusPill tone={['open', 'under_review'].includes(dispute.status) ? 'warning' : dispute.status === 'resolved' ? 'success' : 'neutral'}>{dispute.status.replace('_', ' ')}</StatusPill></div><p className="mt-2 text-sm leading-6 text-slate-400">{dispute.description}</p>{dispute.resolution && <p className="mt-2 text-xs font-semibold text-accent">Resolution: {dispute.resolution}</p>}</Link>)}</div>}</section>
}

function AgreementSummary({ agreement }: { agreement: AgreementDto }) {
  const accepted = agreement.status === 'accepted'
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><StatusPill tone={accepted ? 'success' : 'neutral'}>{accepted ? 'Accepted' : agreement.status}</StatusPill><Link to={`/jobs/${agreement.job_id}/agreement`} className="text-xs font-semibold text-electric hover:text-white">View full agreement</Link></div><dl className="space-y-3"><Field label="Proposed budget" value={formatBudget(agreement.proposed_budget, agreement.currency)} /><Field label="Agreed amount" value={formatBudget(agreement.amount, agreement.currency)} /><Field label="Proposed deadline" value={agreement.proposed_deadline ? formatDate(agreement.proposed_deadline) : 'Not specified'} /><Field label="Agreement version" value={agreement.accepted_version ?? agreement.proposal_version ?? 'Legacy response'} /><Field label="Terms" value={Object.keys(agreement.terms).length > 0 ? <RecordValue record={agreement.terms} /> : 'No terms recorded'} /></dl>{accepted && <Link to={`/jobs/${agreement.job_id}/escrow`} className="inline-flex items-center gap-2 text-sm font-bold text-electric hover:text-white"><ShieldCheck size={16} /> Open escrow details</Link>}</div>
}

function EscrowSummary({ escrow, jobId }: { escrow: EscrowDto; jobId: number }) {
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><StatusPill tone={escrow.status === 'funded' || escrow.status === 'held' ? 'success' : escrow.status === 'pending' ? 'warning' : escrow.status === 'disputed' || escrow.status === 'refunded' ? 'danger' : 'neutral'}>{escrow.status}</StatusPill><Link to={`/jobs/${jobId}/escrow`} className="text-xs font-semibold text-electric hover:text-white">Open escrow details</Link></div><dl className="space-y-3"><Field label="Status" value={escrow.status} /><Field label="Accepted amount" value={formatBudget(escrow.amount, escrow.currency)} /><Field label="Funded amount" value={escrow.funded_amount === null ? 'Not funded' : formatBudget(escrow.funded_amount, escrow.currency)} /><Field label="Funded at" value={escrow.funded_at ? formatDate(escrow.funded_at) : 'Not funded'} /><Field label="Ledger entries" value={escrow.ledger_entries.length} /></dl></div>
}

function SuccessBanner({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><div><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p></div></div>
}

function RelatedResource<T>({ title, icon, state, emptyLabel, emptyAction, retry, children }: { title: string; icon: ReactNode; state: RelatedState<T>; emptyLabel: string; emptyAction?: ReactNode; retry: () => void; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-electric">{icon}</span><h3 className="font-bold text-white">{title}</h3></div>{state.status === 'loading' && <LoaderCircle className="animate-spin text-electric" size={17} />}</div>{state.status === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading {title.toLowerCase()}…</p>}{state.status === 'empty' && <div className="mt-4"><p className="text-sm text-slate-500">{emptyLabel}</p>{emptyAction}</div>}{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && <div className="mt-5">{children}</div>}</section>
}

function AuditEvents({ state, retry }: { state: RelatedState<JobEventDto[]>; retry: () => void }) {
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-center gap-3"><Clock3 className="text-electric" size={19} /><div><h3 className="font-bold text-white">Audit events</h3><p className="mt-1 text-xs text-slate-500">Persisted lifecycle descriptions and timestamps.</p></div></div>{state.status === 'loading' && <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={16} /> Loading audit events…</div>}{state.status === 'error' && <RelatedError message={state.message} retry={retry} />}{state.status === 'success' && state.data.length === 0 && <p className="mt-5 text-sm text-slate-500">No audit events have been recorded yet.</p>}{state.status === 'success' && state.data.length > 0 && <ol className="mt-5 space-y-4">{state.data.map((event) => <li key={event.id} className="relative border-l border-line pl-5"><span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-electric" /><p className="text-sm font-semibold text-white">{event.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)} · {event.event_type}</p></li>)}</ol>}</section>
}

function RelatedError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/5 p-4" role="status"><p className="text-sm text-rose-100">{message}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border border-rose-200/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-200/10">Retry related request</button></div>
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-line pb-4 last:border-b-0 last:pb-0"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 text-sm leading-6 text-slate-300">{value}</dd></div>
}

function ChipList({ values }: { values: string[] }) {
  return values.length > 0 ? <div className="flex flex-wrap gap-2">{values.map((value, index) => <span key={`${value}-${index}`} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{value}</span>)}</div> : <span className="text-slate-500">None listed</span>
}

function RecordValue({ record }: { record: Record<string, unknown> }) {
  return <dl className="space-y-3">{Object.entries(record).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"><dt className="text-sm text-slate-500">{key}</dt><dd className="max-w-full text-right text-sm text-slate-300">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
}

function LoadingPanel() {
  return <div className="rounded-2xl border border-line bg-panel p-8" aria-label="Loading job details"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading job details…</div></div>
}

function ErrorPanel({ message, notFound, backToJobs }: { message: string; notFound: boolean; backToJobs: string }) {
  return <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">{notFound ? 'Job not found' : 'Unable to load job details'}</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{message}</p><Link to={backToJobs} className="mt-5 inline-flex rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Return to jobs</Link></div>
}
