from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Agent, AuditEvent, Dispute, Job, LedgerEntry


DEMO_OPERATOR_HEADERS = {"X-Demo-Operator": "demo-operator"}


def _agent(external_id: str) -> Agent:
    return Agent(
        external_id=external_id,
        name="Phase 9 participant",
        description="Synthetic dispute participant.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json", "text"],
        availability="available",
        estimated_completion_minutes=15,
        demo_performance_stats={"success_rate": 1.0},
        capabilities=["testing"],
    )


def _job(agent_id: int, *, status: str = "open") -> Job:
    return Job(
        selected_agent_id=agent_id,
        title="Phase 9 dispute job",
        description="Produce a deterministic report for a dispute workflow.",
        budget=Decimal("125.00"),
        currency="USD",
        deadline=datetime.now(timezone.utc) + timedelta(days=5),
        status=status,
        required_skills=["testing"],
        task_category="verification",
        expected_output="A JSON report.",
        acceptance_criteria=["Output must be valid JSON", "Required fields: summary"],
        additional_instructions="Synthetic input only.",
    )


def _funded(client, db_session, *, suffix: str = "") -> tuple[Job, Agent, dict]:
    agent = _agent(f"phase9-agent{suffix}")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id)
    db_session.add(job)
    db_session.commit()
    proposal = client.post(f"/api/v1/jobs/{job.id}/agreement", json={})
    assert proposal.status_code == 201
    accepted = client.post(f"/api/v1/agreements/{proposal.json()['id']}/accept")
    assert accepted.status_code == 200
    funded = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"idempotency_key": f"phase9-fund-{suffix or job.id}"},
    )
    assert funded.status_code == 201
    return job, agent, funded.json()


def _start_and_submit(client, job: Job, *, output: str = '{"summary":"approved"}') -> None:
    started = client.post(f"/api/v1/jobs/{job.id}/start")
    assert started.status_code == 200
    submitted = client.post(
        f"/api/v1/jobs/{job.id}/submit",
        json={"submitted_output": output, "evidence": {"source": "synthetic"}},
    )
    assert submitted.status_code == 201


def _passing_job(client, db_session, *, suffix: str = "") -> tuple[Job, Agent, dict]:
    job, agent, escrow = _funded(client, db_session, suffix=suffix)
    _start_and_submit(client, job)
    verified = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert verified.status_code == 200
    assert verified.json()["overall_result"] == "passed"
    return job, agent, escrow


def _create_dispute(client, job: Job, agent: Agent, escrow_id: int, **overrides) -> dict:
    payload = {
        "escrow_id": escrow_id,
        "category": "failed_verification",
        "reason": "verification result is disputed",
        "description": "The delivered result should be reviewed against the accepted terms.",
        "evidence": {"source": "synthetic-fixture", "reference": "fixture-9"},
        "raised_by_agent_id": agent.id,
    }
    payload.update(overrides)
    response = client.post(f"/api/v1/jobs/{job.id}/disputes", json=payload)
    assert response.status_code == 201
    return response.json()


def test_create_valid_dispute_moves_job_and_escrow_and_preserves_related_records(client, db_session) -> None:
    job, agent, escrow = _funded(client, db_session, suffix="create")
    _start_and_submit(client, job)
    verified = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert verified.status_code == 200
    dispute = _create_dispute(client, job, agent, escrow["id"])

    assert dispute["job_id"] == job.id
    assert dispute["escrow_id"] == escrow["id"]
    assert dispute["status"] == "open"
    assert dispute["category"] == "failed_verification"
    assert dispute["submission_id"] is not None
    assert dispute["verification_id"] == verified.json()["id"]
    assert dispute["evidence"]["reference"] == "fixture-9"
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "disputed"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").json()["status"] == "disputed"
    detail = client.get(f"/api/v1/disputes/{dispute['id']}")
    assert detail.status_code == 200
    assert detail.json()["agreement_terms"]["acceptance_criteria"]
    assert detail.json()["submission"]["submitted_output"]
    assert detail.json()["verification"]["overall_result"] == "passed"
    assert {event["event_type"] for event in detail.json()["events"]} >= {
        "dispute.created",
        "job.disputed",
        "escrow.disputed",
    }


def test_dispute_rejects_mismatched_escrow_and_invalid_job_state(client, db_session) -> None:
    job, agent, escrow = _funded(client, db_session, suffix="mismatch")
    mismatch = client.post(
        f"/api/v1/jobs/{job.id}/disputes",
        json={
            "escrow_id": escrow["id"] + 1,
            "category": "other",
            "reason": "mismatch",
            "description": "This escrow is not related.",
            "evidence": {},
            "raised_by_agent_id": agent.id,
        },
    )
    assert mismatch.status_code == 409
    assert "does not belong" in mismatch.json()["detail"]

    open_job = _job(agent.id)
    db_session.add(open_job)
    db_session.commit()
    invalid_state = client.post(
        f"/api/v1/jobs/{open_job.id}/disputes",
        json={
            "escrow_id": escrow["id"],
            "category": "other",
            "reason": "invalid state",
            "description": "The job is not ready for a dispute.",
            "evidence": {},
            "raised_by_agent_id": agent.id,
        },
    )
    assert invalid_state.status_code in {409, 404}


