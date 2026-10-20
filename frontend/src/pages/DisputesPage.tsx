import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, Gavel, LoaderCircle, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type DisputeCategory, type DisputeDto, type DisputeStatus, type EscrowDto, type JobDetailDto } from '../lib/api'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

const statusLabels: Record<DisputeStatus, string> = { open: 'Open', under_review: 'Under review', resolved: 'Resolved', rejected: 'Rejected' }
const categoryLabels: Record<DisputeCategory, string> = { failed_verification: 'Failed verification', deliverable_incomplete: 'Deliverable incomplete', agreement_mismatch: 'Agreement mismatch', deadline_issue: 'Deadline issue', other: 'Other' }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function statusTone(status: DisputeStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'resolved') return 'success'
  if (status === 'open' || status === 'under_review') return 'warning'
  if (status === 'rejected') return 'neutral'
  return 'danger'
}

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function parseId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function DisputesPage() {
  const [filter, setFilter] = useState<DisputeStatus | 'all'>('all')
  const [state, setState] = useState<LoadState<DisputeDto[]>>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api.disputes(filter === 'all' ? undefined : filter).then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error, 'Disputes could not be loaded.') })
    })
    return () => { active = false }
  }, [filter, reloadKey])

  return <div className="space-y-8"><section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Trust and review</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Disputes</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Review persisted dispute records, evidence, accepted terms, verification results, and demo-operator resolutions. Opening a dispute protects the simulated escrow.</p></div><Gavel className="text-electric" size={30} /></div><div className="mt-6 flex flex-wrap items-center gap-3"><label className="text-sm font-semibold text-slate-300" htmlFor="dispute-status-filter">Filter status</label><select id="dispute-status-filter" value={filter} onChange={(event) => setFilter(event.target.value as DisputeStatus | 'all')} className="rounded-xl border border-line bg-ink/40 px-3 py-2 text-sm text-white outline-none focus:border-electric"><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.05]"><RefreshCw size={15} /> Refresh</button></div></section>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} retry={() => setReloadKey((value) => value + 1)} />}{state.status === 'success' && <DisputeList disputes={state.data} />}</div>
}

