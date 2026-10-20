import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecutionPage } from './pages/ExecutionPage'

const job = {
  id: 17,
  public_id: 'job-phase8-017',
  requester_agent_id: 1,
  executor_agent_id: 4,
  selected_agent_id: 4,
  title: 'Prepare a deterministic report',
  description: 'Prepare a report from synthetic inputs.',
  required_skills: ['testing'],
  task_category: 'verification',
  expected_output: 'A JSON report.',
  acceptance_criteria: ['Output must be valid JSON', 'Required fields: summary'],
  additional_instructions: 'Synthetic data only.',
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
  proposal_version: 1,
  accepted_version: 1,
  terms: { expected_deliverable: 'A JSON report.', acceptance_criteria: ['Output must be valid JSON', 'Required fields: summary'] },
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

const readyExecution = {
  job_id: 17,
  job_status: 'assigned',
  execution_status: 'ready',
  selected_agent_id: 4,
  executor_agent_id: 4,
  agreement_id: 6,
  accepted_agreement_version: 1,
  escrow_status: 'funded',
  executor_type: 'local_demo',
  can_start: true,
  can_submit: false,
  can_verify: false,
  start_reason: 'The accepted agreement, selected agent, and funded escrow are ready.',
  submit_reason: 'A submission is available only while execution is awaiting a result or a failed check allows a retry.',
  verify_reason: 'Verification is available after a new submission reaches the submitted state.',
  started_at: null,
  latest_submission_version: null,
  latest_verification_result: null,
}

const runningExecution = { ...readyExecution, job_status: 'in_progress', execution_status: 'awaiting_submission', can_start: false, can_submit: true }
const submittedExecution = { ...runningExecution, job_status: 'submitted', execution_status: 'awaiting_verification', can_submit: false, can_verify: true }
const submission = { id: 21, job_id: 17, agent_id: 4, version: 1, artifact_url: 'local://submission/job-phase8-017/1', content: '{"summary":"done"}', submitted_output: '{"summary":"done"}', evidence: { source: 'fixture' }, notes: null, status: 'pending', submitted_at: '2030-05-04T12:00:00+00:00' }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)))
}

function renderExecution() {
  return render(<MemoryRouter initialEntries={['/jobs/17/execution']}><Routes><Route path="/jobs/:jobId/execution" element={<ExecutionPage />} /></Routes></MemoryRouter>)
}

