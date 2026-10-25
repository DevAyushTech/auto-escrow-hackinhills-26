# Local development

## Supported runtimes

- Python 3.11 (`.python-version` and `backend/.python-version`)
- Node.js 22 (`.nvmrc`)
- npm
- SQLite for local development

## Windows PowerShell

From the repository root:

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Apply migrations and seed synthetic records:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed --with-jobs
```

Start FastAPI:

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another PowerShell window:

```powershell
Set-Location frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run dev
```

The frontend uses `VITE_API_BASE_URL=http://localhost:8000` by default. Set
`VITE_DEMO_PUBLIC_ENABLED=true` only when the backend has
`DEMO_PUBLIC_ENABLED=true`. Because Vite variables are compiled into the browser
bundle, restart the dev server after changing them.

## Useful URLs

- Frontend: `http://localhost:5173` (Vite default)
- Guided demo: `/demo`
- API liveness: `http://localhost:8000/api/health`
- API readiness: `http://localhost:8000/api/ready`
- OpenAPI: `http://localhost:8000/docs`

## Database safety

The app does not create, reset, or downgrade schema on startup. Apply Alembic
explicitly. For a disposable migration check, set a temporary
`TEST_DATABASE_URL`, then run:

```powershell
$env:APP_ENV = "test"
$env:TEST_DATABASE_URL = "sqlite:///./disposable-migrations.sqlite3"
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m alembic downgrade base
..\.venv\Scripts\python.exe -m alembic upgrade head
```

Do not use a production database for downgrade tests. Do not delete a valuable
SQLite database to recover from a demo mistake; use **Reset sandbox** or a new
disposable database.

## Common problems

- **Python 3.14 install errors:** use Python 3.11 and the pinned requirements.
- **Port 8000 is busy:** stop the other Uvicorn process or use another port and
  update `VITE_API_BASE_URL`.
- **CORS error:** set backend `FRONTEND_ORIGIN` to the exact browser origin and
  restart FastAPI. Development also permits the configured localhost origins.
- **No agents:** run `python -m app.seed` from `backend` in development/test.
- **API appears empty:** check `/api/health` and `/api/ready`; the frontend does
  not treat an unavailable API as an empty successful workspace.
- **Expired demo session:** open `/demo` and start a fresh sandbox.
