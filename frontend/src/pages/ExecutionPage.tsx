import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, FileCheck2, FileText, LoaderCircle, Play, Send, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type AgreementDto, type EscrowDto, type ExecutionDto, type JobDetailDto, type SubmissionDto, type VerificationDto } from '../lib/api'

type PageState =
  | { status: 'loading' }
  | { status: 'success'; job: JobDetailDto; agreement: AgreementDto | null; escrow: EscrowDto | null; execution: ExecutionDto; submissions: SubmissionDto[]; verification: VerificationDto | null }
  | { status: 'error'; message: string }

function parseJobId(value: string | undefined): number | null {
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

function executionTone(status: ExecutionDto['execution_status']): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'settlement_ready' || status === 'completed') return 'success'
  if (status === 'blocked' || status === 'manual_review' || status === 'disputed' || status === 'cancelled') return 'danger'
  if (status === 'ready' || status === 'awaiting_submission' || status === 'awaiting_verification' || status === 'retry_available') return 'warning'
  return 'neutral'
}

function executionLabel(status: ExecutionDto['execution_status']): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function loadPageData(jobId: number): Promise<Extract<PageState, { status: 'success' }>> {
  const [job, agreement, escrow, execution, submissions, verification] = await Promise.all([
    api.job(jobId),
    api.agreement(jobId),
    api.jobEscrow(jobId),
    api.execution(jobId),
    api.submissions(jobId),
    api.jobVerification(jobId),
  ])
  return { status: 'success', job, agreement, escrow, execution, submissions, verification }
}

