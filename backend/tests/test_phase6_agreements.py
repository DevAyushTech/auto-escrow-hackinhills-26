from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Agent, Agreement, AuditEvent, Job


def _agent(external_id: str = "phase6-agent") -> Agent:
    return Agent(
        external_id=external_id,
        name="Phase 6 agent",
        description="Agent used by agreement negotiation tests.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json"],
        availability="available",
        estimated_completion_minutes=30,
        demo_performance_stats={"success_rate": 1.0},
        capabilities=["testing"],
    )


def _job(agent_id: int, *, requester_agent_id: int | None = None, status: str = "open") -> Job:
    return Job(
        requester_agent_id=requester_agent_id,
        selected_agent_id=agent_id,
        title="Phase 6 agreement job",
        description="Complete the verification task and return a structured result.",
        budget=Decimal("125.00"),
        currency="USD",
        deadline=datetime.now(timezone.utc) + timedelta(days=5),
        status=status,
        required_skills=["testing"],
        task_category="verification",
        expected_output="A structured verification report.",
        acceptance_criteria=["Every check has a result", "The report is readable"],
        additional_instructions="Use the supplied synthetic input.",
    )


def _terms(suffix: str = "") -> dict:
    return {
        "scope": f"Verify the supplied input {suffix}".strip(),
        "expected_deliverable": "A JSON verification report",
        "acceptance_criteria": ["Every check has a result", "The report is readable"],
        "verification_method": "Requester reviews the report against each criterion",
        "cancellation_conditions": "Either party may cancel before acceptance by agreement",
        "dispute_conditions": "A party may submit evidence for a disputed result",
        "instructions": "Keep the report concise",
    }


def _create_selected_job(
    db_session,
    *,
    requester: bool = True,
    status: str = "open",
    suffix: str = "",
) -> tuple[Agent, Job]:
    agent = _agent(f"phase6-agent{suffix}")
    db_session.add(agent)
    db_session.flush()
    requester_agent = _agent(f"phase6-requester{suffix}") if requester else None
    if requester_agent:
        db_session.add(requester_agent)
        db_session.flush()
    job = _job(agent.id, requester_agent_id=requester_agent.id if requester_agent else None, status=status)
    db_session.add(job)
    db_session.commit()
    return agent, job


def test_create_proposal_uses_selected_agent_and_job_defaults(client, db_session) -> None:
    agent, job = _create_selected_job(db_session)

    response = client.post(f"/api/v1/jobs/{job.id}/agreement", json={})

    assert response.status_code == 201
    agreement = response.json()
    assert agreement["status"] == "proposed"
    assert agreement["executor_agent_id"] == agent.id
    assert agreement["proposed_budget"] == "125.00"
    assert agreement["proposal_version"] == 1
    assert agreement["accepted_version"] is None
    assert agreement["terms"]["scope"] == job.description
    assert agreement["terms"]["expected_deliverable"] == job.expected_output
    assert len(agreement["proposal_history"]) == 1
    assert agreement["proposal_history"][0]["version"] == 1
    assert client.get(f"/api/v1/jobs/{job.id}/agreement").status_code == 200


def test_create_preserves_a_future_legacy_job_deadline_outside_new_input_horizon(client, db_session) -> None:
    _agent_row, job = _create_selected_job(db_session)
    job.deadline = datetime.now(timezone.utc) + timedelta(days=400)
    db_session.commit()

    response = client.post(f"/api/v1/jobs/{job.id}/agreement", json={})

    assert response.status_code == 201
    assert response.json()["proposed_deadline"].startswith(str(job.deadline.date()))


def test_create_requires_selected_existing_agent_and_open_job(client, db_session) -> None:
    agent = _agent()
    db_session.add(agent)
    db_session.flush()
    no_selection = _job(agent.id)
    no_selection.selected_agent_id = None
    db_session.add(no_selection)
    closed = _job(agent.id, status="assigned")
    db_session.add(closed)
    db_session.commit()

    assert client.post(f"/api/v1/jobs/{no_selection.id}/agreement", json={}).status_code == 409
    assert client.post(f"/api/v1/jobs/{closed.id}/agreement", json={}).status_code == 409



def test_create_rejects_invalid_budget_deadline_currency_and_terms(client, db_session) -> None:
    _agent_row, job = _create_selected_job(db_session)
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    base = {"proposed_budget": "100.00", "proposed_deadline": future, "terms": _terms()}

    assert client.post(f"/api/v1/jobs/{job.id}/agreement", json={**base, "proposed_budget": "0"}).status_code == 422
    assert client.post(
        f"/api/v1/jobs/{job.id}/agreement", json={**base, "proposed_deadline": "2030-01-01T00:00:00"}
    ).status_code == 422
    assert client.post(f"/api/v1/jobs/{job.id}/agreement", json={**base, "currency": "ZZZ"}).status_code == 422
    assert client.post(f"/api/v1/jobs/{job.id}/agreement", json={**base, "terms": {}}).status_code == 422


