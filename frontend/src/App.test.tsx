import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DashboardPage } from './pages/DashboardPage'
import { WorkspacePage } from './pages/WorkspacePage'

const healthResponse = {
  status: 'ok',
  service: 'auto-escrow-api',
  environment: 'development',
  timestamp: '2026-01-01T00:00:00Z',
}

const metricsResponse = {
  total_jobs: 12,
  jobs_in_progress: 3,
  completed_jobs: 7,
  open_disputes: 2,
  total_simulated_escrow_funded: '12500.50',
  total_simulated_escrow_settled: '8400.00',
}

const agentResponse = [
  { id: 1, external_id: 'atlas-writer', name: 'Atlas Writer', description: 'Drafts structured research briefs.', endpoint_url: null, status: 'active', availability: 'available', skills: ['research', 'writing'], task_categories: ['research'], supported_output_formats: ['json', 'markdown'], estimated_completion_minutes: 45, demo_performance_stats: { completed_jobs: 18, success_rate: 0.94 }, capabilities: ['research', 'writing'], metadata: { synthetic: true, cohort: 'phase-2' }, created_at: '2026-01-01T00:00:00Z' },
  { id: 2, external_id: 'ledger-reviewer', name: 'Ledger Reviewer', description: 'Reviews simulated escrow evidence.', endpoint_url: 'https://agents.example.test/ledger-reviewer', status: 'inactive', availability: 'busy', skills: ['verification', 'escrow'], task_categories: ['verification'], supported_output_formats: ['json'], estimated_completion_minutes: null, demo_performance_stats: { completed_jobs: 4, success_rate: 0.8 }, capabilities: ['verification', 'escrow'], metadata: { synthetic: false }, created_at: '2026-01-02T00:00:00Z' },
]

const jobResponse = {
  items: [{
    id: 1,
    public_id: 'job-free-001',
    requester_agent_id: null,
    executor_agent_id: null,
    selected_agent_id: null,
    title: 'Unassigned contract review',
    description: 'Review an API contract before agent selection.',
    required_skills: ['review', 'api'],
    task_category: 'software',
    expected_output: 'A structured JSON review.',
    acceptance_criteria: ['Findings are categorized', 'Output is valid JSON'],
    additional_instructions: 'Use only synthetic examples.',
    budget: '125.00',
    currency: 'USD',
    deadline: '2030-06-01T12:00:00+00:00',
    status: 'open',
    requirements: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }],
  total: 1,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => handler(String(input))))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Auto Escrow shell', () => {
  it('preserves the responsive shell and renders connected dashboard metrics', async () => {
    stubApi((url) => url.endsWith('/api/health') ? jsonResponse(healthResponse) : jsonResponse(metricsResponse))

    render(<App />)

    expect(screen.getByText('Coordinate AI work with clarity, before money moves.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Browse agents/i })).toBeInTheDocument()
    expect(await screen.findByText('Metrics loaded')).toBeInTheDocument()
    expect(await screen.findByText('API connected')).toBeInTheDocument()
  })
})

describe('DashboardPage', () => {
  it('renders persisted dashboard metrics returned by the API', async () => {
    stubApi((url) => url.endsWith('/api/v1/dashboard/metrics') ? jsonResponse(metricsResponse) : jsonResponse({}, 404))

    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Metrics loaded')).toBeInTheDocument()
    expect(screen.getByText('Total jobs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('$12,500.50')).toBeInTheDocument()
    expect(screen.getByText('$8,400.00')).toBeInTheDocument()
  })

  it('shows the persisted empty state when all metrics are zero', async () => {
    stubApi((url) => url.endsWith('/api/v1/dashboard/metrics') ? jsonResponse({
      total_jobs: 0,
      jobs_in_progress: 0,
      completed_jobs: 0,
      open_disputes: 0,
      total_simulated_escrow_funded: '0.00',
      total_simulated_escrow_settled: '0.00',
    }) : jsonResponse({}, 404))

    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('No persisted dashboard activity yet')).toBeInTheDocument()
    expect(screen.getAllByText('$0.00')).toHaveLength(2)
  })

  it('shows a visible API error and retry affordance when metrics fail', async () => {
    stubApi((url) => url.endsWith('/api/v1/dashboard/metrics') ? jsonResponse({ detail: 'Metrics service unavailable.' }, 503) : jsonResponse({}, 404))

    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Metrics service unavailable.')
    expect(screen.getByRole('button', { name: /Retry metrics request/i })).toBeInTheDocument()
  })

  it('reports a contract mismatch instead of translating a legacy metrics payload', async () => {
    stubApi((url) => url.endsWith('/api/v1/dashboard/metrics') ? jsonResponse({
      total_agents: 2,
      active_agents: 2,
      total_jobs: 1,
      open_jobs: 1,
      completed_jobs: 0,
      total_agreements: 1,
      total_escrows: 1,
      funded_escrow_amount: '75.00',
      released_escrow_amount: '0.00',
    }) : jsonResponse({}, 404))

    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('does not match the canonical API contract')
  })
})

describe('Agents workspace', () => {
  it('lists persisted agents and supports search and status filtering', async () => {
    const user = userEvent.setup()
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ items: agentResponse, total: 2 }) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)

    expect(await screen.findByText('Atlas Writer')).toBeInTheDocument()
    expect(screen.getByText('Synthetic demo profile')).toBeInTheDocument()
    expect(screen.getByText('Persisted registry profile')).toBeInTheDocument()
    expect(screen.getByText('Availability: Available')).toBeInTheDocument()
    expect(screen.getByText('45 minutes')).toBeInTheDocument()
    expect(screen.getByText('18 completed · 94% success')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search agents' }), 'ledger')
    expect(screen.queryByText('Atlas Writer')).not.toBeInTheDocument()
    expect(screen.getByText('Ledger Reviewer')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search agents' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'active')
    expect(screen.getByText('Atlas Writer')).toBeInTheDocument()
    expect(screen.queryByText('Ledger Reviewer')).not.toBeInTheDocument()
  })

  it('shows an honest empty state for an empty agent registry', async () => {
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ items: [], total: 0 }) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)

    expect(await screen.findByText('No persisted agents are available yet.')).toBeInTheDocument()
    expect(screen.getByText(/Synthetic demo profiles are not invented/)).toBeInTheDocument()
  })

  it('shows a visible API error when the agent registry fails', async () => {
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ detail: 'Agent registry unavailable.' }, 503) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent registry unavailable.')
  })

  it('renders requester-free jobs with the explicit task fields', async () => {
    stubApi((url) => url.endsWith('/api/v1/jobs') ? jsonResponse(jobResponse) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/jobs']}><WorkspacePage /></MemoryRouter>)

    expect(await screen.findByText('Unassigned contract review')).toBeInTheDocument()
    expect(screen.getByText('software')).toBeInTheDocument()
    expect(screen.getByText('A structured JSON review.')).toBeInTheDocument()
    expect(screen.getByText('No agent selected')).toBeInTheDocument()
  })
})
