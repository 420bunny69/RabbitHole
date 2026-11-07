import ipaddress
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app import deps
from app.config import get_settings
from app.database import SessionLocal, engine
from app.main import app
from app.models import Item, UserWorkspace, Workspace
from app.routers import items as items_router


@pytest.fixture
def postgres_api(monkeypatch):
    configured_url = make_url(get_settings().database_url)
    engine_url = engine.url
    for url in (configured_url, engine_url):
        if (
            url.get_backend_name() != "postgresql"
            or url.drivername != "postgresql+psycopg"
            or url.host != "localhost"
            or url.port != 5432
            or url.database != "rabbithole_test"
        ):
            pytest.fail(
                "PostgreSQL integration test requires DATABASE_URL and app.database.engine "
                "to target localhost:5432/rabbithole_test using postgresql+psycopg."
            )

    try:
        with engine.connect() as connection:
            database_name = connection.execute(text("SELECT current_database()")).scalar_one()
            server_address = connection.execute(text("SELECT inet_server_addr()")).scalar_one()
            if database_name != "rabbithole_test" or not ipaddress.ip_address(server_address).is_loopback:
                pytest.fail("Connected PostgreSQL server is not the local rabbithole_test database.")

        required_tables = {"items", "workspaces", "user_workspaces", "item_concepts", "suggestions"}
        missing_tables = required_tables - set(inspect(engine).get_table_names())
        if missing_tables:
            pytest.fail(
                "PostgreSQL test database is missing required tables; migrations are not run by this test."
            )
    except SQLAlchemyError as error:
        pytest.fail(f"Could not verify the local PostgreSQL test database: {type(error).__name__}")

    first_user_id, second_user_id = uuid4(), uuid4()
    first_workspace, second_workspace = Workspace(id=uuid4()), Workspace(id=uuid4())
    workspace_ids = [first_workspace.id, second_workspace.id]

    previous_auth_override = app.dependency_overrides.get(deps.get_supabase_user_id)
    identity = {"user_id": first_user_id}

    try:
        with SessionLocal() as db:
            db.add_all(
                [
                    first_workspace,
                    second_workspace,
                    UserWorkspace(user_id=first_user_id, workspace_id=first_workspace.id),
                    UserWorkspace(user_id=second_user_id, workspace_id=second_workspace.id),
                ]
            )
            db.commit()

        app.dependency_overrides[deps.get_supabase_user_id] = lambda: identity["user_id"]
        monkeypatch.setattr(items_router, "process_item", lambda _item_id: None)

        with TestClient(app) as client:
            yield {
                "client": client,
                "identity": identity,
                "first_user_id": first_user_id,
                "second_user_id": second_user_id,
                "first_workspace_id": first_workspace.id,
                "workspace_ids": workspace_ids,
            }
    finally:
        if previous_auth_override is None:
            app.dependency_overrides.pop(deps.get_supabase_user_id, None)
        else:
            app.dependency_overrides[deps.get_supabase_user_id] = previous_auth_override

        with SessionLocal() as db:
            items = db.scalars(select(Item).where(Item.owner_id.in_(workspace_ids))).all()
            for item in items:
                db.delete(item)
            db.execute(
                delete(UserWorkspace).where(
                    UserWorkspace.user_id.in_([first_user_id, second_user_id])
                )
            )
            db.execute(delete(Workspace).where(Workspace.id.in_(workspace_ids)))
            db.commit()


def test_authenticated_item_crud_and_workspace_isolation_postgresql(postgres_api):
    client = postgres_api["client"]
    identity = postgres_api["identity"]
    headers = {"Authorization": "Bearer synthetic-test-identity"}
    payload = {
        "text": "PostgreSQL integration test content with enough detail to create an item."
    }

    created = client.post("/api/items", json=payload, headers=headers)
    assert created.status_code == 201
    item_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    listed = client.get("/api/items", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [item_id]

    read = client.get(f"/api/items/{item_id}", headers=headers)
    assert read.status_code == 200
    assert read.json()["id"] == item_id

    updated = client.patch(
        f"/api/items/{item_id}/notes",
        json={"notes": "PostgreSQL integration update"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "PostgreSQL integration update"

    identity["user_id"] = postgres_api["second_user_id"]
    assert client.get("/api/items", headers=headers).json() == []
    assert client.get(f"/api/items/{item_id}", headers=headers).status_code == 404
    assert client.delete(f"/api/items/{item_id}", headers=headers).status_code == 404

    identity["user_id"] = postgres_api["first_user_id"]
    assert client.get(f"/api/items/{item_id}", headers=headers).status_code == 200

    deleted = client.delete(f"/api/items/{item_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/items/{item_id}", headers=headers).status_code == 404
