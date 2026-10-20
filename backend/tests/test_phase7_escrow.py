from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.escrow_states import InvalidEscrowTransition, can_transition, transition_escrow
from app.models import (
    Agent,
    Agreement,
    AuditEvent,
    Dispute,
    Escrow,
    Job,
    LedgerEntry,
    Submission,
    Verification,
)
from app.schemas import EscrowFundRequest
from app.services import escrow as escrow_service
from app.services.escrow import remaining_refundable_balance, remaining_releasable_balance


def _agent(external_id: str, *, name: str = "Phase 7 agent") -> Agent:
    return Agent(
        external_id=external_id,
        name=name,
        description="Agent used by simulated escrow lifecycle tests.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json"],
        availability="available",
        estimated_completion_minutes=30,
        demo_performance_stats={"success_rate": 1.0},
        capabilities=["testing"],
    )


def _job(agent_id: int, *, currency: str = "USD", status: str = "open") -> Job:
    return Job(
        selected_agent_id=agent_id,
        title="Phase 7 escrow job",
        description="Complete the simulated escrow verification task.",
        budget=Decimal("125.00"),
        currency=currency,
        deadline=datetime.now(timezone.utc) + timedelta(days=5),
        status=status,
        required_skills=["testing"],
        task_category="verification",
        expected_output="A structured verification report.",
        acceptance_criteria=["Every check has a result"],
        additional_instructions="Use synthetic input.",
    )


def _prepare_accepted(client, db_session, *, suffix: str = "", currency: str = "USD") -> tuple[Job, dict]:
    agent = _agent(f"phase7-executor{suffix}")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id, currency=currency)
    db_session.add(job)
    db_session.commit()

    proposal = client.post(f"/api/v1/jobs/{job.id}/agreement", json={})
    assert proposal.status_code == 201
    accepted = client.post(f"/api/v1/agreements/{proposal.json()['id']}/accept")
    assert accepted.status_code == 200
    return job, accepted.json()


def _funded(client, db_session, *, suffix: str = "") -> tuple[Job, dict, dict]:
    job, agreement = _prepare_accepted(client, db_session, suffix=suffix)
    response = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"idempotency_key": f"fund-{suffix or job.id}", "reference": "demo-reference"},
    )
    assert response.status_code == 201
    return job, agreement, response.json()


def test_funding_requires_an_accepted_agreement(client, db_session) -> None:
    agent = _agent("phase7-no-agreement")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id, status="assigned")
    db_session.add(job)
    db_session.commit()

    response = client.post(f"/api/v1/jobs/{job.id}/escrow/fund", json={})

    assert response.status_code == 409
    assert response.json()["detail"] == "accepted agreement is required"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").status_code == 204


def test_valid_funding_derives_amount_currency_and_persists_ledger(client, db_session) -> None:
    job, agreement, escrow = _funded(client, db_session, suffix="valid")

    assert escrow["status"] == "funded"
    assert escrow["funding_state"] == "funded"
    assert escrow["accepted_agreement_version"] == agreement["accepted_version"] == 1
    assert escrow["agreement_version"] == 1
    assert escrow["accepted_amount"] == "125.00"
    assert escrow["accepted_currency"] == "USD"
    assert escrow["funded_amount"] == "125.00"
    assert escrow["currency"] == "USD"
    assert escrow["amount"] == "125.00"

    ledger = client.get(f"/api/v1/escrows/{escrow['id']}/ledger")
    assert ledger.status_code == 200
    assert len(ledger.json()) == 1
    assert ledger.json()[0] == {
        "id": ledger.json()[0]["id"],
        "escrow_id": escrow["id"],
        "job_id": job.id,
        "idempotency_key": "fund-valid",
        "entry_type": "funding",
        "amount": "125.00",
        "currency": "USD",
        "reference": "demo-reference",
        "occurred_at": ledger.json()[0]["occurred_at"],
    }

    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)
    ).all()
    assert [event.event_type for event in events] == [
        "agreement.proposed",
        "agreement.accepted",
        "escrow.created",
        "escrow.funded",
    ]
    assert events[-1].data["amount"] == "125.00"
    assert events[-1].data["currency"] == "USD"


