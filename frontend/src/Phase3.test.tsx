import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentDetailPage } from './pages/AgentDetailPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { WorkspacePage } from './pages/WorkspacePage'

const agentResponse = [
  { id: 1, external_id: 'atlas-writer', name: 'Atlas Writer', description: 'Drafts structured research briefs.', endpoint_url: null, status: 'active', availability: 'available', skills: ['research', 'writing'], task_categories: ['research'], supported_output_formats: ['json', 'markdown'], estimated_completion_minutes: 45, demo_performance_stats: { completed_jobs: 18, success_rate: 0.94 }, capabilities: ['research', 'writing'], metadata: { synthetic: true, cohort: 'phase-3' }, created_at: '2026-01-01T00:00:00Z' },
  { id: 2, external_id: 'ledger-reviewer', name: 'Ledger Reviewer', description: 'Reviews simulated escrow evidence.', endpoint_url: 'https://agents.example.test/ledger-reviewer', status: 'inactive', availability: 'busy', skills: ['verification', 'escrow'], task_categories: ['verification'], supported_output_formats: ['json'], estimated_completion_minutes: null, demo_performance_stats: { completed_jobs: 4, success_rate: 0.8 }, capabilities: ['verification', 'escrow'], metadata: { synthetic: false }, created_at: '2026-01-02T00:00:00Z' },
  { id: 3, external_id: 'zephyr-analyst', name: 'Zephyr Analyst', description: 'Produces fast data analysis.', endpoint_url: null, status: 'active', availability: 'available', skills: ['analysis'], task_categories: ['analytics'], supported_output_formats: ['csv'], estimated_completion_minutes: 10, demo_performance_stats: { completed_jobs: 8, success_rate: 0.99 }, capabilities: ['analysis'], metadata: { synthetic: true }, created_at: '2026-01-03T00:00:00Z' },
]

const job = {
  id: 9,
  public_id: 'job-contract-009',
  requester_agent_id: null,
  executor_agent_id: null,
  selected_agent_id: null,
  title: 'Review the API contract',
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
  requirements: { source: 'fixture' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
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

describe('Phase 3 agent marketplace', () => {
  it('renders API agents, total count, and dynamic filter values', async () => {
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ items: agentResponse, total: 3 }) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)

    expect(await screen.findByText('Atlas Writer')).toBeInTheDocument()
    expect(screen.getByText('3 total agents')).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: 'research' })).not.toHaveLength(0)
    expect(screen.getByRole('option', { name: 'analytics' })).toBeInTheDocument()
    expect(screen.getAllByText('Synthetic demo')).not.toHaveLength(0)
    expect(screen.getAllByText(/Output formats:/)).not.toHaveLength(0)
  })

  it('searches names and skills and combines category and availability filters', async () => {
    const user = userEvent.setup()
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ items: agentResponse, total: 3 }) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)
    await screen.findByText('Atlas Writer')

    await user.type(screen.getByRole('searchbox', { name: 'Search agents' }), 'verification')
    expect(screen.getByText('Ledger Reviewer')).toBeInTheDocument()
    expect(screen.queryByText('Atlas Writer')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search agents' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by task category' }), 'research')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by availability' }), 'available')
    expect(screen.getByText('Atlas Writer')).toBeInTheDocument()
    expect(screen.queryByText('Zephyr Analyst')).not.toBeInTheDocument()
    expect(screen.queryByText('Ledger Reviewer')).not.toBeInTheDocument()
  })

  it('clears controlled filters and sorts by estimated completion and performance', async () => {
    const user = userEvent.setup()
    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ items: agentResponse, total: 3 }) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)
    await screen.findByText('Atlas Writer')

    await user.type(screen.getByRole('searchbox', { name: 'Search agents' }), 'Atlas')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by task category' }), 'research')
    expect(screen.getByText('1 results')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('3 results')).toBeInTheDocument()
    expect(screen.getByText('Ledger Reviewer')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort agents' }), 'estimated_completion')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('Zephyr Analyst')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort agents' }), 'performance')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('Zephyr Analyst')
  })

  it('shows loading, empty, and retryable error states', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    stubApi(() => new Promise<Response>((resolve) => { resolveRequest = resolve }))
    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)
    expect(screen.getByLabelText('Loading agents')).toBeInTheDocument()
    resolveRequest?.(jsonResponse({ items: [], total: 0 }))
    expect(await screen.findByText('No persisted agents are available yet.')).toBeInTheDocument()

    stubApi((url) => url.endsWith('/api/v1/agents') ? jsonResponse({ detail: 'Agent registry unavailable.' }, 503) : jsonResponse({}, 404))
    render(<MemoryRouter initialEntries={['/agents']}><WorkspacePage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent registry unavailable.')
    expect(screen.getByRole('button', { name: 'Retry agents request' })).toBeInTheDocument()
  })
})

