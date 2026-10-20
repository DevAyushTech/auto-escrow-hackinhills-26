# Auto Escrow judge demo guide

**Team:** Code Rangers  
**Event:** Hack in Hills ’26 Round 2

This guide describes a repeatable local demonstration of the implementation that exists in this repository. It does not use fake screenshots, fabricated metrics, or claimed payment-provider activity.

## A. Opening pitch

AI-agent work is useful, but the requester still needs to know which agent was selected, what was agreed, whether the delivered result meets the criteria, and why a payment decision was made. Auto Escrow makes that workflow visible and reviewable.

The requester defines a job, compares explainable agent matches, accepts versioned agreement terms, and funds a simulated escrow derived from those terms. The local demo then stores a submission, evaluates it against the accepted criteria, and permits settlement only through backend rules. If the result fails or is disputed, the system keeps the escrow protected and records the decision in the ledger and audit trail.

The important distinction is that the frontend presents the workflow, while the FastAPI backend owns the state machine and financial authority.

## B. Prepare the demo

Use two PowerShell terminals from the repository root.

### Terminal 1 — backend

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Set-Location backend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
python -m alembic upgrade head
python -m app.seed --with-jobs
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Terminal 2 — frontend

```powershell
Set-Location frontend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/health`

The seed is repeatable and creates six synthetic agents plus two synthetic jobs. It does not reset the database and refuses to run outside `development` and `test`. Numeric database IDs are not guaranteed; use the records displayed by the UI or API rather than assuming that a seeded agent is always ID `4`.

## C. Successful workflow

For the most reliable passing demonstration, create a fresh job instead of relying on the seeded jobs' original criteria. Use criteria that the deterministic evaluator explicitly supports:

- `Required JSON fields: summary, status`
- `Required terms: approved, synthetic`
- `Required evidence fields: source`
- `Minimum length: 20 characters`

### Presentation sequence

1. Open **Agents** and show persisted agent records, availability, skills, categories, and synthetic-profile labels.
2. Open **Jobs → Create job**.
3. Enter a clear title, description, required skills, task category, expected output, budget, future deadline, and the criteria above.
4. Submit the job and point out that the UI navigates only after the backend confirms creation.
5. Open **Find Matching Agents** from the job detail page.
6. Show the ranked score, matched/missing skills, warnings, eligibility, and the versioned scoring policy.
7. Select an eligible agent. Explain that selection persists `selected_agent_id` but does not create an agreement or fund escrow automatically.
8. Open the **Agreement workspace** and create the proposal.
9. Optionally request a revision, submit revised terms, and show the versioned proposal history.
10. Accept the proposal. Show that the accepted version is frozen and the job becomes `assigned`.
11. Open **Escrow details** and point out the accepted amount/currency and the simulated-ledger disclaimer.
12. Choose **Fund Demo Escrow** and confirm the browser prompt.
13. After the API response, show the persisted `funded` status, one funding ledger entry, and related audit events.
14. Open **Execution workspace** and start the local demo execution.
15. Submit:

```json
{"summary":"approved synthetic result","status":"approved"}
```

with evidence:

```json
{"source":"synthetic-fixture"}
```

16. Run **Verify latest submission**. Explain that the verifier loads the accepted agreement from the database and does not accept a client-claimed pass.
17. Show the passing checks, `completed` job state, and settlement-ready status.
18. Open escrow and release through the permitted settlement action if the current page/workflow exposes it. Confirm the ledger contains funding and release entries and the audit history contains the corresponding events.

The passing verification itself does not release funds. Verification makes the escrow eligible; the escrow service performs the separate release operation.

## D. Failed-verification workflow

Use a funded job with a criterion such as:

```text
Required terms: approved
```

1. Start execution.
2. Submit `pending result` without the required term.
3. Run verification.
4. Show the failed check and the stored reason that the required term is missing.
5. Point out that the job remains under review and escrow is not released merely because a submission exists.
6. Submit a corrected result containing `approved`.
7. Confirm the new immutable submission version appears.
8. Verify again and show that the latest submission can now be evaluated independently of the earlier failed result.

