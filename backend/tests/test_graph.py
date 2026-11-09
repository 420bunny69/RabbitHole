from uuid import uuid4

import pytest

from app import deps
from app.main import app
from app.models import Concept, Item, ItemConcept
from app.services import pipeline
from app.services.llm import LLMError

# The test AI (see conftest.py) gives every text "shared idea" plus one concept of its own.
ENTROPY = "Entropy measures disorder in a system. It never decreases in an isolated system."
GRADIENT = "Gradient descent finds minima of a function by following the slope."


@pytest.fixture()
def client(authenticated_client):
    return authenticated_client["client"]


@pytest.fixture()
def owner():
    return {}


def save(client, owner, text) -> str:
    return client.post("/api/items", json={"text": text}, headers=owner).json()["id"]


def graph(client, owner, **params) -> dict:
    response = client.get("/api/graph", params=params, headers=owner)
    assert response.status_code == 200
    return response.json()


def of_type(data, kind) -> list[dict]:
    return [node for node in data["nodes"] if node["type"] == kind]


def test_an_empty_library_gives_an_empty_graph(client, owner):
    assert graph(client, owner) == {"nodes": [], "edges": [], "truncated": False}


def test_items_and_concepts_become_nodes_and_edges(client, owner):
    entropy_id = save(client, owner, ENTROPY)
    gradient_id = save(client, owner, GRADIENT)
    data = graph(client, owner)

    items = of_type(data, "item")
    assert {n["id"] for n in items} == {f"item:{entropy_id}", f"item:{gradient_id}"}
    assert {n["item_id"] for n in items} == {entropy_id, gradient_id}
    assert {n["label"] for n in items} == {ENTROPY, GRADIENT}  # short texts become their own titles

    concepts = of_type(data, "concept")
    assert [n["label"] for n in concepts][0] == "shared idea"  # most used first
    assert {n["label"]: n["count"] for n in concepts} == {
        "shared idea": 2,
        "entropy": 1,
        "gradient descent": 1,
    }

    assert len(data["edges"]) == 4
    node_ids = {n["id"] for n in data["nodes"]}
    assert all(e["source"] in node_ids and e["target"] in node_ids for e in data["edges"])
    assert all(e["source"].startswith("item:") and e["target"].startswith("concept:") for e in data["edges"])
    shared = next(n for n in concepts if n["label"] == "shared idea")
    linked = {e["source"] for e in data["edges"] if e["target"] == shared["id"]}
    assert linked == {f"item:{entropy_id}", f"item:{gradient_id}"}  # this is what connects the two items
    assert {e["weight"] for e in data["edges"]} == {0.9, 0.4}
    assert data["truncated"] is False


def test_min_items_hides_concepts_used_by_only_one_item(client, owner):
    save(client, owner, ENTROPY)
    save(client, owner, GRADIENT)
    data = graph(client, owner, min_items=2)

    assert [n["label"] for n in of_type(data, "concept")] == ["shared idea"]
    assert len(data["edges"]) == 2
    assert len(of_type(data, "item")) == 2  # items always stay


def test_items_that_are_not_ready_are_left_out(client, owner, monkeypatch):
    save(client, owner, ENTROPY)

    def busy(title, text,known_concepts=None):
        raise LLMError("The AI service is busy right now")

    monkeypatch.setattr(pipeline, "analyze_text", busy)
    save(client, owner, GRADIENT)  # ends up failed

    data = graph(client, owner)
    assert len(of_type(data, "item")) == 1
    assert "gradient descent" not in {n["label"] for n in of_type(data, "concept")}


def test_deleting_an_item_removes_it_and_its_private_concepts(client, owner):
    entropy_id = save(client, owner, ENTROPY)
    save(client, owner, GRADIENT)
    client.delete(f"/api/items/{entropy_id}", headers=owner)

    data = graph(client, owner)
    assert len(of_type(data, "item")) == 1
    assert {n["label"] for n in of_type(data, "concept")} == {"gradient descent", "shared idea"}


def test_other_users_see_only_their_workspace_graph(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    save(client, owner, ENTROPY)
    authenticated_client["create_user_mapping"]()
    assert graph(client, owner) == {"nodes": [], "edges": [], "truncated": False}
    authenticated_client["identity"]["user_id"] = original_user_id
    assert len(of_type(graph(client, owner), "item")) == 1


def test_limit_keeps_the_newest_items_and_says_so(client, owner):
    for n in range(3):
        save(client, owner, f"Note {n} about entropy and heat in physical systems.")

    data = graph(client, owner, limit=2)
    assert len(of_type(data, "item")) == 2
    assert data["truncated"] is True
    assert graph(client, owner, limit=3)["truncated"] is False


def test_invalid_requests_are_rejected(client, owner):
    assert client.get("/api/graph", params={"limit": 0}, headers=owner).status_code == 422
    assert client.get("/api/graph", params={"limit": 201}, headers=owner).status_code == 422
    assert client.get("/api/graph", params={"min_items": 0}, headers=owner).status_code == 422


def test_anonymous_is_rejected_and_unmapped_user_gets_private_workspace(client, authenticated_client):
    user_dependency = app.dependency_overrides.pop(deps.get_supabase_user_id)
    try:
        anonymous = client.get("/api/graph", headers={"X-Owner-Id": str(authenticated_client["workspace_id"])})
    finally:
        app.dependency_overrides[deps.get_supabase_user_id] = user_dependency
    assert anonymous.status_code == 401

    user_id = uuid4()
    authenticated_client["identity"]["user_id"] = user_id
    response = client.get("/api/graph")
    assert response.status_code == 200
    assert response.json() == {"nodes": [], "edges": [], "truncated": False}


def test_graph_excludes_cross_workspace_concept_links(client, authenticated_client, owner):
    owner_user = authenticated_client["user_id"]
    owner_workspace = authenticated_client["workspace_id"]
    _, foreign_workspace = authenticated_client["create_user_mapping"]()
    with authenticated_client["session_factory"]() as db:
        item = Item(
            owner_id=owner_workspace,
            source_type="text",
            title="Owned item",
            raw_text="Owned content",
            status="ready",
        )
        concept = Concept(owner_id=foreign_workspace, name="foreign private concept")
        db.add_all([item, concept])
        db.flush()
        db.add(ItemConcept(item_id=item.id, concept_id=concept.id, relevance=1.0))
        db.commit()

    authenticated_client["identity"]["user_id"] = owner_user
    data = graph(client, owner)
    assert "foreign private concept" not in {node["label"] for node in of_type(data, "concept")}
    assert data["edges"] == []

    