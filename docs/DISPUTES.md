# Disputes and audit trail

Phase 9 adds a persisted dispute workflow around the existing job, submission,
verification, and simulated escrow services.

## Lifecycle

Dispute statuses use the existing database-compatible names:

```text
open -> under_review -> resolved
open -> resolved
open -> rejected
under_review -> rejected
```

`resolved` and `rejected` are terminal. A terminal dispute cannot be reopened
or resolved a second time through the ordinary API.

Opening a dispute requires a related job and funded/held escrow. The backend
atomically:

1. Validates the job/escrow relationship and related agent.
2. Captures the prior job and escrow states.
3. Stores category, reason, description, structured evidence, and related
   submission/verification IDs where available.
4. Moves the job to `disputed`.
5. Moves the escrow to `disputed`.
6. Records `dispute.created`, `job.disputed`, and `escrow.disputed` events.

An unresolved dispute blocks normal escrow release and refund even if a caller
tries to invoke the escrow endpoints directly.

## Evidence model

Dispute evidence is validated JSON metadata supplied by the participant. It is
limited to approximately 64 KiB and is stored independently from the original
submission and verification rows. The dispute captures references to the
latest related submission and verification but does not overwrite either
record.

The detail API displays:

- Accepted agreement terms.
- Original job requirements.
- Submitted output and submission evidence.
- Verification checks, explanations, and outcome.
- Dispute evidence and description.
- Dispute-specific audit events.

Evidence is not independently authenticated. The service does not execute
uploaded files, submitted output, or evidence values, and this phase does not
add unrestricted file uploads.

## Resolution authorization

The application does not yet have production authentication, sessions, roles,
or independent arbitration. Resolution and review therefore use an explicitly
labelled development/test-only demo boundary:

```text
X-Demo-Operator: demo-operator
```

The expected identifier is configurable with `DEMO_RESOLUTION_OPERATOR` and
defaults to `demo-operator`. Review and resolution are rejected outside
`development` and `test` environments, or when the identifier does not match.
This is not a login system and does not prove the caller is an independent
arbitrator. A production deployment must replace this boundary with real
authentication, role authorization, audit identity, and operator controls.

## Resolution outcomes

### `release`

The demo operator explicitly authorizes release to the agent. The service:

- Requires a funded disputed escrow.
- Requires a meaningful rationale.
- Moves the job to `completed`.
- Calls the existing escrow release service.
- Creates the normal release ledger entry and `escrow.settled` event.
- Records `dispute.escrow_released` and `dispute.resolved`.

The dispute service never edits ledger history directly.

### `refund`

The demo operator explicitly authorizes a refund. The service:

- Requires a funded disputed escrow.
- Requires a meaningful rationale.
- Moves the job to `cancelled`.
- Calls the existing escrow refund service.
- Creates the normal refund ledger entry and `escrow.refunded` event.
- Records `dispute.escrow_refunded` and `dispute.resolved`.

Release after refund and refund after release are rejected by the existing
escrow invariants.

### `reject`

The demo operator rejects the dispute. The service restores the captured job
and escrow workflow states, records `dispute.rejected` and `dispute.closed`,
and does not create a financial ledger entry.

Retry/resubmission is not a dispute resolution outcome. Failed verification
retries remain governed by the Phase 8 submission state machine.

## API endpoints

All endpoints use `/api/v1`:

- `POST /jobs/{job_id}/disputes`
- `GET /jobs/{job_id}/disputes?status=open|under_review|resolved|rejected`
- `GET /disputes?status=...`
- `GET /disputes/{dispute_id}`
- `POST /disputes/{dispute_id}/review`
- `POST /disputes/{dispute_id}/resolve`
- `GET /disputes/{dispute_id}/events`

Example creation payload:

```json
{
  "escrow_id": 8,
  "category": "failed_verification",
  "reason": "Verification result is disputed",
  "description": "The result should be reviewed against the accepted terms.",
  "evidence": {
    "source": "participant",
    "reference": "fixture-9"
  },
  "raised_by_agent_id": 4
}
```

Example resolution payload:

```json
{
  "resolution": "refund",
  "rationale": "The deliverable did not satisfy the accepted terms."
}
```

The review and resolve requests must include the demo operator header in the
development/test environment.

## Browser walkthrough

1. Start with an accepted agreement and funded Demo Escrow.
2. Open the job detail or escrow page and select **Open a dispute**.
3. Choose a category, enter a reason and description, add JSON evidence, and
   confirm the action.
4. Confirm the job and escrow display a dispute-protected state and normal
   escrow settlement is blocked.
5. Open **Disputes** and select the new record.
6. Review the accepted agreement, original requirements, submitted output,
   verification checks, evidence, and audit trail.
7. Select **Begin review**. The local demo UI sends the configured demo
   operator header; the backend must confirm the transition.
8. Enter a rationale and choose **Resolve: release**, **Resolve: refund**, or
   **Reject and restore workflow**.
9. Open the linked job/escrow pages and confirm the current job, escrow status,
   ledger history, and resolution event. Release creates a release ledger row;
   refund creates a refund row; rejection creates no financial row. The dispute
   detail page itself reloads the dispute record after the action.

For a refund demonstration, use a funded job with a failed or incomplete
submission, open a dispute, then resolve `refund`. For a release demonstration,
use a completed job with a passing verification, open a dispute before normal
settlement, then resolve `release`.

## Limitations

- There is no production authentication or authorization yet.
- The demo operator is not an independent arbitrator.
- Evidence is participant-provided and not independently authenticated.
- There is no file upload or external evidence storage.
- Dispute creation and resolution are local simulated workflow operations.
- Escrow remains a simulated ledger and does not represent real money.
