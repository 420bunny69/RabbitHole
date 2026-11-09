import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import URL
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from app import deps
from app.database import Base, enable_sqlite_foreign_keys, get_db
from app.main import app
from app.models import UserWorkspace, Workspace
from app.routers.workspaces import TARGET_WORKSPACE_ID, claim_workspace
from app.schemas import WorkspaceClaimRequest

AUTHENTICATED_USER_ID = UUID("ce7c4c6a-7d2f-4d54-bf10-8f4e182b8afe")
TEST_TOKEN = "test-only-claim-token-never-used-outside-tests"


@pytest.fixture
def claim_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
    try:
        with TestClient(app) as client:
            yield client, TestingSession
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture
def authenticated_claim_client(claim_client, monkeypatch):
    client, session_factory = claim_client
    app.dependency_overrides[deps.get_supabase_user_id] = lambda: AUTHENTICATED_USER_ID
    monkeypatch.setattr(
        deps,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_jwt_issuer="https://test.supabase.co/auth/v1",
            supabase_jwt_audience="authenticated",
            supabase_jwt_algorithm="ES256",
            supabase_jwt_secret="",
        ),
    )
    return client, session_factory


def seed_workspace(session_factory, token=TEST_TOKEN, expires_at=None):
    with session_factory() as db:
        db.add(
            Workspace(
                id=TARGET_WORKSPACE_ID,
                claim_token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
                claim_expires_at=expires_at or datetime.now(timezone.utc) + timedelta(minutes=5),
            )
        )
        db.commit()


def test_valid_claim_returns_minimal_response_and_creates_mapping(authenticated_claim_client, caplog, capsys):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)

    response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert response.status_code == 200
    assert response.json() == {"status": "claimed", "workspace_id": str(TARGET_WORKSPACE_ID)}
    assert TEST_TOKEN not in response.text
    assert TEST_TOKEN not in caplog.text
    assert TEST_TOKEN not in capsys.readouterr().out
    with session_factory() as db:
        workspace = db.get(Workspace, TARGET_WORKSPACE_ID)
        mapping = db.get(UserWorkspace, AUTHENTICATED_USER_ID)
        assert workspace.claim_token_hash is None
        assert workspace.claim_expires_at is None
        assert mapping.workspace_id == TARGET_WORKSPACE_ID


def test_missing_authentication_returns_401(claim_client):
    client, _ = claim_client
    response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})
    assert response.status_code == 401


def test_workspace_endpoint_provisions_once_for_authenticated_user(authenticated_claim_client):
    client, session_factory = authenticated_claim_client

    first = client.get("/api/workspaces/me")
    second = client.get("/api/workspaces/me")

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    with session_factory() as db:
        mapping = db.get(UserWorkspace, AUTHENTICATED_USER_ID)
        assert mapping.workspace_id == UUID(first.json()["workspace_id"])
        assert len(db.query(Workspace).all()) == 1


def test_concurrent_first_requests_create_one_workspace(tmp_path):
    database_file = tmp_path / "workspace-race.db"
    engine = create_engine(
        URL.create("sqlite", database=str(database_file)),
        connect_args={"timeout": 15, "check_same_thread": False},
        poolclass=NullPool,
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    user_id = uuid4()
    barrier = Barrier(2)

    def ensure_workspace():
        with session_factory() as db:
            barrier.wait(timeout=10)
            return deps.get_current_workspace_id(user_id, db)

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            workspace_ids = list(executor.map(lambda _: ensure_workspace(), range(2)))
        assert workspace_ids[0] == workspace_ids[1]
        with session_factory() as db:
            assert db.get(UserWorkspace, user_id).workspace_id == workspace_ids[0]
            assert len(db.query(Workspace).all()) == 1
    finally:
        engine.dispose()


def test_invalid_jwt_returns_401(claim_client, monkeypatch):
    client, _ = claim_client
    monkeypatch.setattr(
        deps,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_jwt_issuer="https://test.supabase.co/auth/v1",
            supabase_jwt_audience="authenticated",
            supabase_jwt_algorithm="ES256",
            supabase_jwt_secret="",
        ),
    )
    response = client.post(
        "/api/workspaces/claim",
        json={"claim_token": TEST_TOKEN},
        headers={"Authorization": "Bearer definitely-not-a-jwt"},
    )
    assert response.status_code == 401


def test_invalid_claim_token_is_generic_failure(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)

    response = client.post("/api/workspaces/claim", json={"claim_token": "wrong-token"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}


def test_expired_claim_token_is_generic_failure(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory, expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))

    response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}


def test_replay_is_generic_failure(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)
    first = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})
    second = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json() == {"detail": "Claim is invalid or unavailable."}


def test_already_claimed_workspace_is_not_transferred(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)
    with session_factory() as db:
        db.add(UserWorkspace(user_id=uuid4(), workspace_id=TARGET_WORKSPACE_ID))
        db.commit()

    response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}
    with session_factory() as db:
        workspace = db.get(Workspace, TARGET_WORKSPACE_ID)
        assert workspace.claim_token_hash == hashlib.sha256(TEST_TOKEN.encode()).hexdigest()


