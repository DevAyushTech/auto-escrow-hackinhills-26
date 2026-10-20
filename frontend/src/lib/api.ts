export type HealthResponse = {
  status: string
  service: string
  environment: string
  timestamp: string
}

export type AgentStatus = 'active' | 'inactive' | 'suspended'
export type AgentAvailability = 'available' | 'busy' | 'unavailable'

export type AgentMetadata = Record<string, unknown>

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
  /** Deprecated compatibility alias retained by the backend. */
  capabilities?: string[]
  /** Deprecated compatibility alias retained by the backend. */
  metadata?: AgentMetadata
  created_at: string
}

/** The detail endpoint currently returns the canonical agent summary shape. */
export type AgentDetailDto = AgentSummaryDto

export type AgentListResponseDto = {
  items: AgentSummaryDto[]
  total: number
}

export type DashboardMetricsDto = {
  total_jobs: number
  jobs_in_progress: number
  completed_jobs: number
  open_disputes: number
  total_simulated_escrow_funded: string
  total_simulated_escrow_settled: string
}

export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'submitted' | 'under_review' | 'completed' | 'disputed' | 'cancelled'

export type JobSummaryDto = {
  id: number
  public_id: string
  requester_agent_id: number | null
  executor_agent_id: number | null
  selected_agent_id: number | null
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
  /** Deprecated compatibility field retained by the backend. */
  requirements?: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** The detail endpoint currently returns the canonical job summary shape. */
export type JobDetailDto = JobSummaryDto

export type JobListResponseDto = {
  items: JobSummaryDto[]
  total: number
}

export type MatchingScoringFormulaDto = {
  skills: number
  category: number
  availability_deadline: number
  budget: number
}

export type MatchingMetadataDto = {
  run_id: string
  scoring_version: string
  scoring_formula: MatchingScoringFormulaDto
}

export type MatchingCompatibilityDto = {
  skills: number
  category: number
  availability_deadline: number
  budget: number
}

export type MatchingCandidateDto = {
  agent_id: number
  agent_name: string
  agent_external_id: string | null
  score: number
  matched_skills: string[]
  missing_skills: string[]
  compatibility: MatchingCompatibilityDto
  explanation: string
  warnings: string[]
}

export type ExcludedAgentDto = {
  agent_id: number
  agent_name: string
  agent_external_id: string | null
  reasons: string[]
}

export type MatchingResponseDto = {
  job_id: number
  metadata: MatchingMetadataDto
  candidates: MatchingCandidateDto[]
  excluded_agents: ExcludedAgentDto[]
}

export type AgentSelectionResponseDto = {
  job_id: number
  selected_agent_id: number
  status: string
  message: string | null
}

export const supportedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'] as const
export type SupportedCurrency = typeof supportedCurrencies[number]

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
  additional_instructions: string | null
}

export type JobListSort = 'newest' | 'deadline'

export type JobListQuery = {
  status?: JobStatus
  taskCategory?: string
  search?: string
  minBudget?: string | number
  maxBudget?: string | number
  sort?: JobListSort
  page?: number
  pageSize?: number
  skip?: number
  limit?: number
  requesterAgentId?: number
}

export type AgreementStatus = 'draft' | 'proposed' | 'revision_requested' | 'revision_pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled'

export type AgreementTermsDto = {
  scope?: string
  expected_deliverable?: string
  acceptance_criteria?: string[]
  verification_method?: string
  cancellation_conditions?: string
  dispute_conditions?: string
  instructions?: string | null
  [key: string]: unknown
}

export type AgreementHistoryEntryDto = {
  id?: number
  version?: number
  proposal_version?: number
  action?: string
  event_type?: string
  status?: AgreementStatus
  proposed_budget?: string
  proposed_deadline?: string | null
  currency?: string
  terms?: AgreementTermsDto
  reason?: string | null
  actor_agent_id?: number | null
  created_at?: string
  occurred_at?: string
  [key: string]: unknown
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
  proposal_version?: number
  accepted_version?: number | null
  history?: AgreementHistoryEntryDto[]
  proposal_history: AgreementHistoryEntryDto[]
  amount: string
  created_at: string
  updated_at: string
  accepted_at: string | null
}

export type AgreementTermsPayload = {
  scope: string
  expected_deliverable: string
  acceptance_criteria: string[]
  verification_method: string
  cancellation_conditions: string
  dispute_conditions: string
  instructions?: string | null
}

