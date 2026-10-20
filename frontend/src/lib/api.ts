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

export type AgreementStatus = 'draft' | 'proposed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'

export type AgreementDto = {
  id: number
  job_id: number
  requester_agent_id: number
  executor_agent_id: number
  proposed_budget: string
  proposed_deadline: string | null
  currency: string
  status: AgreementStatus
  terms: Record<string, unknown>
  proposal_history: Record<string, unknown>[]
  amount: string
  created_at: string
  updated_at: string
  accepted_at: string | null
}

export type EscrowStatus = 'pending' | 'funded' | 'held' | 'released' | 'refunded' | 'disputed'

export type LedgerEntryDto = {
  id: number
  escrow_id: number
  idempotency_key: string
  entry_type: 'deposit' | 'hold' | 'release' | 'refund' | 'fee'
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

const agreementStatuses: AgreementStatus[] = ['draft', 'proposed', 'accepted', 'rejected', 'expired', 'cancelled']
const escrowStatuses: EscrowStatus[] = ['pending', 'funded', 'held', 'released', 'refunded', 'disputed']
const ledgerEntryTypes: LedgerEntryDto['entry_type'][] = ['deposit', 'hold', 'release', 'refund', 'fee']

function parseAgreement(payload: unknown): AgreementDto {
  if (!isRecord(payload) || !requiredInteger(payload.id) || !requiredInteger(payload.job_id) || !requiredInteger(payload.requester_agent_id) || !requiredInteger(payload.executor_agent_id) || !requiredString(payload.proposed_budget) || (payload.proposed_deadline !== null && !requiredString(payload.proposed_deadline)) || !requiredString(payload.currency) || !agreementStatuses.includes(payload.status as AgreementStatus) || !isRecord(payload.terms) || !Array.isArray(payload.proposal_history) || payload.proposal_history.some((item) => !isRecord(item)) || !requiredString(payload.amount) || !requiredString(payload.created_at) || !requiredString(payload.updated_at) || (payload.accepted_at !== null && !requiredString(payload.accepted_at))) throw contractError('agreement')
  return {
    id: payload.id,
    job_id: payload.job_id,
    requester_agent_id: payload.requester_agent_id,
    executor_agent_id: payload.executor_agent_id,
    proposed_budget: payload.proposed_budget,
    proposed_deadline: payload.proposed_deadline,
    currency: payload.currency,
    status: payload.status as AgreementStatus,
    terms: payload.terms,
    proposal_history: payload.proposal_history as Record<string, unknown>[],
    amount: payload.amount,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
    accepted_at: payload.accepted_at,
  }
}

function parseLedgerEntry(value: unknown): LedgerEntryDto | undefined {
  if (!isRecord(value) || !requiredInteger(value.id) || !requiredInteger(value.escrow_id) || !requiredString(value.idempotency_key) || !ledgerEntryTypes.includes(value.entry_type as LedgerEntryDto['entry_type']) || !requiredString(value.amount) || !requiredString(value.currency) || (value.reference !== null && !requiredString(value.reference)) || !requiredString(value.occurred_at)) return undefined
  return { id: value.id, escrow_id: value.escrow_id, idempotency_key: value.idempotency_key, entry_type: value.entry_type as LedgerEntryDto['entry_type'], amount: value.amount, currency: value.currency, reference: value.reference, occurred_at: value.occurred_at }
}

function parseEscrow(payload: unknown): EscrowDto {
  if (!isRecord(payload) || !requiredInteger(payload.id) || !requiredInteger(payload.job_id) || !requiredInteger(payload.agreement_id) || !requiredString(payload.funded_amount) || !requiredString(payload.currency) || !escrowStatuses.includes(payload.status as EscrowStatus) || (payload.provider_reference !== null && !requiredString(payload.provider_reference)) || (payload.funded_at !== null && !requiredString(payload.funded_at)) || (payload.released_at !== null && !requiredString(payload.released_at)) || (payload.settled_at !== null && !requiredString(payload.settled_at)) || !requiredString(payload.created_at) || !requiredString(payload.updated_at) || !requiredString(payload.amount) || !Array.isArray(payload.ledger_entries)) throw contractError('escrow')
  const ledgerEntries = payload.ledger_entries.map(parseLedgerEntry)
  if (ledgerEntries.some((item): item is undefined => item === undefined)) throw contractError('escrow')
  return { id: payload.id, job_id: payload.job_id, agreement_id: payload.agreement_id, funded_amount: payload.funded_amount, currency: payload.currency, status: payload.status as EscrowStatus, provider_reference: payload.provider_reference, funded_at: payload.funded_at, released_at: payload.released_at, settled_at: payload.settled_at, created_at: payload.created_at, updated_at: payload.updated_at, amount: payload.amount, ledger_entries: ledgerEntries as LedgerEntryDto[] }
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
  jobAgreement: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/agreement`).then((payload) => payload === undefined ? null : parseAgreement(payload)),
  jobEscrow: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/escrow`).then((payload) => payload === undefined ? null : parseEscrow(payload)),
  jobEvents: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}/events`).then(parseJobEvents),
}

export { baseUrl }
