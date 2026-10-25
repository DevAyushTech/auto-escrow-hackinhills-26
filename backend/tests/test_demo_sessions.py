from datetime import datetime, timedelta, timezone

from app import config as config_module
from app import demo_sessions as demo_module
from app.models import Agent, DemoSession


def _job_payload(title: str) -> dict:
    return {
        "title": title,
        "description": "A synthetic demo job used to verify sandbox ownership.",
        "required_skills": ["testing"],
        "task_category": "verification",
        "expected_output": "A structured synthetic result.",
        "acceptance_criteria": ["Required terms: synthetic"],
        "budget": "25.00",
        "currency": "USD",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
    }


def _enable_public_demo(monkeypatch):
    import app.services.disputes as disputes_module

    settings = config_module.Settings(
        app_env="production",
        frontend_origin="https://demo.example",
        demo_public_enabled=True,
        demo_max_jobs_per_session=3,
        demo_rate_limit_per_minute=500,
        demo_session_create_limit_per_hour=50,
    )
    monkeypatch.setattr(config_module, "get_settings", lambda: settings)
    monkeypatch.setattr(demo_module, "get_settings", lambda: settings)
    monkeypatch.setattr(disputes_module, "get_settings", lambda: settings)


def test_public_session_bootstrap_seeds_synthetic_agents_once_when_registry_is_empty(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)

    first_token = client.post("/api/demo/session").json()["session_token"]
    first_agents = client.get("/api/v1/agents", headers={"X-Demo-Session": first_token})
    assert first_agents.status_code == 200
    assert first_agents.json()["total"] == 6
    assert all(item["metadata"]["synthetic"] is True for item in first_agents.json()["items"])

    second_token = client.post("/api/demo/session").json()["session_token"]
    second_agents = client.get("/api/v1/agents", headers={"X-Demo-Session": second_token})
    assert second_agents.status_code == 200
    assert second_agents.json()["total"] == 6
    assert db_session.query(Agent).count() == 6


