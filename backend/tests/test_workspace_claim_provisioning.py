import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from itertools import count
from threading import Barrier, Lock
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

import provision_workspace_claim as provisioning
from app.database import Base
from app.models import UserWorkspace, Workspace


def add_workspace(db_session, workspace_id=None):
    workspace = Workspace(id=workspace_id or uuid4())
    db_session.add(workspace)
    db_session.commit()
    return workspace


def test_generated_tokens_have_256_bits_and_are_random(db_session, capsys):
    first = add_workspace(db_session)
    second = add_workspace(db_session)

    provisioning.provision_workspace_claim(db_session, first.id)
    first_token = capsys.readouterr().out.strip()
    provisioning.provision_workspace_claim(db_session, second.id)
    second_token = capsys.readouterr().out.strip()

    assert len(first_token) >= 43
    assert len(second_token) >= 43
    assert first_token != second_token


def test_only_hash_is_stored_and_token_expires(db_session, capsys, monkeypatch):
    workspace = add_workspace(db_session)
    now = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(provisioning, "_utcnow", lambda: now)

    provisioning.provision_workspace_claim(db_session, workspace.id)
    token = capsys.readouterr().out.strip()
    db_session.refresh(workspace)

    assert workspace.claim_token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert token not in workspace.claim_token_hash
    expiry = workspace.claim_expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    assert expiry == now + provisioning.TOKEN_LIFETIME


def test_claimed_workspace_refuses_token_generation(db_session, capsys):
    workspace = add_workspace(db_session)
    db_session.add(UserWorkspace(user_id=uuid4(), workspace_id=workspace.id))
    db_session.commit()

    with pytest.raises(provisioning.ProvisioningError, match="already claimed"):
        provisioning.provision_workspace_claim(db_session, workspace.id)

    assert capsys.readouterr().out == ""
    db_session.refresh(workspace)
    assert workspace.claim_token_hash is None
    assert workspace.claim_expires_at is None


def test_unexpired_token_cannot_be_rotated(db_session, capsys):
    workspace = add_workspace(db_session)
    provisioning.provision_workspace_claim(db_session, workspace.id)
    original_token = capsys.readouterr().out.strip()
    original_hash = hashlib.sha256(original_token.encode("utf-8")).hexdigest()

    with pytest.raises(provisioning.ProvisioningError, match="unexpired"):
        provisioning.provision_workspace_claim(db_session, workspace.id)

    assert capsys.readouterr().out == ""
    db_session.refresh(workspace)
    assert workspace.claim_token_hash == original_hash


def test_expired_token_can_be_rotated(db_session, capsys, monkeypatch):
    workspace = add_workspace(db_session)
    clock = [datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)]
    monkeypatch.setattr(provisioning, "_utcnow", lambda: clock[0])

    provisioning.provision_workspace_claim(db_session, workspace.id)
    first_token = capsys.readouterr().out.strip()
    clock[0] += provisioning.TOKEN_LIFETIME + timedelta(seconds=1)
    provisioning.provision_workspace_claim(db_session, workspace.id)
    second_token = capsys.readouterr().out.strip()

    db_session.refresh(workspace)
    assert first_token != second_token
    assert workspace.claim_token_hash == hashlib.sha256(second_token.encode("utf-8")).hexdigest()


def test_missing_workspace_is_rejected_without_printing_token(db_session, capsys):
    with pytest.raises(provisioning.ProvisioningError, match="not found"):
        provisioning.provision_workspace_claim(db_session, uuid4())

    assert capsys.readouterr().out == ""


def test_command_requires_workspace_id():
    with pytest.raises(SystemExit) as error:
        provisioning.main([str(UUID(int=1))])

    assert error.value.code == 2


def test_database_confirmation_requires_matching_existing_absolute_path(tmp_path, monkeypatch):
    configured_file = tmp_path / "configured.db"
    configured_file.touch()
    other_file = tmp_path / "other.db"
    other_file.touch()
    configured_engine = create_engine(
        URL.create("sqlite", database=str(configured_file)), poolclass=NullPool
    )
    monkeypatch.setattr(provisioning, "engine", configured_engine)

    assert provisioning.resolve_confirmed_database_path(str(configured_file)) == configured_file.resolve()
    with pytest.raises(provisioning.ProvisioningError, match="does not match"):
        provisioning.resolve_confirmed_database_path(str(other_file.resolve()))
    with pytest.raises(provisioning.ProvisioningError, match="absolute"):
        provisioning.resolve_confirmed_database_path("configured.db")

    configured_engine.dispose()


