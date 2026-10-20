import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleDollarSign, Clock3, FileText, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type AgreementDto, type DisputeDto, type EscrowDto, type EscrowStatus, type JobDetailDto, type JobEventDto, type JobStatus, type LedgerEntryDto } from '../lib/api'

type PageState =
  | { status: 'loading' }
  | { status: 'success'; job: JobDetailDto; agreement: AgreementDto | null; escrow: EscrowDto | null; ledger: LedgerEntryDto[]; events: JobEventDto[]; disputes: DisputeDto[] }
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

const escrowStatusLabels: Record<EscrowStatus, string> = {
  pending: 'Pending',
  funded: 'Funded',
  held: 'Held',
  released: 'Released',
  refunded: 'Refunded',
  disputed: 'Disputed',
}

function parseJobId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatMoney(amount: string, currency: string): string {
  return `${amount} ${currency}`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function statusTone(status: EscrowStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'funded' || status === 'held') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'disputed' || status === 'refunded') return 'danger'
  return 'neutral'
}

function canFund(job: JobDetailDto, agreement: AgreementDto | null, escrow: EscrowDto | null): { allowed: boolean; reason: string } {
  if (escrow !== null) return { allowed: false, reason: 'An escrow record already exists for this job. Funding cannot be submitted again.' }
  if (agreement === null) return { allowed: false, reason: 'Funding is unavailable because this job has no persisted agreement.' }
  if (agreement.job_id !== job.id) return { allowed: false, reason: 'Funding is unavailable because the agreement belongs to a different job.' }
  if (agreement.status !== 'accepted') return { allowed: false, reason: 'Funding is available only after the agreement is accepted.' }
  if (!['open', 'assigned', 'in_progress'].includes(job.status)) return { allowed: false, reason: `Funding is unavailable while this job is ${jobStatusLabels[job.status].toLowerCase()}.` }
  return { allowed: true, reason: 'The accepted agreement and current job state allow demo funding.' }
}

async function loadPageData(jobId: number): Promise<Omit<Extract<PageState, { status: 'success' }>, 'status'>> {
  const [job, agreement, escrow, events, disputes] = await Promise.all([
    api.job(jobId),
    api.agreement(jobId),
    api.jobEscrow(jobId),
    api.jobEvents(jobId),
    api.jobDisputes(jobId).catch((error: unknown) => {
      // Keep the existing escrow page usable against a pre-Phase-9 backend;
      // the Phase 9 API returns a real list and is used whenever available.
      if (error instanceof ApiError && error.status === 404) return []
      throw error
    }),
  ])
  if (escrow === null) return { job, agreement, escrow, ledger: [], events, disputes }

  try {
    const ledger = await api.escrowLedger(escrow.id)
    return { job, agreement, escrow, ledger, events, disputes }
  } catch (error: unknown) {
    // Older escrow responses embed ledger_entries and may not expose the Phase 7 ledger route yet.
    if (error instanceof ApiError && error.status === 404) return { job, agreement, escrow, ledger: escrow.ledger_entries, events, disputes }
    throw error
  }
}

export function EscrowPage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = parseJobId(jobIdParam)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<PageState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.' } : { status: 'loading' })
  const [funding, setFunding] = useState(false)
  const [fundingError, setFundingError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (jobId === null) {
      setState({ status: 'error', message: 'The job ID is invalid.' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    loadPageData(jobId).then((data) => {
      if (active) setState({ status: 'success', ...data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error, 'Escrow details could not be loaded.') })
    })
    return () => { active = false }
  }, [jobId, reloadKey])

  const retry = () => {
    setFundingError(null)
    setReloadKey((value) => value + 1)
  }

  const fund = async () => {
    if (funding || state.status !== 'success') return
    const validity = canFund(state.job, state.agreement, state.escrow)
    if (!validity.allowed) {
      setFundingError(validity.reason)
      return
    }
    if (!window.confirm(`Fund the agreed demo escrow of ${formatMoney(state.agreement?.amount ?? '', state.agreement?.currency ?? '')}? This records simulated ledger activity only.`)) return

    setFunding(true)
    setFundingError(null)
    setSuccessMessage(null)
    try {
      await api.fundDemoEscrow(state.job.id)
      // The confirmation is only shown after the fund response; the following reload reads every persisted record again.
      setSuccessMessage('Demo escrow funding was accepted by the API. Refreshed persisted records are shown below.')
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      setFundingError(`${errorMessage(error, 'The demo escrow funding request failed.')} Check that the agreement is accepted, the job is fundable, and no escrow already exists.`)
    } finally {
      setFunding(false)
    }
  }

  const backToJob = jobId === null ? '/jobs' : `/jobs/${jobId}`
  return <div className="mx-auto max-w-6xl space-y-8"><Link to={backToJob} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to job</Link>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} retry={retry} />}{state.status === 'success' && <EscrowDetails state={state} funding={funding} fundingError={fundingError} successMessage={successMessage} onFund={fund} />}</div>
}

