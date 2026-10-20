import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, FilePenLine, FileText, History, LoaderCircle, LockKeyhole, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api, getApiFieldErrors, supportedCurrencies, type AgreementDto, type AgreementHistoryEntryDto, type AgreementStatus, type AgreementTermsPayload, type CreateAgreementPayload, type JobDetailDto, type SubmitAgreementRevisionPayload, type SupportedCurrency } from '../lib/api'

type FormValues = {
  budget: string
  currency: SupportedCurrency
  deadline: string
  scope: string
  expectedDeliverable: string
  acceptanceCriteria: string
  verificationMethod: string
  cancellationConditions: string
  disputeConditions: string
  instructions: string
}

type FieldName = keyof FormValues
type FieldErrors = Partial<Record<FieldName, string>>
type AgreementPageState =
  | { status: 'loading' }
  | { status: 'success'; job: JobDetailDto; agreement: AgreementDto | null }
  | { status: 'error'; message: string }
type HistoryState =
  | { status: 'empty'; data: AgreementHistoryEntryDto[] }
  | { status: 'loading'; data: AgreementHistoryEntryDto[] }
  | { status: 'success'; data: AgreementHistoryEntryDto[] }
  | { status: 'error'; message: string; data: AgreementHistoryEntryDto[] }
type ActionName = 'request_revision' | 'submit_revision' | 'accept' | 'reject' | 'cancel'

const inputClassName = 'w-full rounded-xl border border-line bg-ink/40 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-electric/60 focus:ring-2 focus:ring-electric/10 disabled:cursor-not-allowed disabled:opacity-60'

const statusLabels: Record<AgreementStatus, string> = {
  draft: 'Draft',
  proposed: 'Proposed',
  revision_requested: 'Revision requested',
  revision_pending: 'Revision pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const initialTerms: Omit<FormValues, 'budget' | 'currency' | 'deadline'> = {
  scope: '',
  expectedDeliverable: '',
  acceptanceCriteria: '',
  verificationMethod: 'The requester reviews the deliverable against each acceptance criterion.',
  cancellationConditions: 'Either party may request cancellation before work begins; the backend decides the resulting state.',
  disputeConditions: 'Raise a dispute with evidence describing the unmet agreement term for review.',
  instructions: '',
}

function parseJobId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function splitLines(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function deadlineAsIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formFromJob(job: JobDetailDto): FormValues {
  return {
    budget: job.budget,
    currency: supportedCurrencies.includes(job.currency as SupportedCurrency) ? job.currency as SupportedCurrency : 'USD',
    deadline: toLocalInput(job.deadline),
    ...initialTerms,
    scope: job.description,
    expectedDeliverable: job.expected_output,
    acceptanceCriteria: job.acceptance_criteria.join('\n'),
    instructions: job.additional_instructions ?? '',
  }
}

function termString(terms: AgreementDto['terms'], key: string): string {
  const value = terms[key]
  return typeof value === 'string' ? value : ''
}

function termCriteria(terms: AgreementDto['terms']): string {
  const value = terms.acceptance_criteria
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n') : ''
}

function formFromAgreement(agreement: AgreementDto): FormValues {
  const terms = agreement.terms
  return {
    budget: agreement.proposed_budget,
    currency: supportedCurrencies.includes(agreement.currency as SupportedCurrency) ? agreement.currency as SupportedCurrency : 'USD',
    deadline: toLocalInput(agreement.proposed_deadline),
    scope: termString(terms, 'scope'),
    expectedDeliverable: termString(terms, 'expected_deliverable'),
    acceptanceCriteria: termCriteria(terms),
    verificationMethod: termString(terms, 'verification_method'),
    cancellationConditions: termString(terms, 'cancellation_conditions'),
    disputeConditions: termString(terms, 'dispute_conditions'),
    instructions: termString(terms, 'instructions'),
  }
}

function validate(values: FormValues): { errors: FieldErrors; payload?: CreateAgreementPayload } {
  const errors: FieldErrors = {}
  const budget = values.budget.trim()
  const deadline = deadlineAsIso(values.deadline)
  const criteria = splitLines(values.acceptanceCriteria)
  const requiredText: Array<[FieldName, string, string]> = [
    ['scope', values.scope, 'Scope is required.'],
    ['expectedDeliverable', values.expectedDeliverable, 'Expected deliverable is required.'],
    ['verificationMethod', values.verificationMethod, 'Verification method is required.'],
    ['cancellationConditions', values.cancellationConditions, 'Cancellation conditions are required.'],
    ['disputeConditions', values.disputeConditions, 'Dispute conditions are required.'],
  ]
  requiredText.forEach(([field, value, message]) => {
    if (!value.trim()) errors[field] = message
  })
  if (!budget) errors.budget = 'Budget is required.'
  else if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(budget) || Number(budget) <= 0) errors.budget = 'Budget must be greater than 0 with at most two decimal places.'
  if (!supportedCurrencies.includes(values.currency)) errors.currency = 'Choose a supported currency.'
  if (!values.deadline) errors.deadline = 'Deadline is required.'
  else if (!deadline) errors.deadline = 'Enter a valid deadline.'
  else if (new Date(deadline).getTime() <= Date.now()) errors.deadline = 'Deadline must be in the future.'
  if (criteria.length === 0) errors.acceptanceCriteria = 'Add at least one acceptance criterion.'

  if (Object.keys(errors).length > 0) return { errors }
  const terms: AgreementTermsPayload = {
    scope: values.scope.trim(),
    expected_deliverable: values.expectedDeliverable.trim(),
    acceptance_criteria: criteria,
    verification_method: values.verificationMethod.trim(),
    cancellation_conditions: values.cancellationConditions.trim(),
    dispute_conditions: values.disputeConditions.trim(),
    instructions: values.instructions.trim() || null,
  }
  return { errors, payload: { proposed_budget: budget, proposed_deadline: deadline as string, currency: values.currency, terms } }
}

