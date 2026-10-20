from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Agent, AuditEvent, Escrow, Job, LedgerEntry, Submission, Verification


def _agent(external_id: str) -> Agent:
    return Agent(
        external_id=external_id,
        name="Phase 8 executor",
        description="Synthetic executor used by execution tests.",
        skills=["testing"],
        task_categories=["verification"],
        supported_output_formats=["json", "text"],
        availability="available",
        estimated_completion_minutes=15,
        demo_performance_stats={"success_rate": 1.0},
        capabilities=["testing"],
    )


def _job(agent_id: int, *, criteria: list[str], status: str = "open") -> Job:
    return Job(
        selected_agent_id=agent_id,
        title="Phase 8 execution job",
        description="Produce a deterministic verification artifact.",
        budget=Decimal("125.00"),
        currency="USD",
        deadline=datetime.now(timezone.utc) + timedelta(days=5),
        status=status,
        required_skills=["testing"],
        task_category="verification",
        expected_output="A structured verification report.",
        acceptance_criteria=criteria,
        additional_instructions="Use synthetic input only.",
    )


def _prepare_accepted(client, db_session, *, criteria: list[str], suffix: str = "") -> tuple[Job, dict]:
    agent = _agent(f"phase8-executor{suffix}")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id, criteria=criteria)
    db_session.add(job)
    db_session.commit()
    proposal = client.post(f"/api/v1/jobs/{job.id}/agreement", json={})
    assert proposal.status_code == 201
    accepted = client.post(f"/api/v1/agreements/{proposal.json()['id']}/accept")
    assert accepted.status_code == 200
    return job, accepted.json()


def _funded(client, db_session, *, criteria: list[str], suffix: str = "") -> tuple[Job, dict, dict]:
    job, agreement = _prepare_accepted(client, db_session, criteria=criteria, suffix=suffix)
    funded = client.post(
        f"/api/v1/jobs/{job.id}/escrow/fund",
        json={"idempotency_key": f"phase8-fund-{suffix or job.id}"},
    )
    assert funded.status_code == 201
    return job, agreement, funded.json()


def _start(client, job: Job) -> dict:
    response = client.post(f"/api/v1/jobs/{job.id}/start")
    assert response.status_code == 200
    return response.json()


def _submit(client, job: Job, output: str, *, evidence: dict | None = None, notes: str | None = None) -> dict:
    response = client.post(
        f"/api/v1/jobs/{job.id}/submit",
        json={
            "submitted_output": output,
            "evidence": evidence or {},
            **({"notes": notes} if notes is not None else {}),
        },
    )
    assert response.status_code == 201
    return response.json()


def test_start_requires_accepted_agreement_and_funded_escrow(client, db_session) -> None:
    agent = _agent("phase8-no-agreement")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id, criteria=["Required terms: approved"], status="assigned")
    db_session.add(job)
    db_session.commit()

    response = client.post(f"/api/v1/jobs/{job.id}/start")
    assert response.status_code == 409
    assert "accepted agreement" in response.json()["detail"]

    accepted_job, _agreement = _prepare_accepted(
        client,
        db_session,
        criteria=["Required terms: approved"],
        suffix="-not-funded",
    )
    not_funded = client.post(f"/api/v1/jobs/{accepted_job.id}/start")
    assert not_funded.status_code == 409
    assert "funded" in not_funded.json()["detail"]


def test_valid_start_transitions_job_and_records_local_demo_execution(client, db_session) -> None:
    job, agreement, escrow = _funded(
        client,
        db_session,
        criteria=["Required terms: approved"],
        suffix="-start",
    )

    execution = _start(client, job)

    assert execution["job_status"] == "in_progress"
    assert execution["execution_status"] == "awaiting_submission"
    assert execution["executor_type"] == "local_demo"
    assert execution["can_submit"] is True
    assert execution["agreement_id"] == agreement["id"]
    assert execution["escrow_status"] == escrow["status"] == "funded"
    assert execution["started_at"]
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "in_progress"
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert events[-1].event_type == "execution.started"
    assert events[-1].data["executor_type"] == "local_demo"


@pytest.mark.parametrize("terminal_status", ["completed", "cancelled", "disputed"])
def test_terminal_or_disputed_jobs_cannot_restart(client, db_session, terminal_status: str) -> None:
    agent = _agent(f"phase8-invalid-{terminal_status}")
    db_session.add(agent)
    db_session.flush()
    job = _job(agent.id, criteria=["Required terms: approved"], status=terminal_status)
    db_session.add(job)
    db_session.commit()
    response = client.post(f"/api/v1/jobs/{job.id}/start")
    assert response.status_code == 409


