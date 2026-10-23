# Manual end-to-end test script

This script verifies the real UI-to-API workflow without inventing records. Run it
against a local seeded environment or a restricted synthetic deployment.

## Setup

1. Apply migrations.
2. Seed synthetic agents and optional jobs with `python -m app.seed --with-jobs` in
   development/test only.
3. Start FastAPI and Vite.
4. Confirm `/api/health` and `/api/ready` both respond successfully.
5. Open the frontend and note the browser console/network panel for CORS errors.

## Pass criteria

Record each result as **pass**, **fail**, or **blocked by unavailable service**.

### 1. Discover an agent

- Open **Agents**.
- Confirm the list shows only returned persisted agents.
- Search by a name or skill and filter by availability/status.
- Open an agent detail page.
- Confirm skills, categories, output formats, availability, and any stored demo
  metadata are visible without invented reviews or performance history.
- Use **Select for job** and confirm the UI explains that the URL context is not yet
  a persisted assignment.

### 2. Create a job

- Open **Jobs → Create job**.
- Enter a title, description, category, expected deliverable, at least one
  acceptance criterion, positive budget, supported currency, and future deadline.
- Submit once and confirm the button enters a pending state.
- Confirm navigation happens only after the API returns the persisted job.
- Refresh the detail page and confirm the same job ID remains present.
- Try an invalid budget or past deadline; confirm field errors appear and other
  entered values remain in the form.

### 3. Run explainable matching

- From the job detail workflow map, open **Run matching**.
- Confirm the page displays the persisted run ID, scoring version, formula, ranked
  candidates, matched/missing skills, warnings, and excluded-agent reasons.
- Confirm the score is described as a heuristic ranking signal.
- Inspect an agent before selecting it.
- Select an eligible agent and confirm the response returns to the job detail page.
- Confirm `selected_agent_id` is now persisted, the job is still `open`, and no
  agreement or escrow was silently created.

### 4. Negotiate and accept terms

- Open the agreement workspace.
- Confirm the form is prefilled from the persisted job.
- Create a proposal and inspect its persisted status/history.
- Request a revision, change a term, and submit the revision.
- Confirm the proposal version/history changes.
- Accept the agreement after reading the confirmation.
- Confirm the status is `accepted`, the accepted version is displayed as frozen,
  the job becomes `assigned`, and escrow is still not funded.

### 5. Fund simulated escrow

- Open the escrow workspace.
- Confirm the page explicitly says that the ledger is simulated and no real money or
  blockchain transfer occurs.
- Confirm accepted amount and currency come from the agreement response.
- Fund once after the confirmation prompt.
- Confirm the page reloads persisted data and shows `funded` plus one funding ledger
  entry.
- Repeat or double-click the action while it is pending; confirm the UI prevents a
  duplicate request and the backend does not create duplicate ledger effects.

### 6. Execute and verify a passing submission

- Open **Execution workspace** and start the local demo execution.
- Confirm the page states that no external agent is called and submitted code is not
  executed.
- Submit a fixture matching the accepted criteria. For example:

```json
{"summary":"approved synthetic result","status":"approved"}
```

with evidence:

```json
{"source":"synthetic-fixture"}
```

- Verify the latest submission.
- Confirm the actual checks and overall result are shown.
- Confirm a passing verification makes the escrow settlement-eligible but does not
  release it automatically.
- Return to escrow and use **Release simulated escrow** only when the page reports
  settlement eligibility. Confirm the prompt, pending state, persisted `released`
  status, release ledger entry, and audit event.

### 7. Verify a failing submission

- Use a funded job with a requirement such as `Required terms: approved`.
- Submit output that omits `approved`.
- Verify it.
- Confirm the failed check and reason are shown.
- Confirm the job remains protected/under review and no release button is offered.
- Submit a corrected immutable version and verify again.
- Confirm the latest verification is evaluated independently and the earlier failed
  submission remains visible in history.

### 8. Verify manual review behavior

- Use a criterion such as `Manual review: factual accuracy`.
- Submit a result and verify it.
- Confirm the outcome is `manual_review`, not `passed`.
- Confirm the UI explains what happens next and does not offer settlement release.

### 9. Dispute and resolution

- From a funded job, open a dispute.
- Enter a meaningful reason, description, related agent, and JSON evidence.
- Confirm the job and escrow move to `disputed` protection.
- Confirm normal settlement is blocked while the dispute is open.
- Open the dispute detail page and review agreement terms, job requirements,
  submission, verification, evidence, and audit events.
- In development/test only, begin review through the configured demo operator
  boundary. This is not authentication or independent arbitration.
- Resolve as `refund` and confirm the job is cancelled, escrow is refunded, and a
  single refund ledger entry is added.
- Attempt a second resolution/refund and confirm the backend rejects it.
- Repeat with `reject` on another synthetic dispute and confirm prior workflow
  state is restored without an unauthorized ledger effect.

## CORS regression smoke test

From a machine that can reach the API:

```bash
curl -i -H 'Origin: http://localhost:5173' http://localhost:8000/api/health
curl -i -H 'Origin: https://unlisted.example' http://localhost:8000/api/health
```

The first response must include:

```text
access-control-allow-origin: http://localhost:5173
```

The second response must not grant that origin. Do not use a wildcard to make the
second request appear to work.

## Browser automation limitation

This repository does not include a browser automation runner. The script above is
the repeatable manual substitute; do not report browser-level responsive or direct
refresh verification as completed unless it was actually performed.
