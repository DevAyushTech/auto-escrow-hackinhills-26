# Auto Escrow security review

Date: October 20, 2026

## Scope

This review inspected the FastAPI routes and services, SQLAlchemy models, Alembic migrations, React API client and workflow pages, Docker configuration, environment examples, and the existing unit/integration tests. Checks were performed against disposable SQLite databases and synthetic test records only.

Auto Escrow remains a local/demo MVP. It is not a production financial platform and must not be exposed to untrusted users or connected to real funds without a separate authentication, authorization, custody, and operations design.

## End-to-end architecture map

The verified workflow crosses these layers:

1. `POST /api/v1/jobs` persists a `Job`.
2. `POST /api/v1/jobs/{job_id}/matches` computes persisted matching context; `POST /matches/{agent_id}/select` persists the selected agent.
3. `POST /api/v1/jobs/{job_id}/agreement` creates an `Agreement`; revision and acceptance routes use `backend/app/services/agreements.py` and `agreement_states.py`.
4. `POST /api/v1/agreements/{agreement_id}/accept` assigns the job and freezes the accepted agreement version.
5. `POST /api/v1/jobs/{job_id}/escrow/fund` uses the accepted agreement as the sole amount/currency source and appends a funding ledger entry.
6. `POST /api/v1/jobs/{job_id}/start` transitions the job to execution only when agreement, agent, and escrow prerequisites agree.
7. `POST /api/v1/jobs/{job_id}/submit` persists an immutable versioned submission.
8. `POST /api/v1/jobs/{job_id}/verify` evaluates the latest submission against the accepted agreement snapshot and persists one verification per submission.
9. `POST /api/v1/escrows/{escrow_id}/release` releases only after a completed job and passing verification; `POST /refund` is only reachable through a resolved dispute outcome.
10. `POST /api/v1/jobs/{job_id}/disputes` moves the job and escrow into dispute protection; review/resolution routes use the development/test operator boundary.
11. `GET /api/v1/jobs/{job_id}/events`, dispute events, escrow ledger endpoints, and the frontend detail pages expose the resulting audit and financial history.

The principal persisted relationships are `Job → Agreement → Escrow → LedgerEntry`, with `Submission → Verification` attached to the job and `Dispute` linking the job, escrow, latest submission, and latest verification where available. Audit events are recorded in the same service transactions as successful lifecycle changes.

## Findings and fixes

### High — No production authentication or tenant authorization remains

**Affected areas:** `backend/app/main.py`, `backend/app/api/v1/`, `backend/app/services/`, `README.md`.

The API has no authenticated principal, tenant scope, or resource ownership checks. Any caller who can reach the service can read and mutate domain records. The dispute operator header is a narrow development/test boundary, not authentication.

**Status:** Open and production-blocking. Implementing a fake login would not solve this. Before public deployment, add real authentication, derive actor identity from the authenticated principal, enforce resource/role checks, and add tenant isolation.

### High — Escrow settlement now reconciles persisted funding data

**Affected files:** `backend/app/services/escrow.py`.

Settlement now validates that funding/deposit ledger entries reconcile with `escrow.funded_amount`, use the escrow currency, and belong to the escrow job. Corrupt or underfunded persisted data is rejected instead of releasing more than the funding ledger contains.

Pending legacy escrow rows with a consistent deposit/funding ledger are reconciled into the funded state without creating a duplicate financial entry. Inconsistent legacy rows fail with a conflict.

### High — Failed-verification retries now expose verification correctly

**Affected files:** `backend/app/services/execution.py`, `backend/tests/test_phase8_execution.py`.

Execution state now looks up verification for the latest immutable submission rather than treating an earlier failed submission as the current verification. A corrected retry can therefore be verified, while the earlier failed verification remains historical.

### High — Production/demo seed boundary tightened

**Affected files:** `backend/app/seed.py`, `backend/tests/test_phase2_api.py`.

The deterministic demo seed command now refuses to run when `APP_ENV` is not `development` or `test`. This is still not a substitute for deployment authorization or database protections; production deployments should also keep demo tooling unavailable and require explicit migration orchestration.

