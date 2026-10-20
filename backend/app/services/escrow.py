"""Transactional simulated escrow funding and settlement workflows."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.escrow_states import InvalidEscrowTransition, transition_escrow
from app.models import (
    Agreement,
    Dispute,
    Escrow,
    Job,
    LedgerEntry,
    Submission,
    Verification,
    SUPPORTED_CURRENCIES,
)
from app.schemas import EscrowFundRequest
from app.services.audit import record_event


MONEY_QUANTUM = Decimal("0.01")
FUNDABLE_JOB_STATES = frozenset(
    {"assigned", "in_progress", "submitted", "under_review", "completed", "disputed"}
)
SETTLEMENT_ENTRY_TYPES = frozenset({"release", "refund"})
FUNDING_ENTRY_TYPES = frozenset({"funding", "deposit"})


class EscrowServiceError(Exception):
    """Base class for expected escrow workflow failures."""


class EscrowNotFoundError(EscrowServiceError):
    pass


class JobNotFoundForEscrowError(EscrowServiceError):
    pass


class AgreementRequiredForFundingError(EscrowServiceError):
    pass


class AgreementNotAcceptedForFundingError(EscrowServiceError):
    pass


class JobNotFundableError(EscrowServiceError):
    pass


class EscrowConsistencyError(EscrowServiceError):
    pass


class EscrowConflictError(EscrowServiceError):
    pass


class IdempotencyConflictError(EscrowConflictError):
    pass


class EscrowStateConflictError(EscrowServiceError):
    pass


class VerificationRequiredError(EscrowServiceError):
    pass


class RefundNotPermittedError(EscrowServiceError):
    pass


class SettlementBalanceError(EscrowServiceError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _money(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(value).quantize(MONEY_QUANTUM)


def get_escrow(db: Session, escrow_id: int) -> Escrow | None:
    return db.scalar(
        select(Escrow)
        .options(selectinload(Escrow.ledger_entries))
        .where(Escrow.id == escrow_id)
    )


def get_job_escrow(db: Session, job_id: int) -> Escrow | None:
    return db.scalar(
        select(Escrow)
        .options(selectinload(Escrow.ledger_entries))
        .where(Escrow.job_id == job_id)
    )


def get_ledger_entries(db: Session, escrow_id: int) -> list[LedgerEntry]:
    return list(
        db.scalars(
            select(LedgerEntry)
            .where(LedgerEntry.escrow_id == escrow_id)
            .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
        ).all()
    )


def remaining_releasable_balance(
    escrow: Escrow,
    entries: list[LedgerEntry] | None = None,
) -> Decimal:
    """Return the unsatisfied balance available to a release operation."""

    rows = entries if entries is not None else list(escrow.ledger_entries)
    settled = sum(
        (_money(entry.amount) for entry in rows if entry.entry_type in SETTLEMENT_ENTRY_TYPES),
        Decimal("0.00"),
    )
    return max(Decimal("0.00"), _money(escrow.funded_amount) - settled)


def remaining_refundable_balance(
    escrow: Escrow,
    entries: list[LedgerEntry] | None = None,
) -> Decimal:
    """Return the unsatisfied balance available to a refund operation."""

    return remaining_releasable_balance(escrow, entries)


def _require_funding_prerequisites(db: Session, job_id: int) -> tuple[Job, Agreement, Decimal, str]:
    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if job is None:
        raise JobNotFoundForEscrowError("job not found")

    agreement = db.scalar(
        select(Agreement).where(Agreement.job_id == job.id).with_for_update()
    )
    if agreement is None:
        raise AgreementRequiredForFundingError("accepted agreement is required")
    if agreement.job_id != job.id:
        raise EscrowConsistencyError("agreement does not belong to this job")
    if agreement.status != "accepted" or agreement.accepted_version is None:
        raise AgreementNotAcceptedForFundingError("accepted agreement is required")
    if job.status not in FUNDABLE_JOB_STATES:
        raise JobNotFundableError("job must be assigned or later before escrow funding")

    amount = _money(agreement.proposed_budget or agreement.amount)
    currency = (agreement.currency or "").strip().upper()
    if amount <= 0 or amount != amount.quantize(MONEY_QUANTUM):
        raise EscrowConsistencyError("accepted agreement has invalid funding amount")
    if currency not in SUPPORTED_CURRENCIES:
        raise EscrowConsistencyError("accepted agreement has unsupported funding currency")
    return job, agreement, amount, currency


def _funding_entries(db: Session, escrow_id: int) -> list[LedgerEntry]:
    return list(
        db.scalars(
            select(LedgerEntry)
            .where(
                LedgerEntry.escrow_id == escrow_id,
                LedgerEntry.entry_type.in_(FUNDING_ENTRY_TYPES),
            )
            .order_by(LedgerEntry.id.asc())
        ).all()
    )


def _validate_funding_ledger(
    escrow: Escrow,
    entries: list[LedgerEntry],
    *,
    expected_amount: Decimal | None = None,
    require_funded_amount: bool = True,
) -> Decimal:
    """Validate the persisted funding side before returning or settling escrow."""

    if require_funded_amount and escrow.funded_amount is None:
        raise EscrowConsistencyError("funded escrow is missing its funded amount")
    funding_total = Decimal("0.00")
    for entry in entries:
        if entry.currency != escrow.currency:
            raise EscrowConsistencyError("escrow ledger currency does not match the escrow currency")
        if entry.job_id not in (None, escrow.job_id):
            raise EscrowConsistencyError("escrow ledger entry belongs to a different job")
        if entry.entry_type in FUNDING_ENTRY_TYPES:
            funding_total += _money(entry.amount)
    if expected_amount is not None and funding_total != _money(expected_amount):
        raise EscrowConsistencyError("existing escrow funding ledger does not match the accepted agreement")
    if require_funded_amount and funding_total != _money(escrow.funded_amount):
        raise EscrowConsistencyError("escrow funding ledger does not reconcile with the funded amount")
    return funding_total


def _validate_escrow_consistency(
    escrow: Escrow,
    agreement: Agreement,
    amount: Decimal,
    currency: str,
) -> None:
    if escrow.agreement_id != agreement.id:
        raise EscrowConsistencyError("escrow agreement does not match the accepted agreement")
    if _money(escrow.amount) != amount or escrow.currency != currency:
        raise EscrowConsistencyError("escrow amount or currency does not match the accepted agreement")
    if escrow.accepted_agreement_version not in (None, agreement.accepted_version):
        raise EscrowConsistencyError("escrow agreement version does not match the accepted agreement")


def _validate_idempotent_request(
    payload: EscrowFundRequest | None,
    entries: list[LedgerEntry],
) -> LedgerEntry | None:
    requested_key = payload.idempotency_key if payload else None
    requested_reference = payload.reference if payload else None
    if requested_key is not None:
        matching = next((entry for entry in entries if entry.idempotency_key == requested_key), None)
        if matching is None:
            raise IdempotencyConflictError("escrow is already funded with a different idempotency key")
        if matching.entry_type not in FUNDING_ENTRY_TYPES:
            raise IdempotencyConflictError("idempotency key is already used by another escrow operation")
        if requested_reference is not None and matching.reference != requested_reference:
            raise IdempotencyConflictError("idempotency key was already used with a different reference")
        return matching
    if requested_reference is not None and entries and entries[0].reference not in (None, requested_reference):
        raise IdempotencyConflictError("escrow is already funded with a different reference")
    return None


def _commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EscrowConflictError("escrow operation could not be saved") from exc


def _commit_funding_or_return_existing(
    db: Session,
    *,
    job_id: int,
    payload: EscrowFundRequest | None,
) -> Escrow | None:
    """Commit funding, resolving a concurrent unique-key winner safely."""

    try:
        db.commit()
        return None
    except IntegrityError as exc:
        db.rollback()
        existing = get_job_escrow(db, job_id)
        if existing is not None:
            _validate_idempotent_request(payload, get_ledger_entries(db, existing.id))
            return existing
        raise EscrowConflictError("escrow operation could not be saved") from exc


def fund_escrow(
    db: Session,
    job_id: int,
    payload: EscrowFundRequest | None = None,
) -> Escrow:
    """Fund an escrow from the accepted agreement in one transaction."""

    try:
        job, agreement, amount, currency = _require_funding_prerequisites(db, job_id)
        requested_key = payload.idempotency_key if payload else None
        requested_reference = payload.reference if payload else None
        escrow = db.scalar(
            select(Escrow)
            .where(Escrow.job_id == job.id)
            .with_for_update()
        )
        is_new = escrow is None

        if escrow is not None:
            _validate_escrow_consistency(escrow, agreement, amount, currency)
            entries = _funding_entries(db, escrow.id)
            all_entries = get_ledger_entries(db, escrow.id)
            if escrow.status != "pending":
                _validate_idempotent_request(payload, all_entries)
                _validate_funding_ledger(escrow, all_entries)
                return get_escrow(db, escrow.id) or escrow
            if entries:
                _validate_idempotent_request(payload, all_entries)
                _validate_funding_ledger(
                    escrow,
                    all_entries,
                    expected_amount=amount,
                    require_funded_amount=False,
                )
                # A legacy/demo row may have a funding deposit but not the
                # matching lifecycle status. Reconcile it without creating a
                # second financial effect.
                escrow.accepted_agreement_version = agreement.accepted_version
                escrow.funded_amount = amount
                escrow.funded_at = escrow.funded_at or utc_now()
                transition_escrow(escrow, "funded")
                record_event(
                    db,
                    "escrow.funded",
                    job_id=job.id,
                    actor_agent_id=agreement.requester_agent_id,
                    description="escrow.funded",
                    data={
                        "escrow_id": escrow.id,
                        "agreement_id": agreement.id,
                        "agreement_version": agreement.accepted_version,
                        "amount": format(amount, ".2f"),
                        "currency": currency,
                        "status": escrow.status,
                        "reconciled_legacy_ledger": True,
                    },
                )
                _commit_or_conflict(db)
                return get_escrow(db, escrow.id) or escrow
        else:
            escrow = Escrow(
                job_id=job.id,
                agreement_id=agreement.id,
                accepted_agreement_version=agreement.accepted_version,
                amount=amount,
                funded_amount=None,
                currency=currency,
                status="pending",
                provider_reference=requested_reference,
            )
            db.add(escrow)
            db.flush()
            entries = []
            all_entries = []

        # A pre-Phase-7 pending row can be completed safely when its immutable
        # agreement snapshot is consistent with the accepted agreement.
        escrow.accepted_agreement_version = agreement.accepted_version
        escrow.funded_amount = amount
        escrow.provider_reference = requested_reference or escrow.provider_reference
        now = utc_now()
        escrow.funded_at = now
        transition_escrow(escrow, "funded")

        entry = LedgerEntry(
            escrow_id=escrow.id,
            job_id=job.id,
            idempotency_key=requested_key or f"funding-{uuid4().hex}",
            entry_type="funding",
            amount=amount,
            currency=currency,
            reference=requested_reference,
            occurred_at=now,
        )
        db.add(entry)
        db.flush()

        # The creation event is intentionally emitted after the funding row is
        # flushed so both audit rows share the same all-or-nothing transaction.
        if is_new:
            record_event(
                db,
                "escrow.created",
                job_id=job.id,
                actor_agent_id=agreement.requester_agent_id,
                description="escrow.created",
                data={
                    "escrow_id": escrow.id,
                    "agreement_id": agreement.id,
                    "agreement_version": agreement.accepted_version,
                    "amount": format(amount, ".2f"),
                    "currency": currency,
                    "status": "pending",
                },
            )
        record_event(
            db,
            "escrow.funded",
            job_id=job.id,
            actor_agent_id=agreement.requester_agent_id,
            description="escrow.funded",
            data={
                "escrow_id": escrow.id,
                "agreement_id": agreement.id,
                "agreement_version": agreement.accepted_version,
                "amount": format(amount, ".2f"),
                "currency": currency,
                "status": escrow.status,
            },
        )
        committed = _commit_funding_or_return_existing(db, job_id=job.id, payload=payload)
        committed_id = committed.id if committed is not None else escrow.id
        return get_escrow(db, committed_id) or committed or escrow
    except Exception:
        db.rollback()
        raise


def _verification_is_complete(db: Session, job_id: int) -> bool:
    verification_id = db.scalar(
        select(Verification.id)
        .join(Submission, Verification.submission_id == Submission.id)
        .where(
            Submission.job_id == job_id,
            Verification.status == "passed",
            Verification.overall_result == "passed",
        )
        .limit(1)
    )
    job = db.get(Job, job_id)
    return verification_id is not None and job is not None and job.status == "completed"


def _dispute_resolution(db: Session, escrow_id: int, target: str) -> bool:
    accepted_values = {
        "released": {"release", "released", "release_funds"},
        "refunded": {"refund", "refunded", "refund_funds"},
    }
    for dispute in db.scalars(
        select(Dispute).where(
            Dispute.escrow_id == escrow_id,
            Dispute.status == "resolved",
        )
    ).all():
        resolution = (dispute.resolution or "").strip().lower()
        if resolution in accepted_values[target]:
            return True
    return False


def _terminal_conflict(escrow: Escrow) -> None:
    if escrow.status in {"released", "refunded"}:
        raise EscrowStateConflictError("escrow is already settled")


def _settle_escrow(
    db: Session,
    escrow_id: int,
    target: str,
    *,
    commit: bool = True,
    rollback_on_error: bool = True,
) -> Escrow:
    try:
        escrow = db.scalar(select(Escrow).where(Escrow.id == escrow_id).with_for_update())
        if escrow is None:
            raise EscrowNotFoundError("escrow not found")
        job = db.scalar(select(Job).where(Job.id == escrow.job_id).with_for_update())
        if job is None:
            raise JobNotFoundForEscrowError("job not found")
        _terminal_conflict(escrow)

        unresolved_dispute = db.scalar(
            select(Dispute.id).where(
                Dispute.escrow_id == escrow.id,
                Dispute.status.in_(("open", "under_review")),
            ).limit(1)
        )
        if unresolved_dispute is not None:
            raise EscrowStateConflictError("an unresolved dispute blocks settlement")

        resolution = _dispute_resolution(db, escrow.id, target)
        if escrow.status == "disputed":
            if not resolution:
                raise EscrowStateConflictError("a valid dispute resolution is required")
        elif target == "released" and not _verification_is_complete(db, escrow.job_id):
            raise VerificationRequiredError("verification is required")
        elif target == "refunded":
            raise RefundNotPermittedError("refund requires a valid dispute resolution")

        entries = get_ledger_entries(db, escrow.id)
        _validate_funding_ledger(escrow, entries)
        remaining = (
            remaining_releasable_balance(escrow, entries)
            if target == "released"
            else remaining_refundable_balance(escrow, entries)
        )
        if remaining <= 0:
            raise SettlementBalanceError("settlement amount exceeds funded balance")

        now = utc_now()
        try:
            transition_escrow(
                escrow,
                target,
                has_valid_resolution=resolution,
            )
        except InvalidEscrowTransition as exc:
            raise EscrowStateConflictError(str(exc)) from exc
        escrow.settled_at = now
        if target == "released":
            escrow.released_at = now
        db.add(
            LedgerEntry(
                escrow_id=escrow.id,
                job_id=escrow.job_id,
                idempotency_key=f"{target}-{uuid4().hex}",
                entry_type="release" if target == "released" else "refund",
                amount=remaining,
                currency=escrow.currency,
                reference=f"escrow-{target}",
                occurred_at=now,
            )
        )
        db.flush()
        event_type = "escrow.settled" if target == "released" else "escrow.refunded"
        record_event(
            db,
            event_type,
            job_id=escrow.job_id,
            description=event_type,
            data={
                "escrow_id": escrow.id,
                "operation": target,
                "amount": format(remaining, ".2f"),
                "currency": escrow.currency,
                "status": escrow.status,
            },
        )
        if commit:
            _commit_or_conflict(db)
        return get_escrow(db, escrow.id) or escrow
    except Exception:
        if rollback_on_error:
            db.rollback()
        raise


def release_escrow(
    db: Session,
    escrow_id: int,
    *,
    commit: bool = True,
    rollback_on_error: bool = True,
) -> Escrow:
    """Release only after a completed job has a passed verification."""

    return _settle_escrow(
        db,
        escrow_id,
        "released",
        commit=commit,
        rollback_on_error=rollback_on_error,
    )


def refund_escrow(
    db: Session,
    escrow_id: int,
    *,
    commit: bool = True,
    rollback_on_error: bool = True,
) -> Escrow:
    """Refund only through an authoritative resolved-dispute decision."""

    return _settle_escrow(
        db,
        escrow_id,
        "refunded",
        commit=commit,
        rollback_on_error=rollback_on_error,
    )


__all__ = [
    "AgreementNotAcceptedForFundingError",
    "AgreementRequiredForFundingError",
    "EscrowConflictError",
    "EscrowConsistencyError",
    "EscrowNotFoundError",
    "EscrowServiceError",
    "EscrowStateConflictError",
    "FUNDABLE_JOB_STATES",
    "IdempotencyConflictError",
    "JobNotFundableError",
    "JobNotFoundForEscrowError",
    "RefundNotPermittedError",
    "SettlementBalanceError",
    "VerificationRequiredError",
    "fund_escrow",
    "get_escrow",
    "get_job_escrow",
    "get_ledger_entries",
    "refund_escrow",
    "release_escrow",
    "remaining_refundable_balance",
    "remaining_releasable_balance",
]
