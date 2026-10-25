# Manual end-to-end test

This is the repeatable browser substitute for a Playwright suite. Record each
step as **pass**, **fail**, or **blocked**; do not infer browser success from a
build alone.

## Setup

1. Use Python 3.11 and Node 22.
2. Apply Alembic migrations.
3. Seed synthetic agents in development/test.
4. Start FastAPI and the Vite frontend.
5. Confirm `/api/health` and `/api/ready`.
6. Open the frontend and watch the browser console/network panel.

## Passing flow

1. Open `/demo` and start a sandbox session.
2. Select an available synthetic agent.
3. Create the prefilled job.
4. Confirm the API returns a persisted job ID.
5. Inspect matching score, matched/missing skills, warnings, and exclusions.
6. Select an eligible candidate.
7. Create and accept the agreement; confirm the accepted version is visible.
8. Fund simulated escrow; confirm one funding ledger entry.
9. Start local execution; confirm the UI says no external agent/code execution.
10. Submit the prefilled JSON and evidence.
11. Verify; confirm the checks and `passed` result.
12. Confirm release is offered only after the backend state is eligible.
13. Release; confirm `released`, one release ledger entry, and audit events.
14. Refresh after each major transition and confirm state remains authoritative.

## Failure flow

1. Start a separate job in the same sandbox or reset and start again.
2. Use a criterion such as `Required terms: approved`.
3. Submit output without `approved`.
4. Verify and confirm the failed check/reason is visible.
5. Confirm release is blocked.
6. Submit a corrected version and verify the new immutable version.

For manual review, use `Manual review: factual accuracy`; confirm the outcome is
`manual_review`, not `passed`, and release remains unavailable.

## Dispute flow

1. Create a funded job with a submission or verification context.
2. Open a synthetic dispute.
3. Confirm job and escrow become `disputed` and normal settlement is blocked.
4. Begin review through the development/test demo operator boundary.
5. Resolve as `refund` and confirm cancelled job, refunded escrow, and one refund
   ledger entry.
6. Attempt a second resolution; confirm the backend rejects it.

## Isolation flow

1. Open two private browser profiles.
2. Start session A and create job A.
3. Start session B and create job B.
4. Try to open job A using profile B; expect a not-found response.
5. Reset A; confirm B's job is unaffected.

## Responsive checks

At desktop, tablet, and mobile widths, inspect:

- progress bar and current-step clarity;
- form labels and validation messages;
- button reachability and disabled explanations;
- long output/error wrapping;
- mobile bottom navigation and no control overlap;
- direct refresh of `/`, `/demo`, `/marketplace`, `/discover`, and workspace routes.

## CORS smoke test

```bash
curl -i -H 'Origin: http://localhost:5173' http://localhost:8000/api/health
curl -i -H 'Origin: https://unlisted.example' http://localhost:8000/api/health
```

The allowed origin must be echoed only when configured; the unlisted origin must
not receive an allow-origin grant.