### Medium — Nested verification schema constraints were silently ignored

**Affected files:** `backend/app/services/verification.py`, `backend/tests/test_phase8_execution.py`.

Nested JSON-schema objects are now evaluated recursively. Unsupported nested keywords, such as `minLength`, result in `manual_review` rather than an automatic pass. This prevents a configured rule from being silently discarded.

### Medium — Disputed escrow restoration now requires an explicit resolution guard

**Affected files:** `backend/app/escrow_states.py`, `backend/app/services/disputes.py`, `backend/tests/test_phase7_escrow.py`.

The centralized state machine no longer permits `disputed → funded|held` without a valid resolution. The supported dispute-rejection service path supplies that guard explicitly.

### Medium — Ledger idempotency key is hardened in migrations

**Affected files:** `backend/migrations/versions/0010_harden_ledger_idempotency.py`.

Existing null idempotency keys are backfilled with deterministic legacy keys and the migrated column is made non-nullable. The existing per-escrow unique constraint remains in place.

### Medium — Pending escrow is represented honestly in the frontend

**Affected files:** `frontend/src/lib/api.ts`, `frontend/src/pages/EscrowPage.tsx`, `frontend/src/pages/JobDetailPage.tsx`, `frontend/src/pages/ExecutionPage.tsx`, `frontend/src/Phase7.test.tsx`.

The API client preserves `funded_amount: null` for pending escrow instead of copying the accepted amount into the funded field. The UI now separates accepted amount from funded amount and can complete a consistent pending escrow through the backend funding endpoint.

### Medium — Invalid frontend routes and production deep links are handled

**Affected files:** `frontend/src/pages/NotFoundPage.tsx`, `frontend/src/App.tsx`, `frontend/Dockerfile`, `frontend/nginx.conf`.

The SPA now has a recovery page for unmatched client routes. The production Nginx image uses an `index.html` fallback so direct refreshes of nested routes do not return a filesystem 404.

### Medium — Dispute creation validates required text before submission

**Affected file:** `frontend/src/pages/DisputesPage.tsx`.

Blank reason and description values are rejected locally before the confirmation dialog or API request. The backend remains authoritative and continues to validate the submitted payload.

### Medium — Docker build contexts exclude local artifacts

**Affected files:** `backend/.dockerignore`, `frontend/.dockerignore`.

Virtual environments, dependency directories, local databases, environment files, logs, caches, and build output are excluded from service build contexts.

## Verified invariants

The current backend tests and targeted Phase 11 tests verify these rules:

- Funding requires an accepted agreement and derives amount/currency from it.
- Client-supplied funding amount/currency are ignored by the typed request contract.
- Execution requires the accepted agreement, matching agent, and funded escrow.
- Release requires a completed job and a passed automated verification.
- Manual-review verification is not treated as a pass.
- Unresolved disputes block normal settlement.
- Terminal released/refunded escrows cannot be settled again.
- Repeated verification of one immutable submission is idempotent.
- Repeated funding uses the escrow/idempotency safeguards and does not create duplicate ledger effects.
- Disputed escrow restoration requires a supported resolution path.
- Settlement rejects an underfunded or currency-inconsistent ledger.
- A failed verification can be retried and the corrected latest submission can be verified.
- Nested unsupported JSON-schema rules do not silently pass.
- Demo seed data is disabled outside development/test environments.
- Fresh Alembic migrations reach `0010_harden_ledger_idempotency` on a disposable SQLite database.

## Authorization and deployment limitations

These gaps remain open and must be addressed before public production use:

