# Auto Escrow

Auto Escrow is a greenfield MVP for coordinating work between people and AI agents. It is designed around a transparent sequence: define a task, compare agents, agree on terms, verify a result, and only then settle a simulated escrow balance.

Phase 5 adds a deterministic, explainable agent matching engine on top of the Phase 4 job workflow. Phase 6 adds a persisted agreement negotiation flow: a selected agent can receive a typed proposal, request and submit revisions, accept/reject/cancel the proposal, and inspect append-only proposal history. Phase 7 adds a simulated escrow ledger: funding is derived from the accepted agreement, stored as an append-only ledger entry, and guarded from settlement until later verification exists. Phase 8 adds a backend-authoritative local demo execution boundary, immutable submission history, deterministic agreement-based verification, manual-review outcomes, retry limits, and settlement eligibility. Acceptance freezes the current terms, moves the job to `assigned`, and does not fund escrow.

## Current scope

Implemented:

- FastAPI application with OpenAPI docs at `/docs`.
- `GET /api/health` liveness endpoint.
- Environment-backed settings and local-origin CORS.
- SQLAlchemy 2 models with relationships, foreign keys, indexes, uniqueness constraints, and database checks.
- SQLite local database with PostgreSQL-compatible URL support.
- Alembic revisions `0001_phase1_foundation`, `0002_escrow_domain`, `0003_explicit_domain_fields`, `0004_optional_job_requester`, `0005_audit_event_description`, `0006_matching_results`, `0007_agreement_negotiation`, and `0008_simulated_escrow_lifecycle`.
- Decimal-safe `NUMERIC(18,2)` money fields and fixed-point API serialization.
- Validated Pydantic request/response contracts.
- Versioned FastAPI endpoints for agents, jobs, agreements, escrow lookup, audit activity, and persisted dashboard metrics.
- Repeatable synthetic demo seed data with six agents and optional jobs.
- Isolated backend tests using temporary SQLite databases.
- React frontend integration for real dashboard metrics, persisted agents, persisted jobs, loading states, empty states, filtering, and API errors.
- Agent marketplace with real API-backed search, skill/category/availability filters, sorting, clear filters, detail pages, and accessible selection navigation.
- Agent detail and job detail routes with missing-record handling and honest Phase 3 workflow boundaries.
- Job creation with backend-authoritative validation, Decimal-safe budgets, future deadlines, duplicate-submit prevention, and persisted success navigation.
- Job registry search, status/category/budget filters, sorting, pagination-ready API client, empty/error/retry states, and job details.
- Related agreement/escrow/event lookups with honest not-created states and persisted job audit timeline.
- Dashboard recent jobs and upcoming deadlines loaded from the jobs API.
- Deterministic Phase 5 matching runs with persisted scoring version, ranked candidates, component breakdowns, exclusions, and audit-backed agent selection.
- Phase 6 agreement proposals with typed scope, deliverable, acceptance, verification, cancellation, and dispute terms.
- Versioned agreement negotiation with request/submit revision actions, append-only history, terminal-state validation, audit events, and accepted-term freezing.
- Agreement workspace UI with proposal creation, validation, revision controls, acceptance/rejection/cancellation actions, history, retries, and demo-mode escrow boundary messaging.
- Simulated escrow funding with accepted-agreement amount derivation, append-only funding ledger entries, idempotency protection, escrow state validation, and guarded settlement/refund service endpoints.
- Escrow details UI with accepted agreement summary, funding confirmation, persisted ledger and audit history, loading/error states, and explicit no-real-money messaging.
- Local demo execution with accepted-agreement, selected-agent, funded-escrow, and lifecycle validation.
- Persistent versioned submissions with bounded output/evidence sizes, safe local artifact references, and audit events.
- Deterministic verification checks for JSON, fields, sections, terms, lengths, evidence, configured formats, and a safe JSON-schema subset.
- Backend-persisted failed and manual-review results, configurable retry limits, settlement-ready state, and recent execution dashboard data.
- Execution workspace UI with real API loading/error states, confirmation prompts, draft preservation, submission history, failed-check explanations, and manual-review messaging.
- Responsive navigation for Dashboard, Agents, Jobs, Escrow, Disputes, and Settings.

Not yet implemented:

