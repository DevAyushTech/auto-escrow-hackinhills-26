# Environment variable reference

Copy the relevant example file and keep the real file private:

- backend: `backend/.env.example` → `backend/.env`
- frontend: `frontend/.env.example` → `frontend/.env`
- root reference: `.env.example`

`.env` files, credentials, local databases, build output, virtual environments, and
`node_modules` are ignored by the repository. Do not commit them.

## Backend variables

| Variable | Used by | Local default/example | Public demo guidance |
| --- | --- | --- | --- |
| `APP_NAME` | FastAPI metadata and root response | `Auto Escrow API` in source | Optional; keep a truthful product name. |
| `APP_ENV` | Settings, seed guard, dispute operator guard, health response | `development` | Set explicitly to `production` for a hosted demo. |
| `DATABASE_URL` | SQLAlchemy/Alembic | `sqlite:///./auto_escrow.db` | Use persistent PostgreSQL. Do not use container-local SQLite. |
| `TEST_DATABASE_URL` | Tests and test-mode Alembic selection | `sqlite:///./test_auto_escrow.db` | Test-only; never point this at production data. |
| `FRONTEND_ORIGIN` | Exact CORS allowlist | `http://localhost:5173` in the example | Use one or more comma-separated HTTPS origins, without paths or trailing slashes. |
| `MAX_SUBMISSION_RETRIES` | Verification retry policy | `2` | Keep a deliberate bounded value. |
| `DEMO_RESOLUTION_OPERATOR` | Development/test dispute operator boundary | `demo-operator` | Not authentication. Do not use as a public production control. |

### CORS behavior

`FRONTEND_ORIGIN` is parsed as an exact comma-separated list. In `development`, the
actual local Vite origins are also allowed:

```text
http://127.0.0.1:5174
http://localhost:5174
http://127.0.0.1:5173
http://localhost:5173
```

In `production`, only configured origins are allowed. Wildcards are ignored, and
credentialed CORS is disabled because the MVP has no browser session/authentication
design.

### Database URL examples

Local SQLite, when the backend is started from `backend/`:

```text
DATABASE_URL=sqlite:///./auto_escrow.db
```

PostgreSQL:

```text
DATABASE_URL=postgresql+psycopg://user:password@host/database
```

The settings layer also normalizes `postgresql://` and `postgres://` to the pinned
`psycopg` driver.

## Frontend variables

| Variable | Visibility | Example | Guidance |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Public browser bundle | `http://localhost:8000` | Set to the deployed HTTPS API URL before `npm run build` or pass it as the frontend Docker build argument. |

Anything prefixed with `VITE_` can be inspected by every browser user. Never put a
database password, token, signing key, operator secret, or private API credential in
one.

## Deployment checklist

- [ ] Backend production environment variables are configured in the hosting
  provider's secret manager.
- [ ] `DATABASE_URL` points to persistent PostgreSQL with backups and TLS.
- [ ] `APP_ENV=production` is explicit.
- [ ] `FRONTEND_ORIGIN` exactly matches the deployed browser origin.
- [ ] The frontend was rebuilt after changing `VITE_API_BASE_URL`.
- [ ] No `.env` file or secret value is present in the image build context or
  publication changes.
- [ ] `/api/ready` succeeds after the migration release step.
