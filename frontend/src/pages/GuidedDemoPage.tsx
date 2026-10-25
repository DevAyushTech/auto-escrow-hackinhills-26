import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, FileText, Gavel, Info, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, clearStoredDemoSession, getStoredDemoSession, type AgentSummaryDto, type AgreementDto, type DisputeDto, type DemoSessionDto, type EscrowDto, type ExecutionDto, type JobDetailDto, type JobEventDto, type MatchingCandidateDto, type MatchingResponseDto, type SubmissionDto, type VerificationDto } from '../lib/api'

const JOB_STORAGE_KEY = 'auto-escrow-active-job'
const STEP_STORAGE_KEY = 'auto-escrow-demo-step'

const DEMO_STEPS = [
  { id: 1, label: 'Discover', hint: 'Choose a fit' },
  { id: 2, label: 'Define', hint: 'Create the job' },
  { id: 3, label: 'Match', hint: 'Compare results' },
  { id: 4, label: 'Agree', hint: 'Accept terms' },
  { id: 5, label: 'Fund', hint: 'Simulated ledger' },
  { id: 6, label: 'Submit', hint: 'Provide output' },
  { id: 7, label: 'Verify', hint: 'Run checks' },
  { id: 8, label: 'Resolve', hint: 'Release or dispute' },
  { id: 9, label: 'Record', hint: 'Review history' },
] as const

const DEFAULT_OUTPUT = '{"summary":"approved synthetic result","status":"approved"}'
const DEFAULT_EVIDENCE = '{"source":"synthetic-fixture"}'

type JobForm = {
  title: string
  description: string
  requiredSkills: string
  category: string
  expectedOutput: string
  criteria: string
  budget: string
  deadline: string
}

type LoadedJob = {
  job: JobDetailDto
  match: MatchingResponseDto | null
  agreement: AgreementDto | null
  escrow: EscrowDto | null
  execution: ExecutionDto | null
  submissions: SubmissionDto[]
  verification: VerificationDto | null
  disputes: DisputeDto[]
  events: JobEventDto[]
}