- Dispute creation and demo-operator resolution.
- Authentication and production authorization.

The UI deliberately does not invent the remaining workflows or claim that a simulated ledger moves real money.

## Architecture

```text
AutoEscrow/
├── backend/
│   ├── app/
│   │   ├── api/                  # health and /api/v1 routers
│   │   ├── services/             # agent, job, agreement, escrow, audit, metrics logic
│   │   ├── config.py             # environment settings
│   │   ├── database.py           # SQLAlchemy engine and sessions
│   │   ├── models.py             # ORM domain models
│   │   ├── schemas.py            # Pydantic API contracts
│   │   ├── seed.py               # repeatable synthetic demo seed
│   │   └── main.py               # FastAPI app
│   ├── migrations/               # Alembic revisions
│   ├── tests/                    # isolated API/database tests
│   ├── requirements.txt
│   └── Makefile
├── frontend/
│   ├── src/components/           # shell, sidebar, status UI
│   ├── src/pages/                # dashboard, marketplace, agent/job details, workflow surfaces
│   ├── src/lib/api.ts            # typed client and response validation
│   └── package.json
├── .env.example
└── .gitignore
```

## Prerequisites

- Windows 10/11 with PowerShell.
- Python 3.11, pinned by `.python-version`.
- Node.js 22 LTS, pinned by `.nvmrc`.
- npm included with Node.js.

No paid service, cloud database, API key, or blockchain account is required.

## Environment variables

Root `.env.example`:

```text
APP_ENV=development
DATABASE_URL=sqlite:///./auto_escrow.db
FRONTEND_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
```

Backend also supports:

```text
TEST_DATABASE_URL=sqlite:///./test_auto_escrow.db
MAX_SUBMISSION_RETRIES=2
```

`TEST_DATABASE_URL` is used only when `APP_ENV=test`. A PostgreSQL-compatible deployment URL can be supplied as `DATABASE_URL`, for example:

```text
postgresql+psycopg://user:password@localhost/auto_escrow
```

Never place backend secrets in a `VITE_` variable. Never overwrite a real `.env` file when preparing local configuration.

## Windows PowerShell setup

Run these commands from the repository root. Open two PowerShell windows for the two services.

### Backend installation and migration

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
Set-Location backend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
python -m alembic upgrade head
```

If PowerShell activation is unavailable:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
```

### Seed six synthetic agents

From `backend`:

```powershell
python -m app.seed
```

To also seed two synthetic jobs:

```powershell
python -m app.seed --with-jobs
```

The command is idempotent. It updates deterministic demo records and does not create duplicates. It never resets or drops the database.

### Start the backend

From `backend`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Install and start the frontend

In the second PowerShell window:

```powershell
Set-Location frontend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm install
npm run dev
```

## Local URLs

- Frontend: <http://localhost:5173>
- API root: <http://localhost:8000>
- Health: <http://localhost:8000/api/health>
- OpenAPI docs: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/openapi.json>

The top-right API badge is driven by a real health request. Dashboard metrics and agent/job cards are driven by persisted API responses.

## Phase 2–5 API endpoints

All domain endpoints use the `/api/v1` prefix.

### Agents

- `GET /api/v1/agents?status=active&availability=available&skip=0&limit=100`
- `GET /api/v1/agents/{agent_id}`

Agent responses include skills, task categories, availability, supported output formats, estimated completion time, and synthetic demo performance statistics.

### Jobs

- `POST /api/v1/jobs`
- `GET /api/v1/jobs?status=open&skip=0&limit=100`
- `GET /api/v1/jobs/{job_id}`
- `GET /api/v1/jobs?status=open&task_category=software&search=contract&min_budget=50.00&max_budget=500.00&sort=deadline`

Example job creation payload:

```json
{
  "title": "Review a synthetic API contract",
  "description": "Return a structured review of the supplied contract.",
  "required_skills": ["review", "api"],
  "task_category": "software",
  "expected_output": "A structured JSON review.",
  "acceptance_criteria": ["Findings are categorized", "Output is valid JSON"],
  "budget": "125.00",
  "currency": "USD",
  "deadline": "2030-06-01T12:00:00Z",
  "additional_instructions": "Use synthetic examples only."
}
```

Budgets must be positive, currencies must be supported, and deadlines must be timezone-aware and in the future.

