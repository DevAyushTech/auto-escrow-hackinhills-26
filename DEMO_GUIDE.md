# Auto Escrow judge demo

## One-sentence pitch

Auto Escrow makes AI-agent work reviewable: it connects requirements to an
explainable match, freezes the accepted terms, records a simulated escrow,
checks the submitted result, and keeps settlement behind explicit backend rules.

## Preparation

From the repository root, use two PowerShell windows:

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed --with-jobs
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In the second window:

```powershell
Set-Location frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run dev
```

Open `http://localhost:5173/demo` from the Vite dev server.

## Two-minute presentation

1. **Frame the problem (15 seconds).** “A requester needs to know which agent
   fits, what was agreed, whether the result meets the criteria, and why a
   settlement decision was made.”
2. **Discover (20 seconds).** Select a synthetic agent and point out skills,
   availability, output formats, and completion estimate.
3. **Define (20 seconds).** Keep the prefilled task. Explain that budget,
   deadline, deliverable, and criteria are sent to FastAPI, not held only in
   React state.
4. **Match (20 seconds).** Show the real score, matched skills, warnings, and
   an excluded candidate. State that matching is a heuristic signal.
5. **Agree (15 seconds).** Create and accept the proposal. Point out the frozen
   version and that acceptance does not fund escrow.
6. **Fund (15 seconds).** Confirm simulated funding. Show the accepted amount,
   state, and the ledger disclaimer: no real money moved.
7. **Submit and verify (30 seconds).** Start local execution, submit the
   prefilled JSON fixture, and verify. Explain that submitted code is never
   executed and that the verifier uses the accepted agreement snapshot.
8. **Release (15 seconds).** Release only after the API reports settlement
   eligibility. Show the funding and release ledger entries.
9. **Record (10 seconds).** Finish on the audit timeline and explain that the
   record is the product: it tells the judge what happened and why.

## Failure/dispute branch

For a second flow, change the submitted output to omit `approved` or one of the
required JSON fields. Verification should show a failed check and keep release
blocked. Open a synthetic dispute, begin review, and resolve it as `refund`.
Show that the job becomes cancelled, escrow becomes refunded, and the ledger
contains one refund entry after funding. In public demo mode, the resolution is
session-scoped to the caller's own sandbox; it is not a shared operator account.

For a manual-review example, use a criterion containing `Manual review: factual
accuracy`. The result must be `manual_review`, not a pass.

## What to say if asked

- **Is this real escrow?** No. It is a persisted simulated ledger for the MVP.
- **Does it run agent code?** No. The local executor records the workflow and
  submitted output is never executed.
- **Can the frontend release funds?** No. The backend checks completed state,
  passed verification, unresolved disputes, ledger reconciliation, and terminal
  state before release.
- **How is a public demo scoped?** The server issues an expiring random token;
  job-linked records are owned by that session. Reset rotates the token and
  deletes only its records.
- **Is this production authentication?** No. It is bounded anonymous demo
  access, not a full account/tenant identity system.
