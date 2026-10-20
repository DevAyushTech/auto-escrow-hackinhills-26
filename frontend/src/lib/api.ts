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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  dashboardMetrics: () => request<unknown>('/api/v1/dashboard/metrics').then(parseDashboardMetrics),
  agents: () => request<unknown>('/api/v1/agents').then(parseAgents),
  agent: (agentId: number) => request<unknown>(`/api/v1/agents/${agentId}`).then(parseAgentDetail),
  jobs: () => request<unknown>('/api/v1/jobs').then(parseJobs),
  job: (jobId: number) => request<unknown>(`/api/v1/jobs/${jobId}`).then(parseJobDetail),
}

export { baseUrl }