function baseHandler({ currentJob = job, currentExecution = readyExecution, currentSubmissions = [] as unknown[], currentVerification = null as unknown | null }: { currentJob?: unknown; currentExecution?: unknown; currentSubmissions?: unknown[]; currentVerification?: unknown | null } = {}) {
  return (url: string, _init?: RequestInit) => {
    if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/execution')) return jsonResponse(currentJob)
    if (url.endsWith('/api/v1/jobs/17/agreement')) return jsonResponse(agreement)
    if (url.endsWith('/api/v1/jobs/17/escrow')) return jsonResponse(escrow)
    if (url.endsWith('/api/v1/jobs/17/execution')) return jsonResponse(currentExecution)
    if (url.endsWith('/api/v1/jobs/17/submissions')) return jsonResponse(currentSubmissions)
    if (url.endsWith('/api/v1/jobs/17/verification')) return currentVerification === null ? new Response(null, { status: 204 }) : jsonResponse(currentVerification)
    return jsonResponse({}, 404)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Phase 8 execution and verification workflow', () => {
  it('renders persisted execution status and starts only after confirmation', async () => {
    const user = userEvent.setup()
    const requests: string[] = []
    const started = { ...runningExecution, started_at: '2030-05-04T12:00:00+00:00' }
    let current: Record<string, unknown> = readyExecution
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/start')) {
        requests.push(url)
        current = started
        return jsonResponse(started)
      }
      return baseHandler({ currentExecution: current, currentJob: current === readyExecution ? job : { ...job, status: 'in_progress' } })(url, init)
    })

    renderExecution()
    expect(await screen.findByText('Local demo executor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start execution' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start execution' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(1)
    expect(await screen.findByText(/Execution started. The backend recorded/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Submit work output' })).toBeInTheDocument()
  })

  it('validates evidence and preserves the draft after a submission API failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubApi((url, init) => init?.method === 'POST' && url.endsWith('/submit') ? jsonResponse({ detail: 'Submission service unavailable.' }, 503) : baseHandler({ currentJob: { ...job, status: 'in_progress' }, currentExecution: runningExecution })(url, init))
    renderExecution()

    const output = await screen.findByLabelText('Submitted output')
    await user.type(output, 'draft output')
    await user.clear(screen.getByLabelText('Structured evidence JSON'))
    fireEvent.change(screen.getByLabelText('Structured evidence JSON'), { target: { value: '{invalid' } })
    await user.click(screen.getByRole('button', { name: 'Submit for verification' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Expected property name")
    expect(screen.getByLabelText('Submitted output')).toHaveValue('draft output')

    await user.clear(screen.getByLabelText('Structured evidence JSON'))
    fireEvent.change(screen.getByLabelText('Structured evidence JSON'), { target: { value: '{}' } })
    await user.click(screen.getByRole('button', { name: 'Submit for verification' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Submission service unavailable.')
    expect(screen.getByLabelText('Submitted output')).toHaveValue('draft output')
  })

  it('submits output and renders a passing verification result after the backend responds', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const passed = { id: 31, job_id: 17, submission_id: 21, submission_version: 1, status: 'passed', overall_result: 'passed', individual_checks: [{ name: 'Valid JSON output', status: 'passed', passed: true, explanation: 'The output parses as JSON.', evidence: {} }], reasons: [], evaluator_type: 'automated', score: '100.00', feedback: { limitations: [] }, evaluated_at: '2030-05-04T12:00:00+00:00', verified_at: '2030-05-04T12:00:00+00:00' }
    let phase: 'running' | 'submitted' | 'completed' = 'running'
    stubApi((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/submit')) {
        phase = 'submitted'
        return jsonResponse(submission, 201)
      }
      if (init?.method === 'POST' && url.endsWith('/verify')) {
        phase = 'completed'
        return jsonResponse(passed)
      }
      if (phase === 'completed') return baseHandler({ currentJob: { ...job, status: 'completed' }, currentExecution: { ...submittedExecution, job_status: 'completed', execution_status: 'settlement_ready', can_verify: false }, currentSubmissions: [{ ...submission, status: 'accepted' }], currentVerification: passed })(url, init)
      if (phase === 'submitted') return baseHandler({ currentJob: { ...job, status: 'submitted' }, currentExecution: submittedExecution, currentSubmissions: [submission] })(url, init)
      return baseHandler({ currentJob: { ...job, status: 'in_progress' }, currentExecution: runningExecution })(url, init)
    })
    renderExecution()
    fireEvent.change(await screen.findByLabelText('Submitted output'), { target: { value: '{"summary":"done"}' } })
    await user.click(screen.getByRole('button', { name: 'Submit for verification' }))
    expect(await screen.findByText('Submission received and persisted. The backend now controls verification state.')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Verify latest submission' }))
    expect(await screen.findByText('Verification passed. The job is settlement-ready; escrow release remains a separate action.')).toBeInTheDocument()
    expect(await screen.findByText('Valid JSON output')).toBeInTheDocument()
    expect(screen.getByText('Settlement Ready')).toBeInTheDocument()
  })

  it('explains failed checks and manual-review outcomes', async () => {
    const failedVerification = { id: 32, job_id: 17, submission_id: 21, submission_version: 1, status: 'failed', overall_result: 'failed', individual_checks: [{ name: 'Required terms: approved', status: 'failed', passed: false, explanation: 'Required terms are missing from the output.', evidence: { missing_terms: ['approved'] } }], reasons: ['Required terms are missing from the output.'], evaluator_type: 'automated', score: '0.00', feedback: { limitations: [] }, evaluated_at: '2030-05-04T12:00:00+00:00', verified_at: '2030-05-04T12:00:00+00:00' }
    stubApi((url) => baseHandler({ currentJob: { ...job, status: 'under_review' }, currentExecution: { ...runningExecution, job_status: 'under_review', execution_status: 'retry_available', can_submit: true, latest_verification_result: 'failed' }, currentSubmissions: [submission], currentVerification: failedVerification })(url))
    renderExecution()
    expect(await screen.findByText('Required terms: approved')).toBeInTheDocument()
    expect(screen.getAllByText('Required terms are missing from the output.')).not.toHaveLength(0)
    expect(screen.getByText('Retry Available')).toBeInTheDocument()
  })

  it('shows an actionable API error instead of inventing execution data', async () => {
    stubApi((url) => url.endsWith('/api/v1/jobs/17/execution') ? jsonResponse({ detail: 'Execution service unavailable.' }, 503) : baseHandler()(url))
    renderExecution()
    expect(await screen.findByRole('alert')).toHaveTextContent('Execution service unavailable.')
    expect(screen.queryByRole('button', { name: 'Start execution' })).not.toBeInTheDocument()
  })
})