function omitUnchangedDeadline(payload: CreateAgreementPayload, persistedDeadline: string | null): CreateAgreementPayload {
  if (!payload.proposed_deadline || !persistedDeadline) return payload
  const proposedTime = new Date(payload.proposed_deadline).getTime()
  const persistedTime = new Date(persistedDeadline).getTime()
  if (!Number.isNaN(proposedTime) && proposedTime === persistedTime) {
    const withoutDeadline = { ...payload }
    delete withoutDeadline.proposed_deadline
    return withoutDeadline
  }
  return payload
}

const apiFieldMap: Record<string, FieldName> = {
  proposed_budget: 'budget',
  amount: 'budget',
  proposed_deadline: 'deadline',
  currency: 'currency',
  'terms.scope': 'scope',
  scope: 'scope',
  'terms.expected_deliverable': 'expectedDeliverable',
  expected_deliverable: 'expectedDeliverable',
  'terms.acceptance_criteria': 'acceptanceCriteria',
  acceptance_criteria: 'acceptanceCriteria',
  'terms.verification_method': 'verificationMethod',
  verification_method: 'verificationMethod',
  'terms.cancellation_conditions': 'cancellationConditions',
  cancellation_conditions: 'cancellationConditions',
  'terms.dispute_conditions': 'disputeConditions',
  dispute_conditions: 'disputeConditions',
  'terms.instructions': 'instructions',
  instructions: 'instructions',
}

