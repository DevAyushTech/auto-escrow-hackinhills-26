import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobDetailPage } from './pages/JobDetailPage'
import { MatchingPage } from './pages/MatchingPage'

const job = {
  id: 17,
  public_id: 'job-phase5-017',
  requester_agent_id: null,
  executor_agent_id: null,
  selected_agent_id: null,
  title: 'Prepare a release checklist',
  description: 'Review release inputs and prepare a concise checklist.',
  required_skills: ['release management', 'technical writing'],
  task_category: 'operations',
  expected_output: 'A markdown release checklist.',
  acceptance_criteria: ['Every release gate is listed'],
  additional_instructions: null,
  budget: '250.00',
  currency: 'USD',
  deadline: '2030-06-01T12:00:00+00:00',
  status: 'open',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
}

const matchingResponse = {
  job_id: 17,
  metadata: {
    run_id: 'run-phase5-017',
    scoring_version: 'v1.0',
    scoring_formula: { skills: 50, category: 20, availability_deadline: 20, budget: 10 },
  },
  candidates: [
    {
      agent_id: 4,
      agent_name: 'Atlas Writer',
      agent_external_id: 'atlas-writer',
      score: 86,
      matched_skills: ['technical writing'],
      missing_skills: ['release management'],
      compatibility: { skills: 36, category: 20, availability_deadline: 18, budget: 8 },
      explanation: 'Strong writing fit with an acceptable delivery window.',
      warnings: ['One required skill is not listed.'],
    },
  ],
  excluded_agents: [
    { agent_id: 9, agent_name: 'Busy Reviewer', agent_external_id: null, reasons: ['Unavailable before the deadline.'] },
  ],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)))
}

