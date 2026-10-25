"""Deterministic, idempotent demo data loader.

Run after applying Alembic migrations with ``python -m app.seed``.  Add
``--with-jobs`` to include two consistent synthetic jobs.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.config import get_settings
from app.models import Agent, Job
from app.services.audit import record_event

DEMO_AGENTS = (
    {
        "external_id": "demo-agent-001",
        "name": "Synthetic Atlas",
        "description": "Synthetic research and planning agent for demos.",
        "skills": ["research", "planning"],
        "task_categories": ["research", "planning"],
        "supported_output_formats": ["json", "markdown"],
        "availability": "available",
        "estimated_completion_minutes": 45,
        "demo_performance_stats": {"completed_jobs": 18, "success_rate": 0.94},
        "capabilities": ["research", "planning"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
    {
        "external_id": "demo-agent-002",
        "name": "Synthetic Beacon",
        "description": "Synthetic data analysis agent for demos.",
        "skills": ["analysis", "data-cleaning"],
        "task_categories": ["analysis", "verification"],
        "supported_output_formats": ["json", "csv"],
        "availability": "available",
        "estimated_completion_minutes": 60,
        "demo_performance_stats": {"completed_jobs": 22, "success_rate": 0.96},
        "capabilities": ["analysis", "data-cleaning"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
    {
        "external_id": "demo-agent-003",
        "name": "Synthetic Cipher",
        "description": "Synthetic software delivery agent for demos.",
        "skills": ["python", "testing"],
        "task_categories": ["software", "automation"],
        "supported_output_formats": ["json", "markdown"],
        "availability": "busy",
        "estimated_completion_minutes": 90,
        "demo_performance_stats": {"completed_jobs": 31, "success_rate": 0.98},
        "capabilities": ["python", "testing"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
    {
        "external_id": "demo-agent-004",
        "name": "Synthetic Delta",
        "description": "Synthetic document review agent for demos.",
        "skills": ["review", "summarization"],
        "task_categories": ["review", "documentation"],
        "supported_output_formats": ["markdown", "json"],
        "availability": "available",
        "estimated_completion_minutes": 30,
        "demo_performance_stats": {"completed_jobs": 14, "success_rate": 0.91},
        "capabilities": ["review", "summarization"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
    {
        "external_id": "demo-agent-005",
        "name": "Synthetic Echo",
        "description": "Synthetic verification agent for demos.",
        "skills": ["verification", "quality-control"],
        "task_categories": ["verification", "testing"],
        "supported_output_formats": ["json"],
        "availability": "available",
        "estimated_completion_minutes": 40,
        "demo_performance_stats": {"completed_jobs": 27, "success_rate": 0.97},
        "capabilities": ["verification", "quality-control"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
    {
        "external_id": "demo-agent-006",
        "name": "Synthetic Forge",
        "description": "Synthetic automation agent for demos.",
        "skills": ["automation", "integration"],
        "task_categories": ["automation", "integration"],
        "supported_output_formats": ["json", "text"],
        "availability": "unavailable",
        "estimated_completion_minutes": 75,
        "demo_performance_stats": {"completed_jobs": 11, "success_rate": 0.89},
        "capabilities": ["automation", "integration"],
        "metadata_json": {"synthetic": True, "cohort": "phase-2"},
    },
)

DEMO_JOBS = (
    {
        "public_id": "demo-job-001",
        "requester": "demo-agent-001",
        "executor": "demo-agent-003",
        "title": "Synthetic API contract review",
        "description": "Review a synthetic API contract and return structured findings.",
        "budget": Decimal("125.00"),
        "currency": "USD",
        "deadline": datetime(2030, 6, 1, 12, 0, tzinfo=timezone.utc),
        "requirements": {"format": "json", "priority": "normal", "synthetic": True},
        "required_skills": ["python", "testing"],
        "task_category": "software",
        "expected_output": "A structured API contract review in JSON.",
        "acceptance_criteria": ["Findings are categorized", "Output is valid JSON"],
        "additional_instructions": "Use only synthetic examples.",
    },
    {
        "public_id": "demo-job-002",
        "requester": "demo-agent-002",
        "executor": "demo-agent-005",
        "title": "Synthetic data quality verification",
        "description": "Verify a synthetic data sample and summarize quality issues.",
        "budget": Decimal("240.00"),
        "currency": "USD",
        "deadline": datetime(2030, 7, 15, 12, 0, tzinfo=timezone.utc),
        "requirements": {"format": "markdown", "priority": "high", "synthetic": True},
        "required_skills": ["verification", "quality-control"],
        "task_category": "verification",
        "expected_output": "A concise quality report in Markdown.",
        "acceptance_criteria": ["Check results are enumerated", "Recommendations are actionable"],
        "additional_instructions": "Flag uncertain findings explicitly.",
    },
)


def ensure_demo_agents_if_empty(db: Session) -> int:
    """Ensure a public sandbox has synthetic agents without touching other data.

    Public session bootstrap calls this only when no synthetic agent exists. The
    deterministic external IDs and dialect-native conflict handling make the
    operation safe when two visitors arrive at an empty database together.
    Existing rows are never updated or reclassified by this path.
    """

    synthetic_filter = Agent.metadata_json["synthetic"].as_boolean() == True  # noqa: E712
    if db.scalar(select(Agent.id).where(synthetic_filter).limit(1)) is not None:
        return 0

    external_ids = [values["external_id"] for values in DEMO_AGENTS]
    existing_rows = list(
        db.scalars(select(Agent).where(Agent.external_id.in_(external_ids))).all()
    )
    non_synthetic_collision = next(
        (agent.external_id for agent in existing_rows if not bool((agent.metadata_json or {}).get("synthetic"))),
        None,
    )
    if non_synthetic_collision is not None:
        raise RuntimeError(
            f"refusing to reserve synthetic demo key already used by a non-synthetic agent: {non_synthetic_collision}"
        )
    existing_ids = {agent.external_id for agent in existing_rows}
    missing = [values for values in DEMO_AGENTS if values["external_id"] not in existing_ids]
    if not missing:
        return 0

    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    elif dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        db.add_all(Agent(**values) for values in missing)
        db.flush()
        return len(missing)

    statement = insert(Agent).values(missing).on_conflict_do_nothing(index_elements=[Agent.external_id])
    db.execute(statement)
    db.flush()
    return len(missing)


def seed_demo_data(*, with_jobs: bool = False, allow_production: bool = False) -> dict[str, int]:
    """Insert demo rows if their deterministic keys are not present."""

    settings = get_settings()
    environment = settings.app_env.lower()
    production_seed_allowed = environment == "production" and getattr(settings, "demo_seed_enabled", False) and allow_production
    if environment not in {"development", "test"} and not production_seed_allowed:
        raise RuntimeError(
            "demo seed data is disabled outside development and test environments; "
            "production requires DEMO_SEED_ENABLED=true and --allow-production-demo"
        )

    db = SessionLocal()
    created_agents = 0
    created_jobs = 0
    try:
        agents_by_key: dict[str, Agent] = {}
        for values in DEMO_AGENTS:
            agent = db.scalar(select(Agent).where(Agent.external_id == values["external_id"]))
            if agent is None:
                agent = Agent(**values)
                db.add(agent)
                created_agents += 1
                db.flush()
            else:
                if not bool((agent.metadata_json or {}).get("synthetic")):
                    raise RuntimeError(
                        f"refusing to overwrite non-synthetic agent with external_id={values['external_id']!r}"
                    )
                # Existing deterministic rows are upgraded with the explicit
                # contract fields without creating duplicates.
                for field in (
                    "skills",
                    "task_categories",
                    "supported_output_formats",
                    "availability",
                    "estimated_completion_minutes",
                    "demo_performance_stats",
                    "capabilities",
                ):
                    setattr(agent, field, values[field])
            agents_by_key[values["external_id"]] = agent

        if with_jobs:
            for values in DEMO_JOBS:
                job = db.scalar(select(Job).where(Job.public_id == values["public_id"]))
                if job is not None:
                    job.required_skills = values["required_skills"]
                    job.task_category = values["task_category"]
                    job.expected_output = values["expected_output"]
                    job.acceptance_criteria = values["acceptance_criteria"]
                    job.additional_instructions = values["additional_instructions"]
                    job.selected_agent_id = agents_by_key[values["executor"]].id
                    continue
                job = Job(
                    public_id=values["public_id"],
                    requester_agent_id=agents_by_key[values["requester"]].id,
                    executor_agent_id=agents_by_key[values["executor"]].id,
                    title=values["title"],
                    description=values["description"],
                    budget=values["budget"],
                    currency=values["currency"],
                    deadline=values["deadline"],
                    required_skills=values["required_skills"],
                    task_category=values["task_category"],
                    expected_output=values["expected_output"],
                    acceptance_criteria=values["acceptance_criteria"],
                    additional_instructions=values["additional_instructions"],
                    requirements=values["requirements"],
                    selected_agent_id=agents_by_key[values["executor"]].id,
                )
                db.add(job)
                db.flush()
                record_event(
                    db,
                    "job.seeded",
                    job_id=job.id,
                    actor_agent_id=job.requester_agent_id,
                    data={"public_id": job.public_id, "synthetic": True},
                )
                created_jobs += 1
        db.commit()
        return {"agents_created": created_agents, "jobs_created": created_jobs}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed deterministic synthetic Auto Escrow data")
    parser.add_argument("--with-jobs", action="store_true", help="also create two synthetic jobs")
    parser.add_argument(
        "--allow-production-demo",
        action="store_true",
        help="allow this explicit synthetic-agent seed when DEMO_SEED_ENABLED=true in production",
    )
    args = parser.parse_args()
    print(
        json.dumps(
            seed_demo_data(with_jobs=args.with_jobs, allow_production=args.allow_production_demo),
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