function DisputeList({ disputes }: { disputes: DisputeDto[] }) {
  if (disputes.length === 0) return <section className="rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center"><Gavel className="mx-auto text-slate-600" size={28} /><h3 className="mt-4 text-lg font-bold text-white">No disputes match this filter</h3><p className="mt-2 text-sm leading-6 text-slate-500">Disputes are created from a funded job and remain visible here after resolution.</p></section>
  return <section className="grid gap-4 lg:grid-cols-2">{disputes.map((dispute) => <Link key={dispute.id} to={`/disputes/${dispute.id}`} className="rounded-2xl border border-line bg-panel p-5 transition hover:border-electric/40"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Dispute #{dispute.id}</p><h3 className="mt-2 text-lg font-bold text-white">Job #{dispute.job_id} · {categoryLabels[dispute.category]}</h3></div><StatusPill tone={statusTone(dispute.status)}>{statusLabels[dispute.status]}</StatusPill></div><p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-400">{dispute.description}</p><div className="mt-5 grid gap-3 text-xs text-slate-500 sm:grid-cols-3"><span>Escrow #{dispute.escrow_id ?? '—'}</span><span>Raised by agent #{dispute.raised_by_agent_id}</span><span>{formatDate(dispute.created_at)}</span></div>{dispute.resolution && <p className="mt-4 text-sm font-semibold text-accent">Resolution: {dispute.resolution}</p>}</Link>)}</section>
}

function LoadingPanel() {
  return <div className="rounded-2xl border border-line bg-panel p-8" aria-label="Loading disputes"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading dispute records…</div></div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load disputes</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{message}</p><button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100"><RefreshCw size={15} /> Retry</button></div>
}

export function DisputeCreatePage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = parseId(jobIdParam)
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState<{ job: JobDetailDto; escrow: EscrowDto }>>({ status: jobId === null ? 'error' : 'loading', ...(jobId === null ? { message: 'The job ID is invalid.' } : {}) } as LoadState<{ job: JobDetailDto; escrow: EscrowDto }>)
  const [category, setCategory] = useState<DisputeCategory>('failed_verification')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState('{"source":"user-provided"}')
  const [agentId, setAgentId] = useState('')
  const [action, setAction] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (jobId === null) return
    let active = true
    Promise.all([api.job(jobId), api.jobEscrow(jobId)]).then(([job, escrow]) => {
      if (!escrow) throw new Error('A funded escrow is required before opening a dispute.')
      if (active) {
        setState({ status: 'success', data: { job, escrow } })
        setAgentId(String(job.executor_agent_id ?? job.selected_agent_id ?? ''))
      }
    }).catch((err: unknown) => { if (active) setState({ status: 'error', message: errorMessage(err, 'The job and escrow could not be loaded.') }) })
    return () => { active = false }
  }, [jobId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state.status !== 'success' || jobId === null || action) return
    let parsedEvidence: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(evidence)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Evidence must be a JSON object.')
      parsedEvidence = parsed as Record<string, unknown>
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Evidence must be valid JSON.')
      return
    }
    const parsedAgentId = Number(agentId)
    if (!Number.isSafeInteger(parsedAgentId) || parsedAgentId <= 0) {
      setError('A related agent ID is required in this development-only demo.')
      return
    }
    if (!window.confirm('Open this dispute? The backend will move the job and escrow into dispute protection.')) return
    setAction(true)
    setError(null)
    try {
      const dispute = await api.createDispute(jobId, { escrow_id: state.data.escrow.id, category, reason: reason.trim(), description: description.trim(), evidence: parsedEvidence, raised_by_agent_id: parsedAgentId })
      navigate(`/disputes/${dispute.id}`)
    } catch (err: unknown) {
      setError(errorMessage(err, 'The dispute could not be created.'))
    } finally { setAction(false) }
  }

  return <div className="mx-auto max-w-4xl space-y-8"><Link to={jobId === null ? '/disputes' : `/jobs/${jobId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back</Link>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} retry={() => window.location.reload()} />}{state.status === 'success' && <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-amber-200" size={21} /><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Open a dispute</p><h2 className="mt-2 text-3xl font-bold text-white">Protect the simulated escrow</h2><p className="mt-3 text-sm leading-6 text-slate-400">Job #{state.data.job.id} · {state.data.job.title} · Escrow #{state.data.escrow.id}</p></div></div>{error && <div className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-300/5 p-4" role="alert"><p className="text-sm text-rose-100">{error}</p></div>}<form onSubmit={submit} className="mt-7 space-y-5"><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-200" htmlFor="dispute-category">Category<select id="dispute-category" value={category} onChange={(event) => setCategory(event.target.value as DisputeCategory)} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm text-white outline-none focus:border-electric">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm font-semibold text-slate-200" htmlFor="dispute-agent">Related agent ID<input id="dispute-agent" type="number" min="1" value={agentId} onChange={(event) => setAgentId(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm text-white outline-none focus:border-electric" required /></label></div><label className="block text-sm font-semibold text-slate-200" htmlFor="dispute-reason">Reason<input id="dispute-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm text-white outline-none focus:border-electric" placeholder="Short reason" required /></label><label className="block text-sm font-semibold text-slate-200" htmlFor="dispute-description">Description<textarea id="dispute-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={12000} rows={6} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-electric" placeholder="Explain the issue without replacing the original submission or verification history." required /></label><label className="block text-sm font-semibold text-slate-200" htmlFor="dispute-evidence">Supporting evidence JSON<textarea id="dispute-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={64000} rows={5} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 font-mono text-xs leading-6 text-white outline-none focus:border-electric" /></label><button type="submit" disabled={action} className="inline-flex items-center gap-2 rounded-xl bg-amber-200 px-5 py-3 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60">{action ? <><LoaderCircle className="animate-spin" size={17} /> Opening dispute…</> : <><Gavel size={17} /> Open dispute</>}</button></form></section>}</div>
}