export type CreateAgreementPayload = {
  proposed_budget: string
  proposed_deadline?: string
  currency: SupportedCurrency
  terms: AgreementTermsPayload
}

export type SubmitAgreementRevisionPayload = CreateAgreementPayload
export type AgreementHistoryDto = AgreementHistoryEntryDto[]
export type AgreementAction = 'request_revision' | 'submit_revision' | 'accept' | 'reject' | 'cancel'
export type AgreementActionResponseDto = AgreementDto

export type EscrowStatus = 'pending' | 'funded' | 'held' | 'released' | 'refunded' | 'disputed'

export type LedgerEntryType = 'funding' | 'deposit' | 'hold' | 'release' | 'refund' | 'fee'

export type LedgerEntryDto = {
  id: number
  escrow_id: number
  /** Optional on older ledger responses that only identify the escrow. */
  job_id?: number | null
  idempotency_key: string
  /** `deposit` is retained for compatibility with the legacy escrow response. */
  entry_type: LedgerEntryType
  amount: string
  currency: string
  reference: string | null
  occurred_at: string
}

export type EscrowDto = {
  id: number
  job_id: number
  agreement_id: number
  funded_amount: string
  currency: string
  status: EscrowStatus
  provider_reference: string | null
  funded_at: string | null
  released_at: string | null
  settled_at: string | null
  created_at: string
  updated_at: string
  amount: string
  ledger_entries: LedgerEntryDto[]
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

export class ApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorPayloadMessage(payload: unknown): { message?: string; code?: string; details?: unknown } {
  if (!isRecord(payload)) return {}
  const detail = payload.detail
  const message = typeof payload.message === 'string' ? payload.message : typeof detail === 'string' ? detail : undefined
  const code = typeof payload.code === 'string' ? payload.code : typeof payload.error_code === 'string' ? payload.error_code : undefined
  return { message, code, details: detail && typeof detail !== 'string' ? detail : undefined }
}

async function request<T>(path: string, options?: RequestInit, expectedStatus?: number): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { Accept: 'application/json', ...options?.headers },
      signal: controller.signal,
    })

    let payload: unknown
    try {
      payload = response.status === 204 ? undefined : await response.json()
    } catch {
      throw new ApiError('The API returned an invalid JSON response.', response.status)
    }

    if (!response.ok) {
      const apiError = errorPayloadMessage(payload)
      throw new ApiError(apiError.message ?? `API request failed with status ${response.status}.`, response.status, apiError.code, apiError.details)
    }

    if (expectedStatus !== undefined && response.status !== expectedStatus) {
      throw new ApiError(`The API returned HTTP ${response.status}; expected HTTP ${expectedStatus}.`, response.status)
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The API request timed out. Is the backend running?')
    }
    throw new ApiError('The backend is unreachable. Start the FastAPI server and try again.')
  } finally {
    window.clearTimeout(timeout)
  }
}

/** Convert FastAPI/Pydantic validation details into field-level messages. */
export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const details = error.details
  const errors: Record<string, string> = {}
  if (Array.isArray(details)) {
    details.forEach((item) => {
      if (!isRecord(item) || !Array.isArray(item.loc)) return
      const path = item.loc.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number').filter((part) => part !== 'body').join('.')
      const message = typeof item.msg === 'string' ? item.msg : 'This value is invalid.'
      if (path) errors[path] = message
    })
  } else if (isRecord(details)) {
    Object.entries(details).forEach(([key, value]) => {
      if (typeof value === 'string') errors[key] = value
      else if (Array.isArray(value) && typeof value[0] === 'string') errors[key] = value[0]
    })
  }
  return errors
}

function contractError(resource: string): ApiError {
  return new ApiError(`The ${resource} response does not match the canonical API contract.`)
}

function requiredString(value: unknown): value is string {
  return typeof value === 'string'
}

function requiredInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function requiredNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function numericValue(value: unknown): number | undefined {
  if (requiredNumber(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function requiredNullableInteger(value: unknown): value is number | null {
  return value === null || requiredInteger(value)
}

function requiredStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function requiredMetadata(value: unknown): value is AgentMetadata {
  return isRecord(value)
}

function parseAgentStatus(value: unknown): AgentStatus | undefined {
  return value === 'active' || value === 'inactive' || value === 'suspended' ? value : undefined
}

function parseAgentAvailability(value: unknown): AgentAvailability | undefined {
  return value === 'available' || value === 'busy' || value === 'unavailable' ? value : undefined
}

function parseAgent(value: unknown): AgentSummaryDto | undefined {
  if (!isRecord(value)) return undefined
  const status = parseAgentStatus(value.status)
  const availability = parseAgentAvailability(value.availability)
  const capabilities = value.capabilities
  const metadata = value.metadata
  if (!requiredInteger(value.id) || !requiredString(value.external_id) || !requiredString(value.name) || !requiredString(value.description) || (value.endpoint_url !== null && !requiredString(value.endpoint_url)) || !status || !availability || !requiredStringArray(value.skills) || !requiredStringArray(value.task_categories) || !requiredStringArray(value.supported_output_formats) || (value.estimated_completion_minutes !== null && !requiredInteger(value.estimated_completion_minutes)) || !requiredMetadata(value.demo_performance_stats) || (capabilities !== undefined && !requiredStringArray(capabilities)) || (metadata !== undefined && !requiredMetadata(metadata)) || !requiredString(value.created_at)) return undefined
  const agent: AgentSummaryDto = {
    id: value.id,
    external_id: value.external_id,
    name: value.name,
    description: value.description,
    endpoint_url: value.endpoint_url,
    status,
    availability,
    skills: value.skills,
    task_categories: value.task_categories,
    supported_output_formats: value.supported_output_formats,
    estimated_completion_minutes: value.estimated_completion_minutes,
    demo_performance_stats: value.demo_performance_stats,
    created_at: value.created_at,
  }
  if (capabilities !== undefined) agent.capabilities = capabilities
  if (metadata !== undefined) agent.metadata = metadata
  return agent
}

function parseAgentDetail(payload: unknown): AgentDetailDto {
  const agent = parseAgent(payload)
  if (!agent) throw contractError('agent')
  return agent
}

function parseAgents(payload: unknown): AgentListResponseDto {
  if (!isRecord(payload) || !Array.isArray(payload.items) || !requiredInteger(payload.total)) throw contractError('agents')
  const items = payload.items.map(parseAgent)
  if (items.some((item): item is undefined => item === undefined)) throw contractError('agents')
  return { items: items as AgentSummaryDto[], total: payload.total }
}

function parseDashboardMetrics(payload: unknown): DashboardMetricsDto {
  if (!isRecord(payload) || !requiredInteger(payload.total_jobs) || !requiredInteger(payload.jobs_in_progress) || !requiredInteger(payload.completed_jobs) || !requiredInteger(payload.open_disputes) || !requiredString(payload.total_simulated_escrow_funded) || !requiredString(payload.total_simulated_escrow_settled)) throw contractError('dashboard metrics')
  return {
    total_jobs: payload.total_jobs,
    jobs_in_progress: payload.jobs_in_progress,
    completed_jobs: payload.completed_jobs,
    open_disputes: payload.open_disputes,
    total_simulated_escrow_funded: payload.total_simulated_escrow_funded,
    total_simulated_escrow_settled: payload.total_simulated_escrow_settled,
  }
}

const jobStatuses: JobStatus[] = ['open', 'assigned', 'in_progress', 'submitted', 'under_review', 'completed', 'disputed', 'cancelled']

function parseJob(value: unknown): JobSummaryDto | undefined {
  if (!isRecord(value)) return undefined
  const requirements = value.requirements
  if (!requiredInteger(value.id) || !requiredString(value.public_id) || !requiredNullableInteger(value.requester_agent_id) || !requiredNullableInteger(value.executor_agent_id) || !requiredNullableInteger(value.selected_agent_id) || !requiredString(value.title) || !requiredString(value.description) || !requiredStringArray(value.required_skills) || !requiredString(value.task_category) || !requiredString(value.expected_output) || !requiredStringArray(value.acceptance_criteria) || (value.additional_instructions !== null && !requiredString(value.additional_instructions)) || !requiredString(value.budget) || !requiredString(value.currency) || !requiredString(value.deadline) || !jobStatuses.includes(value.status as JobStatus) || (requirements !== undefined && !isRecord(requirements)) || !requiredString(value.created_at) || !requiredString(value.updated_at)) return undefined
  const job: JobSummaryDto = {
    id: value.id,
    public_id: value.public_id,
    requester_agent_id: value.requester_agent_id,
    executor_agent_id: value.executor_agent_id,
    selected_agent_id: value.selected_agent_id,
    title: value.title,
    description: value.description,
    required_skills: value.required_skills,
    task_category: value.task_category,
    expected_output: value.expected_output,
    acceptance_criteria: value.acceptance_criteria,
    additional_instructions: value.additional_instructions,
    budget: value.budget,
    currency: value.currency,
    deadline: value.deadline,
    status: value.status as JobStatus,
    created_at: value.created_at,
    updated_at: value.updated_at,
  }
  if (requirements !== undefined) job.requirements = requirements
  return job
}

function parseJobDetail(payload: unknown): JobDetailDto {
  const job = parseJob(payload)
  if (!job) throw contractError('job')
  return job
}

function parseJobs(payload: unknown): JobListResponseDto {
  if (!isRecord(payload) || !Array.isArray(payload.items) || !requiredInteger(payload.total)) throw contractError('jobs')
  const items = payload.items.map(parseJob)
  if (items.some((item): item is undefined => item === undefined)) throw contractError('jobs')
  return { items: items as JobSummaryDto[], total: payload.total }
}

const agreementStatuses: AgreementStatus[] = ['draft', 'proposed', 'revision_requested', 'revision_pending', 'accepted', 'rejected', 'expired', 'cancelled']
const escrowStatuses: EscrowStatus[] = ['pending', 'funded', 'held', 'released', 'refunded', 'disputed']
const ledgerEntryTypes: LedgerEntryType[] = ['funding', 'deposit', 'hold', 'release', 'refund', 'fee']

/** Money values stay strings at the API boundary; reject exponent and unsafe decimal forms. */
function safeFixedPointString(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(value)
}

function parseAgreementHistoryEntry(value: unknown): AgreementHistoryEntryDto | undefined {
  if (!isRecord(value)) return undefined
  if (value.id !== undefined && !requiredInteger(value.id)) return undefined
  if (value.version !== undefined && !requiredInteger(value.version)) return undefined
  if (value.proposal_version !== undefined && !requiredInteger(value.proposal_version)) return undefined
  if (value.status !== undefined && !agreementStatuses.includes(value.status as AgreementStatus)) return undefined
  if (value.proposed_budget !== undefined && !requiredString(value.proposed_budget)) return undefined
  if (value.proposed_deadline !== undefined && value.proposed_deadline !== null && !requiredString(value.proposed_deadline)) return undefined
  if (value.currency !== undefined && !requiredString(value.currency)) return undefined
  if (value.terms !== undefined && !isRecord(value.terms)) return undefined
  if (value.reason !== undefined && value.reason !== null && !requiredString(value.reason)) return undefined
  if (value.actor_agent_id !== undefined && !requiredNullableInteger(value.actor_agent_id)) return undefined
  if (value.created_at !== undefined && !requiredString(value.created_at)) return undefined
  return value as AgreementHistoryEntryDto
}

function parseAgreementHistory(payload: unknown): AgreementHistoryEntryDto[] {
  const root = isRecord(payload) && payload.data !== undefined ? payload.data : payload
  const values = Array.isArray(root)
    ? root
    : isRecord(root)
      ? root.items ?? root.history ?? root.proposal_history
      : undefined
  if (!Array.isArray(values)) throw contractError('agreement history')
  const history = values.map(parseAgreementHistoryEntry)
  if (history.some((item): item is undefined => item === undefined)) throw contractError('agreement history')
  return history as AgreementHistoryEntryDto[]
}

function agreementResponseValue(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  if (isRecord(payload.agreement)) return payload.agreement
  if (isRecord(payload.data) && isRecord(payload.data.agreement)) return payload.data.agreement
  if (isRecord(payload.data)) return payload.data
  return payload
}

function parseAgreement(payload: unknown): AgreementDto {
  const root = agreementResponseValue(payload)
  if (!isRecord(root) || !requiredInteger(root.id) || !requiredInteger(root.job_id) || !requiredInteger(root.requester_agent_id) || !requiredInteger(root.executor_agent_id) || !safeFixedPointString(root.proposed_budget) || (root.proposed_deadline !== null && !requiredString(root.proposed_deadline)) || !requiredString(root.currency) || !agreementStatuses.includes(root.status as AgreementStatus) || !isRecord(root.terms) || !safeFixedPointString(root.amount) || !requiredString(root.created_at) || !requiredString(root.updated_at) || (root.accepted_at !== null && !requiredString(root.accepted_at))) throw contractError('agreement')
  const historyValue = root.history ?? root.proposal_history
  const history = historyValue === undefined ? [] : parseAgreementHistory(historyValue)
  if (root.proposal_version !== undefined && (!requiredInteger(root.proposal_version) || root.proposal_version < 1)) throw contractError('agreement')
  const acceptedVersion = root.accepted_version ?? root.accepted_agreement_version
  if (acceptedVersion !== undefined && acceptedVersion !== null && (!requiredInteger(acceptedVersion) || acceptedVersion < 1)) throw contractError('agreement')
  return {
    id: root.id,
    job_id: root.job_id,
    requester_agent_id: root.requester_agent_id,
    executor_agent_id: root.executor_agent_id,
    proposed_budget: root.proposed_budget,
    proposed_deadline: root.proposed_deadline,
    currency: root.currency,
    status: root.status as AgreementStatus,
    terms: root.terms as AgreementTermsDto,
    proposal_version: root.proposal_version as number | undefined,
    accepted_version: acceptedVersion as number | null | undefined,
    history,
    proposal_history: history,
    amount: root.amount,
    created_at: root.created_at,
    updated_at: root.updated_at,
    accepted_at: root.accepted_at,
  }
}

function parseLedgerEntry(value: unknown): LedgerEntryDto | undefined {
  if (!isRecord(value) || !requiredInteger(value.id) || !requiredInteger(value.escrow_id) || !requiredString(value.idempotency_key) || !ledgerEntryTypes.includes(value.entry_type as LedgerEntryType) || !safeFixedPointString(value.amount) || !requiredString(value.currency) || (value.reference !== null && value.reference !== undefined && !requiredString(value.reference)) || !requiredString(value.occurred_at)) return undefined
  if (value.job_id !== undefined && !requiredNullableInteger(value.job_id)) return undefined
  const entry: LedgerEntryDto = { id: value.id, escrow_id: value.escrow_id, idempotency_key: value.idempotency_key, entry_type: value.entry_type as LedgerEntryType, amount: value.amount, currency: value.currency, reference: value.reference === undefined ? null : value.reference, occurred_at: value.occurred_at }
  if (value.job_id !== undefined) entry.job_id = value.job_id
  return entry
}

function parseEscrow(payload: unknown): EscrowDto {
  const root = isRecord(payload) && isRecord(payload.escrow) ? payload.escrow : isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.escrow) ? payload.data.escrow : isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(root)) throw contractError('escrow')
  const fundedAmount = root.funded_amount ?? root.amount
  const amount = root.amount ?? root.funded_amount
  const ledgerEntriesValue = root.ledger_entries ?? []
  if (!requiredInteger(root.id) || !requiredInteger(root.job_id) || !requiredInteger(root.agreement_id) || !safeFixedPointString(fundedAmount) || !requiredString(root.currency) || !escrowStatuses.includes(root.status as EscrowStatus) || (root.provider_reference !== null && root.provider_reference !== undefined && !requiredString(root.provider_reference)) || (root.funded_at !== null && root.funded_at !== undefined && !requiredString(root.funded_at)) || (root.released_at !== null && root.released_at !== undefined && !requiredString(root.released_at)) || (root.settled_at !== null && root.settled_at !== undefined && !requiredString(root.settled_at)) || !requiredString(root.created_at) || !requiredString(root.updated_at) || !safeFixedPointString(amount) || !Array.isArray(ledgerEntriesValue)) throw contractError('escrow')
  const ledgerEntries = ledgerEntriesValue.map(parseLedgerEntry)
  if (ledgerEntries.some((item): item is undefined => item === undefined)) throw contractError('escrow')
  return { id: root.id, job_id: root.job_id, agreement_id: root.agreement_id, funded_amount: fundedAmount, currency: root.currency, status: root.status as EscrowStatus, provider_reference: root.provider_reference === undefined ? null : root.provider_reference, funded_at: root.funded_at === undefined ? null : root.funded_at, released_at: root.released_at === undefined ? null : root.released_at, settled_at: root.settled_at === undefined ? null : root.settled_at, created_at: root.created_at, updated_at: root.updated_at, amount, ledger_entries: ledgerEntries as LedgerEntryDto[] }
}

function parseLedger(payload: unknown): LedgerEntryDto[] {
  if (payload === undefined) return []
  const root = isRecord(payload) && payload.data !== undefined ? payload.data : payload
  const values = Array.isArray(root)
    ? root
    : isRecord(root)
      ? root.entries ?? root.items ?? root.ledger_entries ?? root.ledger
      : undefined
  if (!Array.isArray(values)) throw contractError('escrow ledger')
  const entries = values.map(parseLedgerEntry)
  if (entries.some((item): item is undefined => item === undefined)) throw contractError('escrow ledger')
  return entries as LedgerEntryDto[]
}

function parseJobEvents(payload: unknown): JobEventDto[] {
  if (!Array.isArray(payload)) throw contractError('job events')
  const events = payload.map((value) => {
    if (!isRecord(value) || !requiredInteger(value.id) || !requiredNullableInteger(value.job_id) || !requiredNullableInteger(value.actor_agent_id) || !requiredString(value.event_type) || !requiredString(value.description) || !isRecord(value.data) || !requiredString(value.created_at)) return undefined
    return { id: value.id, job_id: value.job_id, actor_agent_id: value.actor_agent_id, event_type: value.event_type, description: value.description, data: value.data, created_at: value.created_at }
  })
  if (events.some((item): item is undefined => item === undefined)) throw contractError('job events')
  return events as JobEventDto[]
}

const defaultMatchingFormula: MatchingScoringFormulaDto = {
  skills: 50,
  category: 20,
  availability_deadline: 20,
  budget: 10,
}

function optionalString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value : undefined
}