def test_user_already_mapped_to_another_workspace_cannot_claim(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)
    other_workspace_id = uuid4()
    with session_factory() as db:
        db.add(Workspace(id=other_workspace_id))
        db.flush()
        db.add(UserWorkspace(user_id=AUTHENTICATED_USER_ID, workspace_id=other_workspace_id))
        db.commit()

    response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert response.status_code == 409
    with session_factory() as db:
        assert db.get(UserWorkspace, AUTHENTICATED_USER_ID).workspace_id == other_workspace_id
        assert db.get(Workspace, TARGET_WORKSPACE_ID).claim_token_hash == hashlib.sha256(
            TEST_TOKEN.encode()
        ).hexdigest()


@pytest.mark.parametrize("extra", [{"user_id": str(uuid4())}, {"workspace_id": str(uuid4())}])
def test_client_cannot_supply_identity_or_workspace(extra, authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)

    response = client.post(
        "/api/workspaces/claim",
        json={"claim_token": TEST_TOKEN, **extra},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}
    with session_factory() as db:
        assert db.get(UserWorkspace, AUTHENTICATED_USER_ID) is None
        assert db.get(Workspace, TARGET_WORKSPACE_ID).claim_token_hash == hashlib.sha256(
            TEST_TOKEN.encode()
        ).hexdigest()


@pytest.mark.parametrize("body", [None, {}])
def test_missing_claim_token_returns_generic_failure(body, authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)

    response = client.post("/api/workspaces/claim", json=body) if body is not None else client.post(
        "/api/workspaces/claim"
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}
    with session_factory() as db:
        assert db.get(Workspace, TARGET_WORKSPACE_ID).claim_token_hash == hashlib.sha256(
            TEST_TOKEN.encode()
        ).hexdigest()


def test_query_and_owner_header_cannot_override_authenticated_identity(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)
    attacker_id = uuid4()

    response = client.post(
        f"/api/workspaces/claim?user_id={attacker_id}",
        json={"claim_token": TEST_TOKEN},
        headers={"X-Owner-Id": str(attacker_id)},
    )

    assert response.status_code == 200
    with session_factory() as db:
        assert db.get(UserWorkspace, AUTHENTICATED_USER_ID).workspace_id == TARGET_WORKSPACE_ID
        assert db.get(UserWorkspace, attacker_id) is None


def test_concurrent_claim_attempts_allow_only_one(tmp_path):
    database_file = tmp_path / "claim-race.db"
    engine = create_engine(
        URL.create("sqlite", database=str(database_file)),
        connect_args={"timeout": 15, "check_same_thread": False},
        poolclass=NullPool,
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    SessionFactory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    seed_workspace(SessionFactory)
    barrier = Barrier(2)
    user_ids = [AUTHENTICATED_USER_ID, uuid4()]

    def attempt(user_id):
        with SessionFactory() as db:
            barrier.wait(timeout=10)
            try:
                claim_workspace(WorkspaceClaimRequest(claim_token=TEST_TOKEN), user_id, db)
                return user_id
            except HTTPException as error:
                return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt, user_ids))
        assert sum(result in user_ids for result in results) == 1
        assert results.count(409) == 1
        with SessionFactory() as db:
            mapping = db.scalar(
                select(UserWorkspace).where(UserWorkspace.workspace_id == TARGET_WORKSPACE_ID)
            )
            assert mapping.user_id in user_ids
            assert db.get(Workspace, TARGET_WORKSPACE_ID).claim_token_hash is None
    finally:
        engine.dispose()


def test_mapping_insert_failure_rolls_back_token_consumption(authenticated_claim_client):
    client, session_factory = authenticated_claim_client
    seed_workspace(session_factory)

    def fail_insert(mapper, connection, mapping):
        raise IntegrityError("forced mapping failure", {}, RuntimeError("forced"))

    event.listen(UserWorkspace, "before_insert", fail_insert)
    try:
        response = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})
    finally:
        event.remove(UserWorkspace, "before_insert", fail_insert)

    assert response.status_code == 409
    assert response.json() == {"detail": "Claim is invalid or unavailable."}
    with session_factory() as db:
        workspace = db.get(Workspace, TARGET_WORKSPACE_ID)
        assert workspace.claim_token_hash == hashlib.sha256(TEST_TOKEN.encode()).hexdigest()
        assert db.get(UserWorkspace, AUTHENTICATED_USER_ID) is None

    retry = client.post("/api/workspaces/claim", json={"claim_token": TEST_TOKEN})

    assert retry.status_code == 200
    with session_factory() as db:
        assert db.get(Workspace, TARGET_WORKSPACE_ID).claim_token_hash is None
        assert db.get(UserWorkspace, AUTHENTICATED_USER_ID).workspace_id == TARGET_WORKSPACE_ID