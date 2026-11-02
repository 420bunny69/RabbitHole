from uuid import uuid4
import pytest

from app import deps
from app.main import app
from app.models import Concept, Item, ItemConcept, ItemStatus
from app.services.extractors.github import parse_github_repo
from app.services.extractors.youtube import extract_video_id

PASTED_1 = "Gradient descent is an optimization algorithm used for training machine learning models."
PASTED_2 = "Stochastic gradient descent calculates the gradient using a random subset of training data."
PASTED_3 = "Quantum computing leverages superposition and entanglement for computation."


@pytest.fixture()
def client(authenticated_client):
    return authenticated_client["client"]


@pytest.fixture()
def owner():
    return {}


def test_notes_can_be_saved_and_retrieved(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    created = client.post("/api/items", json={"text": PASTED_1}, headers=owner).json()
    item_id = created["id"]

    # Initial notes are empty
    detail = client.get(f"/api/items/{item_id}", headers=owner).json()
    assert detail["notes"] is None

    # Update notes
    updated = client.patch(
        f"/api/items/{item_id}/notes",
        json={"notes": "Need to review step size hyperparameter."},
        headers=owner,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Need to review step size hyperparameter."

    # Verify retrieval
    detail = client.get(f"/api/items/{item_id}", headers=owner).json()
    assert detail["notes"] == "Need to review step size hyperparameter."

    # Other owner cannot access or update notes
    authenticated_client["create_user_mapping"]()
    assert client.patch(
        f"/api/items/{item_id}/notes",
        json={"notes": "Hacked"},
        headers=owner,
    ).status_code == 404
    authenticated_client["identity"]["user_id"] = original_user_id


def test_related_items_endpoint(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    id1 = client.post("/api/items", json={"text": PASTED_1}, headers=owner).json()["id"]
    id2 = client.post("/api/items", json={"text": PASTED_2}, headers=owner).json()["id"]
    id3 = client.post("/api/items", json={"text": PASTED_3}, headers=owner).json()["id"]

    related = client.get(f"/api/items/{id1}/related", headers=owner)
    assert related.status_code == 200
    data = related.json()
    # id1 and id2 both share the test concept "gradient descent" and "shared idea"
    related_ids = [item["id"] for item in data]
    assert id2 in related_ids
    # Verify explainable reason is provided
    match = next(item for item in data if item["id"] == id2)
    assert "concept" in match["relationship_reason"].lower() or "discuss" in match["relationship_reason"].lower()

    # Isolation check
    authenticated_client["create_user_mapping"]()
    assert client.get(f"/api/items/{id1}/related", headers=owner).status_code == 404
    authenticated_client["identity"]["user_id"] = original_user_id


def test_topics_endpoint(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    client.post("/api/items", json={"text": PASTED_1}, headers=owner)
    client.post("/api/items", json={"text": PASTED_2}, headers=owner)

    topics = client.get("/api/topics", headers=owner)
    assert topics.status_code == 200
    data = topics.json()
    assert len(data) >= 1
    # Check that topic contains items
    topic_names = [t["name"] for t in data]
    assert "shared idea" in topic_names or "gradient descent" in topic_names
    for t in data:
        assert t["count"] == len(t["items"])
        assert t["count"] >= 1

    # Isolation check
    authenticated_client["create_user_mapping"]()
    empty_topics = client.get("/api/topics", headers=owner).json()
    assert empty_topics == []
    authenticated_client["identity"]["user_id"] = original_user_id


def test_ask_rabbithole_endpoint(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    client.post("/api/items", json={"text": PASTED_1}, headers=owner)

    # Ask a relevant question
    res = client.post(
        "/api/ask",
        json={"question": "What is gradient descent used for?"},
        headers=owner,
    )
    assert res.status_code == 200
    answer_data = res.json()
    assert "answer" in answer_data
    assert len(answer_data["citations"]) >= 1
    citation = answer_data["citations"][0]
    assert "gradient" in citation["title"].lower() or "gradient" in citation["excerpt"].lower()

    # Ask about something not in library
    res_unrelated = client.post(
        "/api/ask",
        json={"question": "Who won the 1994 world cup?"},
        headers=owner,
    )
    assert res_unrelated.status_code == 200
    assert len(res_unrelated.json()["citations"]) == 0

    # Other owner gets no results from our library
    authenticated_client["create_user_mapping"]()
    res_other = client.post(
        "/api/ask",
        json={"question": "What is gradient descent?"},
        headers=owner,
    )
    assert res_other.status_code == 200
    assert len(res_other.json()["citations"]) == 0
    authenticated_client["identity"]["user_id"] = original_user_id


def test_trails_endpoint(client, owner, authenticated_client):
    original_user_id = authenticated_client["user_id"]
    client.post("/api/items", json={"text": PASTED_1}, headers=owner)
    client.post("/api/items", json={"text": PASTED_2}, headers=owner)

    res = client.get("/api/trails", headers=owner)
    assert res.status_code == 200
    trail = res.json()
    assert "id" in trail
    assert "title" in trail
    assert len(trail["steps"]) >= 2
    # Verify steps have connections and reasons
    assert all("connection_reason" in step for step in trail["steps"])

    authenticated_client["create_user_mapping"]()
    other_trail = client.get("/api/trails", headers=owner).json()
    assert not any(step.get("item_id") for step in other_trail["steps"])
    authenticated_client["identity"]["user_id"] = original_user_id


def test_anonymous_and_unmapped_users_are_rejected_for_all_four_apis(client, authenticated_client):
    requests = [
        lambda: client.get("/api/graph"),
        lambda: client.get("/api/topics"),
        lambda: client.post("/api/ask", json={"question": "test question"}),
        lambda: client.get("/api/trails"),
    ]
    user_dependency = app.dependency_overrides.pop(deps.get_supabase_user_id)
    try:
        anonymous_responses = [request() for request in requests]
    finally:
        app.dependency_overrides[deps.get_supabase_user_id] = user_dependency
    assert [response.status_code for response in anonymous_responses] == [401] * 4

    authenticated_client["identity"]["user_id"] = uuid4()
    unmapped_responses = [request() for request in requests]
    assert [response.status_code for response in unmapped_responses] == [403] * 4


def test_topic_relationship_does_not_expose_foreign_workspace_item(client, authenticated_client):
    owner_user = authenticated_client["user_id"]
    owner_workspace = authenticated_client["workspace_id"]
    _, foreign_workspace = authenticated_client["create_user_mapping"]()
    with authenticated_client["session_factory"]() as db:
        item = Item(
            owner_id=foreign_workspace,
            source_type="text",
            title="Foreign item",
            raw_text="Foreign content",
            summary="Foreign summary",
            status=ItemStatus.READY.value,
        )
        concept = Concept(owner_id=owner_workspace, name="owned concept")
        db.add_all([item, concept])
        db.flush()
        db.add(ItemConcept(item_id=item.id, concept_id=concept.id, relevance=1.0))
        db.commit()

    authenticated_client["identity"]["user_id"] = owner_user
    topics = client.get("/api/topics").json()
    assert all(item["title"] != "Foreign item" for topic in topics for item in topic["items"])


def test_ask_and_trail_exclude_foreign_workspace_concepts(client, authenticated_client, owner):
    owner_user = authenticated_client["user_id"]
    owner_workspace = authenticated_client["workspace_id"]
    _, foreign_workspace = authenticated_client["create_user_mapping"]()
    with authenticated_client["session_factory"]() as db:
        item = Item(
            owner_id=owner_workspace,
            source_type="text",
            title="Neutral owned item",
            raw_text="Neutral content",
            summary="Neutral summary",
            status=ItemStatus.READY.value,
        )
        concept = Concept(owner_id=foreign_workspace, name="foreignonlyterm")
        db.add_all([item, concept])
        db.flush()
        db.add(ItemConcept(item_id=item.id, concept_id=concept.id, relevance=1.0))
        db.commit()

    authenticated_client["identity"]["user_id"] = owner_user
    answer = client.post("/api/ask", json={"question": "foreignonlyterm"}, headers=owner).json()
    assert answer["citations"] == []
    trail = client.get("/api/trails", headers=owner).json()
    assert "foreignonlyterm" not in {step["title"] for step in trail["steps"]}


def test_youtube_video_id_parser():
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://example.com/watch?v=dQw4w9WgXcQ") is None


def test_github_repo_parser():
    assert parse_github_repo("https://github.com/tiangolo/fastapi") == ("tiangolo", "fastapi")
    assert parse_github_repo("https://github.com/tiangolo/fastapi.git") == ("tiangolo", "fastapi")
    assert parse_github_repo("https://github.com/explore") is None
    assert parse_github_repo("https://notgithub.com/a/b") is None