def test_funding_ignores_malicious_money_body_and_rejects_conflicting_idempotency(client, db_session) -> None:
    job, agreement = _prepare_accepted(client, db_session, suffix="idempotency")
    first = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={
            "amount": "0.01",
            "currency": "EUR",
            "idempotency_key": "same-key",
            "reference": "safe-reference",
        },
    )
    assert first.status_code == 201
    assert first.json()["accepted_amount"] == "125.00"
    assert first.json()["accepted_currency"] == "USD"

    repeated = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"amount": "999.99", "currency": "GBP", "idempotency_key": "same-key", "reference": "safe-reference"},
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == first.json()["id"]
    assert repeated.json()["funded_amount"] == "125.00"

    different_key = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"idempotency_key": "different-key", "reference": "safe-reference"},
    )
    assert different_key.status_code == 409
    assert "different idempotency key" in different_key.json()["detail"]

    different_reference = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"idempotency_key": "same-key", "reference": "changed-reference"},
    )
    assert different_reference.status_code == 409
    assert "different reference" in different_reference.json()["detail"]
    assert db_session.query(LedgerEntry).count() == 1


def test_escrow_lookup_preserves_204_for_absent_rows_and_exposes_ledger(client, db_session) -> None:
    agent = _agent("phase7-lookup")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id)
    db_session.add(job)
    db_session.commit()

    assert client.get(f"/api/v1/jobs/{job.id}/escrow").status_code == 204
    assert client.get("/api/v1/escrows/999999/ledger").status_code == 404


def test_invalid_transitions_are_centralized() -> None:
    assert can_transition("pending", "funded")
    assert can_transition("funded", "held")
    assert can_transition("held", "released")
    assert not can_transition("pending", "released")
    assert not can_transition("released", "refunded")
    assert not can_transition("disputed", "funded")
    assert not can_transition("disputed", "refunded")
    assert can_transition("disputed", "funded", has_valid_resolution=True)
    assert can_transition("disputed", "refunded", has_valid_resolution=True)

    escrow = Escrow(
        job_id=1,
        agreement_id=1,
        amount=Decimal("10.00"),
        funded_amount=Decimal("10.00"),
        currency="USD",
        status="pending",
    )
    with pytest.raises(InvalidEscrowTransition):
        transition_escrow(escrow, "released")


def test_release_requires_verification_and_duplicate_release_is_rejected(client, db_session) -> None:
    job, _agreement, escrow = _funded(client, db_session, suffix="release")

    blocked = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "verification is required"
    assert client.get(f"/api/v1/escrows/{escrow['id']}").json()["status"] == "funded"

    submission = Submission(
        job_id=job.id,
        agent_id=job.selected_agent_id,
        version=1,
        artifact_url="https://example.test/artifact",
        submitted_output="verified output",
        evidence={"synthetic": True},
        status="accepted",
    )
    db_session.add(submission)
    db_session.flush()
    db_session.add(
        Verification(
            submission_id=submission.id,
            status="passed",
            overall_result="passed",
            individual_checks=[{"name": "all", "passed": True}],
            reasons=[],
            evaluator_type="automated",
            evaluated_at=datetime.now(timezone.utc),
            verified_at=datetime.now(timezone.utc),
        )
    )
    job.status = "completed"
    db_session.commit()

    released = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert released.status_code == 200
    assert released.json()["status"] == "released"
    assert released.json()["settled_at"]
    repeated = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "escrow is already settled"
    refund_after_release = client.post(f"/api/v1/escrows/{escrow['id']}/refund")
    assert refund_after_release.status_code == 409
    assert refund_after_release.json()["detail"] == "escrow is already settled"

    entries = db_session.scalars(
        select(LedgerEntry).where(LedgerEntry.escrow_id == escrow["id"]).order_by(LedgerEntry.id)
    ).all()
    assert [entry.entry_type for entry in entries] == ["funding", "release"]
    assert remaining_releasable_balance(released_row := db_session.get(Escrow, escrow["id"]), entries) == Decimal("0.00")
    assert remaining_refundable_balance(released_row, entries) == Decimal("0.00")


