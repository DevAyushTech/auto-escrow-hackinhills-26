# Environment variables

Keep real `.env` files private. The repository examples are safe templates only.

## Backend variables

| Variable | Visibility | Local example | Hosted demo guidance |
| --- | --- | --- | --- |
| `APP_NAME` | Private server config | `Auto Escrow API` | Keep truthful. |
| `APP_ENV` | Private server config | `development` | Set `production` on the hosted service. |
| `DATABASE_URL` | Secret | `sqlite:///./auto_escrow.db` | Persistent TLS PostgreSQL only. Never expose to the browser. |
| `TEST_DATABASE_URL` | Test-only | `sqlite:///./test_auto_escrow.db` | Do not configure against production data. |
| `FRONTEND_ORIGIN` | Server config | `http://localhost:5173` | Exact HTTPS origin, comma-separated only when necessary. No wildcard. |
| `MAX_SUBMISSION_RETRIES` | Server config | `2` | Keep a bounded deliberate value. |
| `DEMO_PUBLIC_ENABLED` | Server config | `false` | `true` only for a restricted synthetic public demo. |
| `DEMO_SEED_ENABLED` | Server config | `false` | Reserved flag; startup never seeds production data. Keep `false`. |
| `DEMO_SESSION_TTL_MINUTES` | Server config | `120` | Expiring anonymous sandbox token lifetime. |
| `DEMO_MAX_JOBS_PER_SESSION` | Server config | `3` | Per-session resource cap. |
| `DEMO_RATE_LIMIT_PER_MINUTE` | Server config | `120` | In-process per-client request limit; use provider edge protection too. |
| `DEMO_SESSION_CREATE_LIMIT_PER_HOUR` | Server config | `10` | In-process session bootstrap limit. |
| `DEMO_MAX_REQUEST_BYTES` | Server config | `300000` | Maximum declared request size enforced by middleware. |
| `DEMO_RESOLUTION_OPERATOR` | Development/test only | `demo-operator` | Not authentication; do not use as a public production credential. |

## Frontend variable

| Variable | Visibility | Local example | Guidance |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Public browser bundle | `http://localhost:8000` | Set to the deployed HTTPS backend origin before `npm run build`. |
| `VITE_DEMO_PUBLIC_ENABLED` | Public browser behavior | `false` | Set `true` only when the backend `DEMO_PUBLIC_ENABLED` flag is enabled. |

Anything beginning with `VITE_` can be inspected by every visitor. Never put
database credentials, passwords, tokens, operator values, signing secrets, or
private API keys in it.

## CORS rules

`FRONTEND_ORIGIN` is an exact origin allowlist. Use:

```text
FRONTEND_ORIGIN=https://demo.example.com
```

Do not include a path or trailing slash. In development, the backend also allows
the configured local origins. In production, there are no implicit localhost
origins and credentials remain disabled because the MVP has no account session.

## Safe setup

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Only run those commands when the destination does not exist. The `.gitignore`
excludes real `.env` files, databases, virtual environments, dependencies, and
build output. Before publication, scan staged files and history for accidental
secrets anyway.
