# Public demo security checklist

Use this before sharing a hosted synthetic prototype. It is stricter than “the
page loads”.

## Launch gate

- [ ] UI and landing page clearly say synthetic data, simulated escrow, and no
  real payment settlement.
- [ ] No personal data, real payment credentials, private agent endpoint, or
  production data is connected.
- [ ] `DEMO_PUBLIC_ENABLED=true` is set only after the session-isolation tests
  pass against the target database.
- [ ] The owner understands anonymous demo tokens are sandbox credentials, not
  full authentication or tenant accounts.
- [ ] No one calls the ledger custody, a bank transfer, a blockchain transaction,
  or dispute resolution independent arbitration.

## Origin and transport

- [ ] Frontend/backend use HTTPS outside local development.
- [ ] `FRONTEND_ORIGIN` exactly matches the frontend origin, without a path or
  trailing slash.
- [ ] No wildcard CORS is used.
- [ ] `VITE_API_BASE_URL` points to the deployed HTTPS backend, not
  localhost.
- [ ] `/api/ready` is the readiness check and `/api/health` is the liveness check.
- [ ] The provider's edge rate limiting/bot controls are configured in addition
  to the app's in-process limits.

## Data and secrets

- [ ] `DATABASE_URL` points to persistent PostgreSQL with TLS/backups.
- [ ] Migration `0011_demo_sessions` is applied before traffic is enabled.
- [ ] No startup reset or destructive migration is configured. Public session
  bootstrap may create the deterministic synthetic agent registry only when no
  synthetic agent exists; it creates no jobs and never updates non-synthetic
  rows. Any optional production CLI seed used a controlled command and the seed
  flag was disabled afterward.
- [ ] `.env` files, local databases, virtual environments, `node_modules`, and
  `dist` output are excluded from publication.
- [ ] No secret is passed through a `VITE_*` variable.
- [ ] The shared `demo-operator` value is not exposed in public mode; public
  dispute actions use only the caller's `demo-session` scope.

## Workflow honesty

- [ ] Dashboard amounts and counts come from successful API responses.
- [ ] Loading, empty, failure, retry, and missing-record states remain visible.
- [ ] Matching is described as a ranking signal, not a quality guarantee.
- [ ] Acceptance is described as freezing terms.
- [ ] Funding, verification, release, refund, and dispute state are read back
  from the backend after actions.
- [ ] Failed/manual-review verification cannot release escrow.
- [ ] Submitted output is never executed.

## Isolation smoke test

- [ ] Start session A and create job A.
- [ ] Start session B and create job B.
- [ ] With token B, `GET /api/v1/jobs/<job-A-id>` returns `404`.
- [ ] With token B, a job-A escrow/release/dispute URL cannot mutate job A.
- [ ] Reset A and confirm A's job disappears while B's job remains.
- [ ] Confirm reset rotates A's token and the old token returns `401`.

## Stop conditions

Do not open public writes if:

- hosted state uses ephemeral SQLite;
- CORS is not exact;
- the frontend points at localhost;
- the session header is optional while public mode is enabled;
- migrations have not run;
- synthetic data is mixed with real data;
- the operator boundary is presented as authentication; or
- anyone expects real custody, real settlement, or legal arbitration.
