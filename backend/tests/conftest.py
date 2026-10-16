import socket

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.database import Base, enable_sqlite_foreign_keys, get_db
from app.main import app
from app.services import pipeline
from app.services.analyzer import Analysis
from app.utils import url_safety


@pytest.fixture()
def client(monkeypatch):
    """Test client wired to a throwaway in-memory SQLite database.

    The background pipeline opens its own session, so it is pointed at the same database.
    """
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(pipeline, "SessionLocal", TestingSession)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def db_session():
    """A database session on a fresh in-memory SQLite database with all tables created."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture(autouse=True)
def fake_analysis(monkeypatch):
    """The real AI is never called in tests; the pipeline gets a fixed, predictable analysis.

    Every item gets one concept based on its text plus the shared concept "shared idea",
    so tests can check that items of the same owner reuse a concept.
    """

    def fake_analyze(title, text):
        main = "gradient descent" if "gradient" in text.lower() else "entropy"
        return Analysis(
            summary="A short test summary of the content.",
            concepts=[
                {"name": main, "relevance": 0.9},
                {"name": "shared idea", "relevance": 0.4},
            ],
        )

    monkeypatch.setattr(pipeline, "analyze_text", fake_analyze)


PUBLIC_DNS = {
    "example.com": ["93.184.216.34"],
    "www.youtube.com": ["142.250.80.46"],
    "github.com": ["140.82.112.3"],
    "internal.example.com": ["10.0.0.5"],  # a name that points at a private address
}


@pytest.fixture()
def public_dns(monkeypatch):
    """Fake DNS so tests never touch the network. Names not listed above fail to resolve."""

    def fake_getaddrinfo(host, port, *args, **kwargs):
        if host not in PUBLIC_DNS:
            raise socket.gaierror("unknown host")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in PUBLIC_DNS[host]]

    monkeypatch.setattr(url_safety.socket, "getaddrinfo", fake_getaddrinfo)
