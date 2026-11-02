"""Curiosity Trails router: interactive exploration trails across saved knowledge."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentWorkspaceId
from app.schemas import Trail
from app.services.trail_builder import build_curiosity_trail

router = APIRouter(prefix="/trails", tags=["trails"])

DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Trail)
def get_trail(workspace_id: CurrentWorkspaceId, db: DB) -> Trail:
    """Generate a curiosity trail through the visitor's saved knowledge graph."""
    return build_curiosity_trail(db, workspace_id)
