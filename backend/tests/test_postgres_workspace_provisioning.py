import ipaddress
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from uuid import uuid4

import pytest
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app import deps
from app.config import get_settings
from app.database import engine
from app.models import UserWorkspace, Workspace


@pytest.fixture
def postgres_session_factory():
    configured_url = make_url(get_settings().database_url)
    for url in (configured_url, engine.url):
        if (
            url.drivername != "postgresql+psycopg"
            or url.host != "localhost"
            or url.port != 5432
            or url.database != "rabbithole_test"
        ):
            pytest.skip("Workspace PostgreSQL integration test requires localhost:5432/rabbithole_test.")

    try:
        with engine.connect() as connection:
            database_name, server_address = connection.execute(
                text("SELECT current_database(), inet_server_addr()")
            ).one()
            if (
                database_name != "rabbithole_test"
                or server_address is None
                or not ipaddress.ip_interface(str(server_address)).ip.is_loopback
            ):
                pytest.fail("Connected PostgreSQL server is not the local rabbithole_test database.")

        if not {"workspaces", "user_workspaces"} <= set(inspect(engine).get_table_names()):
            pytest.fail("PostgreSQL test database is missing workspace tables; migrations are not run by this test.")
    except SQLAlchemyError as error:
        pytest.fail(f"Could not verify the local PostgreSQL test database: {type(error).__name__}")

    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def test_postgresql_workspace_provisioning_is_atomic_and_idempotent(
    postgres_session_factory, monkeypatch
):
    session_factory = postgres_session_factory
    existing_user_id, concurrent_user_id, separate_user_id = uuid4(), uuid4(), uuid4()
    user_ids = [existing_user_id, concurrent_user_id, separate_user_id]

    with session_factory() as db:
        existing_workspace_ids = set(db.scalars(select(Workspace.id)))

    created_workspace_ids = set()
    created_workspace_ids_lock = Lock()

    def candidate_workspace():
        workspace = Workspace(id=uuid4(), name="Provisioning integration test")
        with created_workspace_ids_lock:
            created_workspace_ids.add(workspace.id)
        return workspace

    monkeypatch.setattr(deps, "Workspace", candidate_workspace)
    try:
        existing_workspace = Workspace(id=uuid4())
        created_workspace_ids.add(existing_workspace.id)
        with session_factory() as db:
            db.add(existing_workspace)
            db.flush()
            db.add(
                UserWorkspace(
                    user_id=existing_user_id,
                    workspace_id=existing_workspace.id,
                )
            )
            db.commit()

        with session_factory() as db:
            retained_id = deps.get_current_workspace_id(existing_user_id, db)
        assert retained_id == existing_workspace.id

        barrier = Barrier(2)

        def provision_concurrently():
            with session_factory() as db:
                barrier.wait(timeout=15)
                return deps.get_current_workspace_id(concurrent_user_id, db)

        with ThreadPoolExecutor(max_workers=2) as executor:
            concurrent_ids = list(executor.map(lambda _: provision_concurrently(), range(2)))
        assert concurrent_ids[0] == concurrent_ids[1]

        with session_factory() as db:
            separate_id = deps.get_current_workspace_id(separate_user_id, db)

        assert separate_id not in {existing_workspace.id, concurrent_ids[0]}
        with session_factory() as db:
            mappings = {
                user_id: db.get(UserWorkspace, user_id).workspace_id
                for user_id in user_ids
            }
            assert mappings == {
                existing_user_id: existing_workspace.id,
                concurrent_user_id: concurrent_ids[0],
                separate_user_id: separate_id,
            }

            workspace_ids_after = set(db.scalars(select(Workspace.id))) - existing_workspace_ids
            assert workspace_ids_after == created_workspace_ids
            assert workspace_ids_after == set(mappings.values()) - existing_workspace_ids
    finally:
        with session_factory() as db:
            db.execute(delete(UserWorkspace).where(UserWorkspace.user_id.in_(user_ids)))
            if created_workspace_ids:
                db.execute(delete(Workspace).where(Workspace.id.in_(created_workspace_ids)))
            db.commit()
