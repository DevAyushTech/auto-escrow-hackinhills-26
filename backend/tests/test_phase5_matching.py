from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Agent, AuditEvent, Job, MatchResult
from app.services.matching import evaluate_candidate, rank_candidates


def _job_payload(**overrides):
    payload = {
        "title": "Phase 5 matching job",
        "description": "Return a deterministic explainable result.",
        "required_skills": ["Python", "Testing"],
        "task_category": "Verification",
        "expected_output": "A JSON result.",
        "acceptance_criteria": ["The result is explainable"],
        "budget": "125.00",
        "currency": "USD",
        "deadline": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
    }
    payload.update(overrides)
    return payload


def _agent(
    name: str,
    *,
    skills: list[str] | None = None,
    categories: list[str] | None = None,
    status: str = "active",
    availability: str = "available",
    completion: int | None = 30,
) -> Agent:
    return Agent(
        external_id=f"phase5-{name.lower().replace(' ', '-')}",
        name=name,
        description=f"{name} test agent",
        status=status,
        availability=availability,
        skills=skills or ["python", "testing"],
        task_categories=categories or ["verification"],
        supported_output_formats=["json"],
        estimated_completion_minutes=completion,
        demo_performance_stats={},
        capabilities=skills or ["python", "testing"],
        metadata_json={},
    )


def _add_agents(db_session, *agents: Agent) -> list[Agent]:
    db_session.add_all(list(agents))
    db_session.commit()
    return list(agents)


