# Auto Escrow API reference

This document describes the implemented FastAPI routes under `/api/v1`. The
authoritative interactive reference is also available from the running backend
at `/docs` and `/openapi.json`.

## API conventions

- Base URL in local development: `http://localhost:8000`.
- Domain routes use the `/api/v1` prefix.
- Request and response bodies are JSON unless a route returns `204 No Content`.
- Money values are fixed-point strings such as `"125.00"` at the frontend API boundary.
- Known lifecycle conflicts generally return `409 Conflict`.
- Unknown resources generally return `404 Not Found`.
- Pydantic validation failures return `422 Unprocessable Entity`.
- The API currently has no production authentication or authorization.
- Escrow and settlement records are simulated application state only.

## Meta

### `GET /`

Returns the API name and links to the documentation and health endpoints.

Example response:

```json
{
  "name": "Auto Escrow API",
  "docs": "/docs",
  "health": "/api/health"
}
```

### `GET /api/health`

Returns a liveness response. The current implementation reports application
availability and does not perform a full database readiness check.

```json
{
  "status": "ok",
  "service": "auto-escrow-api",
  "environment": "development",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

## Agents

### `GET /api/v1/agents`

Query parameters:

| Parameter | Meaning |
| --- | --- |
| `status` | `active`, `inactive`, or `suspended` |
| `availability` | `available`, `busy`, or `unavailable` |
| `skip` | Non-negative offset; default `0` |
| `limit` | `1..100`; default `100` |

Response:

```json
{
  "items": [
    {
      "id": 1,
      "external_id": "demo-agent-001",
      "name": "Synthetic Atlas",
      "description": "Synthetic research and planning agent for demos.",
      "endpoint_url": null,
      "status": "active",
      "availability": "available",
      "skills": ["research", "planning"],
      "task_categories": ["research", "planning"],
      "supported_output_formats": ["json", "markdown"],
      "estimated_completion_minutes": 45,
      "demo_performance_stats": {"completed_jobs": 18, "success_rate": 0.94},
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### `GET /api/v1/agents/{agent_id}`

Returns one persisted agent. Unknown IDs return `404`.

## Jobs

### `POST /api/v1/jobs`

Creates a job. New jobs always start in `open`; privileged lifecycle and
assignment values cannot be supplied by the client.

Request fields:

```json
{
  "title": "Review a synthetic API contract",
  "description": "Return a structured review of the supplied contract.",
  "required_skills": ["review", "api"],
  "task_category": "software",
  "expected_output": "A structured JSON review.",
  "acceptance_criteria": [
    "Required JSON fields: summary, status",
    "Required terms: approved, synthetic"
  ],
  "budget": "125.00",
  "currency": "USD",
  "deadline": "2030-06-01T12:00:00Z",
  "additional_instructions": "Use synthetic examples only.",
  "requester_agent_id": null,
  "requirements": {}
}
```

Validation includes positive two-decimal budget, supported currency (`USD`,
`EUR`, `GBP`, `JPY`, `CAD`, `AUD`), timezone-aware future deadline within the
supported horizon, nonblank text, bounded skills/criteria, and rejection of
client-supplied workflow state.

Returns `201` with a job summary. Unknown `requester_agent_id` returns `404`;
invalid input returns `422`.

### `GET /api/v1/jobs`

Query parameters:

```text
status
task_category
min_budget
max_budget
search
requester_agent_id
skip
limit (1..100, default 100)
sort=newest|deadline
```

Response:

```json
{
  "items": [
    {
      "id": 17,
      "public_id": "job-free-001",
      "requester_agent_id": null,
      "executor_agent_id": null,
      "selected_agent_id": null,
      "title": "Unassigned contract review",
      "description": "Review an API contract before agent selection.",
      "required_skills": ["review", "api"],
      "task_category": "software",
      "expected_output": "A structured JSON review.",
      "acceptance_criteria": ["Findings are categorized"],
      "additional_instructions": "Use only synthetic examples.",
      "budget": "125.00",
      "currency": "USD",
      "deadline": "2030-06-01T12:00:00Z",
      "status": "open",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### `GET /api/v1/jobs/{job_id}`

Returns a persisted job summary. Unknown IDs return `404`.

### `GET /api/v1/jobs/{job_id}/events`

Returns job-level audit events with `id`, `job_id`, `actor_agent_id`,
`event_type`, `description`, `data`, and `created_at`. Unknown jobs return
`404`.

## Matching

### `POST /api/v1/jobs/{job_id}/matches`

Computes and persists one deterministic matching run for an `open` job.
Returns `201` with:

```json
{
  "job_id": 17,
  "metadata": {
    "run_id": "match-...",
    "scoring_version": "phase5-v1",
    "scoring_formula": {
      "skills": 0.5,
      "category": 0.2,
      "availability_deadline": 0.2,
      "budget": 0.1
    }
  },
  "candidates": [],
  "excluded_agents": []
}
```

Candidate records include agent identity, score, matched/missing skills,
compatibility breakdown, explanation, warnings, and eligibility. Missing jobs
return `404`; matching a non-open job returns `409`.

### `GET /api/v1/jobs/{job_id}/matches`

Returns the latest persisted run. Returns `204` when the job exists but has no
matching run and `404` for an unknown job.

### `POST /api/v1/jobs/{job_id}/matches/{agent_id}/select`

Persists an eligible agent selection after server-side revalidation. Optional
body:

```json
{"run_id": "match-..."}
```

The job remains `open`; this route does not create an agreement or escrow.
Repeated selection of the same agent is idempotent. A different selection,
missing agent, missing run, or ineligible agent returns `404` or `409` as
appropriate.

## Agreements

### `POST /api/v1/jobs/{job_id}/agreement`

Creates a proposal for an `open` job with a persisted selected agent. A
proposal starts at version `1` and stores an agreement-term snapshot.

Agreement terms include:

```text
scope
expected_deliverable
acceptance_criteria
verification_method
cancellation_conditions
dispute_conditions
instructions
verification_rules
```

Budget, deadline, and currency may be supplied in the agreement request;
omitted values use the job defaults. Returns `201`. Missing job/agent or an
invalid lifecycle state returns `404` or `409`; invalid terms return `422`.

### `GET /api/v1/jobs/{job_id}/agreement`

Returns the agreement or `204` when no agreement exists for a known job.
Unknown jobs return `404`.

### `GET /api/v1/agreements/{agreement_id}`

Returns an agreement with status, current terms, proposal history, amount,
currency, proposal version, accepted version, and timestamps. Unknown IDs
return `404`.

### `GET /api/v1/agreements/{agreement_id}/history`

Returns normalized proposal history entries. Unknown IDs return `404`.

### `POST /api/v1/agreements/{agreement_id}/revise`

Request revision:

```json
{"action":"request_revision","rationale":"Please clarify evidence requirements."}
```

Submit a revision:

```json
{
  "action":"submit_revision",
  "proposed_budget":"275.00",
  "proposed_deadline":"2030-06-05T12:00:00Z",
  "currency":"USD",
  "terms": {},
  "rationale":"Added the requested verification detail."
}
```

Allowed negotiation transitions are centralized. Invalid or terminal
transitions return `409`.

### Agreement actions

```text
POST /api/v1/agreements/{agreement_id}/accept
POST /api/v1/agreements/{agreement_id}/reject
POST /api/v1/agreements/{agreement_id}/cancel
```

An optional action body may contain a rationale. Acceptance freezes the current
proposal version and moves the job from `open` to `assigned`; it does not fund
escrow. Repeated acceptance is idempotent. Terminal agreement changes return
`409`.

## Simulated escrow

### `POST /api/v1/jobs/{job_id}/escrow/fund`

Funding requires an accepted agreement, an accepted version, and a fundable
assigned-or-later job state. The body contains only safe metadata:

```json
{
  "idempotency_key":"demo-funding-001",
  "reference":"local-demo-funding"
}
```

`amount` and `currency` are not financial authority and are discarded if sent
by a legacy client. The accepted agreement supplies the amount, currency,
agreement version, and job relationship. Successful first funding returns
`201`, creates one canonical `funding` ledger row, and records `escrow.created`
and `escrow.funded` transactionally.

Repeated matching funding returns the existing financial effect. Conflicting
idempotency metadata, missing agreement, non-accepted agreement, invalid job
state, or inconsistent legacy escrow data returns `409`.

### `GET /api/v1/jobs/{job_id}/escrow`

Returns the escrow or `204` when a known job has no escrow. Unknown jobs return
`404`. Response fields include accepted agreement version, accepted amount and
currency, nullable `funded_amount`, persisted status, public `funding_state`,
timestamps, and embedded compatible ledger entries.

### `GET /api/v1/escrows/{escrow_id}`

Returns one escrow. Unknown IDs return `404`.

### `GET /api/v1/escrows/{escrow_id}/ledger`

Returns append-only ledger history. Entry types are `deposit`, `funding`,
`hold`, `release`, `refund`, and `fee`. Unknown escrows return `404`.

### Settlement actions

```text
POST /api/v1/escrows/{escrow_id}/release
POST /api/v1/escrows/{escrow_id}/refund
```

Normal release requires a funded/held escrow, completed job, passing persisted
verification, consistent accepted agreement snapshot, reconciled funding
ledger, and no unresolved dispute. Refund requires a resolved dispute with a
refund outcome. Released/refunded escrows are terminal; repeated or conflicting
settlement requests return `409`.

## Execution and verification

### `POST /api/v1/jobs/{job_id}/start`

Starts the local demo execution boundary. It requires an accepted agreement,
matching selected executor, funded/held escrow, and an `assigned` job. It
moves the job to `in_progress` and records `execution.started`. It does not
call an external agent, run submitted code, or start a background worker.

Returns `200`; missing prerequisites or invalid job state return `409` and an
unknown job returns `404`.

### `GET /api/v1/jobs/{job_id}/execution`

Returns backend-derived execution state including:

```text
job_status
execution_status
selected_agent_id
executor_agent_id
agreement_id
accepted_agreement_version
escrow_status
executor_type
can_start
can_submit
can_verify
start_reason
submit_reason
verify_reason
started_at
latest_submission_version
latest_verification_result
```

### `POST /api/v1/jobs/{job_id}/submit`

Persists a new immutable submission version. Request:

```json
{
  "submitted_output":"{\"summary\":\"approved synthetic result\",\"status\":\"approved\"}",
  "evidence":{"source":"synthetic-fixture"},
  "notes":"Optional explanation",
  "agent_id":4
}
```

`agent_id` is optional but must match the accepted executor if provided. Output,
notes, and evidence have bounded sizes. Returns `201`; missing agreement,
agent mismatch, invalid job state, or retry limit returns `409`.

### `GET /api/v1/jobs/{job_id}/submissions`

Returns immutable submission history ordered by version. Unknown jobs return
`404`.

### `POST /api/v1/jobs/{job_id}/verify`

Evaluates the latest submission against the accepted agreement snapshot. The
request has no client-supplied criteria or claimed result. Repeating the
request for the same immutable submission returns the existing verification.

Verification responses include:

```text
id
job_id
submission_id
submission_version
status=pending|passed|failed
overall_result=pending|passed|failed|manual_review|needs_revision
individual_checks
reasons
evaluator_type
score
feedback
evaluated_at
verified_at
```

`manual_review` is not a pass. Passing automated checks move the job to
`completed` and make escrow settlement-eligible; verification does not release
escrow. Missing submission/agreement or invalid lifecycle state returns `409`.

### `GET /api/v1/jobs/{job_id}/verification`

Returns the latest persisted verification or `204` when none exists. Unknown
jobs return `404`.

### `GET /api/v1/dashboard/execution`

Returns persisted execution counts and recent submissions/verifications:

```text
jobs_running
jobs_awaiting_submission
jobs_awaiting_verification
jobs_eligible_for_settlement
recent_submissions
recent_verifications
```

## Disputes

### `POST /api/v1/jobs/{job_id}/disputes`

Creates a dispute for a related job with funded/held escrow. Request:

```json
{
  "escrow_id":8,
  "category":"failed_verification",
  "reason":"Verification result is disputed",
  "description":"The result should be reviewed against the accepted terms.",
  "evidence":{"source":"participant"},
  "raised_by_agent_id":4
}
```

Categories are `failed_verification`, `deliverable_incomplete`,
`agreement_mismatch`, `deadline_issue`, and `other`. The related agent must be
associated with the job. Opening a dispute moves the job and escrow to
`disputed`, records the previous states, and creates dispute/job/escrow audit
events. Invalid relationships or lifecycle states return `409`.

### Dispute reads

```text
GET /api/v1/jobs/{job_id}/disputes?status=open|under_review|resolved|rejected
GET /api/v1/disputes?status=open|under_review|resolved|rejected
GET /api/v1/disputes/{dispute_id}
GET /api/v1/disputes/{dispute_id}/events
```

Detail responses include accepted agreement terms, job requirements, evidence,
related submission/verification, resolution fields, and dispute-specific audit
events. Unknown jobs/disputes return `404`.

### `POST /api/v1/disputes/{dispute_id}/review`

Moves `open` to `under_review`. In development/test it requires:

```text
X-Demo-Operator: demo-operator
```

An optional body can contain a rationale. Missing or incorrect operator
returns `403`; invalid state returns `409`.

### `POST /api/v1/disputes/{dispute_id}/resolve`

Request:

```json
{
  "resolution":"release|refund|reject",
  "rationale":"At least 10 characters"
}
```

It also requires the development/test demo operator header. `release` invokes
the normal escrow release service, `refund` invokes the normal refund service,
and `reject` restores the captured workflow state without a financial ledger
entry. Terminal disputes cannot be resolved again.

## Dashboard metrics

### `GET /api/v1/dashboard/metrics`

Returns persisted aggregate fields:

```text
total_jobs
jobs_in_progress
completed_jobs
open_disputes
```

Money values are fixed-point strings. Aggregates do not include currency
metadata and should not be interpreted as a mixed-currency financial report.

## Error and security notes

Expected lifecycle failures use `409`; validation failures use `422`; missing
records use `404`; demo operator failures use `403`. Unexpected server errors
are not intended as a client workflow contract and should be investigated.

The API has no production authentication, tenant isolation, or ownership
authorization. The demo operator header is not a login system. Do not expose
this local/demo API to untrusted users or connect it to real funds.
