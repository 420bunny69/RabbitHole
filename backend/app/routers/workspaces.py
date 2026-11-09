import hashlib
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentWorkspaceId, SupabaseUserId
from app.models import UserWorkspace, Workspace
from app.schemas import WorkspaceClaimRequest, WorkspaceClaimResponse

DB = Annotated[Session, Depends(get_db)]
TARGET_WORKSPACE_ID = UUID("46049394-cbe3-45b9-8745-fa24c5d196a2")
CLAIM_FAILURE_DETAIL = "Claim is invalid or unavailable."


class _ClaimRoute(APIRoute):
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def generic_validation_handler(request: Request):
            try:
                return await original_handler(request)
            except RequestValidationError:
                return JSONResponse(
                    status_code=409,
                    content={"detail": CLAIM_FAILURE_DETAIL},
                )

        return generic_validation_handler


router = APIRouter(prefix="/workspaces", tags=["workspaces"], route_class=_ClaimRoute)


class _ClaimUnavailable(Exception):
    pass


@router.get("/me")
def get_my_workspace(workspace_id: CurrentWorkspaceId) -> dict[str, str]:
    return {"workspace_id": str(workspace_id)}


@router.post("/claim", response_model=WorkspaceClaimResponse)
def claim_workspace(
    payload: WorkspaceClaimRequest,
    user_id: SupabaseUserId,
    db: DB,
) -> WorkspaceClaimResponse:
    token_hash = hashlib.sha256(payload.claim_token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    workspace_already_claimed = select(UserWorkspace.user_id).where(
        UserWorkspace.workspace_id == TARGET_WORKSPACE_ID
    ).exists()
    user_already_mapped = select(UserWorkspace.workspace_id).where(
        UserWorkspace.user_id == user_id
    ).exists()

    try:
        with db.begin():
            result = db.execute(
                update(Workspace)
                .where(
                    Workspace.id == TARGET_WORKSPACE_ID,
                    Workspace.claim_token_hash == token_hash,
                    Workspace.claim_expires_at > now,
                    ~workspace_already_claimed,
                    ~user_already_mapped,
                )
                .values(claim_token_hash=None, claim_expires_at=None)
            )
            if result.rowcount != 1:
                raise _ClaimUnavailable

            db.add(UserWorkspace(user_id=user_id, workspace_id=TARGET_WORKSPACE_ID))
    except (_ClaimUnavailable, IntegrityError):
        raise HTTPException(status_code=409, detail=CLAIM_FAILURE_DETAIL) from None
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Unable to complete workspace claim.") from None

    return WorkspaceClaimResponse(status="claimed", workspace_id=TARGET_WORKSPACE_ID)