def test_missing_configured_database_is_not_created(tmp_path, monkeypatch):
    missing_file = tmp_path / "missing.db"
    configured_engine = create_engine(
        URL.create("sqlite", database=str(missing_file)), poolclass=NullPool
    )
    monkeypatch.setattr(provisioning, "engine", configured_engine)

    with pytest.raises(provisioning.ProvisioningError, match="must already exist"):
        provisioning.resolve_confirmed_database_path(str(missing_file.resolve()))

    assert not missing_file.exists()
    configured_engine.dispose()


def test_command_refuses_non_sqlite_database(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(provisioning, "engine", SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))

    result = provisioning.main([str(UUID(int=1)), "--confirm-db", str(tmp_path.resolve())])

    assert result == 1
    assert "restricted to SQLite" in capsys.readouterr().err


def test_command_displays_confirmed_path_before_token(tmp_path, monkeypatch, capsys):
    database_file = tmp_path / "confirmed.db"
    test_engine = create_engine(
        URL.create("sqlite", database=str(database_file)), poolclass=NullPool
    )
    Base.metadata.create_all(test_engine)
    TestSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    workspace_id = uuid4()
    with TestSession() as db:
        db.add(Workspace(id=workspace_id))
        db.commit()

    monkeypatch.setattr(provisioning, "engine", test_engine)
    monkeypatch.setattr(provisioning, "SessionLocal", TestSession)
    monkeypatch.setattr(provisioning.secrets, "token_urlsafe", lambda _: "test-only-token")

    result = provisioning.main(
        [str(workspace_id), "--confirm-db", str(database_file.resolve())]
    )

    assert result == 0
    assert capsys.readouterr().out.splitlines() == [
        f"Database: {database_file.resolve()}",
        "test-only-token",
    ]
    with TestSession() as db:
        workspace = db.get(Workspace, workspace_id)
        assert workspace.claim_token_hash == hashlib.sha256(b"test-only-token").hexdigest()

    test_engine.dispose()


def test_concurrent_provisioning_only_prints_and_stores_one_token(tmp_path, monkeypatch, capsys):
    database_file = tmp_path / "concurrent-provisioning.db"
    test_engine = create_engine(
        URL.create("sqlite", database=str(database_file)),
        connect_args={"timeout": 15},
        poolclass=NullPool,
    )
    Base.metadata.create_all(test_engine)
    TestSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    workspace_id = uuid4()
    with TestSession() as db:
        db.add(Workspace(id=workspace_id))
        db.commit()

    barrier = Barrier(2)
    token_counter = count()
    token_lock = Lock()
    generated_test_tokens = []

    def make_test_token(num_bytes):
        assert num_bytes == 32
        with token_lock:
            token = f"test-only-claim-token-{next(token_counter)}"
            generated_test_tokens.append(token)
            return token

    monkeypatch.setattr(provisioning.secrets, "token_urlsafe", make_test_token)

    def attempt_provisioning():
        with TestSession() as db:
            barrier.wait(timeout=10)
            try:
                provisioning.provision_workspace_claim(db, workspace_id)
                return True
            except provisioning.ProvisioningError:
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: attempt_provisioning(), range(2)))

    printed_tokens = capsys.readouterr().out.splitlines()
    assert sum(results) == 1
    assert len(printed_tokens) == 1
    assert len(generated_test_tokens) == 2

    with TestSession() as db:
        workspace = db.get(Workspace, workspace_id)
        assert workspace.claim_token_hash == hashlib.sha256(
            printed_tokens[0].encode("utf-8")
        ).hexdigest()
        assert workspace.claim_token_hash != hashlib.sha256(
            next(token for token in generated_test_tokens if token != printed_tokens[0]).encode("utf-8")
        ).hexdigest()
        stored_values = repr(
            db.execute(
                select(Workspace.id, Workspace.claim_token_hash, Workspace.claim_expires_at)
                .where(Workspace.id == workspace_id)
            ).one()
        )
        assert all(token not in stored_values for token in generated_test_tokens)

    test_engine.dispose()