# Auto Escrow deployment guide

**Status:** deployment preparation only. No cloud account, paid service, database, or
public URL has been provisioned from this workspace.

## Recommended architecture

For a controlled synthetic demo, use two containers behind one HTTPS ingress and a
persistent PostgreSQL database:

```text
HTTPS ingress
├── demo.example.com      → frontend Nginx container
└── api.demo.example.com → FastAPI backend container → managed PostgreSQL
```

This keeps the existing React/Vite and FastAPI split, preserves the included SPA
fallback, and avoids placing SQLite on an ephemeral container filesystem. A single
container host or platform that supports Docker, private environment variables,
release commands, health checks, and persistent external databases is suitable.

The application is **not safe for unrestricted public writes** yet: it has no real
authentication, authorization, tenant isolation, rate limiting, or real payment
custody. Put the demo behind the host's access gate or an invite-only network and
use synthetic data only.

## Artifacts prepared in this repository

- `backend/Dockerfile` runs Uvicorn on `0.0.0.0:8000`, uses a non-root user, and
  checks `/api/ready`.
- `frontend/Dockerfile` accepts the public `VITE_API_BASE_URL` at build time.
- `frontend/nginx.conf` preserves direct-refresh support for React Router routes.
- `backend/app/main.py` reads an exact CORS allowlist from `FRONTEND_ORIGIN`.
- `backend/app/api/health.py` exposes liveness at `/api/health` and database
  readiness at `/api/ready`.
- Alembic remains an explicit release step; the backend does not mutate the schema
  during application startup.

## Required deployment sequence

### 1. Create the external database

Use a persistent PostgreSQL service with TLS, backups, and a database URL supplied
through the host's secret manager. The current code supports PostgreSQL through
SQLAlchemy/`psycopg`, but this repository does not provision PostgreSQL or verify a
specific provider for you.

Do not deploy the default SQLite URL to an ephemeral filesystem.

### 2. Build the backend image

From the repository root:

```bash
docker build -t auto-escrow-api:review ./backend
```

The image does not run migrations automatically. That is intentional: migrations
must be reviewed and run once as a controlled release job against the target
database.

### 3. Run the migration release job

Run this command using the exact backend image and production environment variables:

```bash
python -m alembic upgrade head
```

The expected migration head is `0010_harden_ledger_idempotency`. Confirm the command
completes before sending traffic to the new backend image. Never run `downgrade` as
an automatic rollback against production data.

### 4. Build the frontend with the deployed API URL

The API URL is compiled into the browser bundle and is therefore public. It must be
the HTTPS backend URL that browsers can reach:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.demo.example.com \
  -t auto-escrow-web:review ./frontend
```

Do not pass `DATABASE_URL`, operator values, passwords, or any other backend secret
as a `VITE_*` variable.

### 5. Configure backend environment variables

Set these in the backend service's secret/environment configuration:

```text
APP_ENV=production
DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>/<database>
FRONTEND_ORIGIN=https://demo.example.com
MAX_SUBMISSION_RETRIES=2
```

`FRONTEND_ORIGIN` accepts a comma-separated exact allowlist when more than one
approved frontend origin is required. Use origins only, without a path or trailing
slash. In production there are no implicit localhost origins and wildcard entries
are ignored.

Do not configure `DEMO_RESOLUTION_OPERATOR` for a public production service. Demo
operator review is intentionally limited to development/test environments and is
not authentication or independent arbitration.

### 6. Configure service health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`
- Container port: `8000`
- Frontend container port: `80`

Use `/api/ready` for traffic readiness because it executes a lightweight database
query. It does not replace migration verification or monitoring.

### 7. Configure HTTPS and SPA routing

Terminate HTTPS at the ingress. Configure the frontend host to serve
`/index.html` for unknown application paths, equivalent to the included Nginx:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The current frontend calls the backend using the compiled absolute URL; the
included Nginx file does not proxy `/api`.

## Verification after deployment

From a machine that can reach the deployed services:

```bash
curl -fsS https://api.demo.example.com/api/health
curl -fsS https://api.demo.example.com/api/ready
```

In the browser, verify all of the following:

1. The dashboard loads without a CORS error.
2. A direct refresh of `/jobs`, `/jobs/<id>`, and `/settings` returns the React app.
3. The settings page reports the intended API base URL and environment disclosure.
4. The browser network panel shows the deployed frontend origin in the API
   `Access-Control-Allow-Origin` response.
5. The demo contains only synthetic records.

The deployment is not considered verified until these checks are run against the
actual URLs. No deployment was performed by this coding session.

## Rollback and recovery

1. Stop traffic to the failing backend revision or point the ingress to the last
   known-good backend image.
2. Keep the database at its current migration level unless a reviewed recovery
   procedure says otherwise. Prefer a forward migration fix over an automatic
   downgrade.
3. If data integrity is involved, preserve logs and use the managed database's
   recovery snapshot according to its documented procedure.
4. Rebuild the frontend with the previous compatible API contract if the backend
   response shape changed.
5. Re-run `/api/health`, `/api/ready`, CORS verification, and the manual workflow
   in [`MANUAL_E2E.md`](MANUAL_E2E.md) before reopening the demo.

## Limitations before a real production launch

- No authentication, authorization, tenant isolation, or authenticated actor
  identity exists.
- Valid write operations are available to any caller who can reach the API.
- Demo dispute resolution is not independent arbitration.
- Escrow is a simulated database ledger, not custody or payment processing.
- There is no rate limiting, CSRF strategy, request tracing, backup automation,
  incident response, or operational alerting in this repository.
- PostgreSQL compatibility is connection-level support; it has not been validated
  here against a provider's production version.
- Backend dependency resolution and Docker base images are not pinned to immutable
  digests.
- Interactive OpenAPI documentation remains enabled by default.

Treat this architecture as a restricted demo deployment, not a real-money product.