function matchingNumber(record: RecordValue, names: string[]): number | undefined {
  for (const name of names) {
    const parsed = numericValue(record[name])
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function parseMatchingFormula(value: unknown): MatchingScoringFormulaDto | undefined {
  if (value === undefined) return defaultMatchingFormula
  if (!isRecord(value)) return undefined
  const availability = matchingNumber(value, ['availability', 'availability_weight', 'availability_score'])
  const deadline = matchingNumber(value, ['deadline', 'deadline_weight', 'deadline_score'])
  const availabilityDeadline = matchingNumber(value, ['availability_deadline', 'availability_and_deadline', 'availability_deadline_weight']) ?? (availability !== undefined && deadline !== undefined ? availability + deadline : availability)
  const formula = {
    skills: matchingNumber(value, ['skills', 'skill_match', 'skills_weight', 'skill_match_weight']),
    category: matchingNumber(value, ['category', 'category_match', 'category_weight', 'category_match_weight']),
    availability_deadline: availabilityDeadline,
    budget: matchingNumber(value, ['budget', 'budget_weight', 'budget_match', 'budget_match_weight']),
  }
  return formula.skills !== undefined && formula.category !== undefined && formula.availability_deadline !== undefined && formula.budget !== undefined
    ? formula as MatchingScoringFormulaDto
    : undefined
}

function matchingAgentReference(value: unknown, fallbackId?: unknown, fallbackName?: unknown): { id: number; name: string; external_id: string | null } | undefined {
  if (isRecord(value) && requiredInteger(value.id) && requiredString(value.name)) {
    return { id: value.id, name: value.name, external_id: optionalString(value.external_id) ?? null }
  }
  if (requiredInteger(fallbackId) && requiredString(fallbackName)) {
    return { id: fallbackId, name: fallbackName, external_id: null }
  }
  return undefined
}

function parseMatchingCompatibility(value: unknown): MatchingCompatibilityDto | undefined {
  if (!isRecord(value)) return undefined
  const component = (names: string[]): number | undefined => {
    const direct = matchingNumber(value, names)
    if (direct !== undefined) return direct
    for (const name of names) {
      const nested = value[name]
      if (isRecord(nested)) {
        const contribution = matchingNumber(nested, ['contribution', 'weighted_contribution'])
        if (contribution !== undefined) return contribution
      }
    }
    return undefined
  }
  const availability = component(['availability', 'availability_score'])
  const deadline = component(['deadline', 'deadline_score'])
  const availabilityDeadline = component(['availability_deadline', 'availability_and_deadline', 'availability_deadline_score']) ?? (availability !== undefined && deadline !== undefined ? availability + deadline : availability)
  const compatibility = {
    skills: component(['skills', 'skill_match', 'skills_score', 'skill_match_score', 'skill_score']),
    category: component(['category', 'category_match', 'category_score', 'category_match_score']),
    availability_deadline: availabilityDeadline,
    budget: component(['budget', 'budget_score', 'budget_match', 'budget_match_score']),
  }
  return compatibility.skills !== undefined && compatibility.category !== undefined && compatibility.availability_deadline !== undefined && compatibility.budget !== undefined
    ? compatibility as MatchingCompatibilityDto
    : undefined
}

function parseMatchingCandidate(value: unknown): MatchingCandidateDto | undefined {
  if (!isRecord(value)) return undefined
  const agent = matchingAgentReference(value.agent, value.agent_id ?? value.id, value.agent_name ?? value.name)
  const compatibility = parseMatchingCompatibility(value.compatibility ?? value.breakdown ?? value.score_breakdown ?? value.compatibility_breakdown)
  const matchedSkills = value.matched_skills ?? value.skills_matched
  const missingSkills = value.missing_skills ?? value.skills_missing
  const warnings = value.warnings ?? []
  const score = numericValue(value.score ?? value.total_score)
  const explanation = value.explanation ?? value.reason
  if (!agent || !requiredNumber(score) || !requiredStringArray(matchedSkills) || !requiredStringArray(missingSkills) || !compatibility || !requiredString(explanation) || !requiredStringArray(warnings)) return undefined
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_external_id: agent.external_id,
    score,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    compatibility,
    explanation,
    warnings,
  }
}

function parseExcludedAgent(value: unknown): ExcludedAgentDto | undefined {
  if (!isRecord(value)) return undefined
  const agent = matchingAgentReference(value.agent, value.agent_id ?? value.id, value.agent_name ?? value.name)
  const reason = value.reason ?? value.exclusion_reason
  const reasons = value.reasons ?? value.exclusion_reasons ?? (reason === undefined ? undefined : [reason])
  if (!agent || !requiredStringArray(reasons)) return undefined
  return { agent_id: agent.id, agent_name: agent.name, agent_external_id: agent.external_id, reasons }
}

function parseMatching(payload: unknown): MatchingResponseDto {
  const root = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(root)) throw contractError('matching')
  const metadataSource = isRecord(root.metadata) ? root.metadata : isRecord(root.matching_metadata) ? root.matching_metadata : root
  const runId = root.run_id ?? metadataSource.run_id
  const scoringVersion = root.scoring_version ?? metadataSource.scoring_version
  const formulaValue = root.scoring_formula ?? root.scoring_weights ?? root.weights ?? metadataSource.scoring_formula ?? metadataSource.scoring_weights ?? metadataSource.weights ?? metadataSource.formula
  const formula = parseMatchingFormula(formulaValue)
  const candidatesValue = root.candidates ?? root.eligible_candidates
  const excludedValue = root.excluded_agents ?? root.excluded
  const jobId = root.job_id ?? metadataSource.job_id ?? (isRecord(root.job) ? root.job.id : undefined)
  if (!requiredInteger(jobId) || !requiredString(runId) || !requiredString(scoringVersion) || !formula || !Array.isArray(candidatesValue) || !Array.isArray(excludedValue)) throw contractError('matching')
  const candidates = candidatesValue.map(parseMatchingCandidate)
  const excludedAgents = excludedValue.map(parseExcludedAgent)
  if (candidates.some((item): item is undefined => item === undefined) || excludedAgents.some((item): item is undefined => item === undefined)) throw contractError('matching')
  return {
    job_id: jobId,
    metadata: { run_id: runId, scoring_version: scoringVersion, scoring_formula: formula },
    candidates: candidates as MatchingCandidateDto[],
    excluded_agents: excludedAgents as ExcludedAgentDto[],
  }
}