def test_submission_persists_output_evidence_notes_and_history(client, db_session) -> None:
    criteria = [
        "Output must be valid JSON",
        "Required fields: summary, status",
        "Minimum length: 20 characters",
        "Required terms: approved, synthetic",
        "Required evidence fields: source",
    ]
    job, _agreement, _escrow = _funded(client, db_session, criteria=criteria, suffix="-submission")
    _start(client, job)
    submission = _submit(
        client,
        job,
        '{"summary":"approved synthetic result","status":"approved"}',
        evidence={"source": "synthetic-fixture", "references": ["fixture-1"]},
        notes="Prepared by the local demo executor.",
    )

    assert submission["job_id"] == job.id
    assert submission["agent_id"] == job.selected_agent_id
    assert submission["version"] == 1
    assert submission["submitted_output"].startswith("{")
    assert submission["evidence"]["source"] == "synthetic-fixture"
    assert submission["notes"] == "Prepared by the local demo executor."
    assert submission["artifact_url"].startswith("local://submission/")
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "submitted"
    history = client.get(f"/api/v1/jobs/{job.id}/submissions")
    assert history.status_code == 200
    assert [item["version"] for item in history.json()] == [1]

    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert events[-1].event_type == "submission.received"
    assert "submitted_output" not in events[-1].data


def test_empty_and_oversized_submissions_are_rejected(client, db_session) -> None:
    job, _agreement, _escrow = _funded(client, db_session, criteria=["Required terms: approved"], suffix="-limits")
    _start(client, job)
    empty = client.post(f"/api/v1/jobs/{job.id}/submit", json={"submitted_output": "   "})
    oversized = client.post(f"/api/v1/jobs/{job.id}/submit", json={"submitted_output": "x" * 100001})
    assert empty.status_code == 422
    assert oversized.status_code == 422
    assert db_session.query(Submission).count() == 0


def test_passing_verification_is_persisted_but_does_not_release_funds(client, db_session) -> None:
    criteria = ["Output must be valid JSON", "Required fields: summary, status"]
    job, _agreement, escrow = _funded(client, db_session, criteria=criteria, suffix="-pass")
    _start(client, job)
    _submit(client, job, '{"summary":"approved","status":"complete"}')

    verified = client.post(f"/api/v1/jobs/{job.id}/verify")

    assert verified.status_code == 200
    result = verified.json()
    assert result["overall_result"] == "passed"
    assert result["status"] == "passed"
    assert all(check["status"] == "passed" for check in result["individual_checks"])
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "completed"
    assert client.get(f"/api/v1/jobs/{job.id}/escrow").json()["status"] == "funded"
    assert len(client.get(f"/api/v1/escrows/{escrow['id']}/ledger").json()) == 1

    repeated = client.post(f"/api/v1/jobs/{job.id}/verify", json={"overall_result": "passed"})
    assert repeated.status_code == 200
    assert repeated.json()["id"] == result["id"]
    assert repeated.json()["overall_result"] == "passed"

    released = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert released.status_code == 200
    assert released.json()["status"] == "released"
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert [event.event_type for event in events[-3:]] == [
        "verification.passed",
        "job.settlement_ready",
        "escrow.settled",
    ]


def test_failed_verification_explains_checks_and_allows_a_retry_without_release(client, db_session) -> None:
    job, _agreement, escrow = _funded(
        client,
        db_session,
        criteria=["Required terms: approved"],
        suffix="-failed",
    )
    _start(client, job)
    first = _submit(client, job, "pending result")
    failed = client.post(f"/api/v1/jobs/{job.id}/verify")

    assert failed.status_code == 200
    body = failed.json()
    assert body["overall_result"] == "failed"
    assert body["status"] == "failed"
    assert body["reasons"]
    assert any(check["status"] == "failed" for check in body["individual_checks"])
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "under_review"
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409

    retry = _submit(client, job, "approved synthetic result", notes="Retry after the failed term check.")
    assert retry["version"] == first["version"] + 1
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "submitted"
    retry_execution = client.get(f"/api/v1/jobs/{job.id}/execution")
    assert retry_execution.status_code == 200
    assert retry_execution.json()["can_verify"] is True
    passed_retry = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert passed_retry.status_code == 200
    assert passed_retry.json()["overall_result"] == "passed"
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.job_id == job.id).order_by(AuditEvent.id)).all()
    assert "verification.failed" in [event.event_type for event in events]
    assert "execution.retry_requested" in [event.event_type for event in events]


def test_malformed_json_and_missing_required_fields_fail_deterministically(client, db_session) -> None:
    criteria = ["Output must be valid JSON", "Required fields: summary, status"]
    job, _agreement, _escrow = _funded(client, db_session, criteria=criteria, suffix="-malformed")
    _start(client, job)
    _submit(client, job, '{"summary": "missing status"}')
    failed = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert failed.status_code == 200
    assert failed.json()["overall_result"] == "failed"
    assert any("Required JSON fields" in reason for reason in failed.json()["reasons"])

    retry = _submit(client, job, "this is not json")
    assert retry["version"] == 2
    malformed = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert malformed.status_code == 200
    assert malformed.json()["overall_result"] == "failed"
    assert any("JSON parsing failed" in reason or "cannot be checked" in reason for reason in malformed.json()["reasons"])