For a manual-review demonstration, use a criterion such as `Manual review: factual accuracy`. The evaluator records `overall_result: manual_review`; it is not treated as a pass and does not expose an automatic retry path.

## E. Dispute and refund workflow

1. Use a funded job with a submission or verification context.
2. From the job or escrow page, choose **Open a dispute**.
3. Enter a reason, description, related agent, and JSON evidence.
4. Confirm that opening the dispute moves both the job and escrow into `disputed` protection.
5. Try the normal release/refund boundary and explain that unresolved disputes block settlement.
6. Open the dispute detail page and review:
   - accepted agreement terms;
   - original job requirements;
   - submitted output and evidence;
   - verification checks and reasons;
   - dispute evidence;
   - dispute-specific audit events.
7. Choose **Begin review**. In development/test mode the UI sends the configured demo operator boundary:

```text
X-Demo-Operator: demo-operator
```

8. Enter a rationale of at least 10 characters and choose **Resolve: refund**.
9. Confirm the dispute is terminal, the job is cancelled, the escrow is refunded, and the ledger contains one refund entry after the funding entry.
10. Attempt a second resolution or refund and show that the backend rejects it.

The other supported outcomes are:

- `release`: completes the job and calls the normal release service.
- `reject`: restores the captured workflow state without creating a financial ledger entry.

The demo operator header is not authentication, not independent arbitration, and not suitable for a public deployment.

## F. Technical explanation for judges

### Frontend and backend

The frontend is React 18 with Vite, TypeScript, React Router, Tailwind CSS, and a typed API client. The backend is FastAPI with Pydantic contracts, SQLAlchemy 2, Alembic, and SQLite by default. The frontend renders server responses and never owns authoritative lifecycle state.

### Matching

Matching is deterministic and versioned as `phase5-v1`:

- skills: 50%;
- exact task category: 20%;
- availability/deadline: 20%;
- budget: 10%.

Agent status, availability, required skills, and deadline feasibility are eligibility rules. Agent pricing does not exist in the current model, so the budget component is neutral and includes a warning rather than inventing a price.

### Verification

Verification evaluates the latest immutable submission using the accepted agreement snapshot. It supports deterministic JSON, field, section, term, length, evidence, format, and restricted JSON-schema checks. Subjective criteria become `manual_review` rather than being guessed or marked as passed.

### Escrow and ledger

Funding derives amount and currency from the accepted agreement. The backend records a canonical funding ledger entry and validates idempotency, currency, job relationship, balance reconciliation, and terminal states. Release requires completed job plus passing verification. Refund requires an authoritative resolved dispute. Ledger and audit updates are transactional.

### Audit and disputes

Audit events record successful lifecycle changes. Disputes capture the prior job/escrow states, evidence, related submission/verification IDs, and resolution outcome. Unresolved disputes block normal settlement.

### Security boundary

This is a local/demo MVP. It has no production authentication, authorization, tenant isolation, real payment provider, custody, wallet, blockchain transaction, or independent arbitration. The local executor does not run submitted code or call an external agent runtime.

## G. Demo recovery

### API or frontend is not running

- Check `http://localhost:8000/api/health`.
- Start the backend from `backend/` with the Uvicorn command above.
- Confirm `frontend/.env` contains `VITE_API_BASE_URL=http://localhost:8000`.
- Restart the Vite process after changing a `VITE_` variable because it is read at build/dev startup.

### Migration or schema error

Use a disposable database, not a valuable development database:

```powershell
Set-Location backend
$env:APP_ENV = "test"
$env:TEST_DATABASE_URL = "sqlite:///./phase12-demo.sqlite3"
python -m alembic upgrade head
```

For a complete disposable-chain check, use `python -m alembic downgrade base` followed by `python -m alembic upgrade head`. Do not run downgrade commands against production data.

### Need a clean demo dataset

There is no application reset endpoint. Use a new disposable SQLite path, migrate it, and run the idempotent seed command. Do not delete or overwrite a valuable database to recover a presentation.

```powershell
$env:APP_ENV = "test"
$env:TEST_DATABASE_URL = "sqlite:///./phase12-clean-demo.sqlite3"
python -m alembic upgrade head
python -m app.seed --with-jobs
```
