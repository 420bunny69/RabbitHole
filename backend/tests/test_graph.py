from uuid import uuid4

import pytest

from app.services import pipeline
from app.services.llm import LLMError

# The test AI (see conftest.py) gives every text "shared idea" plus one concept of its own.
ENTROPY = "Entropy measures disorder in a system. It never decreases in an isolated system."
GRADIENT = "Gradient descent finds minima of a function by following the slope."


@pytest.fixture()
def owner():
    return {"X-Owner-Id": str(uuid4())}


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

    def busy(title, text):
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


def test_other_visitors_see_only_their_own_graph(client, owner):
    save(client, owner, ENTROPY)
    stranger = {"X-Owner-Id": str(uuid4())}
    assert graph(client, stranger) == {"nodes": [], "edges": [], "truncated": False}
    assert len(of_type(graph(client, owner), "item")) == 1


def test_limit_keeps_the_newest_items_and_says_so(client, owner):
    for n in range(3):
        save(client, owner, f"Note {n} about entropy and heat in physical systems.")

    data = graph(client, owner, limit=2)
    assert len(of_type(data, "item")) == 2
    assert data["truncated"] is True
    assert graph(client, owner, limit=3)["truncated"] is False


def test_invalid_requests_are_rejected(client, owner):
    assert client.get("/api/graph").status_code == 400  # no X-Owner-Id header
    assert client.get("/api/graph", params={"limit": 0}, headers=owner).status_code == 422
    assert client.get("/api/graph", params={"limit": 201}, headers=owner).status_code == 422
    assert client.get("/api/graph", params={"min_items": 0}, headers=owner).status_code == 422

    