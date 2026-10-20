import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './pages/DashboardPage'
import { CreateJobPage } from './pages/CreateJobPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { JobsPage } from './pages/JobsPage'

const job = {
  id: 17,
  public_id: 'job-phase4-017',
  requester_agent_id: null,
  executor_agent_id: null,
  selected_agent_id: 4,
  title: 'Prepare a release checklist',
  description: 'Review the release inputs and prepare a concise checklist.',
  required_skills: ['release management', 'technical writing'],
  task_category: 'operations',
  expected_output: 'A markdown release checklist.',
  acceptance_criteria: ['Every release gate is listed', 'Checklist is valid markdown'],
  additional_instructions: 'Use the current API contract.',
  budget: '250.00',
  currency: 'USD',
  deadline: '2030-06-01T12:00:00+00:00',
  status: 'open',
  requirements: {},
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
}

const secondJob = {
  ...job,
  id: 18,
  public_id: 'job-phase4-018',
  selected_agent_id: null,
  title: 'Verify a data export',
  description: 'Check an export for consistency.',
  task_category: 'verification',
  required_skills: ['quality assurance'],
  budget: '75.00',
  deadline: '2030-04-01T12:00:00+00:00',
  created_at: '2026-02-01T00:00:00+00:00',
}

const agreement = {
  id: 6,
  job_id: 17,
  requester_agent_id: 1,
  executor_agent_id: 4,
  proposed_budget: '250.00',
  proposed_deadline: '2030-06-01T12:00:00+00:00',
  currency: 'USD',
  status: 'proposed',
  terms: { deliverable: 'markdown' },
  proposal_history: [],
  amount: '250.00',
  created_at: '2026-01-02T00:00:00+00:00',
  updated_at: '2026-01-02T00:00:00+00:00',
  accepted_at: null,
}

const escrow = {
  id: 8,
  job_id: 17,
  agreement_id: 6,
  funded_amount: '250.00',
  currency: 'USD',
  status: 'funded',
  provider_reference: null,
  funded_at: '2026-01-03T00:00:00+00:00',
  released_at: null,
  settled_at: null,
  created_at: '2026-01-03T00:00:00+00:00',
  updated_at: '2026-01-03T00:00:00+00:00',
  amount: '250.00',
  ledger_entries: [],
}

const metrics = {
  total_jobs: 2,
  jobs_in_progress: 1,
  completed_jobs: 0,
  open_disputes: 0,
  total_simulated_escrow_funded: '250.00',
  total_simulated_escrow_settled: '0.00',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)))
}

function setFutureDeadline() {
  fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2030-06-01T12:00' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Phase 4 job creation', () => {
  it('shows field-level validation errors without calling the API', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><CreateJobPage /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: 'Create job' }))

    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByText('Detailed description is required.')).toBeInTheDocument()
    expect(screen.getByText('Task category is required.')).toBeInTheDocument()
    expect(screen.getByText('Acceptance criteria', { exact: true })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prevents duplicate submits and navigates only after HTTP 201', async () => {
    const user = userEvent.setup()
    let resolveCreate: ((response: Response) => void) | undefined
    const pendingCreate = new Promise<Response>((resolve) => { resolveCreate = resolve })
    const requests: { url: string; method: string }[] = []
    stubApi((url, init) => {
      requests.push({ url, method: init?.method ?? 'GET' })
      if (init?.method === 'POST') return pendingCreate
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (url.endsWith('/agreement') || url.endsWith('/escrow')) return new Response(null, { status: 204 })
      if (url.endsWith('/events')) return jsonResponse([])
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter initialEntries={['/jobs/new']}><Routes><Route path="/jobs/new" element={<CreateJobPage />} /><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Prepare a release checklist')
    await user.type(screen.getByRole('textbox', { name: 'Detailed description' }), 'Review release inputs.')
    await user.type(screen.getByRole('textbox', { name: 'Task category' }), 'operations')
    await user.type(screen.getByRole('textbox', { name: 'Expected deliverable' }), 'A markdown checklist.')
    await user.type(screen.getByRole('textbox', { name: 'Acceptance criteria' }), 'Every gate is listed')
    await user.type(screen.getByRole('spinbutton', { name: 'Budget' }), '250')
    setFutureDeadline()
    const submit = screen.getByRole('button', { name: 'Create job' })
    await user.click(submit)
    await user.click(submit)

    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Creating job…' })).toBeDisabled()
    expect(screen.queryByText('Job created successfully')).not.toBeInTheDocument()

    resolveCreate?.(jsonResponse(job, 201))
    expect(await screen.findByText('Job created successfully')).toBeInTheDocument()
  })

  it('maps API validation failures to fields and shows the server message', async () => {
    const user = userEvent.setup()
    stubApi((url, init) => init?.method === 'POST' ? jsonResponse({ detail: [{ loc: ['body', 'budget'], msg: 'Budget is too large.' }] }, 422) : jsonResponse({}, 404))
    render(<MemoryRouter><CreateJobPage /></MemoryRouter>)
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'A valid title')
    await user.type(screen.getByRole('textbox', { name: 'Detailed description' }), 'A valid description')
    await user.type(screen.getByRole('textbox', { name: 'Task category' }), 'software')
    await user.type(screen.getByRole('textbox', { name: 'Expected deliverable' }), 'A valid output')
    await user.type(screen.getByRole('textbox', { name: 'Acceptance criteria' }), 'It is complete')
    await user.type(screen.getByRole('spinbutton', { name: 'Budget' }), '50')
    setFutureDeadline()
    await user.click(screen.getByRole('button', { name: 'Create job' }))
    expect(await screen.findByText('Budget is too large.')).toBeInTheDocument()
    expect(screen.getByText('Budget is too large.')).toBeInTheDocument()
  })
})