function EscrowDetails({ state, funding, fundingError, successMessage, onFund }: { state: Extract<PageState, { status: 'success' }>; funding: boolean; fundingError: string | null; successMessage: string | null; onFund: () => void }) {
  const validity = canFund(state.job, state.agreement, state.escrow)
  return <>
    <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Professional escrow record</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Escrow details</h2><p className="mt-2 text-sm text-slate-500">{state.job.title} · {state.job.public_id} · Job #{state.job.id}</p></div><div className="flex items-center gap-2 rounded-full border border-electric/25 bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric"><ShieldCheck size={14} /> Demo mode</div></div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4" role="note"><CircleDollarSign className="mt-0.5 shrink-0 text-amber-200" size={19} /><p className="text-sm font-semibold leading-6 text-amber-100">Simulated demo ledger — no real money or blockchain transfer</p></div>
      <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-3"><SummaryValue label="Job status" value={jobStatusLabels[state.job.status]} /><SummaryValue label="Job ID" value={String(state.job.id)} /><SummaryValue label="Job title" value={state.job.title} /></div>
    </section>

    {fundingError && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5" role="alert"><p className="text-sm font-bold text-rose-100">Unable to fund demo escrow</p><p className="mt-2 text-sm leading-6 text-rose-100/80">{fundingError}</p></div>}
    {successMessage && <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><p className="text-sm leading-6 text-slate-200">{successMessage}</p></div>}

      <DisputeBanner job={state.job} escrow={state.escrow} disputes={state.disputes} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5"><AgreementSummary agreement={state.agreement} job={state.job} /><EscrowStatusCard escrow={state.escrow} jobId={state.job.id} validity={validity} funding={funding} onFund={onFund} /></div>
      <div className="space-y-5"><LedgerHistory entries={state.ledger} escrow={state.escrow} /><AuditEvents events={state.events} /></div>
    </div>
  </>
}

function AgreementSummary({ agreement, job }: { agreement: AgreementDto | null; job: JobDetailDto }) {
  if (agreement === null) return <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex items-center gap-3"><FileText className="text-electric" size={19} /><h3 className="font-bold text-white">Accepted agreement</h3></div><p className="mt-5 text-sm leading-6 text-slate-400">No agreement is persisted for {job.title}. An accepted agreement is required before demo escrow can be funded.</p><Link to={`/jobs/${job.id}/agreement`} className="mt-5 inline-flex rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric hover:bg-electric/10">Open agreement workspace</Link></section>
  const accepted = agreement.status === 'accepted'
  const version = agreement.accepted_version ?? agreement.proposal_version
  return <section className={`rounded-3xl border p-6 sm:p-8 ${accepted ? 'border-accent/30 bg-accent/5' : 'border-line bg-panel'}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Agreement #{agreement.id}</p><h3 className="mt-2 text-xl font-bold text-white">{accepted ? 'Accepted agreement' : 'Agreement is not accepted'}</h3></div><StatusPill tone={accepted ? 'success' : 'warning'}>{accepted ? 'Accepted' : agreement.status}</StatusPill></div><dl className="mt-6 grid gap-4 sm:grid-cols-3"><SummaryValue label="Version" value={version === undefined || version === null ? 'Legacy response' : String(version)} /><SummaryValue label="Agreed amount" value={formatMoney(agreement.amount, agreement.currency)} /><SummaryValue label="Currency" value={agreement.currency} /></dl><p className="mt-5 text-sm leading-6 text-slate-400">{accepted ? 'These terms are frozen and are the basis for this escrow record.' : 'Funding is unavailable until this agreement reaches the accepted state.'}</p><Link to={`/jobs/${agreement.job_id}/agreement`} className="mt-5 inline-flex rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric hover:bg-electric/10">View full agreement</Link></section>
}

function EscrowStatusCard({ escrow, jobId, validity, funding, onFund }: { escrow: EscrowDto | null; jobId: number; validity: { allowed: boolean; reason: string }; funding: boolean; onFund: () => void }) {
  if (escrow === null) return <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Funding state</p><h3 className="mt-2 text-xl font-bold text-white">Escrow not funded</h3></div><StatusPill tone="warning">Not funded</StatusPill></div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><SummaryValue label="Current escrow status" value="No persisted record" /><SummaryValue label="Verification state" value="Awaiting escrow record" /></dl><p className="mt-5 text-sm leading-6 text-slate-400">{validity.reason}</p>{validity.allowed ? <button type="button" onClick={onFund} disabled={funding} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink transition hover:bg-[#5ee0d9] disabled:cursor-not-allowed disabled:opacity-60">{funding ? <><LoaderCircle className="animate-spin" size={17} /> Funding demo escrow…</> : <><CircleDollarSign size={17} /> Fund Demo Escrow</>}</button> : <div className="mt-6 rounded-2xl border border-line bg-ink/30 p-4 text-sm text-slate-400">Resolve the agreement or job state above before funding becomes available.</div>}</section>
  const status = escrow.status
  const executionMessage = status === 'funded' || status === 'held' ? 'Escrow is funded. Continue toward execution and submission; settlement is not recorded here.' : `The persisted escrow status is ${escrowStatusLabels[status].toLowerCase()}.`
   return <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Funding state</p><h3 className="mt-2 text-xl font-bold text-white">Persisted escrow record</h3></div><StatusPill tone={statusTone(status)}>{escrowStatusLabels[status]}</StatusPill></div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><SummaryValue label="Current escrow status" value={escrowStatusLabels[status]} /><SummaryValue label="Funded amount" value={formatMoney(escrow.funded_amount, escrow.currency)} /><SummaryValue label="Verification state" value="Escrow and ledger records loaded" /><SummaryValue label="Funded at" value={escrow.funded_at ? formatDate(escrow.funded_at) : 'Not recorded'} /></dl><p className="mt-5 text-sm leading-6 text-slate-400">{executionMessage}</p><div className="mt-4 flex flex-wrap gap-3"><Link to={`/jobs/${jobId}/execution`} className="inline-flex items-center gap-2 rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric hover:bg-electric/10">Open execution workspace</Link><p className="self-center text-xs leading-5 text-slate-500">Settlement stays guarded by the existing escrow service; verification never releases funds directly.</p></div></section>
}

function DisputeBanner({ job, escrow, disputes }: { job: JobDetailDto; escrow: EscrowDto | null; disputes: DisputeDto[] }) {
  const active = disputes.find((dispute) => dispute.status === 'open' || dispute.status === 'under_review')
  if (active) return <section className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Settlement blocked</p><h3 className="mt-2 text-lg font-bold text-white">Dispute #{active.id} is protecting this escrow</h3><p className="mt-2 text-sm leading-6 text-amber-100/80">Normal release and refund requests remain blocked until the dispute reaches a backend-authorized terminal outcome.</p></div><ShieldCheck className="text-amber-200" size={24} /></div><Link to={`/disputes/${active.id}`} className="mt-4 inline-flex rounded-xl border border-amber-200/30 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-200/10">Review dispute</Link></section>
  if (disputes.length > 0) return <section className="rounded-2xl border border-line bg-panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Dispute history</p><p className="mt-2 text-sm text-slate-400">This job has {disputes.length} terminal dispute record{disputes.length === 1 ? '' : 's'}.</p></div><Link to={`/disputes/${disputes[0].id}`} className="text-sm font-semibold text-electric hover:text-white">View resolution</Link></div></section>
  if (escrow && ['funded', 'held'].includes(escrow.status) && ['assigned', 'in_progress', 'submitted', 'under_review', 'completed'].includes(job.status)) return <section className="rounded-2xl border border-line bg-panel/70 p-5"><p className="text-sm leading-6 text-slate-400">If the deliverable or agreement needs formal review, you can open a dispute from this funded escrow.</p><Link to={`/jobs/${job.id}/disputes/new`} className="mt-4 inline-flex rounded-xl border border-amber-300/30 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-300/10">Open a dispute</Link></section>
  return null
}

function LedgerHistory({ entries, escrow }: { entries: LedgerEntryDto[]; escrow: EscrowDto | null }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><CircleDollarSign className="text-electric" size={19} /><div><h3 className="font-bold text-white">Ledger history</h3><p className="mt-1 text-xs text-slate-500">Persisted funding and escrow entries.</p></div></div>{escrow === null && <p className="mt-5 text-sm text-slate-500">Ledger history will appear after a persisted escrow record exists.</p>}{escrow !== null && entries.length === 0 && <p className="mt-5 text-sm text-slate-500">No ledger entries have been recorded yet.</p>}{entries.length > 0 && <ol className="mt-5 space-y-3">{entries.map((entry) => <li key={entry.id} className="rounded-2xl border border-line bg-ink/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{entry.entry_type === 'deposit' || entry.entry_type === 'funding' ? 'Funding' : entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}</p><p className="text-sm font-semibold text-slate-200">{formatMoney(entry.amount, entry.currency)}</p></div><p className="mt-2 text-xs text-slate-500">{formatDate(entry.occurred_at)}{entry.job_id === undefined || entry.job_id === null ? '' : ` · Job #${entry.job_id}`}</p></li>)}</ol>}</section>
}

function AuditEvents({ events }: { events: JobEventDto[] }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Clock3 className="text-electric" size={19} /><div><h3 className="font-bold text-white">Related audit events</h3><p className="mt-1 text-xs text-slate-500">Persisted lifecycle descriptions and timestamps.</p></div></div>{events.length === 0 && <p className="mt-5 text-sm text-slate-500">No audit events have been recorded yet.</p>}{events.length > 0 && <ol className="mt-5 space-y-4">{events.map((event) => <li key={event.id} className="relative border-l border-line pl-5"><span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-electric" /><p className="text-sm font-semibold text-white">{event.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)} · {event.event_type}</p></li>)}</ol>}</section>
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 break-words font-semibold text-slate-200">{value}</dd></div>
}

function LoadingPanel() {
  return <div className="rounded-3xl border border-line bg-panel p-8" aria-label="Loading escrow details"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={19} /> Loading persisted escrow details…</div></div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-3xl border border-rose-300/25 bg-rose-300/5 p-7" role="alert"><p className="text-sm font-bold text-rose-100">Unable to load escrow details</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{message}</p><button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-ink hover:bg-white">Retry escrow requests</button></div>
}
