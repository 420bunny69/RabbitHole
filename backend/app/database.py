from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_settings = get_settings()

# SQLite needs this flag because FastAPI may use a connection from a different thread.
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """SQLite ignores foreign keys unless asked on every connection. Postgres always enforces them."""

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


engine = create_engine(_settings.database_url, connect_args=_connect_args, pool_pre_ping=True)
if engine.dialect.name == "sqlite":
    enable_sqlite_foreign_keys(engine)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Parent class for all database models (see app/models.py)."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request, always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