function renderMatching(initialEntry = '/jobs/17/matching') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/jobs/:jobId/matching" element={<MatchingPage />} /><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Phase 5 matching workspace', () => {
  it('renders the job summary, scoring formula, candidate explanation, and run metadata', async () => {
    stubApi((url, init) => {
      if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches')) return jsonResponse(job)
      if (url.endsWith('/api/v1/jobs/17/matches') && init?.method === 'POST') return jsonResponse(matchingResponse)
      return jsonResponse({}, 404)
    })

    renderMatching()

    expect(await screen.findByRole('heading', { name: 'Prepare a release checklist' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scoring formula' })).toBeInTheDocument()
    expect(screen.getByText(/50.*points/)).toBeInTheDocument()
    expect(screen.getByText(/Run ID:/)).toBeInTheDocument()
    expect(screen.getByText('run-phase5-017')).toBeInTheDocument()
    expect(screen.getByText('v1.0')).toBeInTheDocument()
    expect(screen.getByText('Atlas Writer')).toBeInTheDocument()
    expect(screen.getByText('Strong writing fit with an acceptable delivery window.')).toBeInTheDocument()
  })

  it('shows score breakdown, matched and missing skills, warnings, and exclusions', async () => {
    stubApi((url, init) => url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches') ? jsonResponse(job) : init?.method === 'POST' ? jsonResponse(matchingResponse) : jsonResponse({}, 404))
    renderMatching()

    expect(await screen.findByText('86')).toBeInTheDocument()
    expect(screen.getByText('36 / 50')).toBeInTheDocument()
    expect(screen.getByText('18 / 20')).toBeInTheDocument()
    expect(screen.getByText('technical writing')).toBeInTheDocument()
    expect(screen.getByText('release management')).toBeInTheDocument()
    expect(screen.getByText('One required skill is not listed.')).toBeInTheDocument()
    expect(screen.getByText('Busy Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Unavailable before the deadline.')).toBeInTheDocument()
  })

  it('parses the backend fixed-point score and nested persisted breakdown shape', async () => {
    const persistedResponse = {
      job_id: 17,
      run_id: 'match-backend-shaped',
      scoring_version: 'phase5-v1',
      computed_at: '2026-01-01T00:00:00Z',
      candidates: [{
        agent_id: 4,
        agent_name: 'Atlas Writer',
        score: '95.00',
        matched_skills: ['release management', 'technical writing'],
        missing_skills: [],
        breakdown: {
          skills: { contribution: '50.00' },
          category: { contribution: '20.00' },
          availability_deadline: { contribution: '20.00' },
          budget: { contribution: '5.00' },
        },
        explanation: 'Persisted backend explanation.',
        warnings: ['Budget is unknown.'],
        eligible: true,
        exclusion_reasons: [],
      }],
      excluded_agents: [{ agent_id: 9, agent_name: 'Busy Reviewer', exclusion_reasons: ['agent is not available.'] }],
    }
    stubApi((url, init) => {
      if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches')) return jsonResponse(job)
      if (url.endsWith('/api/v1/jobs/17/matches') && init?.method === 'POST') return jsonResponse(persistedResponse)
      return jsonResponse({}, 404)
    })

    renderMatching()

    expect(await screen.findByText('Persisted backend explanation.')).toBeInTheDocument()
    expect(screen.getByText('50 / 50')).toBeInTheDocument()
    expect(screen.getByText('Busy Reviewer')).toBeInTheDocument()
  })

  it('renders an empty eligible state without any select action', async () => {
    const emptyResponse = { ...matchingResponse, candidates: [], excluded_agents: matchingResponse.excluded_agents }
    stubApi((url, init) => url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches') ? jsonResponse(job) : init?.method === 'POST' ? jsonResponse(emptyResponse) : jsonResponse({}, 404))
    renderMatching()

    expect(await screen.findByText('No eligible candidates')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Excluded agents' })).toBeInTheDocument()
  })

  it('shows matching API errors and retries the POST run', async () => {
    const user = userEvent.setup()
    let attempts = 0
    stubApi((url, init) => {
      if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches')) return jsonResponse(job)
      if (url.endsWith('/api/v1/jobs/17/matches') && init?.method === 'POST') {
        attempts += 1
        return attempts === 1 ? jsonResponse({ detail: 'Matching service unavailable.' }, 503) : jsonResponse(matchingResponse)
      }
      return jsonResponse({}, 404)
    })
    renderMatching()

    expect(await screen.findByRole('alert')).toHaveTextContent('Matching service unavailable.')
    await user.click(screen.getByRole('button', { name: 'Retry matching' }))
    expect(await screen.findByText('Atlas Writer')).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('reports a canonical contract error for malformed matching data', async () => {
    stubApi((url, init) => url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches') ? jsonResponse(job) : init?.method === 'POST' ? jsonResponse({ candidates: [] }) : jsonResponse({}, 404))
    renderMatching()

    expect(await screen.findByRole('alert')).toHaveTextContent('matching response does not match the canonical API contract')
  })

  it('posts selection, then navigates to the persisted job with a success banner', async () => {
    const user = userEvent.setup()
    const requests: { url: string; method: string }[] = []
    const selectedJob = { ...job, selected_agent_id: 4 }
    stubApi((url, init) => {
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url.endsWith('/api/v1/jobs/17') && !url.endsWith('/matches')) return jsonResponse(selectedJob)
      if (url.endsWith('/api/v1/jobs/17/matches') && init?.method === 'POST') return jsonResponse(matchingResponse)
      if (url.endsWith('/api/v1/jobs/17/matches/4/select') && init?.method === 'POST') return jsonResponse({ job_id: 17, selected_agent_id: 4, status: 'selected', message: 'Agent selected.' })
      if (url.endsWith('/agreement') || url.endsWith('/escrow')) return new Response(null, { status: 204 })
      if (url.endsWith('/events')) return jsonResponse([])
      return jsonResponse({}, 404)
    })
    renderMatching()

    await user.click(await screen.findByRole('button', { name: 'Select Atlas Writer' }))
    expect(await screen.findByText('Agent selected successfully')).toBeInTheDocument()
    expect(requests).toContainEqual({ url: 'http://localhost:8000/api/v1/jobs/17/matches/4/select', method: 'POST' })
  })

  it('renders the persisted selected agent and selection success banner on job detail', async () => {
    stubApi((url) => {
      if (url.endsWith('/api/v1/jobs/17')) return jsonResponse({ ...job, selected_agent_id: 4 })
      if (url.endsWith('/agreement') || url.endsWith('/escrow')) return new Response(null, { status: 204 })
      if (url.endsWith('/events')) return jsonResponse([])
      return jsonResponse({}, 404)
    })
    render(<MemoryRouter initialEntries={['/jobs/17?selected=1']}><Routes><Route path="/jobs/:jobId" element={<JobDetailPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByText('Agent selected successfully')).toBeInTheDocument()
    expect(screen.getAllByText('Agent #4').length).toBeGreaterThan(0)
    expect(screen.getByText('selected_agent_id')).toBeInTheDocument()
    expect(screen.getByText('Agreement not created yet.')).toBeInTheDocument()
    expect(screen.getByText('Escrow not created yet.')).toBeInTheDocument()
  })
})
