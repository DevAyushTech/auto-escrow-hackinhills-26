import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgreementPage } from './pages/AgreementPage'

const job = {
  id: 17,
  public_id: 'job-phase6-017',
  requester_agent_id: 1,
  executor_agent_id: 4,
  selected_agent_id: 4,
  title: 'Prepare a release checklist',
  description: 'Review release inputs and prepare a concise checklist.',
  required_skills: ['release management', 'technical writing'],
  task_category: 'operations',
  expected_output: 'A markdown release checklist.',
  acceptance_criteria: ['Every release gate is listed'],
  additional_instructions: 'Use the current release notes.',
  budget: '250.00',
  currency: 'USD',
  deadline: '2030-06-01T12:00:00+00:00',
  status: 'open',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
}

const terms = {
  scope: 'Review release inputs and prepare the checklist.',
  expected_deliverable: 'A markdown release checklist.',
  acceptance_criteria: ['Every release gate is listed'],
  verification_method: 'Requester checks every gate against the release inputs.',
  cancellation_conditions: 'Cancel before work starts by mutual agreement.',
  dispute_conditions: 'Provide evidence of the unmet criterion for review.',
  instructions: 'Use the current release notes.',
}

const history = [
  { version: 1, action: 'proposal_created', status: 'proposed', proposed_budget: '250.00', currency: 'USD', terms, created_at: '2030-05-01T12:00:00+00:00' },
]

const agreement = {
  id: 6,
  job_id: 17,
  requester_agent_id: 1,
  executor_agent_id: 4,
  proposed_budget: '250.00',
  proposed_deadline: '2030-06-01T12:00:00+00:00',
  currency: 'USD',
  status: 'proposed',
  proposal_version: 2,
  accepted_version: null,
  terms,
  history,
  amount: '250.00',
  created_at: '2030-05-01T12:00:00+00:00',
  updated_at: '2030-05-01T12:00:00+00:00',
  accepted_at: null,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)))
}

function renderAgreement(initialEntry = '/jobs/17/agreement') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/jobs/:jobId/agreement" element={<AgreementPage />} /></Routes></MemoryRouter>)
}

