# Manual deployment preparation

**Status:** preparation only. No hosting account, database, public URL, or
deployment was created by this workspace.

## Selected architecture: static frontend, API service, database

Use one Render project with:

1. **Frontend:** Vite static site built from `frontend/`.
2. **Backend:** FastAPI Python web service rooted at `backend/`.
3. **Database:** persistent managed PostgreSQL.

The active frontend is a Vite SPA. `npm run build` produces `frontend/dist`,
and the included `frontend/nginx.conf` provides the SPA fallback required for
direct refreshes such as `/demo` and `/jobs/17`. Use a static-site provider or
the included Nginx container; do not configure a Next.js `next start` service
for the active app.

The backend can also be built from `backend/Dockerfile`, but the native Python
service is simpler because Render can run the migration as an explicit
pre-deploy command and inject its `$PORT` value.

## Before creating services

1. Publish the repository yourself using the checklist in the root handoff
   response. Do not publish `.env`, local databases, `.venv`, `node_modules`, or
   `dist` output.
2. Create a Render project/environment for the demo.
3. Create the PostgreSQL database first and copy its **internal** connection
   string into the backend service. Do not paste it into frontend variables.
4. Review the current Render compute-plan and billing pages. Render currently
   documents that free web services spin down after 15 minutes of inactivity and
   that free Postgres databases expire 30 days after creation. Availability,
   included usage, database retention, and pricing can change. Do not assume a
   free plan is suitable for a judge-facing link or persistent database.

## Create the PostgreSQL database

In the Render dashboard:

1. **New → PostgreSQL**.
2. Select the region nearest the expected judges and the plan you can afford.
3. Enable the provider's available backups/retention options.
4. After creation, copy the connection string from the database page.
5. Keep the database private to the Render project where possible. Use the
   internal connection string for the backend service.

Do not point a hosted service at `sqlite:///./auto_escrow.db`. A redeploy can
replace an ephemeral filesystem and lose records.

## Create the backend service

Create **New → Web Service** from the repository.

Recommended fields:

| Field | Value |
| --- | --- |
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Pre-Deploy Command | `python -m alembic upgrade head` on a paid web service |
| Start Command | `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/ready` |
| Auto-Deploy | Manual initially, then choose deliberately |

The pre-deploy migration is a controlled schema step. Render documents that
pre-deploy commands run after build and before deployment, but are available for
paid web services, private services, and background workers—not free web
services. If you select a free web service, do not silently skip migrations:
run the exact command once through an approved provider shell/one-off mechanism
or from a controlled machine with the same production `DATABASE_URL`, then
verify the migration head before enabling traffic.

### Backend environment variables

Enter these in the backend service's Environment page:

```text
APP_NAME=Auto Escrow API
APP_ENV=production
DATABASE_URL=<Render PostgreSQL connection string>
FRONTEND_ORIGIN=https://<your-frontend-service>.onrender.com
DEMO_PUBLIC_ENABLED=true
DEMO_SEED_ENABLED=false
DEMO_SESSION_TTL_MINUTES=120
DEMO_MAX_JOBS_PER_SESSION=3
DEMO_RATE_LIMIT_PER_MINUTE=120
DEMO_SESSION_CREATE_LIMIT_PER_HOUR=10
DEMO_MAX_REQUEST_BYTES=300000
MAX_SUBMISSION_RETRIES=2
```

Do **not** set `DEMO_RESOLUTION_OPERATOR` as a public security control. In public
mode, the guided demo sends the `demo-session` operator boundary and the backend
allows review/resolution only when the dispute belongs to the caller's session.
This is still not authentication or independent arbitration.

After the first deploy, verify:

```powershell
curl.exe -fsS https://<backend-service>.onrender.com/api/health
curl.exe -fsS https://<backend-service>.onrender.com/api/ready
```

The readiness response must be `ready` after migrations. A healthy process with
an un-migrated database is not deployment success.

## Create the frontend static site

Create a **Static Site** from the same repository, or serve the included
`frontend/Dockerfile` as a container:

| Field | Value |
| --- | --- |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |

Set this build-time/public variable before the build:

```text
VITE_API_BASE_URL=https://<backend-service>.onrender.com
VITE_DEMO_PUBLIC_ENABLED=true
```

This value is intentionally public because the browser must know where the API
is. It must contain only the HTTPS API origin; never put database credentials or
operator values in it.

After the frontend service has its final URL, update the backend's exact
`FRONTEND_ORIGIN` to that origin with no path and no trailing slash. Redeploy the
backend after changing CORS.

## Render dashboard sequence

