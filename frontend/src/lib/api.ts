/**
 * Typed browser client for the FastAPI application.
 *
 * The backend is authoritative for workflow state.  This module only adapts
 * the wire contracts into the shapes used by the active Vite workspace and
 * never fabricates a successful response when the API is unavailable.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const baseUrl = API_BASE_URL
export const DEMO_PUBLIC_ENABLED = import.meta.env.VITE_DEMO_PUBLIC_ENABLED === 'true'
const DEMO_SESSION_STORAGE_KEY = 'auto-escrow-demo-session'
const DEMO_SESSION_HEADER = 'X-Demo-Session'

export type AgentStatus = 'active' | 'inactive' | 'suspended'
export type AgentAvailability = 'available' | 'busy' | 'unavailable'
export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'submitted' | 'under_review' | 'completed' | 'disputed' | 'cancelled'
export type AgreementStatus = 'draft' | 'proposed' | 'revision_requested' | 'revision_pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
export type EscrowStatus = 'pending' | 'funded' | 'held' | 'released' | 'refunded' | 'disputed'
export type DisputeCategory = 'failed_verification' | 'deliverable_incomplete' | 'agreement_mismatch' | 'deadline_issue' | 'other'
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected'
export type DisputeResolution = 'release' | 'refund' | 'reject'
export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD'
export const supportedCurrencies: SupportedCurrency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']

export type AgentSummaryDto = {
  id: number
  external_id: string
  name: string
  description: string
  endpoint_url: string | null
  status: AgentStatus
  availability: AgentAvailability
  skills: string[]
  task_categories: string[]
  supported_output_formats: string[]
  estimated_completion_minutes: number | null
  demo_performance_stats: Record<string, unknown>
  capabilities?: string[]
  metadata: Record<string, unknown>
  created_at: string
}

export type AgentDetailDto = AgentSummaryDto
export type AgentSummary = AgentSummaryDto
export type Agent = AgentSummaryDto

export type AgentListResponseDto = {
  items: AgentSummaryDto[]
  total: number
}

export type CreateJobPayload = {
  title: string
  description: string
  required_skills: string[]
  task_category: string
  expected_output: string
  acceptance_criteria: string[]
  budget: string
  currency: SupportedCurrency
  deadline: string
  additional_instructions?: string | null
  requester_agent_id?: number | null
  requirements?: Record<string, unknown>
}

export type JobSummaryDto = {
  id: number
  public_id: string
  requester_agent_id: number | null
  executor_agent_id: number | null
  selected_agent_id: number | null
  selected_match_run_id?: string | null
  selected_matching_score?: string | number | null
  selected_scoring_version?: string | null
  title: string
  description: string
  required_skills: string[]
  task_category: string
  expected_output: string
  acceptance_criteria: string[]
  additional_instructions: string | null
  budget: string
  currency: string
  deadline: string
  status: JobStatus
  requirements?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type JobDetailDto = JobSummaryDto
export type JobSummary = JobSummaryDto

export type JobListResponseDto = {
  items: JobSummaryDto[]
  total: number
}

export type AgreementTermsPayload = {
  scope: string
  expected_deliverable: string
  acceptance_criteria: string[]
  verification_method: string
  cancellation_conditions: string
  dispute_conditions: string
  instructions?: string | null
  verification_rules?: Record<string, unknown> | null
}

export type AgreementTermsDto = AgreementTermsPayload & Record<string, unknown>

export type CreateAgreementPayload = {
  proposed_budget?: string
  proposed_deadline?: string
  currency?: SupportedCurrency
  terms?: AgreementTermsPayload
  rationale?: string | null
}

export type SubmitAgreementRevisionPayload = CreateAgreementPayload & {
  action: 'submit_revision'
}

export type AgreementDto = {
  id: number
  job_id: number
  requester_agent_id: number
  executor_agent_id: number
  proposed_budget: string
  proposed_deadline: string | null
  currency: string
  status: AgreementStatus
  terms: AgreementTermsDto
  proposal_history: Record<string, unknown>[]
  history?: Record<string, unknown>[]
  amount: string
  created_at: string
  updated_at: string
  accepted_at: string | null
  proposal_version?: number
  accepted_version?: number | null
}

export type AgreementHistoryEntryDto = {
  id?: number
  version?: number
  proposal_version?: number
  action?: string
  event_type?: string
  status?: AgreementStatus
  created_at?: string
  occurred_at?: string
  reason?: string
  terms?: AgreementTermsDto
}

export type LedgerEntryDto = {
  id: number
  escrow_id: number
  job_id?: number | null
  idempotency_key: string
  entry_type: 'deposit' | 'funding' | 'hold' | 'release' | 'refund' | 'fee'
  amount: string
  currency: string
  reference: string | null
  occurred_at: string
}

export type EscrowDto = {
  id: number
  job_id: number
  agreement_id: number
  accepted_agreement_version?: number | null
  agreement_version?: number | null
  accepted_amount?: string
  accepted_currency?: string
  funded_amount: string | null
  currency: string
  status: EscrowStatus
  funding_state?: string
  provider_reference: string | null
  funded_at: string | null
  released_at: string | null
  settled_at: string | null
  created_at: string
  updated_at: string
  amount: string
  ledger_entries: LedgerEntryDto[]
}

export type ExecutionStatus = 'blocked' | 'ready' | 'awaiting_submission' | 'awaiting_verification' | 'retry_available' | 'manual_review' | 'settlement_ready' | 'completed' | 'disputed' | 'cancelled'

export type ExecutionDto = {
  job_id: number
  job_status: JobStatus
  execution_status: ExecutionStatus
  selected_agent_id: number | null
  executor_agent_id: number | null
  agreement_id: number | null
  accepted_agreement_version: number | null
  escrow_status: EscrowStatus | null
  executor_type: 'local_demo'
  can_start: boolean
  can_submit: boolean
  can_verify: boolean
  start_reason: string
  submit_reason: string
  verify_reason: string
  started_at: string | null
  latest_submission_version: number | null
  latest_verification_result: VerificationDto['overall_result'] | null
}

export type SubmissionDto = {
  id: number
  job_id: number
  agent_id: number
  version: number
  artifact_url: string
  content: string | null
  submitted_output: string
  evidence: Record<string, unknown>
  notes: string | null
  status: 'pending' | 'accepted' | 'rejected'
  submitted_at: string
}

export type SubmissionPayload = {
  submitted_output: string
  evidence: Record<string, unknown>
  notes?: string
  agent_id?: number
}

export type VerificationCheck = {
  name: string
  status: 'passed' | 'failed' | 'manual_review' | string
  passed?: boolean
  explanation: string
  evidence?: unknown
}

export type VerificationDto = {
  id: number
  job_id: number
  submission_id: number
  submission_version: number
  status: 'pending' | 'passed' | 'failed'
  overall_result: 'pending' | 'passed' | 'failed' | 'manual_review' | 'needs_revision'
  individual_checks: VerificationCheck[]
  reasons: string[]
  evaluator_type: 'automated' | 'human' | 'hybrid'
  score: string | null
  feedback: Record<string, unknown>
  evaluated_at: string | null
  verified_at: string | null
}

export type DisputeDto = {
  id: number
  job_id: number
  escrow_id: number | null
  raised_by_agent_id: number
  category: DisputeCategory
  status: DisputeStatus
  reason: string
  description: string
  evidence: Record<string, unknown>
  submission_id: number | null
  verification_id: number | null
  previous_job_status: JobStatus | null
  previous_escrow_status: EscrowStatus | null
  resolution: DisputeResolution | null
  resolution_rationale: string | null
  resolved_by_operator: string | null
  created_at: string
  reviewed_at: string | null
  resolved_at: string | null
  updated_at: string
  agreement_terms: Record<string, unknown>
  job_requirements: Record<string, unknown>
  submission?: SubmissionDto | null
  verification?: VerificationDto | null
  events: JobEventDto[]
}

export type DisputeCreatePayload = {
  escrow_id: number
  category: DisputeCategory
  reason: string
  description: string
  evidence: Record<string, unknown>
  raised_by_agent_id: number
}

export type JobEventDto = {
  id: number
  job_id: number | null
  actor_agent_id: number | null
  event_type: string
  description: string
  data: Record<string, unknown>
  created_at: string
}

export type DashboardMetricsDto = {
  total_jobs: number
  jobs_in_progress: number
  completed_jobs: number
  open_disputes: number
  total_simulated_escrow_funded: string
  total_simulated_escrow_settled: string
}

export type DashboardExecutionDto = {
  jobs_running: number
  jobs_awaiting_submission: number
  jobs_awaiting_verification: number
  jobs_eligible_for_settlement: number
  recent_submissions: (SubmissionDto & { job_id: number })[]
  recent_verifications: (VerificationDto & { job_id: number })[]
}

export type HealthResponse = {
  status: string
  service: string
  environment: string
  timestamp: string
}

export type DemoSessionDto = {
  session_token: string
  expires_at: string
  max_jobs: number
  synthetic_only: boolean
  reset_note: string | null
}

type Compatibility = {
  skills: number
  category: number
  availability_deadline: number
  budget: number
}

export type MatchingCandidateDto = {
  agent_id: number
  agent_name: string
  agent_external_id?: string | null
  score: number
  matched_skills: string[]
  missing_skills: string[]
  compatibility: Compatibility
  breakdown?: Record<string, unknown>
  explanation: string
  warnings: string[]
  eligible: boolean
  exclusion_reasons?: string[]
  reasons: string[]
}

export type MatchingResponseDto = {
  job_id: number
  metadata: {
    run_id: string
    scoring_version: string
    scoring_formula: { skills: number; category: number; availability_deadline: number; budget: number }
  }
  candidates: MatchingCandidateDto[]
  excluded_agents: MatchingCandidateDto[]
}

export type MatchRun = MatchingResponseDto
export type MatchCandidate = MatchingCandidateDto
export type JobEvent = JobEventDto
export type Agreement = AgreementDto
export type Escrow = EscrowDto
export type ExecutionState = ExecutionDto
export type Submission = SubmissionDto
export type Verification = VerificationDto
export type Dispute = DisputeDto

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly payload: unknown

  constructor(status: number, detail: string, payload: unknown = null) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.payload = payload
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function detailText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const messages = value.map((item) => {
      const record = asRecord(item)
      return typeof record.msg === 'string' ? record.msg : detailText(item)
    }).filter(Boolean)
    return messages.join(' ') || 'The API rejected the request.'
  }
  const record = asRecord(value)
  if (typeof record.message === 'string') return record.message
  if (typeof record.detail === 'string') return record.detail
  if (Object.keys(record).length > 0) return JSON.stringify(record)
  return 'The API request failed.'
}

function readStoredSession(): DemoSessionDto | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoSessionDto>
    return typeof parsed.session_token === 'string' && typeof parsed.expires_at === 'string'
      ? {
          session_token: parsed.session_token,
          expires_at: parsed.expires_at,
          max_jobs: Number(parsed.max_jobs ?? 3),
          synthetic_only: parsed.synthetic_only !== false,
          reset_note: typeof parsed.reset_note === 'string' ? parsed.reset_note : null,
        }
      : null
  } catch {
    window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY)
    return null
  }
}

function storeSession(session: DemoSessionDto): DemoSessionDto {
  if (typeof window !== 'undefined') window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}

export function getStoredDemoSession(): DemoSessionDto | null {
  return readStoredSession()
}

export function clearStoredDemoSession(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY)
}

async function rawRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T | null> {
  const headers: Record<string, string> = init.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : Array.isArray(init.headers)
      ? Object.fromEntries(init.headers)
      : { ...(init.headers ?? {}) }
  const hasHeader = (name: string) => Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())
  const body = init.body
  if (body !== undefined && body !== null && !hasHeader('Content-Type')) headers['Content-Type'] = 'application/json'
  const sessionToken = token ?? readStoredSession()?.session_token
  if (sessionToken) headers[DEMO_SESSION_HEADER] = sessionToken
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  let payload: unknown = null
  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  }
  if (!response.ok) throw new ApiError(response.status, detailText(asRecord(payload).detail ?? payload), payload)
  return response.status === 204 ? null : payload as T
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T | null> {
  const explicitToken = token !== undefined
  try {
    return await rawRequest<T>(path, init, token)
  } catch (error) {
    // A public deployment may require a sandbox token while local development
    // intentionally does not. Bootstrap only after an anonymous 401 so normal
    // tests and local API use do not create sessions unexpectedly.
    if (!explicitToken && error instanceof ApiError && error.status === 401 && !path.startsWith('/api/demo/')) {
      clearStoredDemoSession()
      const session = await rawRequest<DemoSessionDto>('/api/demo/session', { method: 'POST' })
      if (!session) throw new ApiError(502, 'The API returned an empty demo session.')
      storeSession(session)
      return rawRequest<T>(path, init, session.session_token)
    }
    throw error
  }
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeAgent(raw: unknown): AgentSummaryDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    external_id: String(value.external_id ?? ''),
    name: String(value.name ?? ''),
    description: String(value.description ?? ''),
    endpoint_url: typeof value.endpoint_url === 'string' ? value.endpoint_url : null,
    status: value.status as AgentStatus,
    availability: value.availability as AgentAvailability,
    skills: Array.isArray(value.skills) ? value.skills.map(String) : [],
    task_categories: Array.isArray(value.task_categories) ? value.task_categories.map(String) : [],
    supported_output_formats: Array.isArray(value.supported_output_formats) ? value.supported_output_formats.map(String) : [],
    estimated_completion_minutes: value.estimated_completion_minutes === null || value.estimated_completion_minutes === undefined ? null : numberValue(value.estimated_completion_minutes),
    demo_performance_stats: asRecord(value.demo_performance_stats),
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.map(String) : undefined,
    metadata: asRecord(value.metadata ?? value.metadata_json),
    created_at: String(value.created_at ?? ''),
  }
}

function normalizeJob(raw: unknown): JobSummaryDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    public_id: String(value.public_id ?? ''),
    requester_agent_id: value.requester_agent_id === null || value.requester_agent_id === undefined ? null : numberValue(value.requester_agent_id),
    executor_agent_id: value.executor_agent_id === null || value.executor_agent_id === undefined ? null : numberValue(value.executor_agent_id),
    selected_agent_id: value.selected_agent_id === null || value.selected_agent_id === undefined ? null : numberValue(value.selected_agent_id),
    selected_match_run_id: typeof value.selected_match_run_id === 'string' ? value.selected_match_run_id : null,
    selected_matching_score: value.selected_matching_score === null || value.selected_matching_score === undefined ? null : value.selected_matching_score as string | number,
    selected_scoring_version: typeof value.selected_scoring_version === 'string' ? value.selected_scoring_version : null,
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    required_skills: Array.isArray(value.required_skills) ? value.required_skills.map(String) : [],
    task_category: String(value.task_category ?? ''),
    expected_output: String(value.expected_output ?? ''),
    acceptance_criteria: Array.isArray(value.acceptance_criteria) ? value.acceptance_criteria.map(String) : [],
    additional_instructions: typeof value.additional_instructions === 'string' ? value.additional_instructions : null,
    budget: String(value.budget ?? '0.00'),
    currency: String(value.currency ?? 'USD'),
    deadline: String(value.deadline ?? ''),
    status: value.status as JobStatus,
    requirements: asRecord(value.requirements),
    created_at: String(value.created_at ?? ''),
    updated_at: String(value.updated_at ?? ''),
  }
}

function normalizeAgreement(raw: unknown): AgreementDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    job_id: numberValue(value.job_id),
    requester_agent_id: numberValue(value.requester_agent_id),
    executor_agent_id: numberValue(value.executor_agent_id),
    proposed_budget: String(value.proposed_budget ?? value.amount ?? '0.00'),
    proposed_deadline: typeof value.proposed_deadline === 'string' ? value.proposed_deadline : null,
    currency: String(value.currency ?? 'USD'),
    status: value.status as AgreementStatus,
    terms: asRecord(value.terms) as AgreementTermsDto,
    proposal_history: Array.isArray(value.proposal_history) ? value.proposal_history.map(asRecord) : [],
    history: Array.isArray(value.history) ? value.history.map((item) => asRecord(item) as AgreementHistoryEntryDto) : undefined,
    amount: String(value.amount ?? value.proposed_budget ?? '0.00'),
    created_at: String(value.created_at ?? ''),
    updated_at: String(value.updated_at ?? ''),
    accepted_at: typeof value.accepted_at === 'string' ? value.accepted_at : null,
    proposal_version: value.proposal_version === undefined ? undefined : numberValue(value.proposal_version),
    accepted_version: value.accepted_version === null || value.accepted_version === undefined ? null : numberValue(value.accepted_version),
  }
}

function normalizeLedger(raw: unknown): LedgerEntryDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    escrow_id: numberValue(value.escrow_id),
    job_id: value.job_id === null || value.job_id === undefined ? null : numberValue(value.job_id),
    idempotency_key: String(value.idempotency_key ?? ''),
    entry_type: value.entry_type as LedgerEntryDto['entry_type'],
    amount: String(value.amount ?? '0.00'),
    currency: String(value.currency ?? 'USD'),
    reference: typeof value.reference === 'string' ? value.reference : null,
    occurred_at: String(value.occurred_at ?? ''),
  }
}

function normalizeEscrow(raw: unknown): EscrowDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    job_id: numberValue(value.job_id),
    agreement_id: numberValue(value.agreement_id),
    accepted_agreement_version: value.accepted_agreement_version === null || value.accepted_agreement_version === undefined ? null : numberValue(value.accepted_agreement_version),
    agreement_version: value.agreement_version === null || value.agreement_version === undefined ? null : numberValue(value.agreement_version),
    accepted_amount: typeof value.accepted_amount === 'string' ? value.accepted_amount : undefined,
    accepted_currency: typeof value.accepted_currency === 'string' ? value.accepted_currency : undefined,
    funded_amount: value.funded_amount === null || value.funded_amount === undefined ? null : String(value.funded_amount),
    currency: String(value.currency ?? value.accepted_currency ?? 'USD'),
    status: value.status as EscrowStatus,
    funding_state: typeof value.funding_state === 'string' ? value.funding_state : undefined,
    provider_reference: typeof value.provider_reference === 'string' ? value.provider_reference : null,
    funded_at: typeof value.funded_at === 'string' ? value.funded_at : null,
    released_at: typeof value.released_at === 'string' ? value.released_at : null,
    settled_at: typeof value.settled_at === 'string' ? value.settled_at : null,
    created_at: String(value.created_at ?? ''),
    updated_at: String(value.updated_at ?? ''),
    amount: String(value.amount ?? value.accepted_amount ?? '0.00'),
    ledger_entries: Array.isArray(value.ledger_entries) ? value.ledger_entries.map(normalizeLedger) : [],
  }
}

function normalizeExecution(raw: unknown): ExecutionDto {
  const value = asRecord(raw)
  return {
    job_id: numberValue(value.job_id),
    job_status: value.job_status as JobStatus,
    execution_status: value.execution_status as ExecutionStatus,
    selected_agent_id: value.selected_agent_id === null || value.selected_agent_id === undefined ? null : numberValue(value.selected_agent_id),
    executor_agent_id: value.executor_agent_id === null || value.executor_agent_id === undefined ? null : numberValue(value.executor_agent_id),
    agreement_id: value.agreement_id === null || value.agreement_id === undefined ? null : numberValue(value.agreement_id),
    accepted_agreement_version: value.accepted_agreement_version === null || value.accepted_agreement_version === undefined ? null : numberValue(value.accepted_agreement_version),
    escrow_status: value.escrow_status === null || value.escrow_status === undefined ? null : value.escrow_status as EscrowStatus,
    executor_type: 'local_demo',
    can_start: Boolean(value.can_start),
    can_submit: Boolean(value.can_submit),
    can_verify: Boolean(value.can_verify),
    start_reason: String(value.start_reason ?? ''),
    submit_reason: String(value.submit_reason ?? ''),
    verify_reason: String(value.verify_reason ?? ''),
    started_at: typeof value.started_at === 'string' ? value.started_at : null,
    latest_submission_version: value.latest_submission_version === null || value.latest_submission_version === undefined ? null : numberValue(value.latest_submission_version),
    latest_verification_result: value.latest_verification_result === null || value.latest_verification_result === undefined ? null : value.latest_verification_result as VerificationDto['overall_result'],
  }
}

function normalizeSubmission(raw: unknown): SubmissionDto {
  const value = asRecord(raw)
  const metadata = asRecord(value.metadata)
  return {
    id: numberValue(value.id),
    job_id: numberValue(value.job_id),
    agent_id: numberValue(value.agent_id),
    version: numberValue(value.version),
    artifact_url: String(value.artifact_url ?? ''),
    content: typeof value.content === 'string' ? value.content : null,
    submitted_output: String(value.submitted_output ?? value.content ?? ''),
    evidence: asRecord(value.evidence),
    notes: typeof value.notes === 'string' ? value.notes : typeof metadata.notes === 'string' ? metadata.notes : null,
    status: value.status as SubmissionDto['status'],
    submitted_at: String(value.submitted_at ?? ''),
  }
}

function normalizeVerification(raw: unknown): VerificationDto {
  const value = asRecord(raw)
  const checks = Array.isArray(value.individual_checks) ? value.individual_checks.map((item) => {
    const check = asRecord(item)
    return {
      name: String(check.name ?? 'Check'),
      status: String(check.status ?? 'unknown'),
      passed: typeof check.passed === 'boolean' ? check.passed : undefined,
      explanation: String(check.explanation ?? ''),
      evidence: check.evidence,
    }
  }) : []
  return {
    id: numberValue(value.id),
    job_id: numberValue(value.job_id),
    submission_id: numberValue(value.submission_id),
    submission_version: numberValue(value.submission_version),
    status: value.status as VerificationDto['status'],
    overall_result: value.overall_result as VerificationDto['overall_result'],
    individual_checks: checks,
    reasons: Array.isArray(value.reasons) ? value.reasons.map(String) : [],
    evaluator_type: value.evaluator_type as VerificationDto['evaluator_type'],
    score: value.score === null || value.score === undefined ? null : String(value.score),
    feedback: asRecord(value.feedback),
    evaluated_at: typeof value.evaluated_at === 'string' ? value.evaluated_at : null,
    verified_at: typeof value.verified_at === 'string' ? value.verified_at : null,
  }
}

function normalizeEvent(raw: unknown): JobEventDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    job_id: value.job_id === null || value.job_id === undefined ? null : numberValue(value.job_id),
    actor_agent_id: value.actor_agent_id === null || value.actor_agent_id === undefined ? null : numberValue(value.actor_agent_id),
    event_type: String(value.event_type ?? ''),
    description: String(value.description ?? ''),
    data: asRecord(value.data),
    created_at: String(value.created_at ?? ''),
  }
}

function normalizeDispute(raw: unknown): DisputeDto {
  const value = asRecord(raw)
  return {
    id: numberValue(value.id),
    job_id: numberValue(value.job_id),
    escrow_id: value.escrow_id === null || value.escrow_id === undefined ? null : numberValue(value.escrow_id),
    raised_by_agent_id: numberValue(value.raised_by_agent_id),
    category: value.category as DisputeCategory,
    status: value.status as DisputeStatus,
    reason: String(value.reason ?? ''),
    description: String(value.description ?? ''),
    evidence: asRecord(value.evidence),
    submission_id: value.submission_id === null || value.submission_id === undefined ? null : numberValue(value.submission_id),
    verification_id: value.verification_id === null || value.verification_id === undefined ? null : numberValue(value.verification_id),
    previous_job_status: value.previous_job_status === null || value.previous_job_status === undefined ? null : value.previous_job_status as JobStatus,
    previous_escrow_status: value.previous_escrow_status === null || value.previous_escrow_status === undefined ? null : value.previous_escrow_status as EscrowStatus,
    resolution: value.resolution === null || value.resolution === undefined ? null : value.resolution as DisputeResolution,
    resolution_rationale: typeof value.resolution_rationale === 'string' ? value.resolution_rationale : null,
    resolved_by_operator: typeof value.resolved_by_operator === 'string' ? value.resolved_by_operator : null,
    created_at: String(value.created_at ?? ''),
    reviewed_at: typeof value.reviewed_at === 'string' ? value.reviewed_at : null,
    resolved_at: typeof value.resolved_at === 'string' ? value.resolved_at : null,
    updated_at: String(value.updated_at ?? ''),
    agreement_terms: asRecord(value.agreement_terms),
    job_requirements: asRecord(value.job_requirements),
    submission: value.submission ? normalizeSubmission(value.submission) : null,
    verification: value.verification ? normalizeVerification(value.verification) : null,
    events: Array.isArray(value.events) ? value.events.map(normalizeEvent) : [],
  }
}

function normalizeCandidate(raw: unknown, eligibleDefault = true): MatchingCandidateDto {
  const value = asRecord(raw)
  const breakdown = asRecord(value.breakdown)
  const compatibility = asRecord(value.compatibility)
  const contribution = (key: string, fallback: unknown) => {
    const component = asRecord(breakdown[key])
    return numberValue(compatibility[key] ?? component.contribution ?? fallback)
  }
  const reasons = Array.isArray(value.reasons) ? value.reasons.map(String) : Array.isArray(value.exclusion_reasons) ? value.exclusion_reasons.map(String) : []
  return {
    agent_id: numberValue(value.agent_id),
    agent_name: String(value.agent_name ?? ''),
    agent_external_id: typeof value.agent_external_id === 'string' ? value.agent_external_id : null,
    score: numberValue(value.score),
    matched_skills: Array.isArray(value.matched_skills) ? value.matched_skills.map(String) : [],
    missing_skills: Array.isArray(value.missing_skills) ? value.missing_skills.map(String) : [],
    compatibility: {
      skills: contribution('skills', 0),
      category: contribution('category', 0),
      availability_deadline: contribution('availability_deadline', 0),
      budget: contribution('budget', 0),
    },
    breakdown,
    explanation: String(value.explanation ?? ''),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    eligible: typeof value.eligible === 'boolean' ? value.eligible : eligibleDefault,
    exclusion_reasons: reasons,
    reasons,
  }
}

function normalizeMatching(raw: unknown): MatchingResponseDto {
  const value = asRecord(raw)
  const candidatesValue = value.candidates
  const excludedValue = value.excluded_agents
  if (!Array.isArray(candidatesValue) || !Array.isArray(excludedValue)) {
    throw new ApiError(502, 'matching response does not match the canonical API contract', raw)
  }
  const rawMetadata = asRecord(value.metadata)
  const runId = String(rawMetadata.run_id ?? value.run_id ?? '')
  const scoringVersion = String(rawMetadata.scoring_version ?? value.scoring_version ?? '')
  if (!runId || !scoringVersion) throw new ApiError(502, 'matching response does not match the canonical API contract', raw)
  const formulaRecord = asRecord(rawMetadata.scoring_formula ?? value.scoring_formula)
  const formula = {
    skills: numberValue(formulaRecord.skills, 50),
    category: numberValue(formulaRecord.category, 20),
    availability_deadline: numberValue(formulaRecord.availability_deadline, 20),
    budget: numberValue(formulaRecord.budget, 10),
  }
  return {
    job_id: numberValue(value.job_id),
    metadata: { run_id: runId, scoring_version: scoringVersion, scoring_formula: formula },
    candidates: candidatesValue.map((candidate) => normalizeCandidate(candidate, true)),
    excluded_agents: excludedValue.map((candidate) => normalizeCandidate(candidate, false)),
  }
}

function normalizeJobList(raw: unknown): JobListResponseDto {
  const value = asRecord(raw)
  return {
    items: Array.isArray(value.items) ? value.items.map(normalizeJob) : [],
    total: numberValue(value.total),
  }
}

function normalizeAgentList(raw: unknown): AgentListResponseDto {
  const value = asRecord(raw)
  return {
    items: Array.isArray(value.items) ? value.items.map(normalizeAgent) : [],
    total: numberValue(value.total),
  }
}

function normalizeMetrics(raw: unknown): DashboardMetricsDto {
  const value = asRecord(raw)
  const required = ['total_jobs', 'jobs_in_progress', 'completed_jobs', 'open_disputes', 'total_simulated_escrow_funded', 'total_simulated_escrow_settled']
  if (required.some((key) => !(key in value))) throw new ApiError(502, 'dashboard metrics response does not match the canonical API contract', raw)
  return {
    total_jobs: numberValue(value.total_jobs),
    jobs_in_progress: numberValue(value.jobs_in_progress),
    completed_jobs: numberValue(value.completed_jobs),
    open_disputes: numberValue(value.open_disputes),
    total_simulated_escrow_funded: String(value.total_simulated_escrow_funded),
    total_simulated_escrow_settled: String(value.total_simulated_escrow_settled),
  }
}

function normalizeExecutionDashboard(raw: unknown): DashboardExecutionDto {
  const value = asRecord(raw)
  return {
    jobs_running: numberValue(value.jobs_running),
    jobs_awaiting_submission: numberValue(value.jobs_awaiting_submission),
    jobs_awaiting_verification: numberValue(value.jobs_awaiting_verification),
    jobs_eligible_for_settlement: numberValue(value.jobs_eligible_for_settlement),
    recent_submissions: Array.isArray(value.recent_submissions) ? value.recent_submissions.map(normalizeSubmission) as DashboardExecutionDto['recent_submissions'] : [],
    recent_verifications: Array.isArray(value.recent_verifications) ? value.recent_verifications.map(normalizeVerification) as DashboardExecutionDto['recent_verifications'] : [],
  }
}

function normalizeSession(raw: unknown): DemoSessionDto {
  const value = asRecord(raw)
  if (typeof value.session_token !== 'string' || typeof value.expires_at !== 'string') throw new ApiError(502, 'demo session response does not match the canonical API contract', raw)
  return {
    session_token: value.session_token,
    expires_at: value.expires_at,
    max_jobs: numberValue(value.max_jobs, 3),
    synthetic_only: value.synthetic_only !== false,
    reset_note: typeof value.reset_note === 'string' ? value.reset_note : null,
  }
}

function withJsonBody(payload: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(payload) }
}

export const api = {
  async health(): Promise<HealthResponse> {
    return await request<HealthResponse>('/api/health') as HealthResponse
  },

  async startSession(): Promise<DemoSessionDto> {
    const session = normalizeSession(await rawRequest<unknown>('/api/demo/session', { method: 'POST' }))
    return storeSession(session)
  },

  async resetSession(token?: string): Promise<DemoSessionDto> {
    const session = normalizeSession(await rawRequest<unknown>('/api/demo/reset', withJsonBody({}), token ?? readStoredSession()?.session_token))
    return storeSession(session)
  },

  async agents(token?: string): Promise<AgentListResponseDto> {
    return normalizeAgentList(await request<unknown>('/api/v1/agents', {}, token))
  },

  async listAgents(token?: string): Promise<AgentListResponseDto> {
    return api.agents(token)
  },

  async agent(agentId: number, token?: string): Promise<AgentDetailDto> {
    return normalizeAgent(await request<unknown>(`/api/v1/agents/${agentId}`, {}, token))
  },

  async listJobs(token?: string): Promise<JobListResponseDto> {
    return normalizeJobList(await request<unknown>('/api/v1/jobs', {}, token))
  },

  async jobs(token?: string): Promise<JobListResponseDto> {
    return api.listJobs(token)
  },

  async job(jobId: number, token?: string): Promise<JobDetailDto> {
    return normalizeJob(await request<unknown>(`/api/v1/jobs/${jobId}`, {}, token))
  },

  async getJob(jobId: number, token?: string): Promise<JobDetailDto> {
    return api.job(jobId, token)
  },

  async createJob(payload: CreateJobPayload, token?: string): Promise<JobDetailDto> {
    return normalizeJob(await request<unknown>('/api/v1/jobs', withJsonBody(payload), token))
  },

  async dashboardMetrics(token?: string): Promise<DashboardMetricsDto> {
    return normalizeMetrics(await request<unknown>('/api/v1/dashboard/metrics', {}, token))
  },

  async getMetrics(token?: string): Promise<DashboardMetricsDto> {
    return api.dashboardMetrics(token)
  },

  async dashboardExecution(token?: string): Promise<DashboardExecutionDto> {
    return normalizeExecutionDashboard(await request<unknown>('/api/v1/dashboard/execution', {}, token))
  },

  async getExecutionMetrics(token?: string): Promise<DashboardExecutionDto> {
    return api.dashboardExecution(token)
  },

  async runMatching(jobId: number, token?: string): Promise<MatchingResponseDto> {
    return normalizeMatching(await request<unknown>(`/api/v1/jobs/${jobId}/matches`, withJsonBody({}), token))
  },

  async latestMatching(jobId: number, token?: string): Promise<MatchingResponseDto | null> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/matches`, {}, token)
    return result === null ? null : normalizeMatching(result)
  },

  async matchJob(jobId: number, token?: string): Promise<MatchingResponseDto> {
    return api.runMatching(jobId, token)
  },

  async selectMatchingAgent(jobId: number, agentId: number, runId?: string, token?: string): Promise<JobDetailDto> {
    return normalizeJob(await request<unknown>(`/api/v1/jobs/${jobId}/matches/${agentId}/select`, withJsonBody(runId ? { run_id: runId } : {}), token))
  },

  async selectAgent(jobId: number, agentId: number, runId?: string, token?: string): Promise<JobDetailDto> {
    return api.selectMatchingAgent(jobId, agentId, runId, token)
  },

  async agreement(jobId: number, token?: string): Promise<AgreementDto | null> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/agreement`, {}, token)
    return result === null ? null : normalizeAgreement(result)
  },

  async getAgreement(jobId: number, token?: string): Promise<AgreementDto | null> {
    return api.agreement(jobId, token)
  },

  async createAgreement(jobId: number, payload: CreateAgreementPayload = {}, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/jobs/${jobId}/agreement`, withJsonBody(payload), token))
  },

  async agreementHistory(agreementId: number, token?: string): Promise<AgreementHistoryEntryDto[]> {
    const result = await request<unknown>(`/api/v1/agreements/${agreementId}/history`, {}, token)
    return Array.isArray(result) ? result.map((item) => asRecord(item) as AgreementHistoryEntryDto) : []
  },

  async submitAgreementRevision(agreementId: number, payload: SubmitAgreementRevisionPayload, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/agreements/${agreementId}/revise`, withJsonBody(payload), token))
  },

  async requestAgreementRevision(agreementId: number, rationale?: string, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/agreements/${agreementId}/revise`, withJsonBody({ action: 'request_revision', ...(rationale ? { rationale } : {}) }), token))
  },

  async acceptAgreement(agreementId: number, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/agreements/${agreementId}/accept`, withJsonBody({}), token))
  },

  async rejectAgreement(agreementId: number, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/agreements/${agreementId}/reject`, withJsonBody({}), token))
  },

  async cancelAgreement(agreementId: number, token?: string): Promise<AgreementDto> {
    return normalizeAgreement(await request<unknown>(`/api/v1/agreements/${agreementId}/cancel`, withJsonBody({}), token))
  },

  async jobEscrow(jobId: number, token?: string): Promise<EscrowDto | null> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/escrow`, {}, token)
    return result === null ? null : normalizeEscrow(result)
  },

  async getEscrow(jobId: number, token?: string): Promise<EscrowDto | null> {
    return api.jobEscrow(jobId, token)
  },

  async fundDemoEscrow(jobId: number, token?: string): Promise<EscrowDto> {
    return normalizeEscrow(await request<unknown>(`/api/v1/jobs/${jobId}/escrow/fund`, withJsonBody({}), token))
  },

  async fundEscrow(jobId: number, token?: string): Promise<EscrowDto> {
    return api.fundDemoEscrow(jobId, token)
  },

  async escrowLedger(escrowId: number, token?: string): Promise<LedgerEntryDto[]> {
    const result = await request<unknown>(`/api/v1/escrows/${escrowId}/ledger`, {}, token)
    return Array.isArray(result) ? result.map(normalizeLedger) : []
  },

  async releaseEscrow(escrowId: number, token?: string): Promise<EscrowDto> {
    return normalizeEscrow(await request<unknown>(`/api/v1/escrows/${escrowId}/release`, withJsonBody({}), token))
  },

  async execution(jobId: number, token?: string): Promise<ExecutionDto> {
    return normalizeExecution(await request<unknown>(`/api/v1/jobs/${jobId}/execution`, {}, token))
  },

  async getExecution(jobId: number, token?: string): Promise<ExecutionDto> {
    return api.execution(jobId, token)
  },

  async startExecution(jobId: number, token?: string): Promise<ExecutionDto> {
    return normalizeExecution(await request<unknown>(`/api/v1/jobs/${jobId}/start`, withJsonBody({}), token))
  },

  async submitJob(jobId: number, payload: SubmissionPayload, token?: string): Promise<SubmissionDto> {
    return normalizeSubmission(await request<unknown>(`/api/v1/jobs/${jobId}/submit`, withJsonBody(payload), token))
  },

  async submit(jobId: number, payload: SubmissionPayload, token?: string): Promise<SubmissionDto> {
    return api.submitJob(jobId, payload, token)
  },

  async submissions(jobId: number, token?: string): Promise<SubmissionDto[]> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/submissions`, {}, token)
    return Array.isArray(result) ? result.map(normalizeSubmission) : []
  },

  async listSubmissions(jobId: number, token?: string): Promise<SubmissionDto[]> {
    return api.submissions(jobId, token)
  },

  async verifyJob(jobId: number, token?: string): Promise<VerificationDto> {
    return normalizeVerification(await request<unknown>(`/api/v1/jobs/${jobId}/verify`, withJsonBody({}), token))
  },

  async verify(jobId: number, token?: string): Promise<VerificationDto> {
    return api.verifyJob(jobId, token)
  },

  async jobVerification(jobId: number, token?: string): Promise<VerificationDto | null> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/verification`, {}, token)
    return result === null ? null : normalizeVerification(result)
  },

  async getVerification(jobId: number, token?: string): Promise<VerificationDto | null> {
    return api.jobVerification(jobId, token)
  },

  async jobEvents(jobId: number, token?: string): Promise<JobEventDto[]> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/events`, {}, token)
    return Array.isArray(result) ? result.map(normalizeEvent) : []
  },

  async getEvents(jobId: number, token?: string): Promise<JobEventDto[]> {
    return api.jobEvents(jobId, token)
  },

  async disputes(status?: DisputeStatus, token?: string): Promise<DisputeDto[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const result = await request<unknown>(`/api/v1/disputes${query}`, {}, token)
    return Array.isArray(result) ? result.map(normalizeDispute) : []
  },

  async jobDisputes(jobId: number, token?: string): Promise<DisputeDto[]> {
    const result = await request<unknown>(`/api/v1/jobs/${jobId}/disputes`, {}, token)
    return Array.isArray(result) ? result.map(normalizeDispute) : []
  },

  async getDisputes(jobId: number, token?: string): Promise<DisputeDto[]> {
    return api.jobDisputes(jobId, token)
  },

  async dispute(disputeId: number, token?: string): Promise<DisputeDto> {
    return normalizeDispute(await request<unknown>(`/api/v1/disputes/${disputeId}`, {}, token))
  },

  async createDispute(jobId: number, payload: DisputeCreatePayload, token?: string): Promise<DisputeDto> {
    return normalizeDispute(await request<unknown>(`/api/v1/jobs/${jobId}/disputes`, withJsonBody(payload), token))
  },

  async reviewDispute(disputeId: number, rationale?: string, token?: string): Promise<DisputeDto> {
    return normalizeDispute(await request<unknown>(
      `/api/v1/disputes/${disputeId}/review`,
      { ...withJsonBody(rationale ? { rationale } : {}), headers: { 'X-Demo-Operator': DEMO_PUBLIC_ENABLED ? 'demo-session' : 'demo-operator' } },
      token,
    ))
  },

  async resolveDispute(disputeId: number, resolution: DisputeResolution, rationale: string, token?: string): Promise<DisputeDto> {
    const result = await request<unknown>(`/api/v1/disputes/${disputeId}/resolve`, { ...withJsonBody({ resolution, rationale }), headers: { 'X-Demo-Operator': DEMO_PUBLIC_ENABLED ? 'demo-session' : 'demo-operator' } }, token)
    return normalizeDispute(result)
  },
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const payload = asRecord(error.payload)
  const detail = payload.detail
  if (!Array.isArray(detail)) return {}
  const mapped: Record<string, string> = {}
  detail.forEach((item) => {
    const record = asRecord(item)
    const location = Array.isArray(record.loc) ? record.loc.map(String).filter((part) => part !== 'body') : []
    if (location.length > 0 && typeof record.msg === 'string') mapped[location.join('.')] = record.msg
  })
  return mapped
}
