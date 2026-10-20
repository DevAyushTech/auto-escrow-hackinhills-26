# Auto Escrow architecture

## System boundary

Auto Escrow is a local/demo full-stack application. The frontend presents a
workflow for jobs, agent matching, agreements, simulated escrow, execution,
verification, and disputes. The FastAPI backend is authoritative for persisted
state, lifecycle transitions, verification results, ledger effects, and audit
events.

There is no production authentication, tenant isolation, real payment custody,
wallet, blockchain transaction, independent arbitration, or external agent
runtime. The default database is local SQLite. PostgreSQL URLs are supported at
the SQLAlchemy connection layer, but the repository does not provision or
operate a production PostgreSQL deployment.

## Repository structure

```text
AutoEscrow/
├── backend/
│   ├── app/
│   │   ├── api/                 # FastAPI health and /api/v1 routes
│   │   ├── services/            # Domain workflows and transactions
│   │   ├── *_states.py          # Central lifecycle transition rules
│   │   ├── config.py            # Environment-backed settings
│   │   ├── database.py          # SQLAlchemy engine and sessions
│   │   ├── models.py            # ORM entities and constraints
│   │   ├── schemas.py            # Pydantic contracts and validation
│   │   ├── seed.py              # Development/test synthetic seed
│   │   └── main.py              # FastAPI app and CORS
│   ├── migrations/              # Alembic history through revision 0010
│   ├── tests/                   # Isolated API/service tests
│   ├── Dockerfile
│   ├── Makefile
│   └── requirements.txt
├── frontend/
│   ├── src/components/          # Shell, navigation, status controls
│   ├── src/pages/               # Workflow pages and recovery page
│   ├── src/lib/api.ts           # Timeout-aware typed API client/parsers
│   ├── src/*.test.tsx           # Vitest/Testing Library suites
│   ├── Dockerfile               # Static Nginx image
│   ├── nginx.conf               # SPA history fallback
│   └── package.json
├── docs/
├── DEMO_GUIDE.md
├── README.md
├── Makefile
├── .python-version
└── .nvmrc
```

## Runtime request flow

1. The browser loads the React/Vite application from `http://localhost:5173`.
2. `App.tsx` installs the React Router route tree under `AppShell`.
3. `AppShell` checks `/api/health`, renders navigation, and provides a stable
   main content target and route-aware title.
4. Workflow pages call the shared `frontend/src/lib/api.ts` client.
5. The client uses a five-second request timeout, checks expected HTTP status
   where needed, and validates canonical response shapes before rendering.
6. FastAPI route handlers validate request/response contracts and delegate
   lifecycle work to backend services.
7. Services load and mutate SQLAlchemy models inside transaction boundaries,
   apply centralized state-machine rules, record audit events, and commit or
   roll back as one unit.
8. The frontend refreshes persisted records after consequential operations; it
   does not infer success from a button click or request submission alone.

## Persistence model

```text
Job
 ├── Agreement
 │    └── Escrow
 │         └── LedgerEntry[]
 ├── MatchResult[]
 ├── Submission[]
 │    └── Verification
 ├── Dispute[]
 └── AuditEvent[]
```

Important relationships:

- A job may have one agreement and one escrow.
- An agreement captures proposal history and the accepted version.
- Escrow copies the accepted agreement amount, currency, and version.
- Ledger entries belong to an escrow and include an idempotency key, amount,
  currency, type, timestamp, and optional job relationship.
- Submissions are immutable versions for a job; each submission can have one
  verification.
- A dispute links the job and escrow and may reference the latest submission
  and verification without rewriting them.
- Audit events preserve event type, description, structured metadata, actor
  agent where available, and timestamp.

Alembic manages the schema. The current migration head is
`0010_harden_ledger_idempotency`, which backfills null ledger idempotency keys
and makes the migrated column non-nullable. Application startup does not create
or reset tables.

## Lifecycle state machines

### Job lifecycle

```text
open
  -> assigned                 agreement accepted
  -> in_progress              local demo execution started
  -> submitted                immutable submission saved
  -> under_review             verification begins
  -> completed                automated checks pass
```

Failure/retry path:

```text
under_review
  -> submitted                permitted failed-verification retry
```

Jobs may also become `disputed` or `cancelled` through the dispute/terminal
workflow. Completed jobs cannot restart. Cancelled and disputed jobs cannot
start execution.

### Agreement lifecycle

Agreement proposals use versioned terms and explicit actions:

