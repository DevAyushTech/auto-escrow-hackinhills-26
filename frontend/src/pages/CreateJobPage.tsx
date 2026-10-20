import { FormEvent, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, CircleDollarSign, LoaderCircle, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api, CreateJobPayload, getApiFieldErrors, supportedCurrencies, SupportedCurrency } from '../lib/api'

type FormValues = {
  title: string
  description: string
  taskCategory: string
  requiredSkills: string
  expectedOutput: string
  acceptanceCriteria: string
  budget: string
  currency: SupportedCurrency
  deadline: string
  additionalInstructions: string
}

type FieldName = keyof FormValues
type FieldErrors = Partial<Record<FieldName, string>>

const initialValues: FormValues = {
  title: '',
  description: '',
  taskCategory: '',
  requiredSkills: '',
  expectedOutput: '',
  acceptanceCriteria: '',
  budget: '',
  currency: 'USD',
  deadline: '',
  additionalInstructions: '',
}

const inputClassName = 'w-full rounded-xl border border-line bg-ink/40 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-electric/60 focus:ring-2 focus:ring-electric/10'

function splitLines(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}

function deadlineAsIso(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function validate(values: FormValues): { errors: FieldErrors; payload?: CreateJobPayload } {
  const errors: FieldErrors = {}
  const title = values.title.trim()
  const description = values.description.trim()
  const taskCategory = values.taskCategory.trim()
  const expectedOutput = values.expectedOutput.trim()
  const acceptanceCriteria = splitLines(values.acceptanceCriteria)
  const requiredSkills = splitLines(values.requiredSkills)
  const budget = values.budget.trim()
  const deadline = deadlineAsIso(values.deadline)

  if (!title) errors.title = 'Title is required.'
  else if (title.length > 240) errors.title = 'Title must be 240 characters or fewer.'
  if (!description) errors.description = 'Detailed description is required.'
  if (!taskCategory) errors.taskCategory = 'Task category is required.'
  else if (taskCategory.length > 120) errors.taskCategory = 'Task category must be 120 characters or fewer.'
  if (!expectedOutput) errors.expectedOutput = 'Expected deliverable is required.'
  if (acceptanceCriteria.length === 0) errors.acceptanceCriteria = 'Add at least one acceptance criterion.'
  if (!budget) errors.budget = 'Budget is required.'
  else if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(budget) || Number(budget) <= 0) errors.budget = 'Budget must be greater than 0 with at most two decimal places.'
  if (!supportedCurrencies.includes(values.currency)) errors.currency = 'Choose a supported currency.'
  if (!values.deadline) errors.deadline = 'Deadline is required.'
  else if (!deadline) errors.deadline = 'Enter a valid deadline.'
  else if (new Date(deadline).getTime() <= Date.now()) errors.deadline = 'Deadline must be in the future.'

  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    payload: {
      title,
      description,
      required_skills: requiredSkills,
      task_category: taskCategory,
      expected_output: expectedOutput,
      acceptance_criteria: acceptanceCriteria,
      budget,
      currency: values.currency,
      deadline: deadline as string,
      additional_instructions: values.additionalInstructions.trim() || null,
    },
  }
}

const apiFieldMap: Record<string, FieldName> = {
  title: 'title',
  description: 'description',
  required_skills: 'requiredSkills',
  task_category: 'taskCategory',
  expected_output: 'expectedOutput',
  acceptance_criteria: 'acceptanceCriteria',
  budget: 'budget',
  currency: 'currency',
  deadline: 'deadline',
  additional_instructions: 'additionalInstructions',
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Choose a future date and time' : date.toLocaleString()
}

