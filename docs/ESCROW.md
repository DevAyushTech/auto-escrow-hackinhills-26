# Simulated escrow ledger

Phase 7 adds a persistent, server-authoritative escrow ledger for the local
demo. It records application state; it does not transfer, custody, or settle
real money and it does not create blockchain transaction hashes.

## Architecture

An escrow belongs to exactly one job and one agreement. Funding copies the
accepted agreement version, amount, and currency onto the escrow. Ledger rows
are append-only and identify the escrow, job when known, entry type, positive
fixed-point amount, currency, idempotency key, timestamp, and safe reference.
Legacy `deposit` rows remain readable; new demo funding uses the canonical
`funding` entry type.

The current model retains `pending` as the persisted compatibility value for
the public `not_funded` state.

## State machine

```text
pending/not_funded -> funded
funded -> held | released | refunded | disputed
held -> released | refunded | disputed
disputed -> released | refunded (only with a valid resolved dispute)
released -> terminal
refunded -> terminal
```

The service, not the frontend, applies transitions. Amounts and currencies are
never accepted from the funding UI as financial authority.

## Funding prerequisites

`POST /api/v1/jobs/{job_id}/escrow/fund` requires:

- an existing job;
- one agreement belonging to that job;
- `agreement.status == accepted` and an `accepted_version`;
- an assigned-or-later fundable job state; and
- no already funded escrow for the job.

The body may contain only optional idempotency metadata:

```json
{
  "idempotency_key": "demo-funding-001",
  "reference": "local-demo-funding"
}
```

`amount` and `currency` are deliberately not part of the funding contract.
If legacy clients send them, they are discarded and the accepted agreement
remains authoritative.

Successful funding returns `201`, creates the escrow and one positive funding
ledger row, and records `escrow.created` and `escrow.funded` in the same
transaction. A repeated request for the same funded escrow returns the existing
record without another financial effect. A conflicting idempotency key or
reference returns `409 Conflict`.

## Ledger invariants

- Ledger entries are append-only during ordinary operations.
- Every amount is positive and stored as a two-decimal `Decimal` value.
- Release/refund effects cannot exceed the funded balance.
- An escrow cannot be released and refunded.
- Released and refunded states are terminal; repeated operations are rejected.
- A failure before commit rolls back the escrow, ledger, and audit rows
  together.

## Settlement and refund guards

The endpoints exist so later workflow phases have a safe service boundary:

```http
POST /api/v1/escrows/{escrow_id}/release
POST /api/v1/escrows/{escrow_id}/refund
```

Release is rejected with `409 verification is required` until the job is
completed and a related submission has a passing verification result. Refund
is rejected unless a server-side dispute is resolved with a refund decision.
An unresolved dispute cannot be bypassed by a frontend request. No frontend
button claims settlement or refund in this phase.

## Read APIs

- `GET /api/v1/jobs/{job_id}/escrow` returns `204` when no record exists and
  `404` for an unknown job.
- `GET /api/v1/escrows/{escrow_id}` returns the escrow snapshot and embedded
  compatible ledger entries.
- `GET /api/v1/escrows/{escrow_id}/ledger` returns append-only ledger history.

The escrow response includes the accepted agreement version, accepted amount
and currency, persisted funding status, timestamps, and a readable funding
state. Ledger responses include entry ID, escrow ID, optional job ID,
idempotency key, type, amount, currency, reference, and timestamp.

## Frontend demonstration

1. Run migrations and seed demo agents/jobs.
2. Create or open an `open` job, run matching, and persist an agent selection.
3. Open the agreement workspace, create a proposal, and accept it.
4. Open `/jobs/:jobId/escrow` from the accepted agreement or job detail page.
5. Verify the agreed amount/version and the **Simulated demo ledger — no real
   money or blockchain transfer** notice.
6. Choose **Fund Demo Escrow**, confirm the browser prompt, and wait for the
   API response.
7. Verify the persisted `Funded` status, one funding entry, and related audit
   events. The page directs the user toward execution/submission; it does not
   claim funds were released.

## Limitations and future integration

This MVP has no authentication or authorization, no independent custody, no
payment provider, no wallet, no chain transaction, and no production dispute
resolution. A real integration would require regulated payment/custody
decisions, authenticated principals, authorization and approval policy,
provider/webhook reconciliation, durable idempotency across failures,
double-entry accounting or an equivalent audited ledger, fraud/AML controls,
secrets management, monitoring, and legal/compliance review. A blockchain
integration would additionally require a wallet/key-management design,
contract audit, chain confirmation/reorg handling, and truthful transaction
references from the provider rather than fabricated hashes.