1. Create PostgreSQL.
2. Create backend web service.
3. Add backend variables and confirm the migration/pre-deploy result.
4. Check `/api/ready`.
5. Temporarily set `DEMO_SEED_ENABLED=true`, then run the controlled
   synthetic-agent seed once from the
   backend release shell: `python -m app.seed --allow-production-demo`. Do not
   pass `--with-jobs`; visitor jobs must be session-scoped. Then set
   `DEMO_SEED_ENABLED=false` and redeploy/restart.
6. Create the frontend static site with `VITE_API_BASE_URL` and
   `VITE_DEMO_PUBLIC_ENABLED`.
7. Open the frontend URL from the Render service page.
8. Start the guided demo and confirm `POST /api/demo/session` succeeds.
9. Return to backend Environment and confirm `FRONTEND_ORIGIN` exactly matches
   the browser origin.
10. Redeploy both services after any final environment changes.

Render assigns each web service an `onrender.com` URL. Do not write that URL into
documentation or share it until the service exists and the post-deployment
checks pass.

## Database and persistence operations

### First release

The backend pre-deploy command is:

```bash
python -m alembic upgrade head
```

The current migration head is `0011_demo_sessions`. Confirm it in the service
logs or a controlled shell with `python -m alembic current`.

### Synthetic agents

The normal seed command is refused when `APP_ENV=production`. For this bounded
synthetic demo, the explicit production-safe path requires
`DEMO_SEED_ENABLED=true` plus `python -m app.seed --allow-production-demo` from
a controlled release shell. Run it without `--with-jobs`, then disable the flag.
Do not run any other seed command against the hosted production database.

### Redeploy and rollback

- A frontend redeploy does not change PostgreSQL data.
- A backend redeploy does not change data unless the explicit migration step
  runs.
- Review migration files before each release; prefer forward fixes to automatic
  downgrades.
- If a release fails, keep the database at its current migration level, route
  traffic to the last known-good compatible service, and preserve logs.
- Use the managed database provider's backup/restore procedure for data recovery.

## Post-deployment verification

Run from a machine that can reach the services:

```powershell
curl.exe -fsS https://<backend-service>.onrender.com/api/health
curl.exe -fsS https://<backend-service>.onrender.com/api/ready
```

In a browser:

1. Open the frontend root and `/demo`.
2. Refresh `/demo` directly; it must not return a host 404.
3. Start a demo session and confirm the browser network request includes the
   server-issued `X-Demo-Session` header on `/api/v1` calls.
4. Create a job and confirm it is visible after refresh.
5. Use a second browser profile to create a second session; confirm the first
   job is not readable by the second token.
6. Complete one passing flow and verify that release is a separate action.
7. Complete one failed-verification flow and confirm release remains blocked.
8. Create/reset a dispute sandbox and confirm the other session remains intact.
9. Check the API response `Access-Control-Allow-Origin` is the exact frontend
   origin, not `*`.
10. Check service logs for startup errors, migration errors, repeated 401s, and
    rate-limit responses.

## Troubleshooting

- **502/port error:** the service must bind to `0.0.0.0` and use `$PORT`.
- **CORS error:** set the exact frontend origin in backend `FRONTEND_ORIGIN` and
  redeploy; do not add a wildcard.
- **Readiness 503:** inspect `DATABASE_URL`, network access, and migration logs.
- **Frontend points to localhost:** rebuild the frontend after setting
  `VITE_API_BASE_URL`; browser variables are compiled at build time.
- **No agents:** hosted production does not auto-seed. Populate synthetic data
  through a controlled non-startup process.
- **Session 401:** the token expired, was reset, or was copied incorrectly. Start
  a new sandbox rather than bypassing the header.

## Current limitations

This architecture is a restricted hackathon prototype, not a real financial
deployment. It does not provide full user authentication, tenant accounts,
payment custody, independent arbitration, production actor identity, provider
backups verification from this workspace, or an audited incident-response
program.

Also review the current frontend dependency audit before launch. The pinned
frontend dependency tree reports high/critical advisories. Do not use the
unrestricted public internet as the threat model until remediation is reviewed.

## Official Render references to re-check before launch

- [Deploy a FastAPI app](https://render.com/docs/deploy-fastapi)
- [Your first deploy](https://render.com/docs/your-first-deploy)
- [Environment variables](https://render.com/docs/configure-environment-variables)
- [Static sites](https://render.com/docs/static-sites)
- [Pre-deploy commands](https://render.com/docs/deploys#pre-deploy-command)
- [Render pricing](https://render.com/pricing)
