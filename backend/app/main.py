"""FastAPI application entry point for Auto Escrow."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_frontend_origins(settings),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(v1_router)


@app.get("/", tags=["meta"], summary="API landing response")
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/api/health",
        "readiness": "/api/ready",
    }
