"""Agent API endpoints."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AgentListResponse, AgentSummary
from app.services.agents import get_agent, list_agents

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse, summary="List registered agents")
def list_registered_agents(
    status: Literal["active", "inactive", "suspended"] | None = Query(default=None),
    availability: Literal["available", "busy", "unavailable"] | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
) -> AgentListResponse:
    agents, total = list_agents(
        db, status=status, availability=availability, skip=skip, limit=limit
    )
    return AgentListResponse(items=agents, total=total)


@router.get("/{agent_id}", response_model=AgentSummary, summary="Get an agent")
def get_registered_agent(agent_id: int, db: Session = Depends(get_db)) -> AgentSummary:
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return agent
