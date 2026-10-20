"""Central job lifecycle definitions used by job workflows.

Mutation endpoints for later phases should use these definitions rather than
accepting arbitrary status strings from clients.  Phase 4 only creates jobs,
so the initial state is the only state transition currently exercised by the
API.
"""

from __future__ import annotations

from typing import Final


JOB_STATES: Final[tuple[str, ...]] = (
    "open",
    "assigned",
    "in_progress",
    "submitted",
    "under_review",
    "completed",
    "disputed",
    "cancelled",
)

INITIAL_JOB_STATUS: Final[str] = "open"

# The mapping is intentionally immutable at the edge of the module so future
# workflow services can share one authoritative transition policy.
JOB_STATE_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "open": frozenset({"assigned", "cancelled"}),
    "assigned": frozenset({"in_progress", "cancelled"}),
    "in_progress": frozenset({"submitted", "disputed", "cancelled"}),
    "submitted": frozenset({"under_review", "disputed"}),
    "under_review": frozenset({"completed", "submitted", "disputed"}),
    "completed": frozenset(),
    "disputed": frozenset({"under_review", "completed", "cancelled"}),
    "cancelled": frozenset(),
}

# Descriptive aliases make the contract easy to discover for later phases.
ALLOWED_JOB_STATES = JOB_STATES
JOB_TRANSITIONS = JOB_STATE_TRANSITIONS


def is_job_state(value: str) -> bool:
    """Return whether *value* is one of the persisted job states."""

    return value in JOB_STATES


def can_transition(current: str, target: str) -> bool:
    """Return whether a future workflow may move a job between two states."""

    return target in JOB_STATE_TRANSITIONS.get(current, frozenset())


__all__ = [
    "ALLOWED_JOB_STATES",
    "INITIAL_JOB_STATUS",
    "JOB_STATE_TRANSITIONS",
    "JOB_STATES",
    "JOB_TRANSITIONS",
    "can_transition",
    "is_job_state",
]
