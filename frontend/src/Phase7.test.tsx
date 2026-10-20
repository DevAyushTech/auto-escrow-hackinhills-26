import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EscrowPage } from './pages/EscrowPage'

const job = {
  id: 17,
  public_id: 'job-phase7-017',
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
  status: 'assigned',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
}

const agreement = {
  id: 6,
  job_id: 17,
  requester_agent_id: 1,
  executor_agent_id: 4,
  proposed_budget: '250.00',
  proposed_deadline: '2030-06-01T12:00:00+00:00',
  currency: 'USD',
  status: 'accepted',
  proposal_version: 3,
  accepted_version: 3,
  terms: { scope: 'Prepare a checklist.' },
  proposal_history: [],
  amount: '250.00',
  created_at: '2030-05-01T12:00:00+00:00',
  updated_at: '2030-05-02T12:00:00+00:00',
  accepted_at: '2030-05-02T12:00:00+00:00',
}

const escrow = {
  id: 8,
  job_id: 17,
  agreement_id: 6,
  funded_amount: '250.00',
  currency: 'USD',
  status: 'funded',
  provider_reference: null,
  funded_at: '2030-05-03T12:00:00+00:00',
  released_at: null,
  settled_at: null,
  created_at: '2030-05-03T12:00:00+00:00',
  updated_at: '2030-05-03T12:00:00+00:00',
  amount: '250.00',
  ledger_entries: [],
}

const ledger = [{
  id: 11,
  escrow_id: 8,
  job_id: 17,
  idempotency_key: 'demo-ledger-key',
  entry_type: 'funding',
  amount: '250.00',
  currency: 'USD',
  reference: null,
  occurred_at: '2030-05-03T12:00:00+00:00',
}]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)))
}

function renderEscrow() {
  return render(<MemoryRouter initialEntries={['/jobs/17/escrow']}><Routes><Route path="/jobs/:jobId/escrow" element={<EscrowPage />} /></Routes></MemoryRouter>)
}

