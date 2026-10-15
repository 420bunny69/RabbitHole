from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deps import OwnerId

# A tiny app that exists only for this test, so we don't ship a debug endpoint.
_app = FastAPI()


@_app.get("/whoami")
def whoami(owner_id: OwnerId) -> dict[str, str]:
    return {"owner_id": str(owner_id)}


_client = TestClient(_app)


def test_valid_owner_id_is_accepted():
    owner = uuid4()
    response = _client.get("/whoami", headers={"X-Owner-Id": str(owner)})
    assert response.status_code == 200
    assert UUID(response.json()["owner_id"]) == owner


def test_missing_owner_id_is_rejected():
    response = _client.get("/whoami")
    assert response.status_code == 400


def test_invalid_owner_id_is_rejected():
    response = _client.get("/whoami", headers={"X-Owner-Id": "not-a-uuid"})
    assert response.status_code == 400
