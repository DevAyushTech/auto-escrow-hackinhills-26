# Auto Escrow backend

FastAPI + SQLAlchemy 2 + Alembic backend for the Auto Escrow Phase 2/3 data/API foundation and Phase 4 job management flow. SQLite is the default local database; PostgreSQL is supported through the configured SQLAlchemy URL.

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
  -> 0005_audit_event_description (head)
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
- `GET /api/v1/jobs/{job_id}/agreement`
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

Funding, settlement, matching, submission, verification, and dispute mutation endpoints are reserved for later phases.

## Tests and checks

```powershell
make test
make compile
make migrate
make migrate-down
make migrate
```

Tests use temporary SQLite databases and cover health, schema initialization, agent retrieval, job validation/persistence, normalized creation, filtering/pagination, metrics, seed idempotency, audit events, and missing records.