def test_public_session_cannot_attach_a_private_requester_agent(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)
    private_agent = Agent(
        external_id="private-requester",
        name="Private Requester",
        description="This record must not be attachable to a public sandbox.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json"],
        availability="available",
        estimated_completion_minutes=10,
        demo_performance_stats={},
        capabilities=["testing"],
        metadata_json={"synthetic": False},
    )
    db_session.add(private_agent)
    db_session.commit()

    token = client.post("/api/demo/session").json()["session_token"]
    response = client.post(
        "/api/v1/jobs",
        headers={"X-Demo-Session": token},
        json={**_job_payload("Private requester must be rejected"), "requester_agent_id": private_agent.id},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "requester agent not found"


def _public_empty_database_job(client, monkeypatch, title: str):
    _enable_public_demo(monkeypatch)
    token = client.post("/api/demo/session").json()["session_token"]
    headers = {"X-Demo-Session": token}
    agents = client.get("/api/v1/agents", headers=headers)
    assert agents.status_code == 200
    assert agents.json()["total"] == 6

    payload = {
        **_job_payload(title),
        "required_skills": ["verification"],
        "task_category": "verification",
    }
    job_response = client.post("/api/v1/jobs", headers=headers, json=payload)
    assert job_response.status_code == 201
    job = job_response.json()
    match = client.post(f"/api/v1/jobs/{job['id']}/matches", headers=headers)
    assert match.status_code == 201
    candidate = match.json()["candidates"][0]
    selected = client.post(
        f"/api/v1/jobs/{job['id']}/matches/{candidate['agent_id']}/select",
        headers=headers,
        json={"run_id": match.json()["run_id"]},
    )
    assert selected.status_code == 200
    agreement = client.post(f"/api/v1/jobs/{job['id']}/agreement", headers=headers, json={})
    assert agreement.status_code == 201
    accepted = client.post(
        f"/api/v1/agreements/{agreement.json()['id']}/accept",
        headers=headers,
        json={},
    )
    assert accepted.status_code == 200
    escrow = client.post(
        f"/api/v1/jobs/{job['id']}/escrow/fund",
        headers=headers,
        json={"idempotency_key": f"empty-db-{job['id']}"},
    )
    assert escrow.status_code == 201
    started = client.post(f"/api/v1/jobs/{job['id']}/start", headers=headers)
    assert started.status_code == 200
    return headers, job, candidate, escrow.json()


def test_empty_public_database_can_complete_and_release_the_success_path(client, db_session, monkeypatch) -> None:
    headers, job, _candidate, escrow = _public_empty_database_job(client, monkeypatch, "Empty database success")
    submitted = client.post(
        f"/api/v1/jobs/{job['id']}/submit",
        headers=headers,
        json={"submitted_output": "approved synthetic result", "evidence": {"source": "fixture"}},
    )
    assert submitted.status_code == 201
    verified = client.post(f"/api/v1/jobs/{job['id']}/verify", headers=headers)
    assert verified.status_code == 200
    assert verified.json()["overall_result"] == "passed"
    released = client.post(f"/api/v1/escrows/{escrow['id']}/release", headers=headers)
    assert released.status_code == 200
    assert released.json()["status"] == "released"
    assert client.get(f"/api/v1/jobs/{job['id']}", headers=headers).json()["status"] == "completed"
    assert client.get("/api/v1/dashboard/metrics", headers=headers).json()["total_jobs"] == 1
    assert db_session.query(Agent).count() == 6


def test_empty_public_database_can_follow_failed_verification_to_refund(client, db_session, monkeypatch) -> None:
    headers, job, candidate, escrow = _public_empty_database_job(client, monkeypatch, "Empty database dispute")
    submitted = client.post(
        f"/api/v1/jobs/{job['id']}/submit",
        headers=headers,
        json={"submitted_output": "failed output", "evidence": {"source": "fixture"}},
    )
    assert submitted.status_code == 201
    verified = client.post(f"/api/v1/jobs/{job['id']}/verify", headers=headers)
    assert verified.status_code == 200
    assert verified.json()["overall_result"] == "failed"

    dispute = client.post(
        f"/api/v1/jobs/{job['id']}/disputes",
        headers=headers,
        json={
            "escrow_id": escrow["id"],
            "category": "failed_verification",
            "reason": "The failed synthetic result needs review.",
            "description": "This is a public sandbox dispute for the failed verification path.",
            "evidence": {"synthetic": True},
            "raised_by_agent_id": candidate["agent_id"],
        },
    )
    assert dispute.status_code == 201
    dispute_id = dispute.json()["id"]
    reviewed = client.post(
        f"/api/v1/disputes/{dispute_id}/review",
        headers={**headers, "X-Demo-Operator": "demo-session"},
        json={},
    )
    assert reviewed.status_code == 200
    resolved = client.post(
        f"/api/v1/disputes/{dispute_id}/resolve",
        headers={**headers, "X-Demo-Operator": "demo-session"},
        json={"resolution": "refund", "rationale": "The failed result did not satisfy the synthetic terms."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert client.get(f"/api/v1/jobs/{job['id']}", headers=headers).json()["status"] == "cancelled"
    assert client.get(f"/api/v1/jobs/{job['id']}/escrow", headers=headers).json()["status"] == "refunded"
    ledger = client.get(f"/api/v1/escrows/{escrow['id']}/ledger", headers=headers)
    assert [entry["entry_type"] for entry in ledger.json()] == ["funding", "refund"]
    assert db_session.query(Agent).count() == 6
    reset = client.post("/api/demo/reset", headers=headers)
    assert reset.status_code == 200
    replacement_token = reset.json()["session_token"]
    assert replacement_token != headers["X-Demo-Session"]
    assert client.get(f"/api/v1/jobs/{job['id']}", headers=headers).status_code == 401
    assert client.get(f"/api/v1/jobs/{job['id']}", headers={"X-Demo-Session": replacement_token}).status_code == 404


def test_public_demo_requires_a_session_and_isolates_jobs(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)
    db_session.add(
        Agent(
            external_id="synthetic-session-agent",
            name="Synthetic Session Agent",
            description="Synthetic agent for session isolation tests.",
            skills=["testing"],
            task_categories=["verification"],
            supported_output_formats=["json"],
            availability="available",
            estimated_completion_minutes=10,
            demo_performance_stats={"synthetic": True},
            capabilities=["testing"],
            metadata_json={"synthetic": True},
        )
    )
    db_session.commit()

    assert client.get("/api/v1/agents").status_code == 401
    first = client.post("/api/demo/session")
    second = client.post("/api/demo/session")
    assert first.status_code == second.status_code == 200
    first_token = first.json()["session_token"]
    second_token = second.json()["session_token"]

    first_job = client.post(
        "/api/v1/jobs",
        headers={"X-Demo-Session": first_token},
        json=_job_payload("First isolated job"),
    )
    second_job = client.post(
        "/api/v1/jobs",
        headers={"X-Demo-Session": second_token},
        json=_job_payload("Second isolated job"),
    )
    assert first_job.status_code == second_job.status_code == 201

    first_id = first_job.json()["id"]
    second_id = second_job.json()["id"]
    assert client.get(f"/api/v1/jobs/{first_id}", headers={"X-Demo-Session": first_token}).status_code == 200
    assert client.get(f"/api/v1/jobs/{second_id}", headers={"X-Demo-Session": first_token}).status_code == 404
    assert client.get(f"/api/v1/jobs/{first_id}", headers={"X-Demo-Session": second_token}).status_code == 404
    assert client.get("/api/v1/agents", headers={"X-Demo-Session": first_token}).json()["total"] == 1


def test_reset_revokes_only_the_callers_token_and_deletes_only_their_jobs(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)
    first_token = client.post("/api/demo/session").json()["session_token"]
    second_token = client.post("/api/demo/session").json()["session_token"]
    first_job = client.post(
        "/api/v1/jobs",
        headers={"X-Demo-Session": first_token},
        json=_job_payload("Reset me"),
    ).json()
    second_job = client.post(
        "/api/v1/jobs",
        headers={"X-Demo-Session": second_token},
        json=_job_payload("Keep me"),
    ).json()

    reset = client.post("/api/demo/reset", headers={"X-Demo-Session": first_token})
    assert reset.status_code == 200
    replacement_token = reset.json()["session_token"]
    assert replacement_token != first_token
    assert client.get(f"/api/v1/jobs/{first_job['id']}", headers={"X-Demo-Session": replacement_token}).status_code == 404
    assert client.get(f"/api/v1/jobs/{first_job['id']}", headers={"X-Demo-Session": first_token}).status_code == 401
    assert client.get(f"/api/v1/jobs/{second_job['id']}", headers={"X-Demo-Session": second_token}).status_code == 200
    assert db_session.query(DemoSession).count() == 2


def test_public_session_can_complete_the_authoritative_success_path(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)
    agent = Agent(
        external_id="synthetic-flow-agent",
        name="Synthetic Flow Agent",
        description="Synthetic agent for the complete public flow.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json"],
        availability="available",
        estimated_completion_minutes=10,
        demo_performance_stats={"synthetic": True},
        capabilities=["testing"],
        metadata_json={"synthetic": True},
    )
    db_session.add(agent)
    db_session.commit()

    token = client.post("/api/demo/session").json()["session_token"]
    headers = {"X-Demo-Session": token}
    job = client.post("/api/v1/jobs", headers=headers, json=_job_payload("Complete isolated flow")).json()
    job_id = job["id"]
    match = client.post(f"/api/v1/jobs/{job_id}/matches", headers=headers)
    assert match.status_code == 201
    selected = client.post(
        f"/api/v1/jobs/{job_id}/matches/{agent.id}/select",
        headers=headers,
        json={"run_id": match.json()["run_id"]},
    )
    assert selected.status_code == 200
    agreement = client.post(f"/api/v1/jobs/{job_id}/agreement", headers=headers, json={})
    assert agreement.status_code == 201
    accepted = client.post(f"/api/v1/agreements/{agreement.json()['id']}/accept", headers=headers, json={})
    assert accepted.status_code == 200
    funded = client.post(f"/api/v1/jobs/{job_id}/escrow/fund", headers=headers, json={"idempotency_key": "public-flow"})
    assert funded.status_code == 201
    started = client.post(f"/api/v1/jobs/{job_id}/start", headers=headers)
    assert started.status_code == 200
    submitted = client.post(
        f"/api/v1/jobs/{job_id}/submit",
        headers=headers,
        json={
            "submitted_output": '{"summary":"approved synthetic result","status":"approved"}',
            "evidence": {"source": "synthetic-fixture"},
        },
    )
    assert submitted.status_code == 201
    verified = client.post(f"/api/v1/jobs/{job_id}/verify", headers=headers)
    assert verified.status_code == 200
    assert verified.json()["overall_result"] == "passed"
    released = client.post(f"/api/v1/escrows/{funded.json()['id']}/release", headers=headers)
    assert released.status_code == 200
    assert released.json()["status"] == "released"

    other_token = client.post("/api/demo/session").json()["session_token"]
    other_headers = {"X-Demo-Session": other_token}
    assert client.get(f"/api/v1/jobs/{job_id}", headers=other_headers).status_code == 404
    assert client.post(f"/api/v1/escrows/{funded.json()['id']}/release", headers=other_headers).status_code == 404


def test_public_session_can_resolve_only_its_own_dispute(client, db_session, monkeypatch) -> None:
    _enable_public_demo(monkeypatch)
    agent = Agent(
        external_id="synthetic-public-dispute-agent",
        name="Synthetic Public Dispute Agent",
        description="Synthetic agent for the public dispute boundary.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json"],
        availability="available",
        estimated_completion_minutes=10,
        demo_performance_stats={"synthetic": True},
        capabilities=["testing"],
        metadata_json={"synthetic": True},
    )
    db_session.add(agent)
    db_session.commit()
    token = client.post("/api/demo/session").json()["session_token"]
    headers = {"X-Demo-Session": token}
    job = client.post("/api/v1/jobs", headers=headers, json=_job_payload("Public dispute flow")).json()
    run = client.post(f"/api/v1/jobs/{job['id']}/matches", headers=headers)
    client.post(
        f"/api/v1/jobs/{job['id']}/matches/{agent.id}/select",
        headers=headers,
        json={"run_id": run.json()["run_id"]},
    )
    agreement = client.post(f"/api/v1/jobs/{job['id']}/agreement", headers=headers, json={}).json()
    client.post(f"/api/v1/agreements/{agreement['id']}/accept", headers=headers, json={})
    escrow = client.post(f"/api/v1/jobs/{job['id']}/escrow/fund", headers=headers, json={"idempotency_key": "public-dispute"}).json()
    client.post(f"/api/v1/jobs/{job['id']}/start", headers=headers)
    client.post(f"/api/v1/jobs/{job['id']}/submit", headers=headers, json={"submitted_output": "failed output", "evidence": {}})
    client.post(f"/api/v1/jobs/{job['id']}/verify", headers=headers)
    dispute = client.post(
        f"/api/v1/jobs/{job['id']}/disputes",
        headers=headers,
        json={
            "escrow_id": escrow["id"],
            "category": "failed_verification",
            "reason": "The synthetic output needs review.",
            "description": "Public sandbox dispute boundary test.",
            "evidence": {"synthetic": True},
            "raised_by_agent_id": agent.id,
        },
    )
    assert dispute.status_code == 201
    dispute_id = dispute.json()["id"]
    reviewed = client.post(
        f"/api/v1/disputes/{dispute_id}/review",
        headers={**headers, "X-Demo-Operator": "demo-session"},
        json={},
    )
    assert reviewed.status_code == 200
    resolved = client.post(
        f"/api/v1/disputes/{dispute_id}/resolve",
        headers={**headers, "X-Demo-Operator": "demo-session"},
        json={"resolution": "refund", "rationale": "The synthetic output did not satisfy the accepted terms."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["resolved_by_operator"].startswith("demo-session-")

    other_token = client.post("/api/demo/session").json()["session_token"]
    cross_session = client.post(
        f"/api/v1/disputes/{dispute_id}/resolve",
        headers={"X-Demo-Session": other_token, "X-Demo-Operator": "demo-session"},
        json={"resolution": "refund", "rationale": "A cross-session resolution must be blocked."},
    )
    assert cross_session.status_code == 404