- No authentication, authorization, tenant isolation, or authenticated audit identity.
- Demo dispute resolution uses a configured shared development/test operator value.
- Default settings are local-development oriented and default to SQLite.
- The backend container does not run migrations automatically; `/api/ready` now provides a database-backed readiness check but does not verify the Alembic head.
- The checked workspace database may be behind the migration head; use a disposable or explicitly migrated database rather than relying on the local file.
- No rate limiting, request-size policy for every JSON field, CSRF strategy, structured request logging, monitoring, backups, or incident response controls.
- CORS now consumes an exact `FRONTEND_ORIGIN` allowlist, permits the four local Vite origins only in development, and disables credentials because the MVP has no session authentication.
- Docker base images and backend transitive dependencies are not pinned to immutable digests/lockfile resolution.
- The production frontend dependency audit is clean after upgrading `react-router-dom` to `7.18.4`. The full development-tool audit still reports 22 issues across the pinned ESLint/Vitest/Vite/PostCSS/Tailwind toolchain; the available forced fix would introduce a Tailwind 4 breaking upgrade and was not applied during this reliability pass.
- Real custody/payment providers, independent dispute arbitration, and production-grade agent execution are not implemented.

## Test evidence

Commands executed during this review include:

```text
./.venv/bin/python -m pytest tests/test_phase8_execution.py tests/test_phase7_escrow.py tests/test_phase2_api.py -q
34 passed, 1 warning

./.venv/bin/python -m pytest tests/test_phase11_security.py -q
2 passed, 1 warning

make test
backend: 83 passed, 1 warning; frontend: 56 passed

APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/phase11-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/phase11-migrations.sqlite3 .venv/bin/python -m alembic downgrade base
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/phase11-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/phase11-migrations.sqlite3 .venv/bin/python -m alembic current
0010_harden_ledger_idempotency (head)

npm run typecheck
npm run lint
npx vitest run src/Phase7.test.tsx src/App.test.tsx
18 passed

npm audit --omit=dev --audit-level=high
found 0 vulnerabilities

npm audit --audit-level=high
22 development-tool vulnerabilities remain; the forced remediation would include breaking toolchain upgrades and was not applied.

npm install --save-dev eslint@9.39.5 vitest@2.1.9 postcss@8.5.31 vite@6.4.2
Not completed: npm could not replace an existing node_modules/@esbuild/linux-x64 directory on the mounted workspace (EACCES). package.json and package-lock.json were unchanged by this failed attempt.
```

The final frontend suite after the dependency update passed with 56 tests, along with typecheck, lint, and production build. The final backend suite passed with 83 tests, compileall, and `pip check`. Docker image execution was not available in this environment because the `docker` command is not installed.

## Phase 12 final verification

The documentation and final project state were rechecked on October 20, 2026:

```text
make test
backend: 83 passed, 1 warning; frontend: 56 passed

make compile
passed

.venv/bin/python -m pip check
No broken requirements found.

npm run typecheck
passed

npm run lint
passed

npm run build
passed

APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/agent-tmp/phase12-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/agent-tmp/phase12-migrations.sqlite3 .venv/bin/python -m alembic downgrade base
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/agent-tmp/phase12-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/agent-tmp/phase12-migrations.sqlite3 .venv/bin/python -m alembic current
0010_harden_ledger_idempotency (head)

PYTHONPATH=. .venv/bin/python -c "from app.main import app; ..."
app_import=ok; route_count=40; health_route=True; openapi_route=True

npm audit --omit=dev --audit-level=high
found 0 vulnerabilities

secret-hygiene scan
real_env_files=0; potential_secret_matches=0

documentation link check
documentation_link_errors=0
```

The full frontend development audit still reports 22 vulnerabilities in the
development toolchain. The available forced remediation would require breaking
tool upgrades, including Tailwind 4, so it was not applied during this phase.

## Deployment-preparation follow-up — October 21, 2026

The current workspace was rechecked after the warm editorial UI redesign, release
eligibility control, exact CORS allowlist, readiness endpoint, and container
preparation changes:

```text
make test
backend: 91 passed, 1 warning; frontend: 57 passed

make -C backend compile
passed

npm --prefix frontend run typecheck
passed

npm --prefix frontend run lint
passed

npm --prefix frontend run build
passed

APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/agent-tmp/phase12-final-migrations.sqlite3

The backend health test suite includes allowed/disallowed Origin checks for the
local Vite origins, exact production-origin parsing, and database readiness success
and failure behavior. Docker image builds were not run because Docker is not
installed in the available environment.
