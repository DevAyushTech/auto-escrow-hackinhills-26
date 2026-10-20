"""Agent persistence queries."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
