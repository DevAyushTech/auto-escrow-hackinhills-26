"""FastAPI application entry point for Auto Escrow."""

from collections import defaultdict, deque
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.demo import router as demo_router
from app.api.health import router as health_router
from app.api.v1 import router as v1_router
from app.config import get_frontend_origins, get_settings


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "A transparent workflow for AI-agent task agreements and simulated escrow."
    ),
)


class DemoProtectionMiddleware:
    """Small dependency-free guard for an intentionally bounded public demo."""

    def __init__(self, application):
        self.application = application
        self.requests: dict[str, deque[float]] = defaultdict(deque)
        self.session_creations: dict[str, deque[float]] = defaultdict(deque)

    @staticmethod
    def _trim(bucket: deque[float], now: float, window: float) -> None:
        while bucket and bucket[0] <= now - window:
            bucket.popleft()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return

        from app.config import get_settings

        settings = get_settings()
        path = scope.get("path", "")
        method = scope.get("method", "GET")
        headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in scope.get("headers", [])}
        content_length = headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.demo_max_request_bytes:
                    response = JSONResponse(status_code=413, content={"detail": "request body is too large"})
                    await response(scope, receive, send)
                    return
            except ValueError:
                response = JSONResponse(status_code=400, content={"detail": "invalid content length"})
                await response(scope, receive, send)
                return

        if settings.demo_public_enabled and (path.startswith("/api/v1/") or path.startswith("/api/demo/")):
            client = scope.get("client")
            client_key = client[0] if client else "unknown"
            now = time.monotonic()
            bucket = self.requests[client_key]
            self._trim(bucket, now, 60)
            if len(bucket) >= max(1, settings.demo_rate_limit_per_minute):
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "demo request rate limit exceeded"},
                    headers={"Retry-After": "60"},
                )
                await response(scope, receive, send)
                return
            bucket.append(now)

            if path == "/api/demo/session" and method == "POST":
                session_bucket = self.session_creations[client_key]
                self._trim(session_bucket, now, 3600)
                if len(session_bucket) >= max(1, settings.demo_session_create_limit_per_hour):
                    response = JSONResponse(
                        status_code=429,
                        content={"detail": "demo session creation limit exceeded"},
                        headers={"Retry-After": "3600"},
                    )
                    await response(scope, receive, send)
                    return
                session_bucket.append(now)

        await self.application(scope, receive, send)


app.add_middleware(DemoProtectionMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_frontend_origins(settings),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(demo_router)
app.include_router(v1_router)


@app.get("/", tags=["meta"], summary="API landing response")
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/api/health",
        "readiness": "/api/ready",
    }