export function CreateJobPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<FormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const summaryBudget = values.budget.trim() ? `${values.budget.trim()} ${values.currency}` : 'Add a budget'
  const summaryDeadline = useMemo(() => values.deadline ? formatDate(values.deadline) : 'Add a deadline', [values.deadline])

  const updateValue = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setApiError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const result = validate(values)
    setErrors(result.errors)
    setApiError(null)
    if (!result.payload) return

    setSubmitting(true)
    try {
      const created = await api.createJob(result.payload)
      navigate(`/jobs/${created.id}?created=1`)
    } catch (error: unknown) {
      const fieldErrors = getApiFieldErrors(error)
      const mappedErrors: FieldErrors = {}
      Object.entries(fieldErrors).forEach(([field, message]) => {
        const mappedField = apiFieldMap[field]
        if (mappedField) mappedErrors[mappedField] = message
      })
      setErrors(mappedErrors)
      setApiError(error instanceof ApiError ? error.message : 'The job could not be created. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to jobs</Link>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">New job</span>
      </div>

      <section className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Job management</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Define work with an auditable finish line.</h2>
        <p className="mt-4 text-base leading-7 text-slate-400">Create a persisted job record with the same constraints enforced by the backend. Required skills and acceptance criteria use one item per line.</p>
      </section>

      <form onSubmit={submit} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {apiError && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5" role="alert"><p className="text-sm font-semibold text-rose-100">Job creation failed</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{apiError}</p></div>}
          <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-electric/10 text-electric"><Plus size={18} /></div><div><h3 className="font-bold text-white">Task brief</h3><p className="text-xs text-slate-500">Describe the work another agent must complete.</p></div></div>
            <div className="space-y-5">
              <FormField label="Title" required error={errors.title} hint="1–240 characters."><input value={values.title} onChange={(event) => updateValue('title', event.target.value)} className={inputClassName} aria-label="Title" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'title-error' : undefined} placeholder="e.g. Review the payment API contract" /></FormField>
              <FormField label="Detailed description" required error={errors.description}><textarea value={values.description} onChange={(event) => updateValue('description', event.target.value)} className={`${inputClassName} min-h-32 resize-y`} aria-label="Detailed description" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'detailed-description-error' : undefined} placeholder="Explain the context, scope, and useful background." /></FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Task category" required error={errors.taskCategory} hint="1–120 characters."><input value={values.taskCategory} onChange={(event) => updateValue('taskCategory', event.target.value)} className={inputClassName} aria-label="Task category" aria-invalid={Boolean(errors.taskCategory)} aria-describedby={errors.taskCategory ? 'task-category-error' : undefined} placeholder="e.g. software" /></FormField>
                <FormField label="Required skills" error={errors.requiredSkills} hint="Optional; separate skills with commas or new lines."><input value={values.requiredSkills} onChange={(event) => updateValue('requiredSkills', event.target.value)} className={inputClassName} aria-label="Required skills" aria-invalid={Boolean(errors.requiredSkills)} aria-describedby={errors.requiredSkills ? 'required-skills-error' : undefined} placeholder="TypeScript, API design" /></FormField>
              </div>
              <FormField label="Expected deliverable" required error={errors.expectedOutput}><textarea value={values.expectedOutput} onChange={(event) => updateValue('expectedOutput', event.target.value)} className={`${inputClassName} min-h-24 resize-y`} aria-label="Expected deliverable" aria-invalid={Boolean(errors.expectedOutput)} aria-describedby={errors.expectedOutput ? 'expected-deliverable-error' : undefined} placeholder="Describe the output that should be returned." /></FormField>
              <FormField label="Acceptance criteria" required error={errors.acceptanceCriteria} hint="At least one criterion; use one criterion per line."><textarea value={values.acceptanceCriteria} onChange={(event) => updateValue('acceptanceCriteria', event.target.value)} className={`${inputClassName} min-h-28 resize-y`} aria-label="Acceptance criteria" aria-invalid={Boolean(errors.acceptanceCriteria)} aria-describedby={errors.acceptanceCriteria ? 'acceptance-criteria-error' : undefined} placeholder={'Findings are categorized\nOutput is valid JSON'} /></FormField>
              <FormField label="Optional instructions" error={errors.additionalInstructions}><textarea value={values.additionalInstructions} onChange={(event) => updateValue('additionalInstructions', event.target.value)} className={`${inputClassName} min-h-24 resize-y`} aria-label="Optional instructions" aria-invalid={Boolean(errors.additionalInstructions)} aria-describedby={errors.additionalInstructions ? 'optional-instructions-error' : undefined} placeholder="Anything an executor should know before starting." /></FormField>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><CircleDollarSign size={18} /></div><div><h3 className="font-bold text-white">Budget and deadline</h3><p className="text-xs text-slate-500">Both values are persisted with the job.</p></div></div>
            <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
              <FormField label="Budget" required error={errors.budget} hint="Positive amount, up to two decimal places."><input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.budget} onChange={(event) => updateValue('budget', event.target.value)} className={inputClassName} aria-label="Budget" aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget ? 'budget-error' : undefined} placeholder="125.00" /></FormField>
              <FormField label="Currency" required error={errors.currency}><select value={values.currency} onChange={(event) => updateValue('currency', event.target.value)} className={inputClassName} aria-label="Currency" aria-invalid={Boolean(errors.currency)} aria-describedby={errors.currency ? 'currency-error' : undefined}>{supportedCurrencies.map((currency) => <option key={currency} value={currency} className="bg-panel">{currency}</option>)}</select></FormField>
            </div>
            <div className="mt-5"><FormField label="Deadline" required error={errors.deadline} hint="Your local time is converted to a timezone-aware ISO timestamp."><input type="datetime-local" value={values.deadline} onChange={(event) => updateValue('deadline', event.target.value)} className={inputClassName} aria-label="Deadline" aria-invalid={Boolean(errors.deadline)} aria-describedby={errors.deadline ? 'deadline-error' : undefined} /></FormField></div>
          </section>

          <div className="flex flex-wrap justify-end gap-3"><Link to="/jobs" className="rounded-xl border border-line px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">Cancel</Link><button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink transition hover:bg-[#5ee0d9] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><LoaderCircle className="animate-spin" size={17} /> Creating job…</> : <><CheckCircle2 size={17} /> Create job</>}</button></div>
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-panel p-5 sm:p-6 xl:sticky xl:top-24">
          <div className="flex items-center gap-3"><CalendarClock className="text-electric" size={19} /><h3 className="font-bold text-white">Before you create</h3></div>
          <p className="mt-3 text-sm leading-6 text-slate-400">Review the values that will be visible on the persisted job record.</p>
          <dl className="mt-6 space-y-4"><SummaryRow label="Budget" value={summaryBudget} /><SummaryRow label="Deadline" value={summaryDeadline} /></dl>
          <div className="mt-6 rounded-xl border border-electric/20 bg-electric/5 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Backend validation</p><p className="mt-2 text-sm leading-6 text-slate-300">The request is sent only after client-side checks pass. Server field errors will be shown beside the matching field.</p></div>
        </aside>
      </form>
    </div>
  )
}

function FormField({ label, required = false, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  const errorId = `${label.toLowerCase().replaceAll(' ', '-')}-error`
  return <div><label className="block text-sm font-semibold text-slate-200">{label}{required && <span className="ml-1 text-accent" aria-hidden="true">*</span>}{children}</label>{hint && !error && <p className="mt-1.5 text-xs text-slate-600">{hint}</p>}{error && <p id={errorId} className="mt-1.5 text-xs font-medium text-rose-200" role="alert">{error}</p>}</div>
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-right text-sm font-semibold text-white">{value}</dd></div>
}
