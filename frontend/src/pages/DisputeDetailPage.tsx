import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, FileText, Gavel, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type DisputeDto, type DisputeResolution, type DisputeStatus } from '../lib/api'

function parseId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function statusTone(status: DisputeStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'resolved') return 'success'
  if (status === 'open' || status === 'under_review') return 'warning'
  return 'neutral'
}

function categoryLabel(category: DisputeDto['category']): string {
  return category.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function DisputeDetailPage() {
  const { disputeId: disputeIdParam } = useParams()
  const disputeId = parseId(disputeIdParam)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<{ status: 'loading' } | { status: 'success'; data: DisputeDto } | { status: 'error'; message: string }>(() => disputeId === null ? { status: 'error', message: 'The dispute ID is invalid.' } : { status: 'loading' })
  const [action, setAction] = useState<'review' | DisputeResolution | null>(null)
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (disputeId === null) {
      setState({ status: 'error', message: 'The dispute ID is invalid.' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    api.dispute(disputeId).then((data) => { if (active) setState({ status: 'success', data }) }).catch((err: unknown) => { if (active) setState({ status: 'error', message: errorMessage(err, 'Dispute details could not be loaded.') }) })
    return () => { active = false }
  }, [disputeId, reloadKey])

  const refresh = () => {
    setError(null)
    setReloadKey((value) => value + 1)
  }

  const review = async () => {
    if (state.status !== 'success' || action || state.data.status !== 'open') return
    if (!window.confirm('Begin demo-operator review of this dispute?')) return
    setAction('review')
    setError(null)
    setSuccess(null)
    try {
      await api.reviewDispute(state.data.id, rationale.trim() || undefined)
      setSuccess('Dispute review started. The backend persisted the review transition.')
      refresh()
    } catch (err: unknown) { setError(errorMessage(err, 'Dispute review could not be started.')) } finally { setAction(null) }
  }

  const resolve = async (resolution: DisputeResolution) => {
    if (state.status !== 'success' || action || !['open', 'under_review'].includes(state.data.status)) return
    if (rationale.trim().length < 10) {
      setError('A meaningful resolution rationale of at least 10 characters is required.')
      return
    }
    const label = resolution === 'release' ? 'release simulated funds to the agent' : resolution === 'refund' ? 'refund the simulated escrow' : 'reject this dispute and restore its prior workflow state'
    if (!window.confirm(`Confirm resolution: ${label}?`)) return
    setAction(resolution)
    setError(null)
    setSuccess(null)
    try {
      await api.resolveDispute(state.data.id, resolution, rationale.trim())
      setSuccess(`Dispute resolved with outcome: ${resolution}. Refreshed persisted records are shown below.`)
      refresh()
    } catch (err: unknown) { setError(errorMessage(err, 'Dispute resolution could not be completed.')) } finally { setAction(null) }
  }

  return <div className="mx-auto max-w-6xl space-y-8"><Link to="/disputes" className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to disputes</Link>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} retry={refresh} />}{state.status === 'success' && <DisputeDetails dispute={state.data} action={action} rationale={rationale} setRationale={setRationale} error={error} success={success} onReview={review} onResolve={resolve} />}</div>
}

function DisputeDetails({ dispute, action, rationale, setRationale, error, success, onReview, onResolve }: { dispute: DisputeDto; action: 'review' | DisputeResolution | null; rationale: string; setRationale: (value: string) => void; error: string | null; success: string | null; onReview: () => void; onResolve: (resolution: DisputeResolution) => void }) {
  const active = dispute.status === 'open' || dispute.status === 'under_review'
  return <><section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Dispute #{dispute.id}</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Job #{dispute.job_id} · {categoryLabel(dispute.category)}</h2><p className="mt-2 text-sm text-slate-500">Escrow #{dispute.escrow_id ?? '—'} · Created {formatDate(dispute.created_at)}</p></div><StatusPill tone={statusTone(dispute.status)}>{dispute.status.replace('_', ' ')}</StatusPill></div><div className="mt-6 grid gap-3 rounded-2xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-4"><SummaryValue label="Raised by" value={`Agent #${dispute.raised_by_agent_id}`} /><SummaryValue label="Job status before dispute" value={dispute.previous_job_status ?? 'Unknown'} /><SummaryValue label="Escrow status before dispute" value={dispute.previous_escrow_status ?? 'Unknown'} /><SummaryValue label="Resolution" value={dispute.resolution ?? 'Pending'} /></div><p className="mt-6 text-sm leading-7 text-slate-300">{dispute.description}</p><div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Reason</p><p className="mt-2 text-sm text-amber-100/80">{dispute.reason}</p></div></section>{error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5" role="alert"><div className="flex gap-3"><TriangleAlert className="shrink-0 text-rose-200" size={19} /><p className="text-sm leading-6 text-rose-100">{error}</p></div></div>}{success && <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><p className="text-sm leading-6 text-slate-200">{success}</p></div>}<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-5"><EvidencePanel dispute={dispute} /><AgreementPanel terms={dispute.agreement_terms} requirements={dispute.job_requirements} /><SubmissionPanel dispute={dispute} /><VerificationPanel dispute={dispute} /><EventsPanel events={dispute.events} /></div><div className="space-y-5"><ResolutionPanel dispute={dispute} active={active} action={action} rationale={rationale} setRationale={setRationale} onReview={onReview} onResolve={onResolve} /></div></div></>
}

function EvidencePanel({ dispute }: { dispute: DisputeDto }) {
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><ShieldAlert className="text-amber-200" size={19} /><h3 className="font-bold text-white">Dispute evidence</h3></div><p className="mt-3 text-xs leading-5 text-slate-500">Evidence is user-provided metadata. It has not been independently authenticated and is never executed.</p><pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-ink/40 p-4 text-xs leading-6 text-slate-300">{JSON.stringify(dispute.evidence, null, 2)}</pre></section>
}