def test_manual_review_is_not_a_pass_and_blocks_automatic_retry(client, db_session) -> None:
    job, _agreement, escrow = _funded(
        client,
        db_session,
        criteria=["Manual review: factual accuracy"],
        suffix="-manual",
    )
    _start(client, job)
    _submit(client, job, "A plausible synthetic statement.")
    manual = client.post(f"/api/v1/jobs/{job.id}/verify")

    assert manual.status_code == 200
    assert manual.json()["overall_result"] == "manual_review"
    assert manual.json()["status"] == "failed"
    assert manual.json()["individual_checks"][0]["status"] == "manual_review"
    assert client.get(f"/api/v1/jobs/{job.id}").json()["status"] == "under_review"
    assert client.post(f"/api/v1/escrows/{escrow['id']}/release").status_code == 409
    retry = client.post(f"/api/v1/jobs/{job.id}/submit", json={"submitted_output": "another statement"})
    assert retry.status_code == 409
    assert "failed automated verification" in retry.json()["detail"]


def test_verification_without_submission_and_invalid_state_are_rejected(client, db_session) -> None:
    job, _agreement, _escrow = _funded(client, db_session, criteria=["Required terms: approved"], suffix="-verify-state")
    assert client.post(f"/api/v1/jobs/{job.id}/verify").status_code == 409
    assert client.get(f"/api/v1/jobs/{job.id}/verification").status_code == 204
    _start(client, job)
    assert client.post(f"/api/v1/jobs/{job.id}/verify").status_code == 409


def test_retry_limit_is_enforced_and_submission_history_is_preserved(client, db_session) -> None:
    job, _agreement, _escrow = _funded(
        client,
        db_session,
        criteria=["Required terms: never-present"],
        suffix="-retry-limit",
    )
    _start(client, job)
    for expected_version in (1, 2, 3):
        submission = _submit(client, job, f"failed output {expected_version}")
        assert submission["version"] == expected_version
        result = client.post(f"/api/v1/jobs/{job.id}/verify")
        assert result.status_code == 200
        assert result.json()["overall_result"] == "failed"
    blocked = client.post(f"/api/v1/jobs/{job.id}/submit", json={"submitted_output": "fourth attempt"})
    assert blocked.status_code == 409
    assert "maximum submission retries" in blocked.json()["detail"]
    history = client.get(f"/api/v1/jobs/{job.id}/submissions")
    assert [item["version"] for item in history.json()] == [1, 2, 3]


def test_json_schema_rules_and_settlement_dashboard_are_persisted(client, db_session) -> None:
    criteria = ["Output must be valid JSON"]
    job, _agreement, _escrow = _funded(client, db_session, criteria=criteria, suffix="-schema")
    agreement = db_session.query(Job).filter(Job.id == job.id).one().agreement
    assert agreement is not None
    agreement.terms = {
        **agreement.terms,
        "verification_rules": {
            "json_schema": {
                "type": "object",
                "required": ["summary"],
                "properties": {"summary": {"type": "string"}},
            }
        },
    }
    db_session.commit()
    _start(client, job)
    _submit(client, job, '{"summary":"passed"}')
    passed = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert passed.status_code == 200
    assert passed.json()["overall_result"] == "passed"
    dashboard = client.get("/api/v1/dashboard/execution")
    assert dashboard.status_code == 200
    assert dashboard.json()["jobs_eligible_for_settlement"] == 1
    assert dashboard.json()["recent_submissions"][0]["job_id"] == job.id
    assert dashboard.json()["recent_verifications"][0]["overall_result"] == "passed"


def test_nested_json_schema_constraints_are_not_silently_ignored(client, db_session) -> None:
    job, _agreement, _escrow = _funded(client, db_session, criteria=["Output must be valid JSON"], suffix="-nested-schema")
    agreement = db_session.query(Job).filter(Job.id == job.id).one().agreement
    assert agreement is not None
    agreement.terms = {
        **agreement.terms,
        "verification_rules": {
            "json_schema": {
                "type": "object",
                "properties": {"summary": {"type": "string", "minLength": 10}},
            }
        },
    }
    db_session.commit()
    _start(client, job)
    _submit(client, job, '{"summary":"x"}')
    result = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert result.status_code == 200
    assert result.json()["overall_result"] == "manual_review"
    assert any("unsupported keywords" in reason for reason in result.json()["reasons"])


def test_settlement_rejects_an_underfunded_ledger(client, db_session) -> None:
    job, _agreement, escrow = _funded(client, db_session, criteria=["Required terms: approved"], suffix="-ledger-reconcile")
    ledger = db_session.scalars(select(LedgerEntry).where(LedgerEntry.escrow_id == escrow["id"])).one()
    ledger.amount = Decimal("1.00")
    db_session.commit()
    _start(client, job)
    _submit(client, job, "approved synthetic result")
    passed = client.post(f"/api/v1/jobs/{job.id}/verify")
    assert passed.status_code == 200
    release = client.post(f"/api/v1/escrows/{escrow['id']}/release")
    assert release.status_code == 409
    assert "funding ledger" in release.json()["detail"]
    ledger_rows = client.get(f"/api/v1/escrows/{escrow['id']}/ledger").json()
    assert len(ledger_rows) == 1
    assert ledger_rows[0]["entry_type"] == "funding"
    assert ledger_rows[0]["amount"] == "1.00"