function parseAgentSelection(payload: unknown): AgentSelectionResponseDto {
  const rootValue = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  const root = isRecord(rootValue) && isRecord(rootValue.job) ? { ...rootValue, ...rootValue.job } : rootValue
  if (!isRecord(root)) throw contractError('agent selection')
  const jobId = root.job_id ?? root.id
  const selectedAgentId = root.selected_agent_id ?? root.agent_id ?? (isRecord(root.selected_agent) ? root.selected_agent.id : undefined)
  const status = root.status ?? 'selected'
  const message = root.message === undefined ? null : root.message
  if (!requiredInteger(jobId) || !requiredInteger(selectedAgentId) || !requiredString(status) || (message !== null && !requiredString(message))) throw contractError('agent selection')
  return { job_id: jobId, selected_agent_id: selectedAgentId, status, message }
}

function jobListSearchParams(query: JobListQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.taskCategory?.trim()) params.set('task_category', query.taskCategory.trim())
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.minBudget !== undefined && String(query.minBudget).trim()) params.set('min_budget', String(query.minBudget))
  if (query.maxBudget !== undefined && String(query.maxBudget).trim()) params.set('max_budget', String(query.maxBudget))
  if (query.sort) params.set('sort', query.sort)
  if (query.requesterAgentId !== undefined) params.set('requester_agent_id', String(query.requesterAgentId))
  if (query.skip !== undefined) params.set('skip', String(query.skip))
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.page !== undefined) {
    const pageSize = query.pageSize ?? query.limit ?? 100
    params.set('skip', String(Math.max(0, query.page - 1) * pageSize))
    if (query.pageSize !== undefined && query.limit === undefined) params.set('limit', String(query.pageSize))
  }
  return params.toString()
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  dashboardMetrics: () => request<unknown>('/api/v1/dashboard/metrics').then(parseDashboardMetrics),
  agents: () => request<unknown>('/api/v1/agents').then(parseAgents),
  agent: (agentId: number) => request<unknown>(`/api/v1/agents/${agentId}`).then(parseAgentDetail),
  createJob: (payload: CreateJobPayload) => request<unknown>('/api/v1/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 201).then(parseJobDetail),
  listJobs: (query: JobListQuery = {}) => {
    const search = jobListSearchParams(query)
    return request<unknown>(`/api/v1/jobs${search ? `?${search}` : ''}`).then(parseJobs)
  },
  /** Compatibility alias for existing callers; new code should use listJobs. */
  jobs: (query?: JobListQuery) => api.listJobs(query),
  job: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}`).then(parseJobDetail),
  runMatching: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/matches`, { method: 'POST' }).then(parseMatching),
  latestMatching: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/matches`).then(parseMatching),
  selectMatchingAgent: (jobId: number, agentId: number, runId?: string) => request<unknown>(`/api/v1/jobs/${jobId}/matches/${agentId}/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(runId ? { run_id: runId } : {}) }).then(parseAgentSelection),
  createAgreement: (jobId: number, payload: CreateAgreementPayload) => request<unknown>(`/api/v1/jobs/${jobId}/agreement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 201).then(parseAgreement),
  agreement: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/agreement`).then((payload) => payload === undefined ? null : parseAgreement(payload)),
  /** Compatibility alias retained for existing Phase 4/5 callers. */
  jobAgreement: (jobId: number) => api.agreement(jobId),
  agreementById: (agreementId: number) => request<unknown>(`/api/v1/agreements/${agreementId}`).then(parseAgreement),
  agreementHistory: (agreementId: number) => request<unknown>(`/api/v1/agreements/${agreementId}/history`).then(parseAgreementHistory),
  requestAgreementRevision: (agreementId: number, rationale?: string) => request<unknown>(`/api/v1/agreements/${agreementId}/revise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_revision', ...(rationale ? { rationale } : {}) }) }).then(parseAgreement),
  submitAgreementRevision: (agreementId: number, payload: SubmitAgreementRevisionPayload) => request<unknown>(`/api/v1/agreements/${agreementId}/revise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, action: 'submit_revision' }) }).then(parseAgreement),
  acceptAgreement: (agreementId: number) => request<unknown>(`/api/v1/agreements/${agreementId}/accept`, { method: 'POST' }).then(parseAgreement),
  rejectAgreement: (agreementId: number) => request<unknown>(`/api/v1/agreements/${agreementId}/reject`, { method: 'POST' }).then(parseAgreement),
  cancelAgreement: (agreementId: number) => request<unknown>(`/api/v1/agreements/${agreementId}/cancel`, { method: 'POST' }).then(parseAgreement),
  jobEscrow: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/escrow`).then((payload) => payload === undefined ? null : parseEscrow(payload)),
  fundDemoEscrow: (jobId: number, idempotencyKey?: string) => request<unknown>(`/api/v1/jobs/${jobId}/escrow/fund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) }).then(parseEscrow),
  escrowLedger: (escrowId: number) => request<unknown>(`/api/v1/escrows/${escrowId}/ledger`).then(parseLedger),
  jobEvents: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/events`).then(parseJobEvents),
}

export { baseUrl }