def test_history_versioning_revision_request_and_submit(client, db_session) -> None:
    _agent_row, job = _create_selected_job(db_session)
    created = client.post(f"/api/v1/jobs/{job.id}/agreement", json={}).json()
    agreement_id = created["id"]

    requested = client.post(
        f"/api/v1/agreements/{agreement_id}/revise",
        json={"action": "request_revision", "rationale": "Please clarify the report format."},
    )
    assert requested.status_code == 200
    assert requested.json()["status"] == "revision_requested"
    assert requested.json()["proposal_version"] == 1
    assert len(requested.json()["proposal_history"]) == 1

    revised = client.post(
        f"/api/v1/agreements/{agreement_id}/revise",
        json={
            "action": "submit_revision",
            "proposed_budget": "140.50",
            "proposed_deadline": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "terms": _terms("with a clarified format"),
            "rationale": "Added the requested format details.",
        },
    )
    assert revised.status_code == 200
    assert revised.json()["status"] == "proposed"
    assert revised.json()["proposal_version"] == 2
    assert revised.json()["proposed_budget"] == "140.50"
    assert len(revised.json()["proposal_history"]) == 2

    history = client.get(f"/api/v1/agreements/{agreement_id}/history")
    assert history.status_code == 200
    assert [entry["version"] for entry in history.json()] == [1, 2]
    assert history.json()[1]["action"] == "revised"
    assert history.json()[1]["budget"] == "140.50"
    assert history.json()[1]["rationale"] == "Added the requested format details."


def test_acceptance_freezes_agreement_assigns_job_and_is_idempotent(client, db_session) -> None:
    _agent_row, job = _create_selected_job(db_session)
    created = client.post(f"/api/v1/jobs/{job.id}/agreement", json={}).json()
    agreement_id = created["id"]

    accepted = client.post(f"/api/v1/agreements/{agreement_id}/accept")
    assert accepted.status_code == 200
    accepted_body = accepted.json()
    assert accepted_body["status"] == "accepted"
    assert accepted_body["accepted_version"] == 1
    assert accepted_body["accepted_at"]
    assigned_job = client.get(f"/api/v1/jobs/{job.id}").json()
    assert assigned_job["status"] == "assigned"
    assert assigned_job["executor_agent_id"] == accepted_body["executor_agent_id"]
    terms_before = accepted_body["terms"]

    repeated = client.post(f"/api/v1/agreements/{agreement_id}/accept")
    assert repeated.status_code == 200
    assert repeated.json()["accepted_at"] == accepted_body["accepted_at"]
    assert repeated.json()["terms"] == terms_before

    for action in ("request_revision", "submit_revision"):
        assert client.post(
            f"/api/v1/agreements/{agreement_id}/revise",
            json={"action": action, "terms": _terms("attempted after acceptance")},
        ).status_code == 409
    assert client.post(f"/api/v1/agreements/{agreement_id}/reject").status_code == 409
    assert client.post(f"/api/v1/agreements/{agreement_id}/cancel").status_code == 409
    assert db_session.scalar(select(Agreement).where(Agreement.id == agreement_id)).escrow is None

    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert [event.event_type for event in events] == ["agreement.proposed", "agreement.accepted"]


def test_reject_cancel_and_invalid_transitions_are_validated(client, db_session) -> None:
    _agent_row, rejected_job = _create_selected_job(db_session, suffix="-reject")
    rejected_id = client.post(f"/api/v1/jobs/{rejected_job.id}/agreement", json={}).json()["id"]
    assert client.post(
        f"/api/v1/agreements/{rejected_id}/revise", json={"action": "request_revision"}
    ).status_code == 200
    assert client.post(f"/api/v1/agreements/{rejected_id}/reject").status_code == 200
    assert client.post(f"/api/v1/agreements/{rejected_id}/accept").status_code == 409

    _agent_row, cancelled_job = _create_selected_job(db_session, suffix="-cancel")
    cancelled_id = client.post(f"/api/v1/jobs/{cancelled_job.id}/agreement", json={}).json()["id"]
    assert client.post(f"/api/v1/agreements/{cancelled_id}/cancel").status_code == 200
    assert client.post(f"/api/v1/agreements/{cancelled_id}/cancel").status_code == 409

    _agent_row, invalid_job = _create_selected_job(db_session, suffix="-invalid")
    invalid_id = client.post(f"/api/v1/jobs/{invalid_job.id}/agreement", json={}).json()["id"]
    assert client.post(
        f"/api/v1/agreements/{invalid_id}/revise", json={"action": "request_revision"}
    ).status_code == 200
    assert client.post(
        f"/api/v1/agreements/{invalid_id}/revise", json={"action": "request_revision"}
    ).status_code == 409
    assert client.post(
        f"/api/v1/agreements/{invalid_id}/revise", json={"action": "submit_revision"}
    ).status_code == 200


def test_missing_agreement_and_history_return_404(client) -> None:
    assert client.get("/api/v1/agreements/999999").status_code == 404
    assert client.get("/api/v1/agreements/999999/history").status_code == 404
    assert client.post("/api/v1/agreements/999999/accept").status_code == 404