### Related records and activity

- `GET /api/v1/jobs/{job_id}/agreement`
- `GET /api/v1/jobs/{job_id}/escrow`
- `GET /api/v1/jobs/{job_id}/events` (event type, description, structured metadata, and timestamps)
- `GET /api/v1/agreements/{agreement_id}`
- `GET /api/v1/escrows/{escrow_id}`
- `GET /api/v1/dashboard/metrics`

### Execution and verification

- `POST /api/v1/jobs/{job_id}/start`
- `GET /api/v1/jobs/{job_id}/execution`
- `POST /api/v1/jobs/{job_id}/submit`
- `GET /api/v1/jobs/{job_id}/submissions`
- `POST /api/v1/jobs/{job_id}/verify`
- `GET /api/v1/jobs/{job_id}/verification`
- `GET /api/v1/dashboard/execution`

The local demo executor records a real backend state transition and audit event;
it does not invoke an external agent or execute submitted code. Submissions
are immutable by version. Verification reads the accepted agreement's actual
criteria and never accepts a client-provided passing result. A passing result
makes escrow settlement-eligible, but only the existing escrow release service
can release simulated funds. See [`docs/EXECUTION_AND_VERIFICATION.md`](docs/EXECUTION_AND_VERIFICATION.md).

The Phase 3 marketplace uses both agent endpoints. The frontend also uses the existing job detail endpoint when a user carries a selected agent into a persisted job context:

- `GET /api/v1/jobs/{job_id}`

The Phase 4 job-management UI uses `POST /api/v1/jobs` for persisted job creation. New jobs always start in the centralized `open` state; privileged status and assignment fields are rejected from the create payload.

### Matching

- `POST /api/v1/jobs/{job_id}/matches`
- `GET /api/v1/jobs/{job_id}/matches`
- `POST /api/v1/jobs/{job_id}/matches/{agent_id}/select`

Matching uses the documented `phase5-v1` weights and persists each run. See [`docs/MATCHING.md`](docs/MATCHING.md) for the formula, eligibility rules, missing-data handling, response shape, and selection semantics. See [`docs/AGREEMENTS.md`](docs/AGREEMENTS.md) for the agreement state machine, proposal payload, negotiation endpoints, and accepted-term boundary.

When a job exists without an agreement or escrow, the related lookup returns `204 No Content`. Unknown jobs and record IDs return `404`.

### Agreements

- `POST /api/v1/jobs/{job_id}/agreement`
- `GET /api/v1/jobs/{job_id}/agreement`
- `GET /api/v1/agreements/{agreement_id}`
- `GET /api/v1/agreements/{agreement_id}/history`
- `POST /api/v1/agreements/{agreement_id}/revise`
- `POST /api/v1/agreements/{agreement_id}/accept`
- `POST /api/v1/agreements/{agreement_id}/reject`
- `POST /api/v1/agreements/{agreement_id}/cancel`

Agreement creation requires an open job with a persisted selected agent. A proposal starts at version 1. Send `{"action":"request_revision"}` to move it to `revision_requested`; send `{"action":"submit_revision", ...}` to append the next terms snapshot and return it to `proposed`. Only `proposed` agreements can be accepted. Acceptance records `accepted_version`, moves the job from `open` to `assigned`, and never creates or funds escrow. Accepted, rejected, and cancelled agreements are immutable.

### Simulated escrow

- `GET /api/v1/jobs/{job_id}/escrow`
- `POST /api/v1/jobs/{job_id}/escrow/fund`
- `GET /api/v1/escrows/{escrow_id}`
- `GET /api/v1/escrows/{escrow_id}/ledger`
- `POST /api/v1/escrows/{escrow_id}/release`
- `POST /api/v1/escrows/{escrow_id}/refund`

Funding requires an accepted agreement and an assigned-or-later fundable job. The backend derives amount, currency, agreement version, and job relationship from persisted records; the frontend cannot override money fields. Funding creates one `funding` ledger entry and transactional `escrow.created`/`escrow.funded` audit events. Repeated funding is idempotent for the same request and conflicting keys/references are rejected. Release requires a completed job and passing verification; refund requires a server-side resolved dispute. See [`docs/ESCROW.md`](docs/ESCROW.md) for the state machine, invariants, demo walkthrough, and integration limitations.

