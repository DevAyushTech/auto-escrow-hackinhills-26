# Execution and verification

Phase 8 adds a backend-authoritative execution boundary, immutable work
submissions, and deterministic verification for the simulated Auto Escrow
workflow.

## Architecture

The MVP deliberately uses a **local demo executor**. `POST /start` does not
call an external AI agent, run shell commands, execute Python, or launch a
background task. It validates the persisted job, accepted agreement, selected
executor, and funded escrow, then moves the job from `assigned` to
`in_progress` and records `execution.started`. The UI tells the user that the
next step is a manual/local submission.

The authoritative workflow is:

```text
assigned + accepted agreement + funded escrow
  -> in_progress                 (start)
  -> submitted                   (submission)
  -> under_review                (verification starts)
  -> completed                   (all automated checks pass)
```

A failed automated verification leaves the job in `under_review`. A permitted
retry creates the next immutable submission version and moves the job back to
`submitted`. The demo default permits two retries after the initial
submission; configure `MAX_SUBMISSION_RETRIES` in the backend environment to
change it. A manual-review result leaves the job protected in `under_review`
and does not permit an automatic retry.

Completed jobs cannot restart. Cancelled and disputed jobs cannot execute.
All status mutations are performed by backend services through the existing
central job transition table; the frontend never supplies a job status.

## Submission format and limits

Submit JSON such as:

```json
{
  "submitted_output": "{\"summary\":\"approved synthetic result\"}",
  "evidence": {
    "source": "synthetic-fixture",
    "references": ["fixture-1"]
  },
  "notes": "Optional explanation of the submission",
  "agent_id": 4
}
```

`agent_id` is optional in the demo and must match the accepted executor when
provided. Output is limited to 100,000 characters, notes to 4,000 characters,
and structured evidence to approximately 64 KiB of JSON. Empty output and
non-object evidence are rejected. Output and evidence are persisted as data;
they are never interpreted as code.

Submission history is append-only by `(job_id, version)`. Each record includes
the job, executor, version, local artifact reference, output, evidence,
timestamp, status, and optional notes. Audit metadata records sizes and keys,
not the full output.

## Deterministic verification

`POST /verify` always loads the accepted agreement from the database. It does
not accept criteria or a claimed result from the caller. The evaluator type is
`automated`, and the result is persisted with the checks, explanations,
evidence, score, reasons, and timestamps.

Supported automatic checks include:

- valid JSON output (`Output must be valid JSON`);
- required JSON fields (`Required fields: summary, status`);
- required sections (`Required sections: Summary, Risks`);
- required terms (`Required terms: approved, synthetic`);
- minimum character or word length (`Minimum length: 20 characters`);
- required evidence fields (`Required evidence fields: source`);
- configured output formats for JSON, Markdown, text, and basic CSV;
- a safe JSON-schema subset configured in accepted agreement terms under
  `verification_rules.json_schema`.

Agreement terms may also include deterministic `verification_rules` such as
`output_format`, `required_fields`, `required_terms`,
`required_evidence_fields`, `min_length`, and `json_schema`. These rules are
stored in the accepted agreement snapshot and cannot be changed by a verify
request.

Criteria that are subjective or cannot be safely evaluated—such as factual
accuracy, originality, professional quality, or safety—produce a
`manual_review` check and overall result. They are not treated as passes.
Deterministic checks cannot prove those properties.

Repeated verification of the same immutable submission is idempotent: the
existing result is returned and no second verification row or duplicate audit
event is created. A retry is a new submission version with a new verification
record.

## Verification and settlement

Passing verification changes the job to `completed`, records
`verification.passed` and `job.settlement_ready`, and makes the escrow
eligible for the existing settlement service. Verification does **not** issue
release payment. The escrow release service still checks that:

- the escrow is funded or held;
- the accepted agreement snapshot is consistent;
- the job is completed;
- a persisted verification is `passed` with `overall_result == "passed"`;
- no unresolved dispute blocks settlement;
- the escrow has not already been released or refunded.

Failed and manual-review outcomes keep the escrow protected. No dispute
creation or operator resolution UI is included in this phase.

## API endpoints

All endpoints use `/api/v1`:

- `POST /jobs/{job_id}/start` — validate prerequisites and start local demo execution;
- `GET /jobs/{job_id}/execution` — return backend-derived execution status and action eligibility;
- `POST /jobs/{job_id}/submit` — persist a new submission version;
- `GET /jobs/{job_id}/submissions` — return submission history;
- `POST /jobs/{job_id}/verify` — evaluate the latest submission;
- `GET /jobs/{job_id}/verification` — return the latest persisted verification or `204`;
- `GET /dashboard/execution` — return running/submission/verification/settlement-ready counts and recent records.

The existing escrow endpoints remain responsible for funding, release, and
refund. Verification is never allowed to bypass those invariants.

## Browser walkthrough

1. Apply migrations and seed synthetic agents/jobs as described in the root
   README.
2. Open a job with a selected agent, create and accept its agreement, then
   fund **Demo Escrow**.
3. Open **Execution workspace** from the job detail or escrow page.
4. Confirm **Start execution**. The page should show `Awaiting submission` and
   identify the executor as **Local demo executor**.
5. Submit a passing output, for example
   `{"summary":"approved synthetic result","status":"approved"}`, and
   evidence `{"source":"synthetic-fixture"}` when the agreement criteria
   require those fields.
6. Select **Verify latest submission**. The page should show passing checks,
   `Settlement Ready`, and a separate escrow settlement next step. No release
   occurs from this action.
7. For a failing demonstration, use output `pending result` for criteria
   `Required terms: approved`. Verification should show the failed check,
   leave the job under review, keep escrow funded, and expose a retry form.
8. For manual review, use a criterion such as `Manual review: factual
   accuracy`. The result should be `manual_review`, not `passed`, with a clear
   manual-review next step.

## Limitations

This phase has no authentication or production authorization, so the local
demo trusts the caller while still enforcing agent/job agreement consistency.
It has no external agent runtime, payment provider, custody, dispute operator,
factual evaluator, originality detector, safety classifier, or professional
quality assessor. The local artifact URL is an internal demo reference, not a
downloadable external artifact. Escrow remains a simulated ledger and does
not represent real funds.
