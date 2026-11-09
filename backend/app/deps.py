from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import UserWorkspace, Workspace

_bearer_scheme = HTTPBearer(auto_error=False)
_SUPPORTED_SUPABASE_ALGORITHMS = frozenset({"ES256", "HS256", "RS256"})


@lru_cache(maxsize=8)
def _get_jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(
        f"{issuer.rstrip('/')}/.well-known/jwks.json",
        cache_jwk_set=True,
        lifespan=300,
        cooldown_duration=0,
        timeout=5,
    )


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


def get_supabase_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    issuer = settings.supabase_jwt_issuer.rstrip("/")
    audience = settings.supabase_jwt_audience
    algorithm = settings.supabase_jwt_algorithm.upper()
    if not issuer or not audience or not algorithm:
        raise HTTPException(status_code=503, detail="Supabase JWT verification is not configured")
    if algorithm not in _SUPPORTED_SUPABASE_ALGORITHMS:
        raise HTTPException(status_code=503, detail="Configured Supabase JWT algorithm is unsupported")
    if algorithm == "HS256":
        secret = settings.supabase_jwt_secret
        if not secret:
            raise HTTPException(status_code=503, detail="Supabase JWT signing secret is not configured")
        if len(secret.encode("utf-8")) < 32:
            raise HTTPException(
                status_code=503,
                detail="Supabase JWT signing secret must be at least 32 bytes",
            )

    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != algorithm:
            raise jwt.InvalidAlgorithmError("Token algorithm does not match trusted configuration")

        if algorithm == "HS256":
            signing_key = secret
        else:
            signing_key = _get_jwks_client(issuer).get_signing_key_from_jwt(token).key

        claims = jwt.decode(
            token,
            signing_key,
            algorithms=[algorithm],
            audience=audience,
            issuer=issuer,
            options={
                "require": ["exp", "iat", "sub", "iss", "aud"],
                "verify_exp": True,
                "verify_iat": True,
                "verify_nbf": True,
            },
        )
    except PyJWKClientConnectionError:
        raise HTTPException(status_code=503, detail="Supabase signing keys are unavailable") from None
    except (PyJWKClientError, jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    subject = claims.get("sub")
    if not isinstance(subject, str):
        raise HTTPException(
            status_code=401,
            detail="Invalid bearer token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return UUID(subject)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid bearer token subject",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


SupabaseUserId = Annotated[UUID, Depends(get_supabase_user_id)]


def get_current_workspace_id(
    user_id: SupabaseUserId,
    db: Annotated[Session, Depends(get_db)],
) -> UUID:
    user_workspace = db.get(UserWorkspace, user_id)
    if user_workspace is not None:
        return user_workspace.workspace_id

    db.rollback()
    try:
        dialect_name = db.get_bind().dialect.name
        if dialect_name == "postgresql":
            mapping_insert = postgresql_insert(UserWorkspace)
        elif dialect_name == "sqlite":
            mapping_insert = sqlite_insert(UserWorkspace)
        else:
            raise HTTPException(status_code=503, detail="Workspace provisioning is unavailable.")

        with db.begin():
            workspace = Workspace()
            db.add(workspace)
            db.flush()

            result = db.execute(
                mapping_insert
                .values(user_id=user_id, workspace_id=workspace.id)
                .on_conflict_do_nothing(index_elements=[UserWorkspace.user_id])
            )

            if result.rowcount == 0:
                db.delete(workspace)
                db.flush()
            else:
                return workspace.id

        user_workspace = db.get(UserWorkspace, user_id)
        if user_workspace is not None:
            return user_workspace.workspace_id
        raise HTTPException(status_code=500, detail="Unable to create a workspace.")
    except IntegrityError:
        db.rollback()
        user_workspace = db.get(UserWorkspace, user_id)
        if user_workspace is not None:
            return user_workspace.workspace_id
        raise HTTPException(status_code=500, detail="Unable to create a workspace.") from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to create a workspace.") from None


CurrentWorkspaceId = Annotated[UUID, Depends(get_current_workspace_id)]