function AgreementPanel({ terms, requirements }: { terms: Record<string, unknown>; requirements: Record<string, unknown> }) {
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><FileText className="text-electric" size={19} /><h3 className="font-bold text-white">Accepted agreement and job requirements</h3></div><div className="mt-5 space-y-4"><RecordBlock label="Accepted agreement terms" value={terms} /><RecordBlock label="Original job requirements" value={requirements} /></div></section>
}

function SubmissionPanel({ dispute }: { dispute: DisputeDto }) {
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><FileCheck2 className="text-electric" size={19} /><h3 className="font-bold text-white">Submitted deliverable</h3></div>{dispute.submission ? <><p className="mt-3 text-xs text-slate-500">Submission v{dispute.submission.version} · {formatDate(dispute.submission.submitted_at)}</p><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-ink/40 p-4 text-sm leading-6 text-slate-300">{dispute.submission.submitted_output}</pre><p className="mt-3 text-xs text-slate-500">Evidence attached to submission: {JSON.stringify(dispute.submission.evidence)}</p></> : <p className="mt-4 text-sm text-slate-500">No submission was associated when the dispute was opened.</p>}</section>
}

function VerificationPanel({ dispute }: { dispute: DisputeDto }) {
  const verification = dispute.verification
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-electric" size={19} /><h3 className="font-bold text-white">Verification results</h3></div>{verification ? <><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><StatusPill tone={verification.overall_result === 'passed' ? 'success' : verification.overall_result === 'manual_review' ? 'warning' : 'danger'}>{verification.overall_result.replace('_', ' ')}</StatusPill><span className="text-xs text-slate-500">{verification.evaluator_type} · {formatDate(verification.evaluated_at)}</span></div><div className="mt-5 space-y-3">{verification.individual_checks.map((check) => <div key={check.name} className="rounded-xl border border-line bg-ink/30 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{check.name}</p><StatusPill tone={check.status === 'passed' ? 'success' : check.status === 'manual_review' ? 'warning' : 'danger'}>{check.status.replace('_', ' ')}</StatusPill></div><p className="mt-2 text-sm leading-6 text-slate-400">{check.explanation}</p></div>)}</div>{verification.reasons.length > 0 && <ul className="mt-4 space-y-1 text-sm leading-6 text-amber-100/80">{verification.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>}</> : <p className="mt-4 text-sm text-slate-500">No verification record was associated with this dispute.</p>}</section>
}

function EventsPanel({ events }: { events: DisputeDto['events'] }) {
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Clock3 className="text-electric" size={19} /><h3 className="font-bold text-white">Dispute audit trail</h3></div>{events.length === 0 ? <p className="mt-4 text-sm text-slate-500">No dispute-specific audit events were returned.</p> : <ol className="mt-5 space-y-4">{events.map((event) => <li key={event.id} className="relative border-l border-line pl-5"><span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-electric" /><p className="text-sm font-semibold text-white">{event.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)} · {event.event_type}</p></li>)}</ol>}</section>
}

function ResolutionPanel({ dispute, active, action, rationale, setRationale, onReview, onResolve }: { dispute: DisputeDto; active: boolean; action: 'review' | DisputeResolution | null; rationale: string; setRationale: (value: string) => void; onReview: () => void; onResolve: (resolution: DisputeResolution) => void }) {
  return <section className="rounded-2xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Gavel className="text-accent" size={19} /><div><h3 className="font-bold text-white">Demo resolution controls</h3><p className="mt-1 text-xs text-slate-500">Development/test only · not independent arbitration.</p></div></div>{!active ? <div className="mt-5 rounded-xl border border-line bg-ink/30 p-4 text-sm leading-6 text-slate-400">This dispute is terminal. Ordinary requests cannot reopen or change it.</div> : <><label className="mt-5 block text-sm font-semibold text-slate-200" htmlFor="resolution-rationale">Review or resolution rationale<textarea id="resolution-rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} rows={5} maxLength={4000} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-electric" placeholder="Explain the decision or review step." /></label>{dispute.status === 'open' && <button type="button" onClick={onReview} disabled={action !== null} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-bold text-electric disabled:opacity-50">{action === 'review' ? <><LoaderCircle className="animate-spin" size={16} /> Starting review…</> : <><RefreshCw size={16} /> Begin review</>}</button>}<div className="mt-5 grid gap-3"><button type="button" onClick={() => onResolve('release')} disabled={action !== null} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-50">{action === 'release' ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Resolve: release to agent</button><button type="button" onClick={() => onResolve('refund')} disabled={action !== null} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-50">{action === 'refund' ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldAlert size={16} />} Resolve: refund user</button><button type="button" onClick={() => onResolve('reject')} disabled={action !== null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-slate-200 disabled:opacity-50">{action === 'reject' ? <LoaderCircle className="animate-spin" size={16} /> : <Gavel size={16} />} Reject and restore workflow</button></div></>}</section>
}

function RecordBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-ink/30 p-3 text-xs leading-5 text-slate-400">{JSON.stringify(value, null, 2)}</pre></div>
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 break-words font-semibold text-slate-200">{value}</dd></div>
}

function LoadingPanel() { return <div className="rounded-2xl border border-line bg-panel p-8" aria-label="Loading dispute"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading dispute records…</div></div> }
function ErrorPanel({ message, retry }: { message: string; retry: () => void }) { return <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">Unable to load dispute</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{message}</p><button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100"><RefreshCw size={15} /> Retry</button></div> }
