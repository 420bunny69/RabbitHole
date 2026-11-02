"""Provision a one-time workspace claim token for local development.

Run from the backend directory after applying migrations to the intended local
database: python provision_workspace_claim.py <workspace-uuid>
"""
import argparse
import hashlib
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models import UserWorkspace, Workspace

TOKEN_LIFETIME = timedelta(minutes=15)


class ProvisioningError(Exception):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def resolve_confirmed_database_path(confirm_db: str) -> Path:
    if engine.dialect.name != "sqlite":
        raise ProvisioningError("Workspace claim provisioning is restricted to SQLite databases.")

    database = engine.url.database
    if not database or database == ":memory:" or database.startswith("file:"):
        raise ProvisioningError("A local SQLite database file is required.")

    try:
        configured_path = Path(database).resolve(strict=True)
    except (OSError, RuntimeError):
        raise ProvisioningError("The configured SQLite database file must already exist.") from None
    if not configured_path.is_file():
        raise ProvisioningError("The configured SQLite database path is not a file.")

    confirmation = Path(confirm_db)
    if not confirmation.is_absolute():
        raise ProvisioningError("--confirm-db must be an absolute path.")
    try:
        confirmed_path = confirmation.resolve(strict=True)
    except (OSError, RuntimeError):
        raise ProvisioningError("The confirmed database file must already exist.") from None
    if confirmed_path != configured_path:
        raise ProvisioningError("--confirm-db does not match the configured SQLite database path.")

    return configured_path


def provision_workspace_claim(db: Session, workspace_id: UUID) -> None:
    now = _utcnow()
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    unclaimed = ~select(UserWorkspace.user_id).where(
        UserWorkspace.workspace_id == Workspace.id
    ).exists()
    token_absent_or_expired = or_(
        Workspace.claim_token_hash.is_(None),
        Workspace.claim_expires_at <= now,
    )

    with db.begin():
        result = db.execute(
            update(Workspace)
            .where(
                Workspace.id == workspace_id,
                unclaimed,
                token_absent_or_expired,
            )
            .values(
                claim_token_hash=token_hash,
                claim_expires_at=now + TOKEN_LIFETIME,
            )
        )

        if result.rowcount != 1:
            db.expire_all()
            workspace = db.get(Workspace, workspace_id)
            if workspace is None:
                raise ProvisioningError("Workspace not found.")
            if db.scalar(
                select(UserWorkspace.user_id)
                .where(UserWorkspace.workspace_id == workspace_id)
                .limit(1)
            ) is not None:
                raise ProvisioningError("Workspace is already claimed.")
            if workspace.claim_token_hash is not None:
                expiry = workspace.claim_expires_at
                if expiry is None or _as_utc(expiry) > now:
                    raise ProvisioningError("An unexpired claim token already exists.")
            raise ProvisioningError("Workspace claim state changed; retry provisioning.")

    print(token)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Provision a local workspace claim token.")
    parser.add_argument("workspace_id", type=UUID, help="UUID of the existing workspace")
    parser.add_argument(
        "--confirm-db",
        required=True,
        help="Expected absolute path of the configured SQLite database file",
    )
    args = parser.parse_args(argv)

    try:
        database_path = resolve_confirmed_database_path(args.confirm_db)
    except ProvisioningError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(f"Database: {database_path}")
    try:
        with SessionLocal() as db:
            provision_workspace_claim(db, args.workspace_id)
    except ProvisioningError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())