function futureDeadline(): string {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const DEFAULT_FORM: JobForm = {
  title: 'Review a synthetic API contract',
  description: 'Return a structured review of a synthetic API contract and clearly identify any issues.',
  requiredSkills: 'verification, quality-control',
  category: 'verification',
  expectedOutput: 'A JSON review with a summary and status.',
  criteria: 'Required JSON fields: summary, status\nRequired terms: approved, synthetic\nRequired evidence fields: source',
  budget: '125.00',
  deadline: futureDeadline(),
}

function errorText(error: unknown, fallback = 'The request failed. Try again.'): string {
  return error instanceof ApiError ? error.detail : error instanceof Error ? error.message : fallback
}

function readStoredJobId(): number | null {
  if (typeof window === 'undefined') return null
  const value = Number(window.localStorage.getItem(JOB_STORAGE_KEY))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function storeJobId(jobId: number | null): void {
  if (typeof window === 'undefined') return
  if (jobId === null) window.localStorage.removeItem(JOB_STORAGE_KEY)
  else window.localStorage.setItem(JOB_STORAGE_KEY, String(jobId))
}

function storedStep(): number {
  if (typeof window === 'undefined') return 1
  const value = Number(window.localStorage.getItem(STEP_STORAGE_KEY))
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : 1
}

function persistStep(step: number): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STEP_STORAGE_KEY, String(step))
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function authoritativeStep(data: LoadedJob | null, selectedAgentId: number | null): number {
  if (!data) return selectedAgentId ? 2 : 1
  if (data.disputes.length > 0 || data.escrow?.status === 'released' || data.escrow?.status === 'refunded') return 9
  if (data.verification) return 8
  if (data.submissions.length > 0) return 7
  if (data.escrow) return 6
  if (data.agreement?.status === 'accepted') return 5
  if (data.agreement) return 4
  if (data.job.selected_agent_id) return 4
  if (data.match) return 3
  return 2
}

export function GuidedDemoPage() {
  const [session, setSession] = useState<DemoSessionDto | null>(() => getStoredDemoSession())
  const [sessionState, setSessionState] = useState<'loading' | 'ready' | 'error'>(() => getStoredDemoSession() ? 'ready' : 'loading')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [step, setStep] = useState(storedStep)
  const [agents, setAgents] = useState<AgentSummaryDto[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [data, setData] = useState<LoadedJob | null>(null)
  const [form, setForm] = useState<JobForm>(DEFAULT_FORM)
  const [output, setOutput] = useState(DEFAULT_OUTPUT)
  const [evidence, setEvidence] = useState(DEFAULT_EVIDENCE)
  const [disputeReason, setDisputeReason] = useState('The submitted result should be reviewed against the accepted synthetic terms.')
  const [disputeDescription, setDisputeDescription] = useState('This is a guided synthetic dispute so the protected path can be inspected.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const token = session?.session_token
  const latestDispute = data?.disputes[0] ?? null

  const setCurrentStep = useCallback((next: number) => {
    const safeStep = Math.min(9, Math.max(1, next))
    setStep(safeStep)
    persistStep(safeStep)
    if (!window.navigator.userAgent.toLowerCase().includes('jsdom')) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const loadAgents = useCallback(async (sessionToken: string) => {
    const response = await api.listAgents(sessionToken)
    setAgents(response.items)
    return response.items
  }, [])

  const loadJob = useCallback(async (jobId: number, sessionToken: string): Promise<LoadedJob> => {
    const [job, match, agreement, escrow, execution, submissions, verification, disputes, events] = await Promise.all([
      api.getJob(jobId, sessionToken),
      api.latestMatching(jobId, sessionToken),
      api.getAgreement(jobId, sessionToken),
      api.getEscrow(jobId, sessionToken),
      api.getExecution(jobId, sessionToken),
      api.listSubmissions(jobId, sessionToken),
      api.getVerification(jobId, sessionToken),
      api.getDisputes(jobId, sessionToken),
      api.getEvents(jobId, sessionToken),
    ])
    return { job, match, agreement, escrow, execution, submissions, verification, disputes, events }
  }, [])

  const refreshJob = useCallback(async (jobId: number, sessionToken: string, requestedStep?: number) => {
    const nextData = await loadJob(jobId, sessionToken)
    setData(nextData)
    setSelectedAgentId(nextData.job.selected_agent_id ?? null)
    const nextStep = requestedStep ?? authoritativeStep(nextData, nextData.job.selected_agent_id ?? null)
    setCurrentStep(nextStep)
    return nextData
  }, [loadJob, setCurrentStep])

  const boot = useCallback(async () => {
    setSessionState('loading')
    setSessionError(null)
    setError(null)
    try {
      const activeSession = getStoredDemoSession() ?? await api.startSession()
      setSession(activeSession)
      const loadedAgents = await loadAgents(activeSession.session_token)
      const jobId = readStoredJobId()
      if (jobId !== null) {
        try {
          const jobData = await refreshJob(jobId, activeSession.session_token)
          if (jobData.job.selected_agent_id === null && loadedAgents.length > 0) setSelectedAgentId(null)
        } catch (requestError) {
          if (requestError instanceof ApiError && requestError.status === 404) storeJobId(null)
          else throw requestError
        }
      }
      setSessionState('ready')
    } catch (requestError) {
      setSessionState('error')
      setSessionError(errorText(requestError, 'The sandbox could not be started.'))
    }
  }, [loadAgents, refreshJob])

  useEffect(() => { void boot() }, [boot])

  function updateForm(field: keyof JobForm, value: string): void {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  function chooseAgent(agent: AgentSummaryDto): void {
    setSelectedAgentId(agent.id)
    setNotice(`${agent.name} is selected as the candidate to compare in the matching run.`)
    setError(null)
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearStoredDemoSession()
        storeJobId(null)
        persistStep(1)
        setSession(null)
        setData(null)
        setSelectedAgentId(null)
        setStep(1)
        setSessionState('error')
        setSessionError('Your sandbox session expired or was reset. Start a fresh sandbox to continue.')
      } else {
        setError(errorText(requestError))
      }
    } finally {
      setBusy(false)
    }
  }

  async function createJob(): Promise<void> {
    if (!token) return setError('Start a demo sandbox before creating a job.')
    const deadline = new Date(form.deadline)
    const criteria = form.criteria.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!form.title.trim() || !form.description.trim() || !form.category.trim() || !form.expectedOutput.trim() || criteria.length === 0 || Number(form.budget) <= 0 || Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
      setError('Complete the title, description, category, deliverable, criteria, positive budget, and future deadline.')
      return
    }
    await runAction(async () => {
      const job = await api.createJob({
        title: form.title.trim(),
        description: form.description.trim(),
        required_skills: form.requiredSkills.split(',').map((item) => item.trim()).filter(Boolean),
        task_category: form.category.trim(),
        expected_output: form.expectedOutput.trim(),
        acceptance_criteria: criteria,
        budget: form.budget.trim(),
        currency: 'USD',
        deadline: deadline.toISOString(),
        additional_instructions: 'Synthetic guided-demo task. Do not execute submitted code.',
        requirements: { synthetic: true, output_format: 'json' },
      }, token)
      storeJobId(job.id)
      setData({ job, match: null, agreement: null, escrow: null, execution: null, submissions: [], verification: null, disputes: [], events: [] })
      setNotice(`Job ${job.public_id} was persisted by the backend.`)
      const match = await api.matchJob(job.id, token)
      setData((current) => current ? { ...current, match } : current)
      setCurrentStep(3)
    })
  }

  async function selectCandidate(candidate: MatchingCandidateDto): Promise<void> {
    if (!token || !data) return
    await runAction(async () => {
      const job = await api.selectAgent(data.job.id, candidate.agent_id, data.match?.metadata.run_id, token)
      setSelectedAgentId(candidate.agent_id)
      setData((current) => current ? { ...current, job } : current)
      setNotice(`${candidate.agent_name} is now the persisted executor selection.`)
      setCurrentStep(4)
    })
  }

  async function createAgreement(): Promise<void> {
    if (!token || !data) return
    await runAction(async () => {
      const agreement = await api.createAgreement(data.job.id, {}, token)
      setData((current) => current ? { ...current, agreement } : current)
      setNotice(`Agreement version ${agreement.proposal_version ?? 1} is ready to review.`)
    })
  }

  async function acceptAgreement(): Promise<void> {
    if (!token || !data?.agreement) return
    if (!window.confirm('Accept these terms? The accepted version becomes immutable. No real money moves.')) return
    await runAction(async () => {
      const agreement = await api.acceptAgreement(data.agreement!.id, token)
      await refreshJob(data.job.id, token, 5)
      setData((current) => current ? { ...current, agreement } : current)
      setNotice(`Agreement version ${agreement.accepted_version ?? agreement.proposal_version ?? 'current'} is frozen.`)
    })
  }

  async function fundEscrow(): Promise<void> {
    if (!token || !data) return
    if (!window.confirm('Record simulated funding? This creates a ledger entry only; no real payment occurs.')) return
    await runAction(async () => {
      await api.fundEscrow(data.job.id, token)
      await refreshJob(data.job.id, token, 6)
      setNotice('The simulated funding entry is now visible in the persisted ledger.')
    })
  }

  async function startExecution(): Promise<void> {
    if (!token || !data) return
    await runAction(async () => {
      await api.startExecution(data.job.id, token)
      await refreshJob(data.job.id, token, 6)
      setNotice('Local demo execution started. No external agent was invoked.')
    })
  }

  async function submitWork(): Promise<void> {
    if (!token || !data) return
    const evidenceObject = parseJsonObject(evidence)
    if (!output.trim()) return setError('Add a submission before continuing.')
    if (!evidenceObject) return setError('Evidence must be a JSON object.')
    await runAction(async () => {
      const submission = await api.submit(data.job.id, { submitted_output: output.trim(), evidence: evidenceObject, notes: 'Submitted through the guided synthetic demo.' }, token)
      await refreshJob(data.job.id, token, 7)
      setNotice(`Submission version ${submission.version} was persisted and remains immutable.`)
    })
  }

  async function verifyWork(): Promise<void> {
    if (!token || !data) return
    await runAction(async () => {
      const verification = await api.verify(data.job.id, token)
      await refreshJob(data.job.id, token, 8)
      setNotice(verification.overall_result === 'passed' ? 'Verification passed. Release is eligible but still requires a separate action.' : 'Verification did not pass. Settlement remains blocked.')
    })
  }

  async function releaseFunds(): Promise<void> {
    if (!token || !data?.escrow) return
    if (!window.confirm('Release the eligible simulated escrow? This records a ledger entry only.')) return
    await runAction(async () => {
      await api.releaseEscrow(data.escrow!.id, token)
      await refreshJob(data.job.id, token, 9)
      setNotice('Simulated release was recorded in the ledger and audit history.')
    })
  }

  async function openDispute(): Promise<void> {
    if (!token || !data?.escrow || !selectedAgentId) return
    await runAction(async () => {
      await api.createDispute(data.job.id, {
        escrow_id: data.escrow!.id,
        category: 'failed_verification',
        reason: disputeReason.trim(),
        description: disputeDescription.trim(),
        evidence: { source: 'guided-demo', synthetic: true },
        raised_by_agent_id: selectedAgentId,
      }, token)
      await refreshJob(data.job.id, token, 9)
      setNotice('The dispute is open. Normal settlement is now blocked.')
    })
  }

  async function reviewDispute(): Promise<void> {
    if (!token || !latestDispute) return
    await runAction(async () => {
      await api.reviewDispute(latestDispute.id, undefined, token)
      await refreshJob(data!.job.id, token, 9)
      setNotice('The dispute review transition is persisted.')
    })
  }

  async function resolveDispute(resolution: 'refund' | 'reject'): Promise<void> {
    if (!token || !latestDispute || !data) return
    await runAction(async () => {
      await api.resolveDispute(latestDispute.id, resolution, resolution === 'refund' ? 'The synthetic output did not satisfy the accepted terms.' : 'The synthetic dispute was rejected after review.', token)
      await refreshJob(data.job.id, token, 9)
      setNotice(`The dispute was resolved with a ${resolution} outcome.`)
    })
  }

  async function resetSandbox(): Promise<void> {
    if (!session) return
    if (!window.confirm('Reset only your synthetic sandbox? Its own jobs and attached records will be deleted.')) return
    await runAction(async () => {
      const replacement = await api.resetSession(session.session_token)
      setSession(replacement)
      setData(null)
      setSelectedAgentId(null)
      setStep(1)
      setForm(DEFAULT_FORM)
      setOutput(DEFAULT_OUTPUT)
      setEvidence(DEFAULT_EVIDENCE)
      storeJobId(null)
      persistStep(1)
      await loadAgents(replacement.session_token)
      setNotice('Your sandbox was reset. Other visitors and their sessions were not changed.')
    })
  }

  async function startFreshSession(): Promise<void> {
    await runAction(async () => {
      clearStoredDemoSession()
      storeJobId(null)
      const replacement = await api.startSession()
      setSession(replacement)
      setData(null)
      setSelectedAgentId(null)
      setStep(1)
      persistStep(1)
      await loadAgents(replacement.session_token)
      setSessionState('ready')
      setNotice('A new isolated sandbox is ready.')
    })
  }

  if (sessionState === 'loading') return <DemoFrame session={session} step={step} busy={busy} onReset={resetSandbox}><LoadingPanel label="Starting your isolated synthetic sandbox…" /></DemoFrame>
  if (sessionState === 'error' || !session) return <DemoFrame session={session} step={1} busy={busy} onReset={resetSandbox}><ErrorPanel message={sessionError ?? 'The sandbox could not be started.'} retry={() => void startFreshSession()} /></DemoFrame>

  return <DemoFrame session={session} step={step} busy={busy} onReset={resetSandbox}>
    {error && <div className="demo-alert demo-alert--error" role="alert"><CircleAlert size={18} /><div><strong>Action could not be completed</strong><p>{error}</p><button type="button" onClick={() => setError(null)}>Dismiss</button></div></div>}
    {notice && <div className="demo-alert demo-alert--success" role="status"><CheckCircle2 size={18} /><p>{notice}</p></div>}
    {step === 1 && <DiscoverStep agents={agents} selectedAgentId={selectedAgentId} onSelect={chooseAgent} onContinue={() => setCurrentStep(2)} />}
    {step === 2 && <DefineStep form={form} onChange={updateForm} busy={busy} onBack={() => setCurrentStep(1)} onSubmit={() => void createJob()} />}
    {step === 3 && <MatchStep data={data} selectedAgentId={selectedAgentId} busy={busy} onBack={() => setCurrentStep(2)} onRun={() => data && token ? void runAction(async () => { const match = await api.matchJob(data.job.id, token); setData((current) => current ? { ...current, match } : current) }) : undefined} onSelect={(candidate) => void selectCandidate(candidate)} onContinue={() => setCurrentStep(4)} />}
    {step === 4 && <AgreementStep data={data} busy={busy} onBack={() => setCurrentStep(3)} onCreate={() => void createAgreement()} onAccept={() => void acceptAgreement()} onContinue={() => setCurrentStep(5)} />}
    {step === 5 && <FundStep data={data} busy={busy} onBack={() => setCurrentStep(4)} onFund={() => void fundEscrow()} onContinue={() => setCurrentStep(6)} />}
    {step === 6 && <SubmitStep data={data} output={output} evidence={evidence} busy={busy} onOutput={setOutput} onEvidence={setEvidence} onBack={() => setCurrentStep(5)} onStart={() => void startExecution()} onSubmit={() => void submitWork()} />}
    {step === 7 && <VerifyStep data={data} busy={busy} onBack={() => setCurrentStep(6)} onVerify={() => void verifyWork()} onContinue={() => setCurrentStep(8)} />}
    {step === 8 && <ResolveStep data={data} busy={busy} reason={disputeReason} description={disputeDescription} onReason={setDisputeReason} onDescription={setDisputeDescription} onBack={() => setCurrentStep(7)} onRelease={() => void releaseFunds()} onOpenDispute={() => void openDispute()} onReview={() => void reviewDispute()} onResolve={(resolution) => void resolveDispute(resolution)} onRecord={() => setCurrentStep(9)} />}
    {step === 9 && <RecordStep data={data} busy={busy} onBack={() => setCurrentStep(8)} onReset={() => void resetSandbox()} />}
  </DemoFrame>
}

function DemoFrame({ session, step, busy, onReset, children }: { session: DemoSessionDto | null; step: number; busy: boolean; onReset: () => Promise<void>; children: ReactNode }) {
  return <div className="guided-demo-page">
    <section className="guided-demo-hero">
      <div>
        <Link to="/" className="text-action"><ArrowLeft size={15} /> Back to Auto Escrow</Link>
        <p className="workspace-page__eyebrow mt-6">Guided prototype</p>
        <h1 className="workspace-page__title">A real workflow you can inspect.</h1>
        <p className="workspace-page__lead">Follow one synthetic job from agent discovery to a recorded outcome. Every consequential button below calls the connected API; the guide never advances by decoration alone.</p>
      </div>
      <div className="guided-demo-hero__side">
        <span className="guided-demo-badge"><ShieldCheck size={15} /> Session-scoped sandbox</span>
        <button type="button" className="action-secondary" onClick={() => void onReset()} disabled={!session || busy}><RefreshCw size={15} /> Reset sandbox</button>
        <p> Synthetic records · simulated escrow · no real funds</p>
      </div>
    </section>

    <nav className="guided-demo-steps" aria-label="Guided demo progress">
      {DEMO_STEPS.map((item) => {
        const complete = item.id < step
        const active = item.id === step
        return <button key={item.id} type="button" onClick={() => undefined} className={`guided-demo-step ${complete ? 'guided-demo-step--complete' : active ? 'guided-demo-step--active' : ''}`} aria-current={active ? 'step' : undefined} disabled>
          <span>{complete ? <Check size={13} /> : item.id}</span><strong>{item.label}</strong><small>{item.hint}</small>
        </button>
      })}
    </nav>

    {session?.expires_at && <p className="guided-demo-expiry">Sandbox expires {new Date(session.expires_at).toLocaleString()} · refresh is safe while the session remains valid.</p>}
    <div className="guided-demo-content">{children}</div>
  </div>
}

function LoadingPanel({ label }: { label: string }) {
  return <div className="workspace-panel workspace-panel--padded"><div className="state-line"><LoaderCircle size={18} className="animate-spin text-electric" /> {label}</div></div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="workspace-error" role="alert"><p>Demo connection problem</p><span>{message}</span><button type="button" onClick={retry}>Start a fresh sandbox</button></div>
}

function StepIntro({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: ReactNode }) {
  return <div className="guided-demo-intro"><div><p className="workspace-page__eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div>{children}</div>
}

function StepActions({ back, next, nextDisabled = false, nextLabel = 'Continue' }: { back?: () => void; next?: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return <div className="guided-demo-actions">{back && <button type="button" className="action-secondary" onClick={back}>Back</button>}{next && <button type="button" className="action-primary" onClick={next} disabled={nextDisabled}>{nextLabel} <ArrowRight size={16} /></button>}</div>
}

function DiscoverStep({ agents, selectedAgentId, onSelect, onContinue }: { agents: AgentSummaryDto[]; selectedAgentId: number | null; onSelect: (agent: AgentSummaryDto) => void; onContinue: () => void }) {
  return <section className="guided-demo-card">
    <StepIntro eyebrow="Step 1 · Discover an agent" title="Start with the capability, not the promise." text="These profiles come from the API. They are synthetic demo agents, but their skills, availability, output formats, and completion estimates are real persisted fields used by matching."><div className="guided-demo-explainer"><Sparkles size={19} /><strong>Matching is a heuristic ranking signal, not a guarantee.</strong></div></StepIntro>
    <div className="guided-demo-grid guided-demo-grid--agents">{agents.map((agent) => <button key={agent.id} type="button" onClick={() => onSelect(agent)} className={`demo-agent-card ${selectedAgentId === agent.id ? 'demo-agent-card--selected' : ''}`}><div className="demo-agent-card__top"><div><h3>{agent.name}</h3><p>{agent.external_id}</p></div>{selectedAgentId === agent.id && <span className="demo-selected"><Check size={14} /></span>}</div><p className="demo-agent-card__description">{agent.description}</p><div className="skill-list">{agent.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><dl className="demo-agent-card__facts"><div><dt>Availability</dt><dd>{agent.availability}</dd></div><div><dt>Completion</dt><dd>{agent.estimated_completion_minutes ? `${agent.estimated_completion_minutes} min` : 'Unknown'}</dd></div><div><dt>Formats</dt><dd>{agent.supported_output_formats.join(', ') || 'Not provided'}</dd></div></dl></button>)}</div>
    {agents.length === 0 && <div className="workspace-empty"><BotIcon /><h3>No synthetic agents returned</h3><p>The backend returned an empty registry. Seed synthetic profiles in the controlled setup and retry the page.</p></div>}
    <StepActions next={onContinue} nextDisabled={selectedAgentId === null} nextLabel="Continue to job brief" />
  </section>
}

function DefineStep({ form, onChange, busy, onBack, onSubmit }: { form: JobForm; onChange: (field: keyof JobForm, value: string) => void; busy: boolean; onBack: () => void; onSubmit: () => void }) {
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 2 · Create a job" title="Give the work a definition the system can verify." text="The API validates the description, required skills, deliverable, budget, deadline, and acceptance criteria. Edit the examples if you want to show a failure path later." /><div className="guided-demo-form"><DemoField label="Task title" value={form.title} onChange={(value) => onChange('title', value)} /><DemoField label="Task category" value={form.category} onChange={(value) => onChange('category', value)} help="Used by matching as one of its ranking signals." /><DemoField label="Description" value={form.description} onChange={(value) => onChange('description', value)} multiline className="guided-demo-field--wide" /><DemoField label="Required skills" value={form.requiredSkills} onChange={(value) => onChange('requiredSkills', value)} help="Comma-separated skills; the backend normalizes case." /><DemoField label="Expected deliverable" value={form.expectedOutput} onChange={(value) => onChange('expectedOutput', value)} /><DemoField label="Budget (USD)" value={form.budget} onChange={(value) => onChange('budget', value)} type="number" /><DemoField label="Deadline" value={form.deadline} onChange={(value) => onChange('deadline', value)} type="datetime-local" /><DemoField label="Acceptance criteria" value={form.criteria} onChange={(value) => onChange('criteria', value)} help="One deterministic criterion per line." multiline className="guided-demo-field--wide" /></div><StepActions back={onBack} next={onSubmit} nextDisabled={busy} nextLabel={busy ? 'Saving…' : 'Create job and run matching'} /></section>
}

function MatchStep({ data, selectedAgentId, busy, onBack, onRun, onSelect, onContinue }: { data: LoadedJob | null; selectedAgentId: number | null; busy: boolean; onBack: () => void; onRun?: () => void; onSelect: (candidate: MatchingCandidateDto) => void; onContinue: () => void }) {
  const match = data?.match
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 3 · Compare matching" title="See why the backend ranked each candidate." text="The score is persisted with a scoring version, component breakdown, warnings, and eligibility decision. It is a signal to investigate—not a promise." />{data?.job && <div className="guided-demo-summary"><span>Job #{data.job.id}</span><strong>{data.job.title}</strong><span>{data.job.budget} {data.job.currency} · {data.job.task_category}</span></div>}{!match && <div className="workspace-empty"><Info className="mx-auto text-electric" size={26} /><h3>No matching run is loaded</h3><p>Run the backend matcher to persist the comparison for this job.</p>{onRun && <button type="button" className="action-primary mt-5" onClick={onRun} disabled={busy}>Run matching <ArrowRight size={15} /></button>}</div>}{match && <div className="guided-demo-matches"><div className="guided-demo-meta"><StatusPill tone="neutral">{match.metadata.scoring_version}</StatusPill><span>Run {match.metadata.run_id}</span><span>Skills {match.metadata.scoring_formula.skills} · category {match.metadata.scoring_formula.category} · deadline {match.metadata.scoring_formula.availability_deadline} · budget {match.metadata.scoring_formula.budget}</span></div>{[...match.candidates, ...match.excluded_agents].map((candidate) => <MatchCandidateCard key={candidate.agent_id} candidate={candidate} selected={selectedAgentId === candidate.agent_id} onSelect={() => onSelect(candidate)} />)}</div>}<StepActions back={onBack} next={data?.job.selected_agent_id ? onContinue : undefined} nextDisabled={!data?.job.selected_agent_id} nextLabel="Review agreement" /></section>
}

function MatchCandidateCard({ candidate, selected, onSelect }: { candidate: MatchingCandidateDto; selected: boolean; onSelect: () => void }) {
  return <article className={`match-candidate ${candidate.eligible ? '' : 'match-candidate--excluded'}`}><div className="match-candidate__top"><div><div className="flex flex-wrap items-center gap-2"><h3>{candidate.agent_name}</h3><StatusPill tone={candidate.eligible ? 'success' : 'danger'}>{candidate.eligible ? 'Eligible' : 'Excluded'}</StatusPill></div><p>{candidate.explanation}</p></div><div className="match-score"><strong>{candidate.score}</strong><span>/ 100</span></div></div><div className="match-candidate__details"><div><dt>Matched skills</dt><dd>{candidate.matched_skills.join(', ') || 'None'}</dd></div><div><dt>Missing skills</dt><dd>{candidate.missing_skills.join(', ') || 'None'}</dd></div><div><dt>Warnings</dt><dd>{candidate.warnings.join(' ') || 'None'}</dd></div></div>{candidate.eligible && <button type="button" className="action-primary" onClick={onSelect} disabled={selected}>{selected ? 'Selected' : 'Select this agent'} <ArrowRight size={15} /></button>}</article>
}

function AgreementStep({ data, busy, onBack, onCreate, onAccept, onContinue }: { data: LoadedJob | null; busy: boolean; onBack: () => void; onCreate: () => void; onAccept: () => void; onContinue: () => void }) {
  const agreement = data?.agreement
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 4 · Review the agreement" title="Accept the terms before the ledger can move." text="Acceptance freezes the current version. The backend copies the amount, currency, deliverable, criteria, and verification method into the accepted snapshot." />{!agreement && <div className="workspace-status-note"><strong>No proposal exists yet.</strong><p>Create the proposal from the persisted job and selected agent, then review the returned terms.</p><button type="button" className="action-primary mt-4" onClick={onCreate} disabled={busy}>Create agreement proposal <FileText size={15} /></button></div>}{agreement && <div className="agreement-review"><div className="agreement-review__main"><div className="flex flex-wrap items-center justify-between gap-3"><p className="workspace-section__label">Proposal version {agreement.proposal_version ?? 'current'}</p><StatusPill tone={agreement.status === 'accepted' ? 'success' : 'warning'}>{agreement.status}</StatusPill></div><DefinitionList items={[['Scope', String(agreement.terms.scope ?? data?.job.description ?? '')], ['Expected deliverable', String(agreement.terms.expected_deliverable ?? data?.job.expected_output ?? '')], ['Acceptance criteria', Array.isArray(agreement.terms.acceptance_criteria) ? agreement.terms.acceptance_criteria.join(' · ') : 'Not provided'], ['Verification method', String(agreement.terms.verification_method ?? 'Not provided')]]} /></div><aside className="agreement-review__aside"><p className="workspace-section__label">Consequence</p><p>Accepted terms become the reference for verification. Funding remains a separate explicit action.</p><strong>{agreement.amount} {agreement.currency}</strong>{agreement.status !== 'accepted' && <button type="button" className="action-primary" onClick={onAccept} disabled={busy}>I accept version {agreement.proposal_version ?? 'current'} <Check size={15} /></button>}</aside></div>}<StepActions back={onBack} next={agreement?.status === 'accepted' ? onContinue : undefined} nextDisabled={agreement?.status !== 'accepted'} nextLabel="Continue to simulated escrow" /></section>
}

function FundStep({ data, busy, onBack, onFund, onContinue }: { data: LoadedJob | null; busy: boolean; onBack: () => void; onFund: () => void; onContinue: () => void }) {
  const agreement = data?.agreement
  const escrow = data?.escrow
  const funded = escrow && ['funded', 'held', 'released', 'refunded', 'disputed'].includes(escrow.status)
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 5 · Fund simulated escrow" title="Record a ledger entry, not a payment." text="The amount and currency come from the accepted agreement. This demo records application state; no bank, wallet, blockchain, or payment provider is connected." /><div className="guided-demo-stat-grid"><SummaryTile label="Accepted amount" value={agreement ? `${agreement.amount} ${agreement.currency}` : '—'} /><SummaryTile label="Ledger state" value={escrow?.status ?? 'Not funded'} /><SummaryTile label="Agreement version" value={String(agreement?.accepted_version ?? '—')} /></div><div className="guided-demo-disclaimer"><CircleDollarSignIcon /><p><strong>Simulation only.</strong> A successful response creates a persisted funding row and ledger entry; it does not move or hold real funds.</p></div><StepActions back={onBack} next={funded ? onContinue : onFund} nextDisabled={busy || !agreement || agreement.status !== 'accepted' || Boolean(escrow && !funded)} nextLabel={funded ? 'Continue to submission' : busy ? 'Funding…' : 'Fund simulated escrow'} /></section>
}

function SubmitStep({ data, output, evidence, busy, onOutput, onEvidence, onBack, onStart, onSubmit }: { data: LoadedJob | null; output: string; evidence: string; busy: boolean; onOutput: (value: string) => void; onEvidence: (value: string) => void; onBack: () => void; onStart: () => void; onSubmit: () => void }) {
  const execution = data?.execution
  const canSubmit = Boolean(execution?.can_submit)
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 6 · Submit the work" title="Use the safe local demo executor." text="Starting execution records a backend state transition. Submissions are stored as immutable versions. The system never executes arbitrary submitted code." /><div className="guided-demo-explainer"><Info size={18} /><span><strong>Passing fixture:</strong> the prefilled JSON satisfies the deterministic criteria. Replace it with missing terms to show a failed verification and protected settlement path.</span></div>{execution?.can_start && <button type="button" className="action-primary mt-5" onClick={onStart} disabled={busy}>Start local demo execution <ArrowRight size={15} /></button>}{execution && <div className="guided-demo-status-row"><StatusPill tone={execution.execution_status === 'awaiting_submission' ? 'warning' : execution.execution_status === 'retry_available' ? 'danger' : 'neutral'}>{execution.execution_status.replaceAll('_', ' ')}</StatusPill><span>{execution.submit_reason}</span></div>}{canSubmit && <div className="guided-demo-form guided-demo-form--two"><DemoField label="Submitted output" value={output} onChange={onOutput} multiline className="guided-demo-field--wide" /><DemoField label="Evidence (JSON object)" value={evidence} onChange={onEvidence} multiline className="guided-demo-field--wide" help="Example: {&quot;source&quot;:&quot;synthetic-fixture&quot;}" /></div>}{data?.submissions.length ? <div className="guided-demo-history"><h3>Immutable submissions</h3>{data.submissions.map((submission) => <div key={submission.id}><strong>Version {submission.version}</strong><span>{submission.status} · {new Date(submission.submitted_at).toLocaleString()}</span></div>)}</div> : null}<StepActions back={onBack} next={canSubmit ? onSubmit : undefined} nextDisabled={busy || !canSubmit} nextLabel={busy ? 'Persisting…' : 'Persist submission'} /></section>
}

function VerifyStep({ data, busy, onBack, onVerify, onContinue }: { data: LoadedJob | null; busy: boolean; onBack: () => void; onVerify: () => void; onContinue: () => void }) {
  const verification = data?.verification
  const tone = verification?.overall_result === 'passed' ? 'success' : verification ? 'danger' : 'warning'
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 7 · Verify the result" title="The backend evaluates the latest submission." text="A pass makes release eligible. A failed or manual-review result keeps settlement blocked and explains what needs attention." /><div className="guided-demo-status-row"><StatusPill tone={tone}>{verification?.overall_result?.replaceAll('_', ' ') ?? 'awaiting verification'}</StatusPill>{verification?.score && <span>Automated score {verification.score}/100</span>}</div>{!verification && <button type="button" className="action-primary mt-5" onClick={onVerify} disabled={busy}>Verify latest submission <ShieldCheck size={15} /></button>}{verification && <div className="verification-checks">{verification.individual_checks.map((check, index) => <article key={`${check.name}-${index}`}><div className="flex items-center justify-between gap-3"><strong>{check.name}</strong><StatusPill tone={check.status === 'passed' ? 'success' : 'danger'}>{check.status}</StatusPill></div><p>{check.explanation}</p></article>)}</div>}{verification && verification.overall_result !== 'passed' && <div className="guided-demo-blocked"><strong>Settlement blocked.</strong><span>{verification.reasons.join(' ') || 'This outcome needs review before release can be considered.'}</span></div>}<StepActions back={onBack} next={verification ? onContinue : undefined} nextDisabled={!verification} nextLabel="Resolve outcome" /></section>
}

function ResolveStep({ data, busy, reason, description, onReason, onDescription, onBack, onRelease, onOpenDispute, onReview, onResolve, onRecord }: { data: LoadedJob | null; busy: boolean; reason: string; description: string; onReason: (value: string) => void; onDescription: (value: string) => void; onBack: () => void; onRelease: () => void; onOpenDispute: () => void; onReview: () => void; onResolve: (resolution: 'refund' | 'reject') => void; onRecord: () => void }) {
  const verification = data?.verification
  const escrow = data?.escrow
  const dispute = data?.disputes[0]
  const passed = verification?.overall_result === 'passed'
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 8 · Resolve the outcome" title="Only an eligible state can release simulated funds." text="For a passing verification, release is a separate guarded action. For a failed result, open a dispute and inspect the protected path instead." />{passed ? <div className="guided-demo-outcome guided-demo-outcome--success"><StatusPill tone="success">Settlement eligible</StatusPill><p>The job is completed and verification passed. The escrow remains funded until you explicitly release it.</p><button type="button" className="action-primary" onClick={onRelease} disabled={busy || !escrow || escrow.status === 'released'}>{escrow?.status === 'released' ? 'Released' : 'Release simulated escrow'} <ArrowRight size={15} /></button></div> : <div className="guided-demo-outcome guided-demo-outcome--danger"><StatusPill tone="danger">Settlement blocked</StatusPill><p>The verification outcome is not a pass. Use the protected dispute path; normal release remains unavailable.</p>{!dispute && <div className="guided-demo-form guided-demo-form--two"><DemoField label="Dispute reason" value={reason} onChange={onReason} /><DemoField label="Dispute description" value={description} onChange={onDescription} multiline /></div>}{!dispute && <button type="button" className="action-primary action-primary--danger" onClick={onOpenDispute} disabled={busy || !escrow}>Open synthetic dispute <Gavel size={15} /></button>}{dispute && <div className="guided-demo-dispute"><div className="flex items-center justify-between gap-3"><strong>Dispute #{dispute.id}</strong><StatusPill tone={dispute.status === 'resolved' || dispute.status === 'rejected' ? 'success' : 'warning'}>{dispute.status}</StatusPill></div><p>{dispute.description}</p>{dispute.status === 'open' && <button type="button" className="action-secondary" onClick={onReview} disabled={busy}>Begin review</button>}{dispute.status === 'under_review' && <div className="flex flex-wrap gap-2"><button type="button" className="action-primary action-primary--danger" onClick={() => onResolve('refund')} disabled={busy}>Resolve: refund</button><button type="button" className="action-secondary" onClick={() => onResolve('reject')} disabled={busy}>Resolve: reject</button></div>}</div>}</div>}<StepActions back={onBack} next={onRecord} nextDisabled={!passed && (!dispute || !['resolved', 'rejected'].includes(dispute.status))} nextLabel="Review the record" /></section>
}

function RecordStep({ data, busy, onBack, onReset }: { data: LoadedJob | null; busy: boolean; onBack: () => void; onReset: () => void }) {
  const escrow = data?.escrow
  return <section className="guided-demo-card"><StepIntro eyebrow="Step 9 · Review the record" title="The outcome is only useful when you can explain it." text="This view reads the persisted job, ledger, verification, dispute, and audit records. It is the final judge-friendly summary of what actually happened." /><div className="guided-demo-stat-grid guided-demo-stat-grid--four"><SummaryTile label="Job state" value={data?.job.status ?? '—'} /><SummaryTile label="Escrow" value={escrow?.status ?? '—'} /><SummaryTile label="Verification" value={data?.verification?.overall_result ?? '—'} /><SummaryTile label="Audit events" value={String(data?.events.length ?? 0)} /></div><div className="guided-demo-record-grid"><section><h3>Ledger history</h3>{escrow?.ledger_entries?.length ? <ol>{escrow.ledger_entries.map((entry) => <li key={entry.id}><strong>{entry.entry_type}</strong><span>{entry.amount} {entry.currency}</span></li>)}</ol> : <p>No ledger entries returned for this job.</p>}</section><section><h3>Audit timeline</h3>{data?.events.length ? <ol className="guided-demo-timeline">{data.events.map((event) => <li key={event.id}><strong>{event.event_type}</strong><span>{event.description}</span><small>{new Date(event.created_at).toLocaleString()}</small></li>)}</ol> : <p>No audit events returned for this job.</p>}</section></div><div className="guided-demo-complete"><CheckCircle2 size={21} /><div><strong>Record complete</strong><p>Use this timeline to explain the workflow. The values are synthetic and the escrow is simulated.</p></div></div><StepActions back={onBack} next={onReset} nextDisabled={busy} nextLabel="Reset this sandbox" /></section>
}

function DemoField({ label, value, onChange, help, multiline = false, className = '', type = 'text' }: { label: string; value: string; onChange: (value: string) => void; help?: string; multiline?: boolean; className?: string; type?: string }) {
  return <label className={`guided-demo-field ${className}`}><span>{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />}{help && <small>{help}</small>}</label>
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return <div className="guided-demo-summary-tile"><span>{label}</span><strong>{value}</strong></div>
}

function DefinitionList({ items }: { items: [string, string][] }) {
  return <dl className="guided-demo-definition-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function BotIcon() { return <Sparkles size={27} /> }
function CircleDollarSignIcon() { return <span aria-hidden="true" className="demo-dollar-mark">$</span> }
