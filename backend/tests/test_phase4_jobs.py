from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.job_states import INITIAL_JOB_STATUS, JOB_STATES, can_transition
from app.models import AuditEvent, Job


def _job_payload(**overrides):
    payload = {
        "title": "A useful verification job",
        "description": "Return a reliable result from the supplied synthetic input.",
        "required_skills": [" Python ", "PYTHON", " Testing "],
        "task_category": " verification ",
        "expected_output": "A structured verification report.",
        "acceptance_criteria": [" All checks have a result ", "The report is readable"],
        "budget": "125.00",
        "currency": " usd ",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "additional_instructions": " Keep the report concise. ",
        "requirements": {"format": "json"},
    }
    payload.update(overrides)
    return payload


def test_valid_create_normalizes_and_persists_job_and_initial_audit(client, db_session) -> None:
    response = client.post("/api/v1/jobs", json=_job_payload())

    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "A useful verification job"
    assert created["required_skills"] == ["python", "testing"]
    assert created["task_category"] == "verification"
    assert created["expected_output"] == "A structured verification report."
    assert created["acceptance_criteria"] == ["All checks have a result", "The report is readable"]
    assert created["additional_instructions"] == "Keep the report concise."
    assert created["currency"] == "USD"
    assert created["budget"] == "125.00"
    assert created["status"] == INITIAL_JOB_STATUS == "open"

    job_id = created["id"]
    persisted = client.get(f"/api/v1/jobs/{job_id}")
    assert persisted.status_code == 200
    assert persisted.json() == created

    events = client.get(f"/api/v1/jobs/{job_id}/events")
    assert events.status_code == 200
    assert len(events.json()) == 1
    assert events.json()[0]["event_type"] == "job.created"
    assert events.json()[0]["description"] == "job.created"
    assert events.json()[0]["job_id"] == job_id
    assert events.json()[0]["created_at"]

    stored_event = db_session.scalar(select(AuditEvent).where(AuditEvent.job_id == job_id))
    assert stored_event is not None
    assert stored_event.event_type == "job.created"
    assert stored_event.description == "job.created"
    assert stored_event.created_at is not None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "   "),
        ("description", "\t\n"),
        ("task_category", " "),
        ("expected_output", "  "),
        ("acceptance_criteria", [" ", "\t"]),
        ("required_skills", ["python", "   "]),
    ],
)
def test_blank_job_content_is_rejected(client, field, value) -> None:
    response = client.post("/api/v1/jobs", json=_job_payload(**{field: value}))

    assert response.status_code == 422


@pytest.mark.parametrize("budget", [0, "0.00", -1, "-0.01", "1.001", "1000000.01"])
def test_budget_must_be_positive_decimal_and_within_reasonable_limit(client, budget) -> None:
    response = client.post("/api/v1/jobs", json=_job_payload(budget=budget))

    assert response.status_code == 422


@pytest.mark.parametrize(
    "deadline",
    [
        "2020-01-01T00:00:00+00:00",
        "2030-01-01T00:00:00",
        (datetime.now(timezone.utc) + timedelta(days=366)).isoformat(),
    ],
)
def test_deadline_must_be_timezone_aware_future_and_within_horizon(client, deadline) -> None:
    response = client.post("/api/v1/jobs", json=_job_payload(deadline=deadline))

    assert response.status_code == 422


def test_currency_and_privileged_create_fields_are_rejected(client) -> None:
    invalid_currency = client.post("/api/v1/jobs", json=_job_payload(currency="ZZZ"))
    assert invalid_currency.status_code == 422

    for privileged_field in ("status", "selected_agent_id", "executor_agent_id", "created_at"):
        response = client.post(
            "/api/v1/jobs",
            json=_job_payload(**{privileged_field: "open" if privileged_field == "status" else 1}),
        )
        assert response.status_code == 422, privileged_field


def test_skills_and_acceptance_criteria_have_bounded_normalized_content(client) -> None:
    too_many_skills = client.post(
        "/api/v1/jobs",
        json=_job_payload(required_skills=[f"skill-{index}" for index in range(21)]),
    )
    assert too_many_skills.status_code == 422

    too_many_criteria = client.post(
        "/api/v1/jobs",
        json=_job_payload(acceptance_criteria=[f"criterion-{index}" for index in range(21)]),
    )
    assert too_many_criteria.status_code == 422

    unreasonable_skill = client.post(
        "/api/v1/jobs",
        json=_job_payload(required_skills=["x" * 81]),
    )
    assert unreasonable_skill.status_code == 422


def test_job_list_filters_search_pagination_and_decimal_bounds(client, db_session) -> None:
    jobs = [
        {"title": "Alpha research report", "task_category": "research", "budget": "10.00", "days": 40},
        {"title": "Beta build report", "task_category": "software", "budget": "20.00", "days": 10},
        {"title": "Gamma audit report", "task_category": "audit", "budget": "30.00", "days": 20},
    ]
    created_ids = []
    for values in jobs:
        payload = _job_payload(
            title=values["title"],
            task_category=values["task_category"],
            budget=values["budget"],
            deadline=(datetime.now(timezone.utc) + timedelta(days=values["days"])).isoformat(),
        )
        response = client.post("/api/v1/jobs", json=payload)
        assert response.status_code == 201
        created_ids.append(response.json()["id"])

    db_job = db_session.get(Job, created_ids[1])
    assert db_job is not None
    db_job.status = "assigned"
    db_session.commit()

    category = client.get("/api/v1/jobs", params={"task_category": " software "})
    assert category.status_code == 200
    assert category.json()["total"] == 1
    assert category.json()["items"][0]["title"] == "Beta build report"

    search = client.get("/api/v1/jobs", params={"search": "ALPHA RESEARCH"})
    assert search.status_code == 200
    assert search.json()["total"] == 1
    assert search.json()["items"][0]["title"] == "Alpha research report"

    budget = client.get(
        "/api/v1/jobs",
        params={"min_budget": "20.00", "max_budget": "30.00", "sort": "deadline"},
    )
    assert budget.status_code == 200
    assert budget.json()["total"] == 2
    assert [item["budget"] for item in budget.json()["items"]] == ["20.00", "30.00"]

    status = client.get("/api/v1/jobs", params={"status": "assigned"})
    assert status.status_code == 200
    assert status.json()["total"] == 1
    assert status.json()["items"][0]["id"] == created_ids[1]

    paged = client.get("/api/v1/jobs", params={"skip": 1, "limit": 1, "sort": "newest"})
    assert paged.status_code == 200
    assert paged.json()["total"] == 3
    assert len(paged.json()["items"]) == 1
    assert paged.json()["items"][0]["id"] == created_ids[1]

    invalid_bounds = client.get("/api/v1/jobs", params={"min_budget": "30.01", "max_budget": "30.00"})
    assert invalid_bounds.status_code == 422
    invalid_precision = client.get("/api/v1/jobs", params={"min_budget": "1.001"})
    assert invalid_precision.status_code == 422
    invalid_status = client.get("/api/v1/jobs", params={"status": "not-a-state"})
    assert invalid_status.status_code == 422


def test_job_and_event_missing_records_return_404(client) -> None:
    assert client.get("/api/v1/jobs/999999").status_code == 404
    assert client.get("/api/v1/jobs/999999/events").status_code == 404


def test_job_state_definition_has_initial_state_and_explicit_transitions() -> None:
    assert INITIAL_JOB_STATUS in JOB_STATES
    assert can_transition("open", "assigned")
    assert not can_transition("open", "completed")
    assert not can_transition("open", "arbitrary-client-state")