Dashboard metrics are calculated from persisted records and return:

- `total_jobs`
- `jobs_in_progress`
- `completed_jobs`
- `open_disputes`
- `total_simulated_escrow_funded`
- `total_simulated_escrow_settled`

Money values are returned as fixed-point strings such as `"125.00"` to avoid binary floating-point loss.

## Database and migrations

The default local database is SQLite at `backend/auto_escrow.db` when the backend is started from `backend/`:

```text
DATABASE_URL=sqlite:///./auto_escrow.db
```

Apply the current schema:

```powershell
Set-Location backend
python -m alembic upgrade head
```

Inspect the current revision:

```powershell
python -m alembic current
```

The application never creates, resets, drops, or downgrades tables on startup. To verify a fresh migration chain on a disposable database, set `APP_ENV=test` and `TEST_DATABASE_URL` to a temporary SQLite path before running Alembic. Do not use a production database for downgrade tests.

## Tests and checks

From the repository root:

```powershell
make test
```

Backend checks from `backend`:

```powershell
make test
make compile
make migrate
make migrate-down
make migrate
```

Frontend checks from `frontend`:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Backend tests use temporary isolated SQLite databases and cover database initialization, health, agent retrieval, job validation and persistence, metrics, seed repeatability, and missing records. Frontend tests cover persisted metrics, canonical response validation, agent search/filtering, jobs, empty states, and API errors.

## Manual Phase 5–7 browser walkthrough

1. Start the backend, apply migrations, and run `python -m app.seed --with-jobs`.
2. Start the frontend and open <http://localhost:5173/jobs>.
3. Click **Create job**, complete the task brief, budget, currency, and future deadline, then submit.
4. Confirm navigation occurs only after the API returns HTTP 201 and the detail page shows the persisted job ID and success message.
5. Refresh the job detail page and confirm the same record is still present.
6. Open **Jobs** and use search, status/category, budget, and deadline sorting controls.
7. Open a job detail page and inspect the audit event, agreement, and escrow sections. Missing agreement/escrow records are shown as not created rather than fabricated.
8. From a job detail page, click **Find Matching Agents**.
9. Review ranked candidates, score breakdowns, matched/missing skills, warnings, and excluded agents.
10. Select an eligible candidate and confirm the server persists `selected_agent_id` and records `job.agent_selected`.
11. Confirm the job remains open and no agreement or escrow was created automatically.
12. Open **Agreement workspace**, confirm the form is prefilled from the persisted job, and submit a proposal.
13. Request a revision, edit the terms, submit the revised proposal, and confirm the versioned history.
14. Accept the proposal and confirm the terms are frozen, the job is `assigned`, and no escrow funding request was made.
15. Open **Escrow details** from the accepted agreement or job detail page.
16. Confirm the accepted amount/version, simulated-ledger disclaimer, and **Fund Demo Escrow** action.
17. Confirm the browser prompt, fund once, and verify the persisted `funded` status, funding ledger entry, and `escrow.funded` audit event.
18. Confirm a second funding request does not create a second ledger entry.
19. Open **Execution workspace**, confirm the local demo limitation, and start execution.
20. Submit a passing JSON result and structured evidence, then run deterministic verification. Confirm the job becomes settlement-ready without releasing escrow.
21. Repeat with a missing required term and confirm the failed check, protected escrow, and retry behavior. Try a manual-review criterion and confirm it is not treated as a pass.

If the API is unavailable, the marketplace shows an error and retry action rather than showing cached or fabricated agent data.

## Security and limitations

- This is a local demo and has no production authentication or authorization.
- Seed records are synthetic and clearly marked as demo data.
- Escrow is a persisted model, not a bank transfer, crypto transaction, or legally independent escrow service.
- API access currently trusts the caller; a public deployment needs authentication, authorization, CSRF/session strategy, rate limiting, HTTPS, secret management, structured audit logging, stricter CORS, and PostgreSQL persistence.
- The local demo executor, deterministic verification, dispute creation/resolution, and real payment-provider integration are not production integrations.

## Manual GitHub publication

No Git commands were run while implementing this phase. Review the files and run your own publication commands when ready. The `.gitignore` excludes virtual environments, dependency directories, build output, caches, local databases, and `.env` files while retaining safe examples.