```text
proposed -> revision_requested -> proposed
proposed -> accepted
proposed -> rejected
proposed -> cancelled
```

Accepted terms are frozen. Acceptance assigns the selected executor and moves
the job to `assigned`; acceptance never funds escrow.

### Escrow lifecycle

```text
pending -> funded
funded  -> held | released | refunded | disputed
held    -> released | refunded | disputed
disputed -> released | refunded   only with a resolved dispute outcome
released -> terminal
refunded -> terminal
```

The persisted `pending` value is exposed as public funding state
`not_funded`. Release and refund use the escrow service rather than direct
ledger mutation.

### Dispute lifecycle

```text
open -> under_review -> resolved
open -> resolved
open -> rejected
under_review -> rejected
```

Terminal disputes cannot be reopened or resolved again. Unresolved disputes
block normal settlement.

## Matching boundary

`app/services/matching.py` computes a deterministic `phase5-v1` run and persists
the result for every agent. Default weights are:

- skills: 50%;
- exact normalized category: 20%;
- availability/deadline: 20%;
- budget: 10%.

Agent active status, availability, required skills, and deadline feasibility are
eligibility rules. The current model has no agent pricing field, so budget is
neutral and produces a warning rather than an invented price. Selection runs
server-side revalidation, persists only the selected agent/matching context,
and leaves the job open.

## Agreement and execution authority

The backend owns:

- job status and assignment;
- selected/executor agent consistency;
- agreement versions and acceptance;
- escrow amount, currency, and agreement snapshot;
- submission versions and retry limits;
- verification criteria and results;
- dispute transitions and resolution outcomes.

The frontend never supplies an authoritative job/escrow status. Client-provided
funding amount/currency are discarded by the request contract. Client-provided
verification results are not accepted.

The local execution service changes `assigned` to `in_progress` only when the
accepted agreement, selected executor, and funded/held escrow agree. It does
not execute submitted output, run arbitrary code, or invoke an external agent.

## Verification and settlement

Verification loads criteria from the accepted agreement snapshot. It supports
safe deterministic checks for JSON, fields, sections, terms, length, evidence,
configured formats, and a restricted JSON-schema subset. Subjective markers such
as factual accuracy, originality, professional quality, and safety become
`manual_review`, not an automatic pass.

A passing verification moves the job to `completed` and records settlement-ready
events. It does not release escrow. Normal release additionally requires:

- funded/held escrow;
- consistent accepted agreement snapshot;
- completed job;
- persisted passed verification for a submission;
- reconciled funding ledger;
- no unresolved dispute;
- non-terminal escrow state.

Refund requires a resolved dispute whose outcome is `refund`. Release/refund
effects cannot exceed the reconciled funded balance, and released/refunded
escrows are terminal.

## Transaction and audit behavior

Critical services lock relevant rows where supported, validate lifecycle state,
flush related rows, record audit events, and commit together. Exceptions roll
back the session. Funding, escrow state, ledger rows, and funding audit events
are atomic. Dispute resolution calls the normal release/refund service instead
of directly editing ledger records.

Verification is idempotent per immutable submission. Funding is protected by
per-escrow idempotency keys and conflict checks. Repeated settlement and dispute
resolution requests are rejected.

## Frontend responsibilities

The frontend includes routes for dashboard, agents, jobs, matching, agreements,
escrow, execution, disputes, settings information, and a not-found recovery
page. It provides loading, empty, error, retry, confirmation, duplicate-action,
and missing-resource states. It uses the backend API client and response
parsers rather than hardcoded lifecycle data.

The top-level `/escrow` and `/settings` pages are honest information/placeholder
workspaces. Actual escrow details are job-scoped at `/jobs/:jobId/escrow`.

## Security and deployment limitations

- There is no production authentication, authorization, or tenant/resource
  isolation.
- The `X-Demo-Operator` header is a development/test-only shared boundary, not
  authentication or independent arbitration.
- Evidence and submitted output are participant-provided data and are not
  independently authenticated.
- No payment provider, custody service, wallet, blockchain transaction, or real
  financial settlement exists.
- SQLite is the default local database; PostgreSQL support is connection-level.
- Backend containers do not run migrations automatically and no deployment
  orchestration is included.
- CORS defaults to the local frontend origin and should be reviewed before any
  credentialed authentication is introduced.
- The application is a local/demo MVP and must not be described as a production
  financial platform or as audited/secure for public use.
