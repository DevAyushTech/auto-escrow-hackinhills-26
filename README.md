# Auto Escrow

Auto Escrow is a hackathon MVP for coordinating synthetic AI-agent work with an
explainable, backend-authoritative workflow. A requester describes a job,
compares persisted agent matches, accepts versioned terms, records simulated
escrow, submits a result, runs deterministic verification, and reviews the
ledger and audit trail before release or dispute resolution.

**This is a prototype.** Escrow is simulated database state. No bank, wallet,
blockchain, payment provider, independent arbitrator, or external agent runtime
is connected. Submitted output is stored and inspected; it is never executed as
code.

## What is implemented

- FastAPI API with SQLAlchemy 2, Pydantic validation, and Alembic migrations.
- SQLite for local development and PostgreSQL URL support for hosting.
- Explainable deterministic matching with persisted scoring runs.
- Versioned agreements with accepted-term immutability.
- Decimal-safe simulated escrow ledger with idempotent funding and guarded
  release/refund transitions.
- Safe local demo execution, immutable submissions, deterministic verification,
  retry limits, manual-review outcomes, disputes, and audit events.
- Vite/React Router frontend using `frontend/src/main.tsx` and the supplied
  operational pages, with a real-API guided demo at `/demo`.
- Server-issued expiring demo sessions with per-session job ownership, reset,
  request limits, request-size limits, and synthetic-agent filtering when public
  demo mode is enabled.

## Guided demo

Open `/demo` and follow the nine visible steps:

1. Discover synthetic agents from `GET /api/v1/agents`.
2. Create a validated job.
3. Run and inspect real matching results.
4. Create and accept an agreement.
5. Fund simulated escrow from the accepted terms.
6. Start local demo execution and submit safe text/JSON output.
7. Verify the latest immutable submission.
8. Release only after an authoritative pass, or open/review/resolve a dispute.
9. Inspect the persisted job state, ledger entries, and audit timeline.

The guide keeps the browser's session token and active job context in local
storage so a refresh can recover the visitor's place. **Reset sandbox** deletes
only the current session's jobs and attached records, then rotates its token.

## Technology stack

- **Frontend:** Vite, React 18, React Router, TypeScript, Tailwind CSS,
  `lucide-react`.
- **Backend:** FastAPI, SQLAlchemy 2, Pydantic Settings, Alembic,
  `psycopg[binary]`.
- **Tests:** pytest with isolated SQLite databases; Vitest and Testing Library for
  frontend workflow and API-boundary checks.
- **Runtime pins:** Python 3.11 (`.python-version`), Node 22 (`.nvmrc`).

## Repository layout

```text
AutoEscrow/
├── backend/
│   ├── app/api/                 # health, demo session, and /api/v1 routes
│   ├── app/services/            # workflow, matching, verification, ledger logic
│   ├── migrations/              # Alembic revisions, currently 0011
│   ├── tests/                   # backend API/workflow/security tests
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/main.tsx             # active Vite entry point
│   ├── src/App.tsx              # active React Router route table
│   ├── src/pages/               # operational pages and GuidedDemoPage
│   ├── src/lib/api.ts           # typed API client and session header handling
│   ├── tests/                   # frontend contract smoke tests
│   ├── package.json              # Vite scripts and pinned frontend dependencies
│   ├── package-lock.json
│   └── .env.example
├── docs/
├── DEMO_GUIDE.md
└── DEMO_USER_GUIDE.md
```

## Local setup on Windows PowerShell

Use Python 3.11. Python 3.14 is not the supported project runtime.

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

The activation-safe version is:

```powershell
Set-Location backend
.\.venv\Scripts\Activate.ps1
python -m alembic upgrade head
python -m app.seed --with-jobs
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If your virtual environment is at `backend\.venv`, use
`..\.venv\Scripts\python.exe` from inside `backend`, or
existing `.env` file.

In a second PowerShell window:

```powershell
Set-Location frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run dev
```

Open:

- Frontend: `http://localhost:5173` (Vite default)
- Guided demo: `http://localhost:5173/demo`
- API root: `http://localhost:8000`
- Liveness: `http://localhost:8000/api/health`
- Readiness: `http://localhost:8000/api/ready`
- OpenAPI: `http://localhost:8000/docs`

The frontend variables are `VITE_API_BASE_URL` and the public behavior flag
`VITE_DEMO_PUBLIC_ENABLED`. They are compiled into the browser bundle; never
put a database URL, password, operator value, or signing secret in them.

## Local checks

From the repository root:

```powershell
make test
```

Frontend checks from `frontend`:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Backend checks from `backend`:

```powershell
make test
make compile
python -m alembic upgrade head
make migration-check
```

For a disposable migration chain, set a separate `TEST_DATABASE_URL` and run
`upgrade head`, `downgrade base`, then `upgrade head` again. Never run downgrade
commands against a valuable database.

## Seed data

```powershell
Set-Location backend
python -m app.seed --with-jobs
```

The seed is idempotent and allowed only when `APP_ENV` is `development` or
`test`. It creates six synthetic agents and optional synthetic jobs. It never
resets a database. Hosted production should use a controlled, one-time seed or
manual synthetic data step—not startup seeding. For an explicitly approved
hosted synthetic demo, set `DEMO_SEED_ENABLED=true` temporarily and run
`python -m app.seed --allow-production-demo` from a controlled release shell,
without `--with-jobs`; then disable the flag.

## Public demo safety

Set these backend variables only for a restricted synthetic demo deployment:

```text
APP_ENV=production
DEMO_PUBLIC_ENABLED=true
DEMO_SESSION_TTL_MINUTES=120
DEMO_MAX_JOBS_PER_SESSION=3
DEMO_RATE_LIMIT_PER_MINUTE=120
DEMO_SESSION_CREATE_LIMIT_PER_HOUR=10
DEMO_MAX_REQUEST_BYTES=300000
```

When public mode is enabled, `/api/v1/*` requires the server-issued
`X-Demo-Session` token. Every created job is stamped with the server-side
session ID. Job-linked agreements, escrows, submissions, disputes, matching
runs, ledger entries, and audit reads are scoped through that job. Agents remain
shared synthetic read-only data. The public mode is still an anonymous sandbox,
not production authentication.

## Deployment preparation

The repository is prepared for a manual split deployment:

1. Vite frontend as a static service using the included Dockerfile/Nginx SPA
   fallback, or an equivalent static host.
2. FastAPI backend as a Python web service or the included Docker image.
3. Persistent managed PostgreSQL database.

Run Alembic explicitly before serving traffic. Do not use the default SQLite
file on an ephemeral host filesystem. Set the frontend's `VITE_API_BASE_URL` to
the deployed API URL before building, set `VITE_DEMO_PUBLIC_ENABLED=true` only
when the backend public-demo flag is enabled, and set the backend
`FRONTEND_ORIGIN` to the exact deployed frontend origin.

See:

- [`DEMO_GUIDE.md`](DEMO_GUIDE.md)
- [`DEMO_USER_GUIDE.md`](DEMO_USER_GUIDE.md)
- [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)
- [`docs/TESTING.md`](docs/TESTING.md)
- [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md)

## Known limitations

This is not production-ready software. It still lacks real user accounts,
authenticated actor identity, full production authorization/tenant management,
CSRF/session hardening for a real account system, independent arbitration,
payment custody, external agent execution, centralized observability, and a
provider-validated PostgreSQL run in this workspace. Treat public mode as a
bounded synthetic prototype only.

The frontend install currently reports 9 npm audit vulnerabilities in the
pinned dependency tree. Review and remediate them before treating any hosted
service as unrestricted public traffic. This prototype is not production-ready.
