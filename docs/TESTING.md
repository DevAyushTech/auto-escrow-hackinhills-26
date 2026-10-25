# Testing and QA

## Automated commands

Run from the repository root:

```bash
make test
```

This runs the backend pytest suite and the frontend Vitest suite.

Backend, from `backend/`:

```bash
PYTHONPATH=. .venv/bin/python -m pytest -q
PYTHONPATH=. .venv/bin/python -m compileall -q app migrations tests
make migration-check
```

Frontend, from `frontend/`:

```bash
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

The frontend `lint` command runs ESLint against the active Vite/React Router
tree. The stale Next.js tree and generated `.next` files are excluded from the
active lint and typecheck scopes.

`npm audit --audit-level=high` currently reports 9 vulnerabilities in the
pinned frontend dependency tree. Treat this as a release blocker for an
unrestricted public service; use a restricted demo and review remediation
separately.

## Backend coverage areas

The pytest suite covers:

- health and database readiness;
- exact CORS origin behavior;
- job validation, persistence, search, and audit events;
- deterministic matching, exclusions, scoring explanations, and idempotent
  selection;
- agreement versioning, acceptance immutability, and job assignment;
- decimal-safe escrow funding, ledger reconciliation, idempotency, guarded
  release, refund, and terminal-state protection;
- safe local execution, immutable submissions, deterministic verification,
  retry limits, failed/manual-review outcomes, and settlement eligibility;
- disputes, operator boundary, review/resolution transitions, refunds, release,
  rejection restoration, and rollback behavior;
- synthetic session creation, per-session job isolation, reset token rotation,
  and protection against cross-session reads;
- disposable migration initialization.

## Frontend coverage areas

The frontend tests protect the public API boundary: the `X-Demo-Session`
header, session bootstrap/reset routes, workflow actions, dispute handling, and
absence of private backend settings in the browser API module. Typecheck and
production build cover the active Vite route table, including `/demo`.

There is not yet a Playwright suite in the repository. The manual browser script
below is therefore the required visual and end-to-end substitute.

## Disposable migration check

From `backend/`:

```bash
rm -f /tmp/auto-escrow-migrations.sqlite3
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 \
  PYTHONPATH=. .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 \
  PYTHONPATH=. .venv/bin/python -m alembic downgrade base
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 \
  PYTHONPATH=. .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 \
  PYTHONPATH=. .venv/bin/python -m alembic current
```

Expected head: `0011_demo_sessions`.

## Manual browser QA

1. Start the backend, migrate, seed synthetic agents, and start Vite.
2. Open `/`, `/agents`, `/jobs`, and `/demo` at desktop width.
3. Start a session and confirm the network request returns a token.
4. Complete a passing guided flow; refresh after job creation, agreement
   acceptance, funding, submission, and verification.
5. Confirm failed verification shows reasons and no release action.
6. Create a dispute and confirm normal settlement is blocked.
7. Reset the sandbox and confirm the current job is gone.
8. Use a second private browser profile and confirm it cannot read the first
   session's job ID.
9. Resize to tablet and mobile widths. Check that the bottom navigation does not
   cover form controls, long titles wrap, and buttons remain reachable.
10. Open a direct refresh of `/demo` and each primary workspace route.

## Known gaps

- No automated Playwright screenshots or accessibility audit is checked into the
  project.
- PostgreSQL compatibility is supported by the URL/driver layer but has not been
  exercised against a live hosted PostgreSQL service in this workspace.
- Provider-level WAF, edge rate limiting, backups, alerting, and rollback must be
  verified manually after deployment.
