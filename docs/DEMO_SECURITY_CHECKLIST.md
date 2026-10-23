# Public demo security checklist

Use this checklist before allowing anyone outside the development team to access a
hosted demo. This checklist is deliberately stricter than “the page loads”.

## Launch gate

- [ ] The demo is labeled as a synthetic/local foundation in the UI and landing
  copy.
- [ ] No real payment credentials, personal data, private agent endpoints, or
  production database is connected.
- [ ] The service is behind an access gate, private network, or invite-only link
  because the API has no real authentication or authorization.
- [ ] The owner has accepted that anonymous callers who can reach the API can read
  and mutate valid workflow records.
- [ ] No one is describing the ledger as custody, a bank transfer, blockchain
  settlement, or independent arbitration.

## Origin and transport

- [ ] Frontend and backend use HTTPS outside local development.
- [ ] `FRONTEND_ORIGIN` contains only the intended deployed browser origin(s).
- [ ] No wildcard origin is used.
- [ ] CORS is verified with an allowed `Origin` header and a disallowed origin.
- [ ] The frontend was rebuilt with the correct public `VITE_API_BASE_URL`.
- [ ] `/api/ready` is used for backend readiness and `/api/health` remains the
  liveness probe.

## Data and secrets

- [ ] `DATABASE_URL` points to persistent PostgreSQL with TLS and backups.
- [ ] Migrations were run as a reviewed release step before traffic was enabled.
- [ ] No automatic destructive migration or database reset is configured.
- [ ] `DEMO_RESOLUTION_OPERATOR` is not treated as a production credential.
- [ ] `.env` files, local databases, virtual environments, logs, and build output
  are not included in the publication or image context.
- [ ] Secrets are stored in the host's secret manager, not in `VITE_*` variables.

## Workflow honesty

- [ ] Dashboard counts and money values come from API responses; zero is not shown
  when an endpoint failed.
- [ ] Empty, loading, error, retry, and missing-record states are visible.
- [ ] Matching scores are described as ranking signals, not quality guarantees.
- [ ] Agreement acceptance is described as freezing terms; the UI does not imply
  silent edits are possible.
- [ ] Funding, release, refund, verification, and dispute state are read back from
  the backend after each action.
- [ ] Release is offered only when the backend reports settlement eligibility.
- [ ] Failed or manual-review verification cannot release escrow.
- [ ] Submitted output is never executed as arbitrary code.

## Operational limits

- [ ] The demo owner understands there is no rate limiting, tenant isolation, actor
  identity, CSRF protection, request tracing, or incident response automation.
- [ ] API docs are either access-controlled or accepted as a demo exposure.
- [ ] Logs do not contain passwords, tokens, database URLs, or private payloads.
- [ ] The host has a rollback path to the previous image and a database recovery
  procedure.
- [ ] The manual workflow in [`MANUAL_E2E.md`](MANUAL_E2E.md) has been run against
  the actual deployed URLs.

## Stop conditions

Do not open the demo to untrusted public writes if any of these are true:

- the backend is using ephemeral SQLite;
- the deployed frontend origin is not in the exact CORS allowlist;
- the frontend still points at `localhost`;
- secrets are being passed as `VITE_*` variables;
- migrations have not been applied to the target database;
- the demo contains real user/payment data;
- the operator boundary is being presented as authentication; or
- the owner expects the MVP to provide real financial custody or legal dispute
  resolution.

The minimum safe alternative is a synthetic, invite-only demo with the API blocked
from direct untrusted access until authentication, authorization, tenant isolation,
rate limiting, and operational controls are implemented.