def test_pure_matching_normalizes_case_and_ranks_strong_match_above_unrelated() -> None:
    job = {
        "required_skills": [" Python ", "TESTING"],
        "task_category": "Verification",
        "deadline": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    strong = {"id": 2, "name": "Strong", "skills": ["python", "Testing"], "task_categories": ["VERIFICATION"], "status": "active", "availability": "available", "estimated_completion_minutes": 30}
    unrelated = {"id": 1, "name": "Unrelated", "skills": ["design"], "task_categories": ["design"], "status": "active", "availability": "available", "estimated_completion_minutes": 30}

    ranked = rank_candidates(job, [strong, unrelated], now=datetime.now(timezone.utc))

    assert ranked[0].agent_id == 2
    assert ranked[0].matched_skills == ("python", "testing")
    assert ranked[0].missing_skills == ()
    assert ranked[0].eligible is True
    assert ranked[1].eligible is False
    assert any("missing required skills" in reason for reason in ranked[1].exclusion_reasons)


def test_category_mismatch_does_not_exclude_and_scores_stay_in_range() -> None:
    job = {
        "required_skills": ["python"],
        "task_category": "verification",
        "deadline": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    agent = {
        "id": 4,
        "name": "Other Category",
        "skills": ["PYTHON"],
        "task_categories": ["research"],
        "status": "active",
        "availability": "available",
        "estimated_completion_minutes": 30,
    }

    candidate = evaluate_candidate(job, agent)

    assert candidate.eligible is True
    assert candidate.breakdown["category"]["state"] == "not_matched"
    assert Decimal("0") <= candidate.score <= Decimal("100")
    assert candidate.breakdown["budget"]["score"] == "0.50"
    assert candidate.breakdown["budget"]["contribution"] == "5.00"
    assert any("budget" in warning.lower() and "neutral" in warning.lower() for warning in candidate.warnings)


def test_unavailable_and_deadline_incompatible_agents_are_explicitly_excluded(client, db_session) -> None:
    _add_agents(
        db_session,
        _agent("Unavailable", availability="busy"),
        _agent("Too Slow", completion=500),
    )
    created = client.post(
        "/api/v1/jobs",
        json=_job_payload(deadline=(datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()),
    )
    assert created.status_code == 201

    response = client.post(f"/api/v1/jobs/{created.json()['id']}/matches")

    assert response.status_code == 201
    assert response.json()["candidates"] == []
    excluded = response.json()["excluded_agents"]
    assert len(excluded) == 2
    reasons = " ".join(reason for item in excluded for reason in item["exclusion_reasons"])
    assert "not available" in reasons
    assert "exceeds" in reasons
    assert all(Decimal("0") <= Decimal(item["score"]) <= Decimal("100") for item in excluded)


def test_missing_required_skill_is_mandatory_but_unknown_deadline_is_not(client, db_session) -> None:
    agent = _agent("Partial", skills=["python"], completion=None)
    _add_agents(db_session, agent)
    created = client.post("/api/v1/jobs", json=_job_payload())
    assert created.status_code == 201

    response = client.post(f"/api/v1/jobs/{created.json()['id']}/matches")
    excluded = response.json()["excluded_agents"][0]

    assert excluded["missing_skills"] == ["testing"]
    assert excluded["eligible"] is False
    assert excluded["breakdown"]["availability_deadline"]["deadline"]["state"] == "unknown"
    assert any("unknown" in warning.lower() for warning in excluded["warnings"])


def test_ties_are_deterministic_and_latest_run_is_persisted_and_retrievable(client, db_session) -> None:
    first, second = _add_agents(db_session, _agent("First"), _agent("Second"))
    created = client.post("/api/v1/jobs", json=_job_payload())
    job_id = created.json()["id"]

    first_run = client.post(f"/api/v1/jobs/{job_id}/matches")
    second_run = client.post(f"/api/v1/jobs/{job_id}/matches")
    latest = client.get(f"/api/v1/jobs/{job_id}/matches")

    assert first_run.status_code == second_run.status_code == 201
    assert first_run.json()["candidates"][0]["agent_id"] == first.id
    assert first_run.json()["candidates"][1]["agent_id"] == second.id
    assert first_run.json()["candidates"][0]["score"] == second_run.json()["candidates"][0]["score"]
    assert latest.status_code == 200
    assert latest.json()["run_id"] == second_run.json()["run_id"]
    assert latest.json()["candidates"] == second_run.json()["candidates"]
    assert db_session.scalar(select(MatchResult).where(MatchResult.job_id == job_id)) is not None
    assert db_session.query(MatchResult).filter(MatchResult.job_id == job_id).count() == 4


def test_missing_job_match_returns_404_and_no_run_returns_204(client, db_session) -> None:
    assert client.post("/api/v1/jobs/999999/matches").status_code == 404
    assert client.get("/api/v1/jobs/999999/matches").status_code == 404

    created = client.post("/api/v1/jobs", json=_job_payload())
    assert client.get(f"/api/v1/jobs/{created.json()['id']}/matches").status_code == 204


def test_matching_run_rejects_non_open_job_state(client, db_session) -> None:
    created = client.post("/api/v1/jobs", json=_job_payload())
    job_id = created.json()["id"]
    job = db_session.get(Job, job_id)
    assert job is not None
    job.status = "completed"
    db_session.commit()

    response = client.post(f"/api/v1/jobs/{job_id}/matches")

    assert response.status_code == 409
    assert "only 'open' jobs are eligible" in response.json()["detail"]


def test_selection_revalidates_eligibility_and_valid_selection_is_idempotent_with_audit(
    client, db_session
) -> None:
    good, bad = _add_agents(
        db_session,
        _agent("Good"),
        _agent("Bad", skills=["python"]),
    )
    created = client.post("/api/v1/jobs", json=_job_payload())
    job_id = created.json()["id"]
    run = client.post(f"/api/v1/jobs/{job_id}/matches")
    run_id = run.json()["run_id"]

    invalid = client.post(f"/api/v1/jobs/{job_id}/matches/{bad.id}/select", json={"run_id": run_id})
    assert invalid.status_code == 409
    assert "missing required skills" in str(invalid.json()["detail"])

    selected = client.post(
        f"/api/v1/jobs/{job_id}/matches/{good.id}/select",
        json={"run_id": run_id},
    )
    repeated = client.post(
        f"/api/v1/jobs/{job_id}/matches/{good.id}/select",
        json={"run_id": run_id},
    )

    assert selected.status_code == repeated.status_code == 200
    assert selected.json()["selected_agent_id"] == good.id
    assert selected.json()["status"] == "open"
    assert selected.json()["selected_match_run_id"] == run_id
    events = client.get(f"/api/v1/jobs/{job_id}/events").json()
    selected_events = [event for event in events if event["event_type"] == "job.agent_selected"]
    assert len(selected_events) == 1
    assert selected_events[0]["data"]["run_id"] == run_id
    assert selected_events[0]["data"]["scoring_version"] == "phase5-v1"
    assert selected_events[0]["data"]["score"] == selected.json()["selected_matching_score"]

    different = client.post(f"/api/v1/jobs/{job_id}/matches/{bad.id}/select")
    assert different.status_code == 409


def test_selection_rejects_non_open_job_and_missing_agent(client, db_session) -> None:
    agent = _add_agents(db_session, _agent("State Agent"))[0]
    created = client.post("/api/v1/jobs", json=_job_payload())
    job_id = created.json()["id"]
    job = db_session.get(Job, job_id)
    assert job is not None
    job.status = "completed"
    db_session.commit()

    assert client.post(f"/api/v1/jobs/{job_id}/matches/{agent.id}/select").status_code == 409
    job.status = "open"
    db_session.commit()
    assert client.post(f"/api/v1/jobs/{job_id}/matches/999999/select").status_code == 404


def test_persisted_selection_has_audit_row(client, db_session) -> None:
    agent = _add_agents(db_session, _agent("Audit Agent"))[0]
    created = client.post("/api/v1/jobs", json=_job_payload())
    job_id = created.json()["id"]

    response = client.post(f"/api/v1/jobs/{job_id}/matches/{agent.id}/select")

    assert response.status_code == 200
    event = db_session.scalar(
        select(AuditEvent).where(AuditEvent.job_id == job_id, AuditEvent.event_type == "job.agent_selected")
    )
    assert event is not None
    assert event.data["agent_id"] == agent.id
    assert event.data["scoring_version"] == "phase5-v1"
