import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DisputeDetailPage } from './pages/DisputeDetailPage'
import { DisputeCreatePage, DisputesPage } from './pages/DisputesPage'
import type { DisputeDto, SubmissionDto, VerificationDto } from './lib/api'

const job = {
  id: 17, public_id: 'job-phase9-017', requester_agent_id: 1, executor_agent_id: 4, selected_agent_id: 4,
  title: 'Prepare a report', description: 'A synthetic report task.', required_skills: ['testing'], task_category: 'verification',
  expected_output: 'A JSON report.', acceptance_criteria: ['Output must be valid JSON'], additional_instructions: null,
  budget: '250.00', currency: 'USD', deadline: '2030-06-01T12:00:00+00:00', status: 'completed', created_at: '2030-05-01T00:00:00+00:00', updated_at: '2030-05-04T00:00:00+00:00',
}

const escrow = { id: 8, job_id: 17, agreement_id: 6, funded_amount: '250.00', currency: 'USD', status: 'funded', provider_reference: null, funded_at: '2030-05-02T00:00:00+00:00', released_at: null, settled_at: null, created_at: '2030-05-02T00:00:00+00:00', updated_at: '2030-05-02T00:00:00+00:00', amount: '250.00', ledger_entries: [] }
const submission: SubmissionDto = { id: 21, job_id: 17, agent_id: 4, version: 1, artifact_url: 'local://submission/job/1', content: '{"summary":"done"}', submitted_output: '{"summary":"done"}', evidence: { source: 'fixture' }, notes: null, status: 'accepted', submitted_at: '2030-05-03T00:00:00+00:00' }
const verification: VerificationDto = { id: 31, job_id: 17, submission_id: 21, submission_version: 1, status: 'passed', overall_result: 'passed', individual_checks: [{ name: 'Valid JSON output', status: 'passed', passed: true, explanation: 'The output parses as JSON.', evidence: {} }], reasons: [], evaluator_type: 'automated', score: '100.00', feedback: {}, evaluated_at: '2030-05-03T00:00:00+00:00', verified_at: '2030-05-03T00:00:00+00:00' }
const baseDispute: DisputeDto = { id: 3, job_id: 17, escrow_id: 8, raised_by_agent_id: 4, category: 'failed_verification', status: 'open', reason: 'Review requested', description: 'Please review the submitted report against the agreement.', evidence: { source: 'fixture', claim: 'user-provided' }, submission_id: 21, verification_id: 31, previous_job_status: 'completed', previous_escrow_status: 'funded', resolution: null, resolution_rationale: null, resolved_by_operator: null, created_at: '2030-05-04T00:00:00+00:00', reviewed_at: null, resolved_at: null, updated_at: '2030-05-04T00:00:00+00:00', agreement_terms: { scope: 'Report', acceptance_criteria: ['Output must be valid JSON'] }, job_requirements: { title: job.title, expected_output: job.expected_output }, submission, verification, events: [{ id: 1, job_id: 17, actor_agent_id: 4, event_type: 'dispute.created', description: 'dispute.created', data: { dispute_id: 3 }, created_at: '2030-05-04T00:00:00+00:00' }] }

function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) { vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))) }
function renderList() { return render(<MemoryRouter initialEntries={['/disputes']}><Routes><Route path="/disputes" element={<DisputesPage />} /></Routes></MemoryRouter>) }
function renderDetail() { return render(<MemoryRouter initialEntries={['/disputes/3']}><Routes><Route path="/disputes/:disputeId" element={<DisputeDetailPage />} /></Routes></MemoryRouter>) }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Phase 9 disputes workflow', () => {
  it('renders dispute list and filters by persisted status', async () => {
    const rejected = { ...baseDispute, id: 4, status: 'rejected', resolution: 'reject', resolution_rationale: 'Not enough evidence.' }
    stubApi((url) => url.includes('?status=rejected') ? jsonResponse([rejected]) : jsonResponse([baseDispute, rejected]))
    renderList()
    expect((await screen.findAllByText('Job #17 · Failed verification')).length).toBe(2)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Filter status' }), 'rejected')
    expect(await screen.findByText('Dispute #4')).toBeInTheDocument()
    expect(screen.queryByText('Dispute #3')).not.toBeInTheDocument()
  })

  it('renders dispute evidence, agreement, submitted work, verification, and audit events', async () => {
    stubApi((url) => url.endsWith('/api/v1/disputes/3') ? jsonResponse(baseDispute) : jsonResponse({}, 404))
    renderDetail()
    expect(await screen.findByText('Dispute evidence')).toBeInTheDocument()
    expect(screen.getAllByText(/user-provided/)).not.toHaveLength(0)
    expect(screen.getByText('Accepted agreement and job requirements')).toBeInTheDocument()
    expect(screen.getByText('{"summary":"done"}')).toBeInTheDocument()
    expect(screen.getByText('Valid JSON output')).toBeInTheDocument()
    expect(screen.getByText('dispute.created')).toBeInTheDocument()
  })

  it('shows the demo operator actions and confirms a resolution before refreshing', async () => {
    const user = userEvent.setup()
    const resolved = { ...baseDispute, status: 'resolved' as const, resolution: 'refund' as const, resolution_rationale: 'The deliverable did not meet the accepted terms.', resolved_by_operator: 'demo-operator', resolved_at: '2030-05-04T01:00:00+00:00' }
    let current = baseDispute
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const requests: { url: string; init?: RequestInit }[] = []
    stubApi((url, init) => {
      requests.push({ url, init })
      if (url.endsWith('/api/v1/disputes/3/resolve')) { current = resolved; return jsonResponse(resolved) }
      return url.endsWith('/api/v1/disputes/3') ? jsonResponse(current) : jsonResponse([], 200)
    })
    renderDetail()
    expect(await screen.findByText('Demo resolution controls')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Review or resolution rationale'), { target: { value: 'The deliverable did not meet the accepted terms.' } })
    await user.click(screen.getByRole('button', { name: /Resolve: refund user/i }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText(/Dispute resolved with outcome: refund/)).toBeInTheDocument())
    const resolutionRequest = requests.find((request) => request.url.endsWith('/resolve'))
    expect(resolutionRequest?.init?.headers).toMatchObject({ 'X-Demo-Operator': 'demo-operator' })
    expect(screen.getByText('resolved')).toBeInTheDocument()
  })

  it('creates a dispute from a funded job and preserves API errors', async () => {
    const user = userEvent.setup()
    const requests: { url: string; body?: unknown }[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => {
      if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/disputes')) return jsonResponse(job)
      if (url.endsWith('/api/v1/jobs/17/escrow')) return jsonResponse(escrow)
      if (url.endsWith('/api/v1/jobs/17/disputes') && init?.method === 'POST') {
        requests.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined })
        return jsonResponse({ detail: 'Dispute service unavailable.' }, 503)
      }
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter initialEntries={['/jobs/17/disputes/new']}><Routes><Route path="/jobs/:jobId/disputes/new" element={<DisputeCreatePage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Protect the simulated escrow' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Reason'), 'Agreement concern')
    await user.type(screen.getByLabelText('Description'), 'The accepted deliverable needs formal review.')
    await user.click(screen.getByRole('button', { name: 'Open dispute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dispute service unavailable.')
    expect(requests[0].body).toMatchObject({ escrow_id: 8, raised_by_agent_id: 4, category: 'failed_verification' })
  })
})