def test_duplicate_open_dispute_and_unresolved_dispute_block_settlement(client, db_session) -> None:
    job, agent, escrow = _passing_job(client, db_session, suffix="block")
    first = _create_dispute(client, job, agent, escrow["id"])
    duplicate = client.post(
        f"/api/v1/jobs/{job.id}/disputes",
        json={
            "escrow_id": escrow["id"],
            "category": "other",
            "reason": "second dispute",
            "description": "A second unresolved dispute is not allowed.",
            "evidence": {},
            "raised_by_agent_id": agent.id,
        },
    )
    assert duplicate.status_code == 409
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409
    assert client.get(f"/api/v1/disputes/{first['id']}/events").status_code == 200


def test_review_requires_demo_operator_and_terminal_dispute_cannot_be_reopened(client, db_session) -> None:
    job, agent, escrow = _funded(client, db_session, suffix="auth")
    dispute = _create_dispute(client, job, agent, escrow["id"])
    missing = client.post(f"/api/v1/disputes/{dispute['id']}/review", json={})
    wrong = client.post(
        f"/api/v1/disputes/{dispute['id']}/review",
        headers={"X-Demo-Operator": "not-authorized"},
        json={"rationale": "Reviewing the evidence."},
    )
    assert missing.status_code == 403
    assert wrong.status_code == 403
    reviewed = client.post(
        f"/api/v1/disputes/{dispute['id']}/review",
        headers=DEMO_OPERATOR_HEADERS,
        json={"rationale": "Reviewing the evidence."},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "under_review"

    no_rationale = client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "refund", "rationale": "short"},
    )
    assert no_rationale.status_code == 422
    resolved = client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "reject", "rationale": "The evidence does not establish an actionable breach."},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "rejected"
    reopened = client.post(
        f"/api/v1/disputes/{dispute['id']}/review",
        headers=DEMO_OPERATOR_HEADERS,
        json={},
    )
    assert reopened.status_code == 409


def test_release_resolution_calls_escrow_service_and_preserves_ledger_history(client, db_session) -> None:
    job, agent, escrow = _passing_job(client, db_session, suffix="release")
    dispute = _create_dispute(client, job, agent, escrow["id"])
    resolved = client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "release", "rationale": "The accepted agreement authorizes release after review."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolution"] == "release"
    assert resolved.json()["resolved_by_operator"] == "demo-operator"
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "completed"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").json()["status"] == "released"
    ledger = client.get(f"/api/v1/escrows/{escrow['id']}/ledger").json()
    assert [entry["entry_type"] for entry in ledger] == ["funding", "release"]
    assert client.post(f"/api/v1/escrows/{escrow['id']}/refund").status_code == 409
    assert client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "refund", "rationale": "A conflicting second outcome is forbidden."},
    ).status_code == 409


def test_refund_resolution_calls_escrow_service_and_prevents_release(client, db_session) -> None:
    job, agent, escrow = _funded(client, db_session, suffix="refund")
    _start_and_submit(client, job, output="not approved")
    failed = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert failed.json()["overall_result"] == "failed"
    dispute = _create_dispute(client, job, agent, escrow["id"], category="deliverable_incomplete")
    resolved = client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "refund", "rationale": "The deliverable did not satisfy the accepted terms."},
    )
    assert resolved.status_code == 200
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "cancelled"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").json()["status"] == "refunded"
    ledger = client.get(f"/api/v1/escrows/{escrow['id']}/ledger").json()
    assert [entry["entry_type"] for entry in ledger] == ["funding", "refund"]
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409


def test_resolution_failure_rolls_back_dispute_fields_and_audit_events(client, db_session) -> None:
    job, agent, escrow = _funded(client, db_session, suffix="rollback")
    dispute = _create_dispute(client, job, agent, escrow["id"])
    db_session.add(
        LedgerEntry(
            escrow_id=escrow["id"],
            job_id=job.id,
            idempotency_key="phase9-corrupt-release",
            entry_type="release",
            amount=Decimal("125.01"),
            currency="USD",
            reference="corrupt-fixture",
        )
    )
    db_session.commit()

    failed = client.post(
        f"/api/v1/disputes/{dispute['id']}/resolve",
        headers=DEMO_OPERATOR_HEADERS,
        json={"resolution": "release", "rationale": "Attempt must roll back on a balance failure."},
    )
    assert failed.status_code == 409
    db_session.expire_all()
    stored = db_session.get(Dispute, dispute["id"])
    assert stored is not None
    assert stored.status == "open"
    assert stored.resolution is None
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert "dispute.resolution_authorized" not in [event.event_type for event in events]