export function ExecutionPage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = parseJobId(jobIdParam)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<PageState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.' } : { status: 'loading' })
  const [action, setAction] = useState<'start' | 'submit' | 'verify' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [evidence, setEvidence] = useState('{}')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    let active = true
    if (jobId === null) {
      setState({ status: 'error', message: 'The job ID is invalid.' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    loadPageData(jobId).then((data) => {
      if (active) setState(data)
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error, 'Execution details could not be loaded.') })
    })
    return () => { active = false }
  }, [jobId, reloadKey])

  const reload = () => {
    setActionError(null)
    setSuccessMessage(null)
    setReloadKey((value) => value + 1)
  }

  const start = async () => {
    if (state.status !== 'success' || !state.execution.can_start || action) return
    if (!window.confirm('Start the local demo execution? This records a backend running state; it does not invoke an external agent.')) return
    setAction('start')
    setActionError(null)
    setSuccessMessage(null)
    try {
      await api.startExecution(state.job.id)
      setSuccessMessage('Execution started. The backend recorded the running state; submit the local demo output when ready.')
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Execution could not be started.'))
    } finally {
      setAction(null)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state.status !== 'success' || !state.execution.can_submit || action) return
    if (!output.trim()) {
      setActionError('Submission output is required.')
      return
    }
    let parsedEvidence: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(evidence)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Evidence must be a JSON object.')
      parsedEvidence = parsed as Record<string, unknown>
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Evidence must be valid JSON.')
      return
    }
    if (!window.confirm('Submit this output for backend verification? The saved submission cannot be edited, but a permitted retry creates a new version.')) return
    setAction('submit')
    setActionError(null)
    setSuccessMessage(null)
    try {
      await api.submitJob(state.job.id, { submitted_output: output.trim(), evidence: parsedEvidence, ...(notes.trim() ? { notes: notes.trim() } : {}) })
      setOutput('')
      setEvidence('{}')
      setNotes('')
      setSuccessMessage('Submission received and persisted. The backend now controls verification state.')
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      // Keep all draft fields intact so a failed request does not discard work.
      setActionError(errorMessage(error, 'Submission could not be saved.'))
    } finally {
      setAction(null)
    }
  }

  const verify = async () => {
    if (state.status !== 'success' || !state.execution.can_verify || action) return
    if (!window.confirm('Run deterministic verification against the accepted agreement criteria?')) return
    setAction('verify')
    setActionError(null)
    setSuccessMessage(null)
    try {
      const result = await api.verifyJob(state.job.id)
      setSuccessMessage(result.overall_result === 'passed' ? 'Verification passed. The job is settlement-ready; escrow release remains a separate action.' : result.overall_result === 'manual_review' ? 'Verification requires manual review. Escrow remains protected.' : 'Verification failed. Review the failed checks and submit a permitted retry.')
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Verification could not be completed.'))
    } finally {
      setAction(null)
    }
  }

  return <div className="workspace-page execution-page space-y-8"><Link to={jobId === null ? '/jobs' : `/jobs/${jobId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to job</Link>{state.status === 'loading' && <LoadingPanel />}{state.status === 'error' && <ErrorPanel message={state.message} retry={reload} />}{state.status === 'success' && <ExecutionDetails state={state} action={action} actionError={actionError} successMessage={successMessage} output={output} evidence={evidence} notes={notes} setOutput={setOutput} setEvidence={setEvidence} setNotes={setNotes} onStart={start} onSubmit={submit} onVerify={verify} />}</div>
}

function ExecutionDetails({ state, action, actionError, successMessage, output, evidence, notes, setOutput, setEvidence, setNotes, onStart, onSubmit, onVerify }: { state: Extract<PageState, { status: 'success' }>; action: 'start' | 'submit' | 'verify' | null; actionError: string | null; successMessage: string | null; output: string; evidence: string; notes: string; setOutput: (value: string) => void; setEvidence: (value: string) => void; setNotes: (value: string) => void; onStart: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onVerify: () => void }) {
  const { job, agreement, escrow, execution, submissions, verification } = state
  return <>
    <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Task execution</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h2><p className="mt-2 text-sm text-slate-500">Job #{job.id} · {job.public_id}</p></div><div className="flex flex-col items-end gap-2"><StatusPill tone={executionTone(execution.execution_status)}>{executionLabel(execution.execution_status)}</StatusPill><span className="text-xs text-slate-500">Backend job status: {job.status}</span></div></div><div className="mt-6 grid gap-3 rounded-2xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-4"><SummaryValue label="Selected agent" value={String(execution.selected_agent_id ?? 'Not selected')} /><SummaryValue label="Executor" value="Local demo executor" /><SummaryValue label="Agreement" value={agreement?.accepted_version ? `Accepted v${agreement.accepted_version}` : 'Not accepted'} /><SummaryValue label="Escrow" value={escrow ? `${escrow.status} · ${escrow.funded_amount ?? 'Not funded'} ${escrow.currency}` : 'Not funded'} /></div><p className="mt-5 text-sm leading-6 text-slate-400">The MVP uses a deterministic local executor boundary. Starting execution changes persisted backend state but does not call an external AI agent or run arbitrary code.</p></section>
    {actionError && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5" role="alert"><div className="flex gap-3"><TriangleAlert className="shrink-0 text-rose-200" size={19} /><div><p className="text-sm font-bold text-rose-100">Action could not be completed</p><p className="mt-2 text-sm leading-6 text-rose-100/80">{actionError}</p></div></div></div>}
    {successMessage && <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><p className="text-sm leading-6 text-slate-200">{successMessage}</p></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-5"><AgreementCard agreement={agreement} job={job} /><DeliverableCard job={job} agreement={agreement} /><ExecutionActionCard execution={execution} action={action} onStart={onStart} onVerify={onVerify} /><SubmissionForm execution={execution} action={action} output={output} evidence={evidence} notes={notes} setOutput={setOutput} setEvidence={setEvidence} setNotes={setNotes} onSubmit={onSubmit} /></div><div className="space-y-5"><SubmissionHistory submissions={submissions} /><VerificationCard verification={verification} /></div></div>
  </>
}

function AgreementCard({ agreement, job }: { agreement: AgreementDto | null; job: JobDetailDto }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><FileText className="text-electric" size={19} /><h3 className="font-bold text-white">Accepted agreement</h3></div>{agreement === null ? <p className="mt-4 text-sm leading-6 text-slate-500">No agreement is persisted. Execution cannot start.</p> : <><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><StatusPill tone={agreement.status === 'accepted' ? 'success' : 'warning'}>{agreement.status}</StatusPill><Link to={`/jobs/${job.id}/agreement`} className="text-xs font-semibold text-electric hover:text-white">View agreement</Link></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><SummaryValue label="Version" value={String(agreement.accepted_version ?? agreement.proposal_version ?? 'Not accepted')} /><SummaryValue label="Amount" value={`${agreement.amount} ${agreement.currency}`} /></dl><p className="mt-4 text-sm leading-6 text-slate-400">{agreement.terms.expected_deliverable ?? job.expected_output}</p></>}</section>
}

function DeliverableCard({ job, agreement }: { job: JobDetailDto; agreement: AgreementDto | null }) {
  const criteria = agreement?.terms.acceptance_criteria ?? job.acceptance_criteria
  const deliverable = agreement?.terms.expected_deliverable ?? job.expected_output
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><FileCheck2 className="text-electric" size={19} /><h3 className="font-bold text-white">Deliverable and acceptance criteria</h3></div><p className="mt-4 text-sm leading-6 text-slate-300">{deliverable}</p><ul className="mt-4 space-y-2 text-sm text-slate-400">{criteria.map((criterion, index) => <li key={`${criterion}-${index}`} className="flex gap-2"><span className="text-accent">•</span><span>{criterion}</span></li>)}</ul><p className="mt-4 text-xs leading-5 text-slate-500">Verification uses the accepted agreement snapshot. Criteria that are not safely deterministic remain manual-review outcomes.</p></section>
}

function ExecutionActionCard({ execution, action, onStart, onVerify }: { execution: ExecutionDto; action: 'start' | 'submit' | 'verify' | null; onStart: () => void; onVerify: () => void }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Play className="text-accent" size={19} /><h3 className="font-bold text-white">Next backend action</h3></div>{execution.can_start ? <button type="button" onClick={onStart} disabled={action !== null} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60">{action === 'start' ? <><LoaderCircle className="animate-spin" size={17} /> Starting execution…</> : <><Play size={17} /> Start execution</>}</button> : execution.can_verify ? <button type="button" onClick={onVerify} disabled={action !== null} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-3 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60">{action === 'verify' ? <><LoaderCircle className="animate-spin" size={17} /> Verifying…</> : <><ShieldCheck size={17} /> Verify latest submission</>}</button> : <div className="mt-4 rounded-2xl border border-line bg-ink/30 p-4 text-sm leading-6 text-slate-400"><p>{execution.execution_status === 'settlement_ready' ? 'Verification passed. The escrow release action remains separate.' : execution.execution_status === 'manual_review' ? 'A manual reviewer must assess the latest criterion before the job can proceed.' : execution.execution_status === 'retry_available' ? 'A failed result allows a permitted new submission below.' : execution.start_reason}</p></div>}</section>
}

function SubmissionForm({ execution, action, output, evidence, notes, setOutput, setEvidence, setNotes, onSubmit }: { execution: ExecutionDto; action: 'start' | 'submit' | 'verify' | null; output: string; evidence: string; notes: string; setOutput: (value: string) => void; setEvidence: (value: string) => void; setNotes: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  if (!execution.can_submit) return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Send className="text-electric" size={19} /><h3 className="font-bold text-white">Submission</h3></div><p className="mt-4 text-sm leading-6 text-slate-500">{execution.submit_reason}</p></section>
  return <form onSubmit={onSubmit} className="rounded-3xl border border-electric/30 bg-panel p-6"><div className="flex items-center gap-3"><Send className="text-electric" size={19} /><div><h3 className="font-bold text-white">Submit work output</h3><p className="mt-1 text-xs text-slate-500">The output is stored as a new immutable submission version and never executed.</p></div></div><label className="mt-5 block text-sm font-semibold text-slate-200" htmlFor="submitted-output">Submitted output</label><textarea id="submitted-output" value={output} onChange={(event) => setOutput(event.target.value)} rows={9} maxLength={100000} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-electric" placeholder="Paste the deliverable output here." required /><label className="mt-4 block text-sm font-semibold text-slate-200" htmlFor="submission-evidence">Structured evidence JSON</label><textarea id="submission-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={5} maxLength={64000} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 font-mono text-xs leading-6 text-white outline-none focus:border-electric" aria-describedby="evidence-help" /><p id="evidence-help" className="mt-2 text-xs leading-5 text-slate-500">Use an object such as {`{"source":"fixture"}`}. References can be included here.</p><label className="mt-4 block text-sm font-semibold text-slate-200" htmlFor="submission-notes">Notes (optional)</label><textarea id="submission-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={4000} className="mt-2 w-full rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-electric" placeholder="Explain the submission or retry context." /><button type="submit" disabled={action !== null} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-3 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60">{action === 'submit' ? <><LoaderCircle className="animate-spin" size={17} /> Saving submission…</> : <><Send size={17} /> Submit for verification</>}</button></form>
}

function SubmissionHistory({ submissions }: { submissions: SubmissionDto[] }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><Send className="text-electric" size={19} /><div><h3 className="font-bold text-white">Submission history</h3><p className="mt-1 text-xs text-slate-500">Persisted versions are never overwritten.</p></div></div>{submissions.length === 0 ? <p className="mt-5 text-sm text-slate-500">No submissions have been received.</p> : <ol className="mt-5 space-y-3">{submissions.map((submission) => <li key={submission.id} className="rounded-2xl border border-line bg-ink/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">Version {submission.version}</p><StatusPill tone={submission.status === 'accepted' ? 'success' : submission.status === 'rejected' ? 'danger' : 'warning'}>{submission.status}</StatusPill></div><p className="mt-2 text-xs text-slate-500">{formatDate(submission.submitted_at)} · Agent #{submission.agent_id}</p><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{submission.submitted_output}</p></li>)}</ol>}</section>
}

function VerificationCard({ verification }: { verification: VerificationDto | null }) {
  if (verification === null) return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-electric" size={19} /><h3 className="font-bold text-white">Verification results</h3></div><p className="mt-5 text-sm leading-6 text-slate-500">No verification result has been persisted for the latest submission.</p></section>
  const tone = verification.overall_result === 'passed' ? 'success' : verification.overall_result === 'manual_review' ? 'warning' : 'danger'
  return <section className="rounded-3xl border border-line bg-panel p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><ShieldCheck className="text-electric" size={19} /><h3 className="font-bold text-white">Verification results</h3></div><StatusPill tone={tone}>{verification.overall_result.replaceAll('_', ' ')}</StatusPill></div><p className="mt-3 text-xs text-slate-500">Automated evaluator · Submission v{verification.submission_version} · {formatDate(verification.evaluated_at)}</p><div className="mt-5 space-y-3">{verification.individual_checks.map((check) => <div key={check.name} className="rounded-xl border border-line bg-ink/30 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-white">{check.name}</p><StatusPill tone={check.status === 'passed' ? 'success' : check.status === 'manual_review' ? 'warning' : 'danger'}>{check.status.replace('_', ' ')}</StatusPill></div><p className="mt-2 text-sm leading-6 text-slate-400">{check.explanation}</p></div>)}</div>{verification.reasons.length > 0 && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Next action</p><ul className="mt-2 space-y-1 text-sm leading-6 text-amber-100/80">{verification.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul></div>}</section>
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 break-words font-semibold text-slate-200">{value}</dd></div>
}

function LoadingPanel() {
  return <div className="rounded-3xl border border-line bg-panel p-8" aria-label="Loading execution details"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={19} /> Loading persisted execution details…</div></div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-3xl border border-rose-300/25 bg-rose-300/5 p-7" role="alert"><p className="text-sm font-bold text-rose-100">Unable to load execution details</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{message}</p><button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-ink hover:bg-white">Retry execution requests</button></div>
}
