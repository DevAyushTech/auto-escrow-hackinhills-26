"""Central escrow lifecycle and transition policy.

``pending`` is the persisted compatibility value for the public
``not_funded`` state.  Services must validate transitions through this module
instead of accepting a status supplied by an API client.
"""

from __future__ import annotations

from typing import Final

from app.models import Escrow


ESCROW_STATES: Final[tuple[str, ...]] = (
    "pending",
    "funded",
    "held",
    "released",
    "refunded",
    "disputed",
)
NOT_FUNDED_STATUS: Final[str] = "pending"
FUNDING_STATE_NOT_FUNDED: Final[str] = "not_funded"

# The table describes possible domain transitions.  Release and refund
# services add their verification/resolution guards before applying one.
ESCROW_STATE_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "pending": frozenset({"funded"}),
    "funded": frozenset({"held", "released", "refunded", "disputed"}),
    "held": frozenset({"released", "refunded", "disputed"}),
    "released": frozenset(),
    "refunded": frozenset(),
    # A rejected dispute can restore the protected escrow to its prior funded
    # state. Financial transitions still require an explicit resolution guard.
    "disputed": frozenset({"funded", "held", "released", "refunded"}),
}


class InvalidEscrowTransition(ValueError):
    """Raised when an escrow lifecycle transition is not permitted."""

    def __init__(self, current: str, target: str) -> None:
        self.current = current
        self.target = target
        super().__init__(f"escrow cannot transition from {current!r} to {target!r}")


class EscrowResolutionRequired(InvalidEscrowTransition):
    """Raised when a disputed escrow lacks an authoritative resolution."""

    def __init__(self, target: str) -> None:
        super().__init__("disputed", target)
        self.args = (f"disputed escrow requires a valid resolution before {target}",)


def is_escrow_state(value: str) -> bool:
    return value in ESCROW_STATES


def can_transition(
    current: str,
    target: str,
    *,
    has_valid_resolution: bool = False,
) -> bool:
    if target not in ESCROW_STATE_TRANSITIONS.get(current, frozenset()):
        return False
    if current != "disputed":
        return True
    return has_valid_resolution


def validate_transition(
    current: str,
    target: str,
    *,
    has_valid_resolution: bool = False,
) -> None:
    if not can_transition(current, target, has_valid_resolution=has_valid_resolution):
        if current == "disputed" and target in {"released", "refunded"} and not has_valid_resolution:
            raise EscrowResolutionRequired(target)
        raise InvalidEscrowTransition(current, target)


def transition_escrow(
    escrow: Escrow,
    target: str,
    *,
    has_valid_resolution: bool = False,
) -> Escrow:
    """Validate and apply an escrow transition in the caller's transaction."""

    validate_transition(escrow.status, target, has_valid_resolution=has_valid_resolution)
    escrow.status = target
    return escrow


def funding_state(status: str) -> str:
    """Expose a readable funding state while retaining persisted legacy names."""

    return FUNDING_STATE_NOT_FUNDED if status == NOT_FUNDED_STATUS else status


# Descriptive aliases match the names used by the earlier lifecycle modules.
ALLOWED_ESCROW_STATES = ESCROW_STATES
ESCROW_TRANSITIONS = ESCROW_STATE_TRANSITIONS


__all__ = [
    "ALLOWED_ESCROW_STATES",
    "ESCROW_STATE_TRANSITIONS",
    "ESCROW_STATES",
    "ESCROW_TRANSITIONS",
    "EscrowResolutionRequired",
    "FUNDING_STATE_NOT_FUNDED",
    "InvalidEscrowTransition",
    "NOT_FUNDED_STATUS",
    "can_transition",
    "funding_state",
    "is_escrow_state",
    "transition_escrow",
    "validate_transition",
]