describe('Phase 4 jobs registry and dashboard', () => {
  it('filters persisted jobs and provides an honest empty result', async () => {
    const user = userEvent.setup()
    stubApi((url) => url.endsWith('/api/v1/jobs') ? jsonResponse({ items: [job, secondJob], total: 2 }) : jsonResponse({}, 404))
    render(<MemoryRouter><JobsPage /></MemoryRouter>)
    expect((await screen.findAllByText('Prepare a release checklist')).length).toBeGreaterThan(0)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'verification')
    expect(screen.queryByText('Prepare a release checklist')).not.toBeInTheDocument()
    expect(screen.getByText('Verify a data export')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'does-not-exist')
    expect(screen.getByText('No jobs match those filters.')).toBeInTheDocument()
  })

  it('shows jobs API errors and can retry the list request', async () => {
    const user = userEvent.setup()
    let attempts = 0
    stubApi((url) => {
      if (!url.endsWith('/api/v1/jobs')) return jsonResponse({}, 404)
      attempts += 1
      return attempts === 1 ? jsonResponse({ detail: 'Job service unavailable.' }, 503) : jsonResponse({ items: [job], total: 1 })
    })
    render(<MemoryRouter><JobsPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Job service unavailable.')
    await user.click(screen.getByRole('button', { name: 'Retry jobs request' }))
    expect((await screen.findAllByText('Prepare a release checklist')).length).toBeGreaterThan(0)
  })

  it('renders recent jobs and upcoming deadlines from dashboard API data', async () => {
    stubApi((url) => {
      if (url.endsWith('/dashboard/metrics')) return jsonResponse(metrics)
      if (url.includes('/api/v1/jobs')) return jsonResponse({ items: [job, secondJob], total: 2 })
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect((await screen.findAllByText('Prepare a release checklist')).length).toBeGreaterThan(0)
    expect(screen.getByText('Agent #4')).toBeInTheDocument()
    expect(screen.getByText('Upcoming deadlines')).toBeInTheDocument()
    expect(screen.getAllByText('Verify a data export')).not.toHaveLength(0)
  })
})

describe('Phase 4 job detail related resources', () => {
  it('loads agreement, escrow, and audit event records and handles missing 204 resources', async () => {
    stubApi((url) => {
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (url.endsWith('/agreement')) return jsonResponse(agreement)
      if (url.endsWith('/escrow')) return jsonResponse(escrow)
      if (url.endsWith('/events')) return jsonResponse([{ id: 1, job_id: 17, actor_agent_id: null, event_type: 'job.created', description: 'Job was created', data: {}, created_at: '2026-01-01T00:00:00+00:00' }])
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter initialEntries={['/jobs/17']}><Routes><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('Proposed budget')).toBeInTheDocument()
    expect(screen.getAllByText('250.00 USD')).not.toHaveLength(0)
    expect(screen.getByText('Funded amount')).toBeInTheDocument()
    expect(screen.getByText('Job was created')).toBeInTheDocument()

    stubApi((url) => {
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (url.endsWith('/agreement') || url.endsWith('/escrow')) return new Response(null, { status: 204 })
      if (url.endsWith('/events')) return jsonResponse([])
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter initialEntries={['/jobs/17']}><Routes><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('Agreement not created yet.')).toBeInTheDocument()
    expect(screen.getByText('Escrow not created yet.')).toBeInTheDocument()
  })
})
