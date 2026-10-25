"""Agent persistence queries."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.demo_sessions import synthetic_only
from app.models import Agent


def list_agents(
    db: Session,
    *,
    status: str | None = None,
    availability: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Agent], int]:
    query = select(Agent)
    count_query = select(func.count()).select_from(Agent)
    if synthetic_only(db):
        synthetic_filter = Agent.metadata_json["synthetic"].as_boolean() == True  # noqa: E712
        query = query.where(synthetic_filter)
        count_query = count_query.where(synthetic_filter)
    if status:
        query = query.where(Agent.status == status)
        count_query = count_query.where(Agent.status == status)
    if availability:
        query = query.where(Agent.availability == availability)
        count_query = count_query.where(Agent.availability == availability)
    total = db.scalar(count_query) or 0
    agents = list(db.scalars(query.order_by(Agent.id).offset(skip).limit(limit)).all())
    return agents, total


def get_agent(db: Session, agent_id: int) -> Agent | None:
    return db.get(Agent, agent_id)


def agent_is_visible(db: Session, agent_id: int) -> bool:
    """Return whether an agent may be referenced by this request scope."""

    query = select(Agent.id).where(Agent.id == agent_id)
    if synthetic_only(db):
        query = query.where(Agent.metadata_json["synthetic"].as_boolean() == True)  # noqa: E712
    return db.scalar(query) is not None
