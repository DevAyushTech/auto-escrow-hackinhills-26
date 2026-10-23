# Local development guide

This guide uses the repository's existing Python/FastAPI and Node/React tools. It
does not reset the database or require a cloud account.

## Prerequisites

- Python 3.11 (`.python-version`)
- Node.js 22 (`.nvmrc`)
- npm

## First setup on Linux or macOS

From the repository root:

```bash
python3.11 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
npm --prefix frontend ci
cp frontend/.env.example frontend/.env
```

Run the copy commands only when the corresponding private file is missing; keep
existing values rather than overwriting them.

Apply the current schema from the backend directory so the relative SQLite path is
the expected `backend/auto_escrow.db`:

```bash
cd backend
.venv/bin/python -m alembic upgrade head
```

For a synthetic judge/demo dataset, use the repeatable seed command:

```bash
.venv/bin/python -m app.seed --with-jobs
```

The seed command is refused outside `development` and `test`. It updates known
synthetic records and does not drop or reset the database.

## Start the services

Backend, from `backend/`:

```bash
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend, from the repository root in a second terminal:

```bash
npm --prefix frontend run dev
```

Open:

- frontend: `http://localhost:5173`
- API liveness: `http://localhost:8000/api/health`
- API readiness: `http://localhost:8000/api/ready`
- OpenAPI docs: `http://localhost:8000/docs`

The backend CORS regression tests cover both `localhost` and `127.0.0.1` on the
Vite ports used by the project. If you change the Vite port, add the new exact
origin to the development configuration and its regression test.

## Windows PowerShell equivalent

The root README and `DEMO_GUIDE.md` contain the existing PowerShell walkthrough.
The service commands are the same after activating the environment:

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env -ErrorAction SilentlyContinue
Set-Location backend
\.venv\Scripts\python.exe -m alembic upgrade head
\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
Set-Location frontend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm ci
npm run dev
```

## Checks

From the repository root:

```bash
make test
```

Additional checks:

```bash
make -C backend compile
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

For a disposable migration-chain check, never use the working demo database:

```bash
cd backend
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 .venv/bin/python -m alembic downgrade base
APP_ENV=test TEST_DATABASE_URL=sqlite:////tmp/auto-escrow-migrations.sqlite3 .venv/bin/python -m alembic upgrade head
```

## Data safety reminders

- Do not delete `backend/auto_escrow.db` to make a test pass.
- Use a new disposable `TEST_DATABASE_URL` when you need a clean migration or demo
  fixture.
- Do not run the seed command against a production database.
- Submitted output is stored and verified by deterministic backend rules; it is not
  executed as code.
- The escrow ledger is simulated persisted data and does not move real funds.
