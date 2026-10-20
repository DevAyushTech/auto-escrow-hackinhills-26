# Agreement negotiation

Auto Escrow Phase 6 makes the agreement between a job and its selected agent a
persisted, auditable workflow. It is still demo mode: the workflow records
terms and lifecycle decisions, but it does not move money or call an escrow
provider.

## Preconditions

An agreement can be created only when:

- the job exists and is `open`;
- `selected_agent_id` is persisted on the job;
- the selected agent still exists; and
- no agreement already exists for the job.

The server owns these checks. The frontend does not treat a URL parameter or a
client-provided agent ID as a selection.

## Terms and versions

`POST /api/v1/jobs/{job_id}/agreement` accepts an optional proposal budget,
future timezone-aware deadline, currency, and `terms` object. If omitted, the
server uses the job defaults. Terms include:

- `scope`
- `expected_deliverable`
- `acceptance_criteria`
- `verification_method`
- `cancellation_conditions`
- `dispute_conditions`
- optional `instructions`

Every proposal has a `proposal_version` and an append-only
`proposal_history`. A created proposal is version 1. A revision submission
stores a complete terms snapshot, budget, deadline, timestamp, and optional
rationale before incrementing the version.

## State machine

```text
proposed -> revision_requested -> proposed
proposed -> accepted
proposed -> rejected
proposed -> cancelled
revision_requested -> rejected
revision_requested -> cancelled
```

Only `proposed` can be accepted. Accepted, rejected, and cancelled agreements
are terminal. The server rejects invalid transitions with `409 Conflict`.

## API actions

### Create

```http
POST /api/v1/jobs/17/agreement
Content-Type: application/json
```

```json
{
  "proposed_budget": "250.00",
  "proposed_deadline": "2030-06-01T12:00:00Z",
  "currency": "USD",
  "terms": {
    "scope": "Review the supplied release inputs.",
    "expected_deliverable": "A markdown release checklist.",
    "acceptance_criteria": ["Every release gate is listed"],
    "verification_method": "Requester reviews each criterion.",
    "cancellation_conditions": "Cancellation is allowed before acceptance.",
    "dispute_conditions": "Submit evidence for an unmet criterion.",
    "instructions": "Use the current release notes."
  }
}
```

Successful creation returns `201 Created` and records `agreement.proposed`.

### Request or submit a revision

Both actions use the same endpoint and an explicit action discriminator:

```http
POST /api/v1/agreements/6/revise
Content-Type: application/json
```

Request a revision:

```json
{
  "action": "request_revision",
  "rationale": "Clarify the verification output."
}
```

Submit revised terms:

```json
{
  "action": "submit_revision",
  "proposed_budget": "275.00",
  "proposed_deadline": "2030-06-05T12:00:00Z",
  "currency": "USD",
  "terms": { "...": "complete replacement terms" },
  "rationale": "Added the requested verification detail."
}
```

The response is the current agreement. History is available from
`GET /api/v1/agreements/{agreement_id}/history`.

### Accept, reject, or cancel

```http
POST /api/v1/agreements/6/accept
POST /api/v1/agreements/6/reject
POST /api/v1/agreements/6/cancel
```

Acceptance records `accepted_version` and `accepted_at`, freezes the current
terms, transitions the job from `open` to `assigned` through the centralized
job state machine, and records `agreement.accepted`. Repeating acceptance is
idempotent and does not create another audit event. It does **not** create,
fund, or settle escrow.

## Frontend walkthrough

After matching and server-side agent selection, open `/jobs/:jobId/agreement`.
The workspace loads the persisted job and agreement, validates required terms
before submission, displays backend errors, and shows only actions valid for
the current state. Accepted terms are rendered as frozen and the next escrow
link is informational only; no funding request is sent by this phase.

There is no authentication yet. The UI labels actions as demo mode and the
backend must be treated as authoritative until production identity and
authorization are added.
