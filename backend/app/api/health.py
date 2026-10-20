from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health", summary="Check API availability")
def health_check() -> dict[str, str]:
    """Return a small machine-readable liveness response."""

    return {
        "status": "ok",
        "service": "auto-escrow-api",
        "environment": get_settings().app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
