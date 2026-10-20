# Auto Escrow backend

FastAPI + SQLAlchemy 2 + Alembic backend for the Auto Escrow Phase 2/3 data/API foundation, Phase 4 job management flow, Phase 5 deterministic agent matching, and Phase 6 agreement negotiation. SQLite is the default local database; PostgreSQL is supported through the configured SQLAlchemy URL.

## Setup

From the repository root on Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
Set-Location backend
python -m alembic upgrade head
```

The application never creates, resets, drops, or downgrades tables during startup.

## Environment

```text
APP_ENV=development
DATABASE_URL=sqlite:///./auto_escrow.db
FRONTEND_ORIGIN=http://localhost:5173
```

When `APP_ENV=test`, `TEST_DATABASE_URL` may point tests or migration checks at an isolated database. PostgreSQL URLs can use `postgresql+psycopg://...`.

## Migrations

The current chain is:

```text
0001_phase1_foundation
  -> 0002_escrow_domain
  -> 0003_explicit_domain_fields
  -> 0004_optional_job_requester
  -> 0005_audit_event_description
  -> 0006_matching_results
  -> 0007_agreement_negotiation (head)
```

Run:

```powershell
make migrate
python -m alembic current
```

For a disposable SQLite migration check only:

```powershell
$env:APP_ENV = "test"
$env:TEST_DATABASE_URL = "sqlite:///./phase2-check.sqlite3"
python -m alembic upgrade head
python -m alembic downgrade base
python -m alembic upgrade head
```

Do not run downgrade commands against a production database.

## Seed data

Load six deterministic synthetic agents:

```powershell
python -m app.seed
```

Load agents plus two synthetic jobs:

```powershell
python -m app.seed --with-jobs
```

The command is repeatable and does not reset existing records. Seed records are marked as synthetic demo data in their metadata.

## Run

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: `http://127.0.0.1:8000/api/health`
- Docs: `http://127.0.0.1:8000/docs`
- Versioned API: `http://127.0.0.1:8000/api/v1`

## API surface

- `GET /api/v1/agents`
- `GET /api/v1/agents/{agent_id}`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs`
- `GET /api/v1/jobs/{job_id}`
- `POST /api/v1/jobs/{job_id}/matches`
- `GET /api/v1/jobs/{job_id}/matches`
- `POST /api/v1/jobs/{job_id}/matches/{agent_id}/select`
- `GET /api/v1/jobs/{job_id}/agreement`
- `POST /api/v1/jobs/{job_id}/agreement`
- `GET /api/v1/agreements/{agreement_id}`
- `GET /api/v1/agreements/{agreement_id}/history`
- `POST /api/v1/agreements/{agreement_id}/revise`
- `POST /api/v1/agreements/{agreement_id}/accept`
- `POST /api/v1/agreements/{agreement_id}/reject`
- `POST /api/v1/agreements/{agreement_id}/cancel`
- `GET /api/v1/jobs/{job_id}/escrow`
- `GET /api/v1/jobs/{job_id}/events`
- `GET /api/v1/agreements/{agreement_id}`
- `GET /api/v1/escrows/{escrow_id}`
- `GET /api/v1/dashboard/metrics`

`GET /api/v1/jobs` accepts optional `status`, `task_category`, `min_budget`,
`max_budget`, `search`, `skip`, `limit`, and `sort` query parameters. `sort`
is either `newest` (the default) or `deadline`. Budget values use fixed-point
Decimal validation, and job creation always starts in the centralized `open`
state. The create request trims and normalizes text and required skills and
rejects client-supplied workflow or assignment state fields.

## Phase 5 matching

`POST /api/v1/jobs/{job_id}/matches` evaluates every registered agent and
persists one `match_results` row per agent under a generated `run_id`.
`GET /api/v1/jobs/{job_id}/matches` returns the latest persisted run; it returns
`204` when the job exists but has no run yet. The response separates ranked
eligible `candidates` from `excluded_agents`, and every candidate includes its
score, matched/missing skills, component breakdown, explanation, warnings, and
eligibility reasons.

The scoring policy is versioned as `phase5-v1` in
`app/services/matching.py`. Its configurable default weights are skills 50%,
exact normalized category membership 20%, availability/deadline 20%, and
budget 10%. Required skills, active status, available status, and known
deadline incompatibility are eligibility rules rather than soft preferences.
Skills and categories are trimmed and compared case-insensitively. An agent
without a known completion estimate remains eligible and receives a deadline
warning with a neutral 0.5 deadline component. Agent pricing is not present in
the current data model, so budget is explicitly unknown, contributes neutral
0.5 / 5 points, and always emits a warning; no price is inferred.

`POST /api/v1/jobs/{job_id}/matches/{agent_id}/select` re-evaluates the agent
server-side and permits selection only while the job is `open`. It sets only
`selected_agent_id` and matching metadata, records one `job.agent_selected`
audit event with score/run/version, and leaves the job open. Repeating the same
selection is idempotent; replacing a different selection and selecting an
ineligible/missing agent are rejected. The endpoint accepts an optional
`{"run_id": "..."}` body to associate the selection with a persisted run.
It does not accept arbitrary state, create agreements, accept agreements, or
fund escrow.

## Phase 6 agreements

An agreement can be proposed only for an open job with a persisted selected
agent. Omitted proposal budget, deadline, currency, and terms use the job's
defaults; the generated terms include scope, expected deliverable, acceptance
criteria, verification method, cancellation conditions, dispute conditions,
and optional instructions. A proposal's append-only history is versioned from
1. `request_revision` moves a proposal to `revision_requested`, and
`submit_revision` records the next version and returns it to `proposed`.

Only a proposed agreement can be accepted. Acceptance freezes the current
proposal version, moves the job from `open` to `assigned` through the central
job transition policy, records an audit event, and does not fund escrow.
Repeated acceptance is idempotent; accepted, rejected, and cancelled
agreements cannot be revised or changed again.

## Tests and checks

```powershell
make test
make compile
make migrate
make migrate-down
make migrate
```

Tests use temporary SQLite databases and cover health, schema initialization, agent retrieval, job validation/persistence, normalized creation, filtering/pagination, metrics, seed idempotency, audit events, missing records, deterministic matching, persisted match runs, eligibility explanations, selection revalidation, idempotency, and selection audit events.
They also cover selected-agent agreement creation, default and invalid terms,
versioned negotiation history, revision transitions, acceptance freezing and
idempotency, terminal transitions, agreement audit events, and missing history.
