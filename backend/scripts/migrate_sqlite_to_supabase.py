#!/usr/bin/env python
"""One-time, guarded transfer of RabbitHole data from SQLite to Supabase PostgreSQL."""

from __future__ import annotations

import argparse
import ipaddress
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import DateTime, Uuid, bindparam, create_engine, inspect, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import SQLAlchemyError

BACKEND_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = BACKEND_DIR / "rabbithole.db"
EXPECTED_REVISION = "d4e5f6a7b8c9"
TABLE_ORDER = (
    "workspaces",
    "user_workspaces",
    "items",
    "concepts",
    "item_concepts",
    "suggestions",
)

sys.path.insert(0, str(BACKEND_DIR))
from app.database import Base  # noqa: E402
from app import models as _models  # noqa: E402,F401


class MigrationCheckError(Exception):
    """A safety precondition for the one-time transfer was not met."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="perform the migration; without this flag, run preflight checks only",
    )
    return parser.parse_args()


def expected_supabase_project_ref() -> str:
    raw_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not raw_url:
        raise MigrationCheckError(
            "Set SUPABASE_URL (or VITE_SUPABASE_URL) to the intended Supabase project URL."
        )
    parsed = urlparse(raw_url)
    match = re.fullmatch(r"([a-z0-9]+)\.supabase\.co", parsed.hostname or "", re.IGNORECASE)
    if parsed.scheme != "https" or not match:
        raise MigrationCheckError("The expected Supabase project URL is invalid.")
    return match.group(1).lower()


def validate_destination_url(raw_url: str, expected_ref: str) -> URL:
    try:
        url = make_url(raw_url)
    except Exception:
        raise MigrationCheckError("DATABASE_URL could not be parsed.") from None

    if url.drivername != "postgresql+psycopg":
        raise MigrationCheckError("DATABASE_URL must use the postgresql+psycopg driver.")
    if url.database != "postgres":
        raise MigrationCheckError("DATABASE_URL must target the Supabase 'postgres' database.")
    if str(url.query.get("sslmode", "")).lower() != "require":
        raise MigrationCheckError("DATABASE_URL must require TLS with sslmode=require.")

    host = (url.host or "").lower()
    direct_match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", host)
    if direct_match:
        if url.port != 5432:
            raise MigrationCheckError("The direct Supabase PostgreSQL endpoint must use port 5432.")
        project_ref = direct_match.group(1)
    elif host.endswith(".pooler.supabase.com"):
        if url.port not in {5432, 6543}:
            raise MigrationCheckError("The Supabase pooler endpoint must use port 5432 or 6543.")
        user_match = re.fullmatch(r"postgres\.([a-z0-9]+)", url.username or "")
        if not user_match:
            raise MigrationCheckError("The Supabase pooler username does not identify a project.")
        project_ref = user_match.group(1)
    else:
        raise MigrationCheckError("DATABASE_URL is not a recognized Supabase PostgreSQL endpoint.")

    if project_ref.lower() != expected_ref:
        raise MigrationCheckError("DATABASE_URL does not match the expected Supabase project.")
    return url


def uuid_value(value: object, label: str) -> UUID:
    try:
        if isinstance(value, bytes):
            return UUID(bytes=value) if len(value) == 16 else UUID(hex=value.decode("ascii"))
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError, UnicodeDecodeError):
        raise MigrationCheckError(f"Invalid source UUID in {label}.") from None


def timestamp_value(value: object, label: str) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise MigrationCheckError(f"Invalid source timestamp in {label}.") from None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def metadata_tables():
    missing = set(TABLE_ORDER) - set(Base.metadata.tables)
    if missing:
        raise MigrationCheckError("Application SQLAlchemy metadata is missing required tables.")
    return {name: Base.metadata.tables[name] for name in TABLE_ORDER}


def read_source(tables):
    if not SOURCE_PATH.is_file():
        raise MigrationCheckError("The expected SQLite source database does not exist.")
    try:
        connection = sqlite3.connect(SOURCE_PATH.as_uri() + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchall()
            if len(integrity) != 1 or integrity[0][0] != "ok":
                raise MigrationCheckError("The SQLite source failed PRAGMA integrity_check.")
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise MigrationCheckError("The SQLite source contains foreign-key violations.")

            source_rows = {}
            for name in TABLE_ORDER:
                expected_columns = [column.name for column in tables[name].columns]
                actual_columns = [
                    row[1] for row in connection.execute(f'PRAGMA table_info("{name}")')
                ]
                if not actual_columns or set(actual_columns) != set(expected_columns):
                    raise MigrationCheckError(
                        f"SQLite source columns do not match application metadata for {name}."
                    )
                rows = connection.execute(f'SELECT * FROM "{name}"').fetchall()
                converted = []
                for row in rows:
                    item = {}
                    for column in tables[name].columns:
                        value = row[column.name]
                        if value is not None and isinstance(column.type, Uuid):
                            value = uuid_value(value, f"{name}.{column.name}")
                        elif value is not None and isinstance(column.type, DateTime):
                            value = timestamp_value(value, f"{name}.{column.name}")
                        item[column.name] = value
                    converted.append(item)
                source_rows[name] = converted
            return source_rows
        finally:
            connection.close()
    except sqlite3.Error:
        raise MigrationCheckError("Could not read the SQLite source in read-only mode.") from None


def verify_supabase_identity(connection) -> None:
    address = connection.execute(text("SELECT inet_server_addr()::text")).scalar_one_or_none()
    if address is None or ipaddress.ip_interface(address).ip.is_loopback:
        raise MigrationCheckError("Connected PostgreSQL server address is not a Supabase remote address.")
    if connection.execute(text("SELECT current_database()")).scalar_one() != "postgres":
        raise MigrationCheckError("Connected database is not the expected Supabase 'postgres' database.")
    driver_connection = connection.connection.driver_connection
    ssl_in_use = getattr(getattr(driver_connection, "pgconn", None), "ssl_in_use", False)
    if ssl_in_use is not True:
        raise MigrationCheckError("The client-side PostgreSQL connection is not using TLS.")

    revision_rows = connection.execute(
        text("SELECT version_num FROM public.alembic_version")
    ).scalars().all()
    if revision_rows != [EXPECTED_REVISION]:
        raise MigrationCheckError("Supabase Alembic revision is not the required revision.")


def verify_project_reference(connection, expected_ref: str, url: URL) -> None:
    host = (url.host or "").lower()
    if host.endswith(".supabase.co"):
        actual_ref = host.split(".")[1] if host.startswith("db.") else None
    else:
        username = url.username or ""
        match = re.fullmatch(r"postgres\.([a-z0-9]+)", username)
        actual_ref = match.group(1) if match else None
    if actual_ref != expected_ref:
        raise MigrationCheckError("Could not verify the destination project reference.")
    verify_supabase_identity(connection)


def verify_destination_schema_and_empty(connection, tables, source_rows):
    inspector = inspect(connection)
    destination_names = set(inspector.get_table_names(schema="public"))
    for name in TABLE_ORDER:
        if name not in destination_names:
            raise MigrationCheckError(f"Destination table {name} is missing from public schema.")
        source_columns = [column.name for column in tables[name].columns]
        destination_columns = [
            column["name"] for column in inspector.get_columns(name, schema="public")
        ]
        if set(destination_columns) != set(source_columns):
            raise MigrationCheckError(
                f"Destination columns do not match application metadata for {name}."
            )
        count = connection.execute(text(f'SELECT COUNT(*) FROM public."{name}"')).scalar_one()
        if count != 0:
            raise MigrationCheckError(f"Destination table {name} is not empty.")
        if source_rows[name] and name in {"concepts", "suggestions"}:
            sequence = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                {"table_name": f"public.{name}"},
            ).scalar_one_or_none()
            if not sequence:
                raise MigrationCheckError(f"Destination sequence for {name}.id is missing.")


def verify_auth_users(connection, source_rows) -> None:
    user_ids = [row["user_id"] for row in source_rows["user_workspaces"]]
    if not user_ids:
        raise MigrationCheckError("SQLite source contains no user-workspace mapping to validate.")
    query = text("SELECT id FROM auth.users WHERE id IN :user_ids").bindparams(
        bindparam("user_ids", expanding=True)
    )
    found = set(connection.execute(query, {"user_ids": user_ids}).scalars().all())
    if found != set(user_ids):
        raise MigrationCheckError("A source workspace user is missing from Supabase auth.users.")


def destination_counts(connection) -> dict[str, int]:
    return {
        name: connection.execute(text(f'SELECT COUNT(*) FROM public."{name}"')).scalar_one()
        for name in TABLE_ORDER
    }


def synchronize_sequences(connection, tables, source_rows) -> None:
    for name in ("concepts", "suggestions"):
        ids = [row["id"] for row in source_rows[name]]
        if not ids:
            continue
        sequence = connection.execute(
            text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
            {"table_name": f"public.{name}"},
        ).scalar_one()
        connection.execute(
            text("SELECT setval(CAST(:sequence_name AS regclass), :max_id, true)"),
            {"sequence_name": sequence, "max_id": max(ids)},
        )


def print_summary(source_counts, dest_counts, checks, mode):
    print(f"Mode: {mode}")
    print(f"SQLite source: {SOURCE_PATH}")
    print("Source counts:")
    for name in TABLE_ORDER:
        print(f"  {name}: {source_counts[name]}")
    print("Destination counts:")
    for name in TABLE_ORDER:
        count = "not queried" if dest_counts is None else str(dest_counts[name])
        print(f"  {name}: {count}")
    print("Verification:")
    for name, passed in checks.items():
        print(f"  {name}: {'PASS' if passed else 'FAIL'}")


def run(execute: bool) -> int:
    raw_database_url = os.environ.get("DATABASE_URL")
    if not raw_database_url:
        raise MigrationCheckError("DATABASE_URL is required in the process environment.")
    project_ref = expected_supabase_project_ref()
    destination_url = validate_destination_url(raw_database_url, project_ref)
    tables = metadata_tables()
    source_rows = read_source(tables)
    source_counts = {name: len(source_rows[name]) for name in TABLE_ORDER}
    checks = {
        "SQLite integrity and foreign keys": True,
        "UUID and timestamp conversion": True,
    }

    destination_engine = create_engine(destination_url, pool_pre_ping=True, connect_args={"connect_timeout": 10})
    try:
        with destination_engine.connect() as connection:
            with connection.begin():
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                verify_project_reference(connection, project_ref, destination_url)
                checks["Supabase project and database"] = True
                checks["Alembic revision"] = True
                verify_destination_schema_and_empty(connection, tables, source_rows)
                checks["Destination schema and empty tables"] = True
                verify_auth_users(connection, source_rows)
                checks["Workspace user exists in auth.users"] = True
                current_counts = destination_counts(connection)

            if execute:
                with destination_engine.begin() as transaction:
                    transaction.exec_driver_sql(
                        "LOCK TABLE public.workspaces, public.user_workspaces, public.items, "
                        "public.concepts, public.item_concepts, public.suggestions "
                        "IN SHARE ROW EXCLUSIVE MODE"
                    )
                    verify_project_reference(transaction, project_ref, destination_url)
                    verify_destination_schema_and_empty(transaction, tables, source_rows)
                    verify_auth_users(transaction, source_rows)
                    for name in TABLE_ORDER:
                        rows = source_rows[name]
                        if rows:
                            transaction.execute(tables[name].insert(), rows)
                    copied_counts = destination_counts(transaction)
                    if copied_counts != source_counts:
                        raise MigrationCheckError("Destination row counts differ from source counts.")
                    synchronize_sequences(transaction, tables, source_rows)

                with destination_engine.connect() as verification:
                    verification.exec_driver_sql("SET TRANSACTION READ ONLY")
                    final_counts = destination_counts(verification)
                checks["Post-migration row counts"] = final_counts == source_counts
                if not checks["Post-migration row counts"]:
                    raise MigrationCheckError("Post-migration row counts differ from source counts.")
                print_summary(source_counts, final_counts, checks, "EXECUTE")
            else:
                checks["Destination tables empty"] = all(
                    count == 0 for count in current_counts.values()
                )
                print_summary(source_counts, current_counts, checks, "DRY RUN")
                print("No destination data was written. Re-run with --execute to perform the transfer.")
        return 0
    finally:
        destination_engine.dispose()


def main() -> int:
    args = parse_args()
    try:
        return run(args.execute)
    except MigrationCheckError as error:
        print(f"ABORTED: {error}", file=sys.stderr)
        return 1
    except SQLAlchemyError as error:
        print(f"ABORTED: PostgreSQL operation failed ({type(error).__name__}).", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"ABORTED: unexpected failure ({type(error).__name__}).", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
