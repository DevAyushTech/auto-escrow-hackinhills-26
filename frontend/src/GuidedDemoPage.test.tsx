import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuidedDemoPage } from './pages/GuidedDemoPage'

const session = {
  session_token: 'demo-session-token',
  expires_at: '2030-06-01T12:00:00+00:00',
  max_jobs: 3,
  synthetic_only: true,
  reset_note: 'Synthetic records only.',
}

const agent = {
  id: 4,
  external_id: 'reviewer-4',
  name: 'Synthetic Reviewer',
  description: 'Reviews synthetic API contracts.',
  endpoint_url: null,
  status: 'active',
  availability: 'available',
  skills: ['review', 'testing'],
  task_categories: ['verification'],
  supported_output_formats: ['json'],
  estimated_completion_minutes: 20,
  demo_performance_stats: { completed_jobs: 8, success_rate: 0.95 },
  metadata: { synthetic: true },
  created_at: '2030-05-01T00:00:00+00:00',
}

const job = {
  id: 17,
  public_id: 'job-guided-017',
  requester_agent_id: null,
  executor_agent_id: null,
  selected_agent_id: null,
  selected_match_run_id: null,
  selected_matching_score: null,
  selected_scoring_version: null,
  title: 'Review a synthetic API contract',
  description: 'Return a structured review of a synthetic API contract and clearly identify any issues.',
  required_skills: ['review', 'testing'],
  task_category: 'verification',
  expected_output: 'A JSON review with a summary and status.',
  acceptance_criteria: ['Required JSON fields: summary, status', 'Required terms: approved, synthetic'],
  additional_instructions: 'Synthetic guided-demo task. Do not execute submitted code.',
  budget: '125.00',
  currency: 'USD',
  deadline: '2030-06-04T12:00:00+00:00',
  status: 'open',
  requirements: { synthetic: true },
  created_at: '2030-05-01T00:00:00+00:00',
  updated_at: '2030-05-01T00:00:00+00:00',
}

const matching = {
  job_id: 17,
  run_id: 'match-guided-1',
  scoring_version: 'phase5-v1',
  computed_at: '2030-05-01T00:01:00+00:00',
  candidates: [{ agent_id: 4, agent_name: 'Synthetic Reviewer', score: '94.00', matched_skills: ['verification', 'quality-control'], missing_skills: [], breakdown: { skills: { contribution: '50.00' }, category: { contribution: '20.00' }, availability_deadline: { contribution: '20.00' }, budget: { contribution: '5.00' } }, explanation: 'Strong skill and category match.', warnings: [], eligible: true, exclusion_reasons: [] }],
  excluded_agents: [],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderDemo() {
  return render(<MemoryRouter initialEntries={['/demo']}><Routes><Route path="/demo" element={<GuidedDemoPage />} /></Routes></MemoryRouter>)
}

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GuidedDemoPage', () => {
  it('boots an isolated session, loads agents, creates a job, and persists matching results', async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/api/demo/session')) return Promise.resolve(jsonResponse(session))
      if (url.endsWith('/api/v1/agents')) return Promise.resolve(jsonResponse({ items: [agent], total: 1 }))
      if (url.endsWith('/api/v1/jobs') && init?.method === 'POST') return Promise.resolve(jsonResponse(job, 201))
      if (url.endsWith('/api/v1/jobs/17/matches') && init?.method === 'POST') return Promise.resolve(jsonResponse(matching, 201))
      return Promise.resolve(jsonResponse({}, 404))
    }))

    renderDemo()
    expect(await screen.findByRole('heading', { name: 'Start with the capability, not the promise.' })).toBeInTheDocument()
    expect(screen.getByText('Synthetic Reviewer')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /Synthetic Reviewer/ }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue to job brief' }))
    expect(await screen.findByRole('heading', { name: 'Give the work a definition the system can verify.' })).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Create job and run matching' }))
    expect(await screen.findByRole('heading', { name: 'See why the backend ranked each candidate.' })).toBeInTheDocument()
    expect(screen.getByText('Strong skill and category match.')).toBeInTheDocument()

    const jobRequest = requests.find((request) => request.url.endsWith('/api/v1/jobs') && request.init?.method === 'POST')
    expect(jobRequest?.init?.headers).toMatchObject({ 'X-Demo-Session': 'demo-session-token' })
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/api/v1/jobs/17/matches'))).toBe(true))
  })
})
