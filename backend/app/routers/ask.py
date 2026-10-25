"""Ask RabbitHole router: grounded Q&A with citations over the user's saved library."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import OwnerId
from app.schemas import AskRequest, AskResponse
from app.services.qa import answer_question

router = APIRouter(prefix="/ask", tags=["ask"])

DB = Annotated[Session, Depends(get_db)]


@router.post("", response_model=AskResponse)
def ask_rabbithole(payload: AskRequest, owner_id: OwnerId, db: DB) -> AskResponse:
    """Answer a question grounded in the visitor's saved resources with citations."""
    return answer_question(db, owner_id, payload.question)
