from sqlalchemy import select

from app.models import Agent, AuditEvent, LedgerEntry
from tests.test_phase8_execution import _funded, _start, _submit


DEMO_OPERATOR_HEADERS = {"X-Demo-Operator": "demo-operator"}


def test_end_to_end_successful_settlement_persists_all_authoritative_records(client, db_session) -> None:
    job, _agreement, escrow = _funded(
        client,
        db_session,
        criteria=["Required terms: approved"],
        suffix="-phase11-success",
    )

    started = _start(client, job)
    assert started["job_status"] == "in_progress"
    submission = _submit(client, job, "approved synthetic result")
    verified = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert verified.status_code == 200
    assert verified.json()["overall_result"] == "passed"

    released = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert released.status_code == 200
    assert released.json()["status"] == "released"
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409

    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "completed"
    ledger = client.get(f"/api/v1/escrows/{escrow['id']}/ledger").json()
    assert [entry["entry_type"] for entry in ledger] == ["funding", "release"]
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert {event.event_type for event in events} >= {
        "agreement.proposed",
        "agreement.accepted",
        "escrow.funded",
        "execution.started",
        "submission.received",
        "verification.passed",
        "escrow.settled",
    }
    assert submission["version"] == 1


def test_end_to_end_dispute_refund_blocks_normal_release_and_duplicate_resolution(client, db_session) -> None:
    job, _agreement, escrow = _funded(
        client,
        db_session,
        criteria=["Required terms: approved"],
        suffix="-phase11-refund",
    )
    _start(client, job)
    _submit(client, job, "approved synthetic result")
    verified = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert verified.status_code == 200

    agent = db_session.get(Agent, job.selected_agent_id)
    assert agent is not None
    dispute = client.post(
        f"/api/v1/jobs/{job.id}/disputes",
        json={
            "escrow_id": escrow["id"],
            "category": "failed_verification",
            "reason": "The result requires a second review.",
            "description": "The requester disputes the verification outcome using synthetic evidence.",
            "evidence": {"source": "phase11"},
            "raised_by_agent_id": agent.id,
        },
    )
    assert dispute.status_code == 201
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409

    reviewed = client.post(f"/api/v1/disputes/{dispute.json()['id']}/review", headers=DEMO_OPERATOR_HEADERS, json={})
    assert reviewed.status_code == 200
    resolved = client.post(
        f"/api/v1/disputes/{dispute.json()['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "refund", "rationale": "The dispute outcome refunds the simulated balance."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert client.post(f"/api/v1/disputes/{dispute.json()['id']}/resolve", headers=DEMO_OPERATOR_HEADERS, json={"resolution": "refund", "rationale": "A second resolution is not permitted."}).status_code == 409
    assert client.post(f"/api/v1/escrows/{escrow['id']}/refund").status_code == 409

    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "cancelled"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").json()["status"] == "refunded"
    ledger = db_session.scalars(select(LedgerEntry).where(LedgerEntry.escrow_id == escrow["id"]).order_by(LedgerEntry.id)).all()
    assert [entry.entry_type for entry in ledger] == ["funding", "refund"]
