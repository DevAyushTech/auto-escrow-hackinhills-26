# Security review

Date: October 25, 2026

## Scope

This review covers the active `frontend/` Vite/React Router app, FastAPI routes/services,
SQLAlchemy models, migration `0011_demo_sessions`, environment examples, and
the automated tests in this workspace. No cloud account, production database,
credential, or public URL was accessed.

## Public synthetic-demo protections implemented

### Server-issued session credential

`POST /api/demo/session` generates a cryptographically random bearer token and
persists only its SHA-256 digest. The token has an expiration timestamp. The
browser stores the token locally and sends it as `X-Demo-Session`.

When `DEMO_PUBLIC_ENABLED=true`, every `/api/v1/*` request without a valid,
unexpired token returns `401`. The server never trusts a client-provided session
ID, job owner, agent ID, or job ID as proof of authority.

### Resource isolation

Public-demo jobs receive a server-side `demo_session_id`. Job lookup/listing,
matching, agreement, escrow, execution, submission, verification, dispute,
dashboard, ledger, and audit reads are scoped through the current session. Shared
agent records are filtered to synthetic profiles in a public-demo request.

`POST /api/demo/reset` deletes only the caller's jobs and attached agreement,
escrow, ledger, submission, verification, dispute, match, and audit records. It
rotates the token and extends the new session expiration. It cannot reset another
visitor's sandbox.

### Abuse limits

The dependency-free middleware bounds declared request size, per-client requests
per minute, and session creation per hour. The service also limits jobs per demo
session and submission retries. A deployed public prototype should add provider
edge rate limiting and bot protection; the in-process counters are not a
multi-instance rate-limit store.

### Workflow authority

- Funding derives amount/currency from the accepted agreement.
- Accepted agreement terms cannot be revised.
- Verification reads the accepted snapshot and never accepts a client-claimed
  pass.
- Release requires completed state, passed verification, reconciled funding
  ledger, no unresolved dispute, and a valid escrow transition.
- Refund requires an authoritative resolved dispute outcome.
- Duplicate funding, verification, settlement, submissions, and dispute actions
  are guarded by existing state/idempotency rules.
- Submitted output is stored; it is not executed.

## CORS and secrets

Production CORS uses an exact `FRONTEND_ORIGIN` allowlist. Wildcards are ignored
and credentials are disabled because this MVP has no authenticated account
session. The browser variables are `VITE_API_BASE_URL` and the public behavior
flag `VITE_DEMO_PUBLIC_ENABLED`; both are public by design. Database URLs,
operator values, and secrets remain backend-only.

## Remaining limitations

These are still open and block calling the product a production financial
platform:

- No real user authentication, identity, roles, or tenant accounts.
- Anonymous demo tokens are sandbox credentials, not an account system and not a
  substitute for a production session strategy.
- In-process rate limiting does not coordinate across multiple instances.
- No CSRF design for future cookie-based accounts.
- Demo dispute resolution is either development/test-only (`demo-operator`) or,
  in public demo mode, a session-scoped `demo-session` boundary that can resolve
  only the caller's own sandbox. Neither is independent arbitration.
- No payment custody, wallet, blockchain transaction, webhook reconciliation,
  real-money settlement, or legal escrow service.
- No external agent runtime or arbitrary code execution.
- No provider-validated PostgreSQL deployment, managed backup recovery exercise,
  WAF configuration, centralized audit log export, alerting, or incident plan in
  this workspace.
- `npm audit --audit-level=high` reports 9 vulnerabilities in the pinned
  frontend dependency tree. Remediation has not been completed in this workspace.
- Interactive API documentation is available by default; restrict or disable it
  if the hosting threat model requires that.

## Verification evidence

The following local checks were run during this implementation:

```text
backend: make test
100 passed, 1 warning

backend: PYTHONPATH=. .venv/bin/python -m compileall -q app migrations tests
passed

frontend: npm run test
58 passed

frontend: npm run typecheck
passed

frontend: npm run build
passed, including /demo

disposable Alembic upgrade
0011_demo_sessions (head)
```

Browser visual QA and live PostgreSQL/provider verification remain manual checks;
they must not be reported as complete unless run against the actual services.