function agreementRoute(url: string): boolean {
  return url.endsWith('/api/v1/jobs/17/agreement')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Phase 6 professional agreements', () => {
  it('renders a prefilled proposal form when the job has no agreement', async () => {
    stubApi((url) => {
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return new Response(null, { status: 204 })
      return jsonResponse({}, 404)
    })

    renderAgreement()

    expect(await screen.findByRole('heading', { name: 'Propose clear terms' })).toBeInTheDocument()
    expect(screen.getByLabelText('Budget')).toHaveValue(250)
    expect(screen.getByLabelText('Currency')).toHaveValue('USD')
    expect(screen.getByLabelText('Scope')).toHaveValue(job.description)
    expect(screen.getByLabelText('Expected deliverable')).toHaveValue(job.expected_output)
    expect(screen.getByLabelText('Acceptance criteria')).toHaveValue('Every release gate is listed')
    expect(screen.getAllByText('Demo mode')).not.toHaveLength(0)
  })

  it('creates a proposal only after client validation and a successful 201 response', async () => {
    const user = userEvent.setup()
    const requests: { url: string; method: string; body?: unknown }[] = []
    stubApi((url, init) => {
      if (init?.method === 'POST') {
        requests.push({ url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined })
        return jsonResponse(agreement, 201)
      }
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return new Response(null, { status: 204 })
      if (url.endsWith('/history')) return jsonResponse(history)
      return jsonResponse({}, 404)
    })

    renderAgreement()
    await user.click(await screen.findByRole('button', { name: 'Create agreement proposal' }))

    expect(await screen.findByText('Agreement proposal created and persisted.')).toBeInTheDocument()
    expect(requests[0]).toMatchObject({ url: 'http://localhost:8000/api/v1/jobs/17/agreement', method: 'POST' })
    expect(requests[0].body).toMatchObject({ proposed_budget: '250.00', currency: 'USD', terms: { scope: job.description, expected_deliverable: job.expected_output } })
    expect(requests[0].body).not.toHaveProperty('proposed_deadline')
    expect(screen.getByText('Current proposal')).toBeInTheDocument()
  })

  it('shows the backend error and keeps the proposal form available when create fails', async () => {
    const user = userEvent.setup()
    stubApi((url, init) => {
      if (init?.method === 'POST') return jsonResponse({ detail: 'Agreement service unavailable.' }, 503)
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return new Response(null, { status: 204 })
      return jsonResponse({}, 404)
    })

    renderAgreement()
    await user.click(await screen.findByRole('button', { name: 'Create agreement proposal' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agreement service unavailable.')
    expect(screen.getByRole('button', { name: 'Create agreement proposal' })).toBeInTheDocument()
  })

  it('requests a revision and submits revised terms through the backend', async () => {
    const user = userEvent.setup()
    const requests: { url: string; method: string; body?: unknown }[] = []
    const revisionRequested = { ...agreement, status: 'revision_requested', proposal_version: 2 }
    const revised = { ...agreement, status: 'proposed', proposal_version: 3, terms: { ...terms, scope: 'Review inputs and publish the checklist.' }, history: [...history, { ...history[0], version: 2, action: 'revision_submitted' }] }
    stubApi((url, init) => {
       requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return jsonResponse(agreement)
      if (url.endsWith('/history')) return jsonResponse(history)
       if (url.endsWith('/revise') && JSON.parse(String(init?.body ?? '{}')).action === 'request_revision') return jsonResponse(revisionRequested)
       if (url.endsWith('/revise') && JSON.parse(String(init?.body ?? '{}')).action === 'submit_revision') return jsonResponse(revised)
      return jsonResponse({}, 404)
    })

    renderAgreement()
    await user.click(await screen.findByRole('button', { name: 'Request revision' }))
    expect(await screen.findByText('Revision requested. Submit updated terms when ready.')).toBeInTheDocument()
    const scope = screen.getByLabelText('Scope')
    await user.clear(scope)
    await user.type(scope, 'Review inputs and publish the checklist.')
    await user.click(screen.getByRole('button', { name: 'Submit revised terms' }))

    expect(await screen.findByText('Revised agreement terms submitted and persisted.')).toBeInTheDocument()
    expect(requests).toContainEqual({ url: 'http://localhost:8000/api/v1/agreements/6/revise', method: 'POST', body: { action: 'request_revision' } })
    expect(requests.find((request) => (request.body as { action?: string } | undefined)?.action === 'submit_revision')).toMatchObject({ url: 'http://localhost:8000/api/v1/agreements/6/revise', method: 'POST', body: { action: 'submit_revision' } })
  })

  it('accepts only after confirmation and renders frozen terms without funding escrow', async () => {
    const user = userEvent.setup()
    const accepted = { ...agreement, status: 'accepted', accepted_version: 2, accepted_at: '2030-05-02T12:00:00+00:00' }
    const requests: { url: string; method: string }[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => {
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return jsonResponse(agreement)
      if (url.endsWith('/history')) return jsonResponse(history)
      if (url.endsWith('/accept')) return jsonResponse(accepted)
      return jsonResponse({}, 404)
    })

    renderAgreement()
    await user.click(await screen.findByRole('button', { name: 'Accept agreement' }))

    expect(await screen.findByText('Agreement accepted. Terms are now frozen.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Frozen agreement terms' })).toBeInTheDocument()
    expect(screen.getByText(/Terms are frozen after acceptance/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept agreement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request revision' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: escrow funding/ })).toBeInTheDocument()
    expect(requests.some(({ url }) => url.endsWith('/escrow'))).toBe(false)
  })

  it('renders persisted history and hides invalid controls for an accepted agreement', async () => {
    const accepted = { ...agreement, status: 'accepted', accepted_version: 2, accepted_at: '2030-05-02T12:00:00+00:00' }
    stubApi((url) => {
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
      if (agreementRoute(url)) return jsonResponse(accepted)
      if (url.endsWith('/history')) return jsonResponse([...history, { version: 2, action: 'accepted', status: 'accepted', created_at: '2030-05-02T12:00:00+00:00' }])
      return jsonResponse({}, 404)
    })

    renderAgreement()

    expect(await screen.findByText('Version 1 · proposal_created')).toBeInTheDocument()
    expect(screen.getByText('Version 2 · accepted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /agreement|revision|cancel/i })).not.toBeInTheDocument()
    expect(screen.getByText('A markdown release checklist.')).toBeInTheDocument()
  })
})