function baseHandler({ currentEscrow = null, ledgerEntries = [] as unknown[], events = [] as unknown[] }: { currentEscrow?: unknown | null; ledgerEntries?: unknown[]; events?: unknown[] } = {}) {
  return (url: string, _init?: RequestInit) => {
    if (url.endsWith('/api/v1/jobs/17')) return jsonResponse(job)
    if (url.endsWith('/api/v1/jobs/17/agreement')) return jsonResponse(agreement)
    if (url.endsWith('/api/v1/jobs/17/escrow')) return currentEscrow === null ? new Response(null, { status: 204 }) : jsonResponse(currentEscrow)
    if (url.endsWith('/api/v1/escrows/8/ledger')) return jsonResponse(ledgerEntries)
    if (url.endsWith('/api/v1/jobs/17/events')) return jsonResponse(events)
    return jsonResponse({}, 404)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Phase 7 professional simulated escrow', () => {
  it('renders an honest not-funded state with the accepted agreement summary and no fake hash', async () => {
    stubApi(baseHandler())
    renderEscrow()

    expect(await screen.findByRole('heading', { name: 'Escrow not funded' })).toBeInTheDocument()
    expect(screen.getByText('Accepted agreement')).toBeInTheDocument()
    expect(screen.getByText('Version')).toBeInTheDocument()
    expect(screen.getByText('250.00 USD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fund Demo Escrow' })).toBeInTheDocument()
    expect(screen.getByText('Simulated demo ledger — no real money or blockchain transfer')).toBeInTheDocument()
    expect(screen.queryByText(/0x|hash|transaction/i)).not.toBeInTheDocument()
  })

  it('does not offer funding for a non-accepted agreement', async () => {
    stubApi((url, init) => {
      if (url.endsWith('/agreement') && !init?.method) return jsonResponse({ ...agreement, status: 'proposed', accepted_version: null, accepted_at: null })
      return baseHandler()(url, init)
    })
    renderEscrow()

    expect(await screen.findByText('Funding is available only after the agreement is accepted.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fund Demo Escrow' })).not.toBeInTheDocument()
  })

  it('preserves a pending escrow as unfunded and offers backend reconciliation', async () => {
    const pending = { ...escrow, funded_amount: null, status: 'pending', funded_at: null, ledger_entries: [] }
    stubApi(baseHandler({ currentEscrow: pending }))
    renderEscrow()

    expect(await screen.findByRole('heading', { name: 'Pending escrow record' })).toBeInTheDocument()
    expect(screen.getByText('Not funded · USD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Demo Funding' })).toBeInTheDocument()
  })

  it('confirms funding, sends only idempotency data, and prevents duplicate submissions', async () => {
    const user = userEvent.setup()
    const requests: { url: string; method?: string; body?: Record<string, unknown> }[] = []
    let resolveFunding: ((response: Response) => void) | undefined
    const pendingFunding = new Promise<Response>((resolve) => { resolveFunding = resolve })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => {
      requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined })
      if (url.endsWith('/escrow/fund')) return pendingFunding
      return baseHandler()(url, init)
    })
    renderEscrow()

    const button = await screen.findByRole('button', { name: 'Fund Demo Escrow' })
    await user.click(button)
    await user.click(button)

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(requests.filter((request) => request.url.endsWith('/escrow/fund'))).toHaveLength(1)
    expect(requests.find((request) => request.url.endsWith('/escrow/fund'))?.body).toEqual({})
    expect(requests.find((request) => request.url.endsWith('/escrow/fund'))?.body).not.toHaveProperty('amount')
    expect(requests.find((request) => request.url.endsWith('/escrow/fund'))?.body).not.toHaveProperty('currency')
    expect(screen.getByRole('button', { name: 'Funding demo escrow…' })).toBeDisabled()

    resolveFunding?.(jsonResponse(escrow, 201))
  })

  it.each([200, 201])('shows success after an HTTP %s fund response and reloads persisted state', async (status) => {
    const user = userEvent.setup()
    let funded = false
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => {
      if (url.endsWith('/escrow/fund') && init?.method === 'POST') {
        funded = true
        return jsonResponse(escrow, status)
      }
      return baseHandler({ currentEscrow: funded ? escrow : null, ledgerEntries: funded ? ledger : [] })(url, init)
    })
    renderEscrow()

    await user.click(await screen.findByRole('button', { name: 'Fund Demo Escrow' }))
    expect(await screen.findByText('Demo escrow funding was accepted by the API. Refreshed persisted records are shown below.')).toBeInTheDocument()
    expect(await screen.findByText('Persisted escrow record')).toBeInTheDocument()
    expect(screen.getAllByText('Funded')).not.toHaveLength(0)
  })

  it('shows actionable funding errors and keeps the action available', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => init?.method === 'POST' ? jsonResponse({ detail: 'Agreement must be accepted before funding.' }, 409) : baseHandler()(url, init))
    renderEscrow()

    await user.click(await screen.findByRole('button', { name: 'Fund Demo Escrow' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Agreement must be accepted before funding.')
    expect(screen.getByRole('button', { name: 'Fund Demo Escrow' })).toBeInTheDocument()
  })

  it('renders ledger history and related audit events without claiming release', async () => {
    stubApi(baseHandler({ currentEscrow: escrow, ledgerEntries: ledger, events: [{ id: 1, job_id: 17, actor_agent_id: null, event_type: 'escrow.funded', description: 'Demo escrow was funded', data: {}, created_at: '2030-05-03T12:00:00+00:00' }] }))
    renderEscrow()

    expect(await screen.findByText('Persisted escrow record')).toBeInTheDocument()
    expect(screen.getByText('Ledger history')).toBeInTheDocument()
    expect(screen.getByText('Funding')).toBeInTheDocument()
    expect(screen.getByText('Demo escrow was funded')).toBeInTheDocument()
    expect(screen.getByText(/Escrow is funded. Continue toward execution and submission/)).toBeInTheDocument()
    expect(screen.queryByText(/released|settled/i)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/Job #17/)).not.toHaveLength(0))
  })
})