def test_refund_requires_resolution_and_disputed_escrow_cannot_bypass_guard(client, db_session) -> None:
    job, _agreement, escrow = _funded(client, db_session, suffix="refund")

    blocked = client.post(f"/api/v1/escrows/{escrow['id']}/refund")
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "refund requires a valid dispute resolution"
    duplicate_blocked = client.post(f"/api/v1/escrows/{escrow['id']}/refund")
    assert duplicate_blocked.status_code == 409
    assert duplicate_blocked.json()["detail"] == "refund requires a valid dispute resolution"

    row = db_session.get(Escrow, escrow["id"])
    assert row is not None
    row.status = "disputed"
    db_session.commit()
    disputed = client.post(f"/api/v1/escrows/{escrow['id']}/refund")
    assert disputed.status_code == 409
    assert "valid dispute resolution" in disputed.json()["detail"]
    assert db_session.query(LedgerEntry).count() == 1


def test_resolved_dispute_authorizes_one_refund_and_records_audit(client, db_session) -> None:
    job, _agreement, escrow = _funded(client, db_session, suffix="resolved-refund")
    row = db_session.get(Escrow, escrow["id"])
    assert row is not None
    row.status = "disputed"
    db_session.add(
        # A resolution is server-side persisted workflow data; it is not
        # accepted as a field on the refund request.
        Dispute(
            job_id=job.id,
            escrow_id=row.id,
            raised_by_agent_id=job.selected_agent_id,
            status="resolved",
            reason="Synthetic dispute",
            evidence={"synthetic": True},
            resolution="refund",
            resolution_rationale="The accepted resolution refunds the balance.",
            resolved_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    refunded = client.post(f"/api/v1/escrows/{row.id}/refund")
    assert refunded.status_code == 200
    assert refunded.json()["status"] == "refunded"
    assert client.post(f"/api/v1/escrows/{row.id}/refund").status_code == 409
    entries = db_session.scalars(
        select(LedgerEntry).where(LedgerEntry.escrow_id == row.id).order_by(LedgerEntry.id)
    ).all()
    assert [entry.entry_type for entry in entries] == ["funding", "refund"]
    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)
    ).all()
    assert events[-1].event_type == "escrow.refunded"


def test_settlement_balance_guard_handles_corrupt_beyond_balance_history(client, db_session) -> None:
    job, _agreement, escrow = _funded(client, db_session, suffix="balance")
    row = db_session.get(Escrow, escrow["id"])
    assert row is not None
    db_session.add(
        LedgerEntry(
            escrow_id=row.id,
            job_id=job.id,
            idempotency_key="legacy-over-release",
            entry_type="release",
            amount=Decimal("125.01"),
            currency="USD",
            reference="legacy",
        )
    )
    row.status = "funded"
    row.funded_amount = Decimal("125.00")
    db_session.commit()

    submission = Submission(
        job_id=job.id,
        agent_id=job.selected_agent_id,
        version=1,
        artifact_url="https://example.test/artifact-balance",
        submitted_output="verified output",
        evidence={},
        status="accepted",
    )
    db_session.add(submission)
    db_session.flush()
    db_session.add(
        Verification(
            submission_id=submission.id,
            status="passed",
            overall_result="passed",
            individual_checks=[],
            reasons=[],
            evaluator_type="automated",
        )
    )
    job.status = "completed"
    db_session.commit()
    response = client.post(f"/api/v1/escrows/{row.id}/release")
    assert response.status_code == 409
    assert response.json()["detail"] == "settlement amount exceeds funded balance"


def test_funding_rolls_back_escrow_ledger_and_events_after_forced_failure(client, db_session, monkeypatch) -> None:
    job, _agreement = _prepare_accepted(client, db_session, suffix="rollback")
    db_session.expire(job)
    original_record_event = escrow_service.record_event

    def fail_on_funding(*args, **kwargs):
        if args[1] == "escrow.funded":
            raise RuntimeError("forced audit failure")
        return original_record_event(*args, **kwargs)

    monkeypatch.setattr(escrow_service, "record_event", fail_on_funding)
    with pytest.raises(RuntimeError, match="forced audit failure"):
        escrow_service.fund_escrow(
            db_session,
            job.id,
            EscrowFundRequest(idempotency_key="rollback-key"),
        )

    assert db_session.query(Escrow).count() == 0
    assert db_session.query(LedgerEntry).count() == 0
    assert [event.event_type for event in db_session.scalars(select(AuditEvent)).all()] == [
        "agreement.proposed",
        "agreement.accepted",
    ]
