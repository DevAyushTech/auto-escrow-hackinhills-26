"""Central dispute lifecycle rules."""

from __future__ import annotations

from typing import Final


DISPUTE_STATES: Final[tuple[str, ...]] = ("open", "under_review", "resolved", "rejected")
DISPUTE_STATE_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "open": frozenset({"under_review", "resolved", "rejected"}),
    "under_review": frozenset({"resolved", "rejected"}),
    "resolved": frozenset(),
    "rejected": frozenset(),
}
DISPUTE_RESOLUTIONS: Final[frozenset[str]] = frozenset({"release", "refund", "reject"})


class InvalidDisputeTransition(ValueError):
    """Raised when a dispute action is not allowed from its current state."""

    def __init__(self, current: str, target: str) -> None:
        self.current = current
        self.target = target
        super().__init__(f"dispute cannot transition from {current!r} to {target!r}")


def can_transition(current: str, target: str) -> bool:
    return target in DISPUTE_STATE_TRANSITIONS.get(current, frozenset())


def validate_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidDisputeTransition(current, target)


def transition_dispute(dispute, target: str):
    validate_transition(dispute.status, target)
    dispute.status = target
    return dispute


def is_terminal(status: str) -> bool:
    return status in {"resolved", "rejected"}


__all__ = [
    "DISPUTE_RESOLUTIONS",
    "DISPUTE_STATE_TRANSITIONS",
    "DISPUTE_STATES",
    "InvalidDisputeTransition",
    "can_transition",
    "is_terminal",
    "transition_dispute",
    "validate_transition",
]