export function AgreementPage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = parseJobId(jobIdParam)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<AgreementPageState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.' } : { status: 'loading' })
  const [history, setHistory] = useState<HistoryState>({ status: 'empty', data: [] })
  const [values, setValues] = useState<FormValues | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<ActionName | null>(null)
  const [revisionFormOpen, setRevisionFormOpen] = useState(false)

  const loadHistory = (agreement: AgreementDto) => {
    const fallback = agreement.history ?? agreement.proposal_history ?? []
    setHistory({ status: 'loading', data: fallback })
    api.agreementHistory(agreement.id).then((data) => {
      setHistory({ status: data.length === 0 && fallback.length === 0 ? 'empty' : 'success', data: data.length > 0 ? data : fallback })
    }).catch((error: unknown) => {
      setHistory({ status: 'error', message: errorMessage(error, 'Agreement history could not be loaded.'), data: fallback })
    })
  }

  useEffect(() => {
    let active = true
    if (jobId === null) {
      setState({ status: 'error', message: 'The job ID is invalid.' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    setApiError(null)
    setSuccessMessage(null)
    Promise.all([api.job(jobId), api.agreement(jobId)]).then(([job, agreement]) => {
      if (!active) return
      setState({ status: 'success', job, agreement })
      setValues(agreement === null ? formFromJob(job) : formFromAgreement(agreement))
      setErrors({})
      setRevisionFormOpen(agreement !== null && (agreement.status === 'revision_requested' || agreement.status === 'revision_pending'))
      if (agreement === null) setHistory({ status: 'empty', data: [] })
      else loadHistory(agreement)
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error, 'The agreement workspace could not be loaded.') })
    })
    return () => { active = false }
  }, [jobId, reloadKey])

  const updateValue = (field: FieldName, value: string) => {
    setValues((current) => current ? { ...current, [field]: value } : current)
    setErrors((current) => ({ ...current, [field]: undefined }))
    setApiError(null)
  }

  const applyAgreement = (agreement: AgreementDto, message: string, action: ActionName) => {
    setState((current) => current.status === 'success' ? { ...current, agreement } : current)
    setValues((current) => current ?? formFromAgreement(agreement))
    setSuccessMessage(message)
    setApiError(null)
    setActionLoading(null)
    if (action === 'request_revision') {
      setRevisionFormOpen(true)
      setValues(formFromAgreement(agreement))
    } else if (action === 'submit_revision') {
      setRevisionFormOpen(false)
      setValues(formFromAgreement(agreement))
    }
    loadHistory(agreement)
  }

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (actionLoading || !values || state.status !== 'success' || state.agreement !== null) return
    const result = validate(values)
    setErrors(result.errors)
    setApiError(null)
    setSuccessMessage(null)
    if (!result.payload) return
    setActionLoading('submit_revision')
    try {
       const agreement = await api.createAgreement(state.job.id, omitUnchangedDeadline(result.payload, state.job.deadline))
      setState((current) => current.status === 'success' ? { ...current, agreement } : current)
      setSuccessMessage('Agreement proposal created and persisted.')
      setActionLoading(null)
      loadHistory(agreement)
    } catch (error: unknown) {
      setActionLoading(null)
      applyApiError(error)
    }
  }

  const submitRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (actionLoading || !values || state.status !== 'success' || state.agreement === null) return
    const result = validate(values)
    setErrors(result.errors)
    setApiError(null)
    setSuccessMessage(null)
    if (!result.payload) return
    setActionLoading('submit_revision')
    try {
       const agreement = await api.submitAgreementRevision(state.agreement.id, omitUnchangedDeadline(result.payload, state.agreement.proposed_deadline) as SubmitAgreementRevisionPayload)
      applyAgreement(agreement, 'Revised agreement terms submitted and persisted.', 'submit_revision')
    } catch (error: unknown) {
      setActionLoading(null)
      applyApiError(error)
    }
  }

  const applyApiError = (error: unknown) => {
    const fieldErrors = getApiFieldErrors(error)
    const mappedErrors: FieldErrors = {}
    Object.entries(fieldErrors).forEach(([field, message]) => {
      const mappedField = apiFieldMap[field]
      if (mappedField) mappedErrors[mappedField] = message
    })
    setErrors(mappedErrors)
    setApiError(errorMessage(error, 'The agreement request failed. Try again.'))
  }

  const runAction = (action: Exclude<ActionName, 'submit_revision'>) => {
    if (state.status !== 'success' || state.agreement === null || actionLoading) return
    const confirmation = action === 'accept'
      ? 'Accept this agreement? The terms will become frozen. No escrow will be funded.'
      : action === 'reject'
        ? 'Reject this agreement proposal?'
        : action === 'cancel'
          ? 'Cancel this agreement?'
          : null
    if (confirmation && !window.confirm(confirmation)) return
    setActionLoading(action)
    setApiError(null)
    setSuccessMessage(null)
    const request = action === 'request_revision'
      ? api.requestAgreementRevision(state.agreement.id)
      : action === 'accept'
        ? api.acceptAgreement(state.agreement.id)
        : action === 'reject'
          ? api.rejectAgreement(state.agreement.id)
          : api.cancelAgreement(state.agreement.id)
    request.then((agreement) => {
      const message = action === 'request_revision' ? 'Revision requested. Submit updated terms when ready.' : action === 'accept' ? 'Agreement accepted. Terms are now frozen.' : action === 'reject' ? 'Agreement rejected.' : 'Agreement cancelled.'
      applyAgreement(agreement, message, action)
    }).catch((error: unknown) => {
      setActionLoading(null)
      setApiError(errorMessage(error, 'The agreement action failed. Try again.'))
    })
  }

  const retry = () => setReloadKey((value) => value + 1)
  const backToJob = jobId === null ? '/jobs' : `/jobs/${jobId}`

  if (state.status === 'loading') return <AgreementFrame backToJob={backToJob}><LoadingPanel /></AgreementFrame>
  if (state.status === 'error') return <AgreementFrame backToJob={backToJob}><ErrorPanel message={state.message} retry={retry} /></AgreementFrame>
  if (values === null) return <AgreementFrame backToJob={backToJob}><LoadingPanel /></AgreementFrame>

  const { job, agreement } = state
  return <AgreementFrame backToJob={backToJob}>
    <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Professional agreement</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{agreement === null ? 'Propose clear terms' : 'Review agreement terms'}</h2>
          <p className="mt-2 text-sm text-slate-500">{job.title} · {job.public_id} · Job #{job.id}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-electric/25 bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric"><ShieldCheck size={14} /> Demo mode</div>
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-400">Make the scope, delivery standard, and resolution path explicit before any simulated escrow step. Agreement actions below are persisted through the API.</p>
      <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-3">
        <SummaryValue label="Job budget" value={`${job.budget} ${job.currency}`} />
        <SummaryValue label="Job deadline" value={formatDate(job.deadline)} />
        <SummaryValue label="Selected agent" value={job.selected_agent_id === null ? agreement === null ? 'Not selected' : `Agent #${agreement.executor_agent_id}` : `Agent #${job.selected_agent_id}`} />
      </div>
    </section>

    {apiError && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5" role="alert"><p className="text-sm font-semibold text-rose-100">Agreement action failed</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{apiError}</p></div>}
    {successMessage && <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4" role="status"><CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={19} /><p className="text-sm leading-6 text-slate-200">{successMessage}</p></div>}

    {agreement === null ? <AgreementForm values={values} errors={errors} submitting={actionLoading === 'submit_revision'} submitLabel="Create agreement proposal" onChange={updateValue} onSubmit={createProposal} /> : <AgreementReview agreement={agreement} values={values} errors={errors} history={history} actionLoading={actionLoading} revisionFormOpen={revisionFormOpen} onChange={updateValue} onSubmitRevision={submitRevision} onRequestRevision={() => runAction('request_revision')} onAccept={() => runAction('accept')} onReject={() => runAction('reject')} onCancel={() => runAction('cancel')} onRetryHistory={() => loadHistory(agreement)} />}
  </AgreementFrame>
}

function AgreementFrame({ backToJob, children }: { backToJob: string; children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-8"><Link to={backToJob} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to job</Link>{children}</div>
}

function LoadingPanel() {
  return <div className="rounded-3xl border border-line bg-panel p-8" aria-label="Loading agreement workspace"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={19} /> Loading agreement workspace…</div></div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-3xl border border-rose-300/25 bg-rose-300/5 p-7" role="alert"><p className="text-sm font-bold text-rose-100">Unable to load agreement workspace</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{message}</p><button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-ink hover:bg-white"><RefreshCw size={16} /> Retry agreement request</button></div>
}

function AgreementForm({ values, errors, submitting, submitLabel, onChange, onSubmit }: { values: FormValues; errors: FieldErrors; submitting: boolean; submitLabel: string; onChange: (field: FieldName, value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5">
      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-electric/10 text-electric"><FilePenLine size={18} /></div><div><h3 className="font-bold text-white">Terms of work</h3><p className="text-xs text-slate-500">These terms become the persisted proposal.</p></div></div>
        <div className="space-y-5"><FormField label="Scope" required error={errors.scope}><textarea value={values.scope} onChange={(event) => onChange('scope', event.target.value)} className={`${inputClassName} min-h-28 resize-y`} aria-label="Scope" aria-invalid={Boolean(errors.scope)} placeholder="Describe the work included in this agreement." /></FormField><FormField label="Expected deliverable" required error={errors.expectedDeliverable}><textarea value={values.expectedDeliverable} onChange={(event) => onChange('expectedDeliverable', event.target.value)} className={`${inputClassName} min-h-24 resize-y`} aria-label="Expected deliverable" aria-invalid={Boolean(errors.expectedDeliverable)} placeholder="Describe the output the executor will return." /></FormField><FormField label="Acceptance criteria" required error={errors.acceptanceCriteria} hint="Use one criterion per line."><textarea value={values.acceptanceCriteria} onChange={(event) => onChange('acceptanceCriteria', event.target.value)} className={`${inputClassName} min-h-28 resize-y`} aria-label="Acceptance criteria" aria-invalid={Boolean(errors.acceptanceCriteria)} placeholder="Every release gate is listed" /></FormField><FormField label="Verification method" required error={errors.verificationMethod}><textarea value={values.verificationMethod} onChange={(event) => onChange('verificationMethod', event.target.value)} className={`${inputClassName} min-h-20 resize-y`} aria-label="Verification method" aria-invalid={Boolean(errors.verificationMethod)} placeholder="Explain how completion will be checked." /></FormField><FormField label="Cancellation conditions" required error={errors.cancellationConditions}><textarea value={values.cancellationConditions} onChange={(event) => onChange('cancellationConditions', event.target.value)} className={`${inputClassName} min-h-20 resize-y`} aria-label="Cancellation conditions" aria-invalid={Boolean(errors.cancellationConditions)} placeholder="When can the agreement be cancelled?" /></FormField><FormField label="Dispute conditions" required error={errors.disputeConditions}><textarea value={values.disputeConditions} onChange={(event) => onChange('disputeConditions', event.target.value)} className={`${inputClassName} min-h-20 resize-y`} aria-label="Dispute conditions" aria-invalid={Boolean(errors.disputeConditions)} placeholder="What evidence should support a dispute?" /></FormField><FormField label="Optional instructions" error={errors.instructions}><textarea value={values.instructions} onChange={(event) => onChange('instructions', event.target.value)} className={`${inputClassName} min-h-20 resize-y`} aria-label="Optional instructions" aria-invalid={Boolean(errors.instructions)} placeholder="Anything else the executor should know." /></FormField></div>
      </section>
      <div className="flex justify-end"><button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink transition hover:bg-[#5ee0d9] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><LoaderCircle className="animate-spin" size={17} /> Saving terms…</> : <><Send size={17} /> {submitLabel}</>}</button></div>
    </div>
    <AgreementFinancials values={values} errors={errors} onChange={onChange} />
  </form>
}

function AgreementFinancials({ values, errors, onChange }: { values: FormValues; errors: FieldErrors; onChange: (field: FieldName, value: string) => void }) {
  return <aside className="h-fit rounded-3xl border border-line bg-panel p-6 xl:sticky xl:top-24"><div className="flex items-center gap-3"><FileText className="text-electric" size={19} /><h3 className="font-bold text-white">Proposal summary</h3></div><p className="mt-3 text-sm leading-6 text-slate-400">Budget and deadline are sent as explicit agreement proposal fields.</p><div className="mt-6 space-y-5"><div className="grid gap-5 sm:grid-cols-[1fr_120px] xl:grid-cols-1"><FormField label="Budget" required error={errors.budget}><input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.budget} onChange={(event) => onChange('budget', event.target.value)} className={inputClassName} aria-label="Budget" aria-invalid={Boolean(errors.budget)} placeholder="250.00" /></FormField><FormField label="Currency" required error={errors.currency}><select value={values.currency} onChange={(event) => onChange('currency', event.target.value)} className={inputClassName} aria-label="Currency" aria-invalid={Boolean(errors.currency)}>{supportedCurrencies.map((currency) => <option key={currency} value={currency} className="bg-panel">{currency}</option>)}</select></FormField></div><FormField label="Deadline" required error={errors.deadline} hint="Your local time is sent as a timezone-aware ISO timestamp."><input type="datetime-local" value={values.deadline} onChange={(event) => onChange('deadline', event.target.value)} className={inputClassName} aria-label="Deadline" aria-invalid={Boolean(errors.deadline)} /></FormField></div><div className="mt-6 rounded-2xl border border-electric/20 bg-electric/5 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Demo mode</p><p className="mt-2 text-sm leading-6 text-slate-300">Saving a proposal records agreement terms. It does not accept the agreement or fund escrow.</p></div></aside>
}

function AgreementReview({ agreement, values, errors, history, actionLoading, revisionFormOpen, onChange, onSubmitRevision, onRequestRevision, onAccept, onReject, onCancel, onRetryHistory }: { agreement: AgreementDto; values: FormValues; errors: FieldErrors; history: HistoryState; actionLoading: ActionName | null; revisionFormOpen: boolean; onChange: (field: FieldName, value: string) => void; onSubmitRevision: (event: FormEvent<HTMLFormElement>) => void; onRequestRevision: () => void; onAccept: () => void; onReject: () => void; onCancel: () => void; onRetryHistory: () => void }) {
  const accepted = agreement.status === 'accepted'
  const canRequestRevision = agreement.status === 'proposed'
  const canAccept = agreement.status === 'proposed'
  const canReject = agreement.status === 'proposed' || agreement.status === 'revision_requested'
  const canCancel = agreement.status === 'draft' || agreement.status === 'proposed' || agreement.status === 'revision_requested' || agreement.status === 'revision_pending'
  const canSubmitRevision = !accepted && revisionFormOpen && !['rejected', 'expired', 'cancelled'].includes(agreement.status)
  return <div className="space-y-5">
    <section className={`rounded-3xl border p-6 sm:p-8 ${accepted ? 'border-accent/30 bg-accent/5' : 'border-line bg-panel'}`}>
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Agreement #{agreement.id}</p><h3 className="mt-2 text-2xl font-bold text-white">{accepted ? 'Frozen agreement terms' : 'Current proposal'}</h3><p className="mt-2 text-sm text-slate-500">{statusLabels[agreement.status]} · Version {agreement.proposal_version ?? 'legacy'}</p></div><span className="rounded-full border border-electric/30 bg-electric/10 px-3 py-1.5 text-xs font-bold text-electric">{statusLabels[agreement.status]}</span></div>
      {accepted && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent/10 p-4"><LockKeyhole className="mt-0.5 shrink-0 text-accent" size={18} /><p className="text-sm leading-6 text-slate-200">Terms are frozen after acceptance. Continue toward escrow when ready; this page does not fund escrow.</p></div>}
      <TermsDisplay agreement={agreement} />
      <div className="mt-6 grid gap-3 border-t border-line pt-5 text-xs text-slate-500 sm:grid-cols-3"><SummaryValue label="Created" value={formatDate(agreement.created_at)} /><SummaryValue label="Updated" value={formatDate(agreement.updated_at)} /><SummaryValue label="Accepted" value={agreement.accepted_at ? formatDate(agreement.accepted_at) : 'Not accepted'} /></div>
       {accepted && <Link to={`/jobs/${agreement.job_id}/escrow`} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent/10"><ShieldCheck size={16} /> Next: escrow funding</Link>}
    </section>

    {!accepted && <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex items-start gap-3"><RefreshCw className="mt-0.5 text-electric" size={19} /><div><h3 className="font-bold text-white">Negotiation controls</h3><p className="mt-1 text-sm leading-6 text-slate-400">Only actions valid for the persisted status are shown. Every success below requires a response from the backend.</p></div></div><div className="mt-5 flex flex-wrap gap-3">{canRequestRevision && <ActionButton label="Request revision" icon={<RefreshCw size={16} />} loading={actionLoading === 'request_revision'} disabled={actionLoading !== null} onClick={onRequestRevision} />}{canAccept && <ActionButton label="Accept agreement" icon={<CheckCircle2 size={16} />} loading={actionLoading === 'accept'} disabled={actionLoading !== null} onClick={onAccept} tone="accent" />}{canReject && <ActionButton label="Reject agreement" icon={<XCircle size={16} />} loading={actionLoading === 'reject'} disabled={actionLoading !== null} onClick={onReject} tone="danger" />}{canCancel && <ActionButton label="Cancel agreement" icon={<XCircle size={16} />} loading={actionLoading === 'cancel'} disabled={actionLoading !== null} onClick={onCancel} tone="muted" />}</div>{canSubmitRevision && <div className="mt-6 border-t border-line pt-6"><p className="mb-5 text-sm font-semibold text-white">Submit revised terms</p><AgreementForm values={values} errors={errors} submitting={actionLoading === 'submit_revision'} submitLabel="Submit revised terms" onChange={onChange} onSubmit={onSubmitRevision} /></div>}</section>}
    <HistoryPanel history={history} onRetry={onRetryHistory} />
  </div>
}

function TermsDisplay({ agreement }: { agreement: AgreementDto }) {
  const terms = agreement.terms
  return <div className="mt-7 grid gap-4 md:grid-cols-2"><Term label="Budget" value={`${agreement.proposed_budget} ${agreement.currency}`} /><Term label="Deadline" value={agreement.proposed_deadline ? formatDate(agreement.proposed_deadline) : 'Not specified'} /><Term label="Scope" value={displayValue(terms.scope)} /><Term label="Expected deliverable" value={displayValue(terms.expected_deliverable)} /><Term label="Acceptance criteria" value={Array.isArray(terms.acceptance_criteria) ? <ul className="list-disc space-y-1 pl-5">{terms.acceptance_criteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul> : 'Not specified'} /><Term label="Verification method" value={displayValue(terms.verification_method)} /><Term label="Cancellation conditions" value={displayValue(terms.cancellation_conditions)} /><Term label="Dispute conditions" value={displayValue(terms.dispute_conditions)} /><Term label="Optional instructions" value={displayValue(terms.instructions)} /></div>
}

function HistoryPanel({ history, onRetry }: { history: HistoryState; onRetry: () => void }) {
  return <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8"><div className="flex items-start gap-3"><History className="mt-0.5 text-electric" size={19} /><div><h3 className="font-bold text-white">Proposal history</h3><p className="mt-1 text-sm leading-6 text-slate-400">Persisted proposal versions and negotiation events.</p></div></div>{history.status === 'loading' && <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={16} /> Loading history…</div>}{history.status === 'error' && <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4" role="status"><p className="text-sm text-amber-100">{history.message}</p><button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-amber-200/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-200/10">Retry history</button></div>}{(history.status === 'empty' || history.status === 'success' || history.status === 'error') && history.data.length === 0 && <p className="mt-5 text-sm text-slate-500">No proposal history has been recorded yet.</p>}{(history.status === 'success' || history.status === 'error') && history.data.length > 0 && <ol className="mt-5 space-y-3">{history.data.map((entry, index) => <li key={`${entry.id ?? entry.version ?? entry.proposal_version ?? 'history'}-${index}`} className="rounded-2xl border border-line bg-ink/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">Version {entry.version ?? entry.proposal_version ?? index + 1}{entry.action ?? entry.event_type ? ` · ${entry.action ?? entry.event_type}` : ''}</p>{(entry.created_at ?? entry.occurred_at) && <time className="text-xs text-slate-500">{formatDate(entry.created_at ?? entry.occurred_at as string)}</time>}</div>{entry.status && <p className="mt-2 text-xs text-slate-400">Status: {statusLabels[entry.status]}</p>}{entry.reason && <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>}</li>)}</ol>}</section>
}

function ActionButton({ label, icon, loading, disabled, onClick, tone = 'default' }: { label: string; icon: ReactNode; loading: boolean; disabled: boolean; onClick: () => void; tone?: 'default' | 'accent' | 'danger' | 'muted' }) {
  const className = tone === 'accent' ? 'bg-accent text-ink hover:bg-[#5ee0d9]' : tone === 'danger' ? 'border border-rose-300/30 text-rose-100 hover:bg-rose-300/10' : tone === 'muted' ? 'border border-line text-slate-300 hover:bg-white/[0.05]' : 'border border-electric/30 text-electric hover:bg-electric/10'
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : icon}{loading ? 'Saving…' : label}</button>
}

function FormField({ label, required = false, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return <div><label className="block text-sm font-semibold text-slate-200">{label}{required && <span className="ml-1 text-accent" aria-hidden="true">*</span>}{children}</label>{hint && !error && <p className="mt-1.5 text-xs text-slate-600">{hint}</p>}{error && <p className="mt-1.5 text-xs font-medium text-rose-200" role="alert">{error}</p>}</div>
}

function Term({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-ink/30 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{value}</div></div>
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 font-semibold text-slate-200">{value}</p></div>
}

function displayValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-slate-500">Not specified</span>
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
