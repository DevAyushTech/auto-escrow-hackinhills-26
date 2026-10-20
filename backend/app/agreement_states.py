"""Central agreement lifecycle and transition policy.

Agreement mutations must use this module rather than accepting arbitrary
status strings from an API client.  ``draft`` and ``expired`` remain readable
for agreements created by older phases, while new proposals always start in
``proposed``.
"""

from __future__ import annotations

from typing import Final


AGREEMENT_STATES: Final[tuple[str, ...]] = (
    "draft",
    "proposed",
    "revision_requested",
    "accepted",
    "rejected",
    "expired",
    "cancelled",
)

AGREEMENT_STATE_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "draft": frozenset({"proposed", "rejected", "cancelled"}),
    "proposed": frozenset({"revision_requested", "accepted", "rejected", "cancelled"}),
    "revision_requested": frozenset({"proposed", "rejected", "cancelled"}),
    "accepted": frozenset(),
    "rejected": frozenset(),
    "expired": frozenset(),
    "cancelled": frozenset(),
}

PROPOSAL_STATUS: Final[str] = "proposed"
REVISION_REQUESTED_STATUS: Final[str] = "revision_requested"
ACCEPTED_STATUS: Final[str] = "accepted"


class InvalidAgreementTransition(ValueError):
    """Raised when an agreement lifecycle transition is not permitted."""

    def __init__(self, current: str, target: str) -> None:
        self.current = current
        self.target = target
        super().__init__(f"agreement cannot transition from {current!r} to {target!r}")


def is_agreement_state(value: str) -> bool:
    return value in AGREEMENT_STATES


def can_transition(current: str, target: str) -> bool:
    """Return whether a normal agreement state transition is allowed."""

    return target in AGREEMENT_STATE_TRANSITIONS.get(current, frozenset())


def validate_transition(current: str, target: str) -> None:
    """Validate a normal transition or raise a domain-specific error."""

    if not can_transition(current, target):
        raise InvalidAgreementTransition(current, target)


def can_submit_revision(current: str) -> bool:
    """A submitted proposal may refresh a proposal or answer a revision request."""

    return current in {PROPOSAL_STATUS, REVISION_REQUESTED_STATUS}


def validate_submit_revision(current: str) -> None:
    if not can_submit_revision(current):
        raise InvalidAgreementTransition(current, PROPOSAL_STATUS)


__all__ = [
    "ACCEPTED_STATUS",
    "AGREEMENT_STATE_TRANSITIONS",
    "AGREEMENT_STATES",
    "InvalidAgreementTransition",
    "PROPOSAL_STATUS",
    "REVISION_REQUESTED_STATUS",
    "can_submit_revision",
    "can_transition",
    "is_agreement_state",
    "validate_submit_revision",
    "validate_transition",
]
