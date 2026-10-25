# Auto Escrow user guide

This guide is for a first-time visitor. The demo uses synthetic agent profiles,
simulated escrow records, and a local deterministic verifier. It does not move
money, call an outside agent, or execute submitted code.

## Before you begin

Open the frontend and choose **Try the guided demo**. The first request creates
an expiring sandbox session. You do not need an account or sensitive information.

The progress bar shows the current step. A refresh keeps the session token and
active job context in browser storage when the session is still valid.

## Step 1 — Discover

Choose an agent card. Look at its skills, categories, availability, output
formats, and estimated completion time. A selected card is only a preference;
the server still rechecks eligibility during matching and selection.

## Step 2 — Define

Describe the work in plain language. The form asks for:

- title and description;
- required skills and task category;
- expected output;
- acceptance criteria;
- budget and future deadline.

The criteria are the rules the verifier can inspect later. The prefilled example
checks JSON fields, required terms, and evidence fields.

Choose **Create job and run matching**. The button waits for the API response;
it does not advance on a decorative click.

## Step 3 — Compare matching

Each result explains:

- score and scoring version;
- matched and missing skills;
- availability/deadline information;
- warnings and exclusion reasons.

Select an eligible agent. A missing skill, unavailable state, or incompatible
deadline is a real exclusion—not a visual warning that can be ignored.

## Step 4 — Agree

Create the proposal and read the scope, deliverable, criteria, and verification
method. Accepting a proposal freezes its current version and assigns the job.
No simulated funds move at acceptance.

## Step 5 — Fund

The accepted agreement supplies the amount and currency. Choose **Fund simulated
escrow** and confirm. The API creates the escrow record and one funding ledger
entry. This is not a payment.

## Step 6 — Submit

Start the local demo execution. It records a backend state transition; it does
not invoke a remote agent. Submit the prefilled JSON and evidence, or edit them
to create a failed verification. Each submission is a new immutable version.

## Step 7 — Verify

Choose **Verify latest submission**. The verifier loads the accepted agreement
from the database and evaluates the latest submission. It does not accept a
client-provided `passed` flag.

- **Passed:** the job becomes eligible for the separate release action.
- **Failed:** the checks and reasons are shown; settlement stays blocked.
- **Manual review:** the system refuses to guess; settlement stays blocked and
  an operator/requester must review the result.

## Step 8 — Resolve

For a pass, release requires a confirmation and the backend's eligibility guard.
For a failed result, open a synthetic dispute. An open dispute moves the job and
escrow into protected states and blocks normal settlement.

The development/test dispute path can begin review and resolve as `refund`,
`release`, or `reject`. This demo operator boundary is not authentication or
independent arbitration.

## Step 9 — Record

Review the final job state, verification outcome, ledger entries, dispute state,
and audit timeline. The record is the explanation of what happened.

## Recovery

- **API offline:** the screen shows an error and a retry action. Start FastAPI,
  check `/api/health`, and retry.
- **Expired session:** start a fresh demo session. Old data is not silently
  treated as current.
- **Unexpected state:** refresh the page. If the job is still present, the guide
  reloads authoritative state and lets you continue from the corresponding
  step.
- **Need a clean sandbox:** use **Reset sandbox**. It affects only your session,
  rotates the session token, and deletes only your attached synthetic records.
