from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException


def get_owner_id(x_owner_id: Annotated[str | None, Header()] = None) -> UUID:
    """Read the anonymous visitor ID from the X-Owner-Id header.

    There are no accounts: the browser generates a random UUID once, stores it in
    localStorage and sends it with every request. It separates visitors' data,
    but it is NOT real security, so anyone who knows an ID can read that data.
    """
    if not x_owner_id:
        raise HTTPException(status_code=400, detail="Missing X-Owner-Id header")
    try:
        return UUID(x_owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="X-Owner-Id must be a valid UUID")


OwnerId = Annotated[UUID, Depends(get_owner_id)]