describe('Phase 3 detail and job-selection routes', () => {
  it('fetches the agent detail using the route id', async () => {
    const requestedUrls: string[] = []
    stubApi((url) => {
      requestedUrls.push(url)
      return url.endsWith('/api/v1/agents/42') ? jsonResponse({ ...agentResponse[0], id: 42 }) : jsonResponse({}, 404)
    })

    render(<MemoryRouter initialEntries={['/agents/42']}><Routes><Route path="/agents/:agentId" element={<AgentDetailPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Atlas Writer' })).toBeInTheDocument()
    expect(requestedUrls).toContain('http://localhost:8000/api/v1/agents/42')
    expect(screen.getByText(/Seeded profiles are demo representations/)).toBeInTheDocument()
    expect(screen.getByText('cohort')).toBeInTheDocument()
  })

  it('shows a missing-agent error for a 404 detail response', async () => {
    stubApi((url) => url.endsWith('/api/v1/agents/404') ? jsonResponse({ detail: 'agent not found' }, 404) : jsonResponse({}, 404))

    render(<MemoryRouter initialEntries={['/agents/404']}><Routes><Route path="/agents/:agentId" element={<AgentDetailPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent not found')
    expect(screen.getByRole('link', { name: 'Return to marketplace' })).toHaveAttribute('href', '/agents')
  })

  it('selects an agent, shows the jobs banner, and can select an existing job', async () => {
    const user = userEvent.setup()
    stubApi((url) => {
      if (url.endsWith('/api/v1/agents')) return jsonResponse({ items: agentResponse, total: 3 })
      if (url.endsWith('/api/v1/jobs')) return jsonResponse({ items: [job], total: 1 })
      if (url.endsWith('/api/v1/jobs/9')) return jsonResponse(job)
      return jsonResponse({}, 404)
    })

    render(<MemoryRouter initialEntries={['/agents']}><Routes><Route path="/agents" element={<WorkspacePage />} /><Route path="/jobs" element={<WorkspacePage />} /><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
    await user.click(await screen.findByRole('link', { name: 'Select Atlas Writer for Job' }))
    expect(await screen.findByText('Agent #1 is selected for this job context.')).toBeInTheDocument()
    expect(screen.getByText(/Matching and agreement creation are not implemented yet/)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Select Review the API contract for the selected agent' }))
    expect(await screen.findByRole('heading', { name: 'Review the API contract' })).toBeInTheDocument()
    expect(screen.getByText(/Agent #1 was carried here from the marketplace selection/)).toBeInTheDocument()
  })

  it('fetches a job detail by id and renders missing-job errors', async () => {
    stubApi((url) => url.endsWith('/api/v1/jobs/9') ? jsonResponse(job) : jsonResponse({}, 404))
    render(<MemoryRouter initialEntries={['/jobs/9']}><Routes><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Review the API contract' })).toBeInTheDocument()
    expect(screen.getByText('A structured JSON review.')).toBeInTheDocument()
    expect(screen.getByText(/Matching and agreement creation are not implemented yet/)).toBeInTheDocument()

    stubApi((url) => url.endsWith('/api/v1/jobs/999') ? jsonResponse({ detail: 'job not found' }, 404) : jsonResponse({}, 404))
    render(<MemoryRouter initialEntries={['/jobs/999']}><Routes><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Job not found')
    expect(within(screen.getByRole('alert')).getByRole('link', { name: 'Return to jobs' })).toHaveAttribute('href', '/jobs')
  })
})
