from uuid import uuid4
import pytest

from app.models import Item, ItemConcept, ItemStatus
from app.services.extractors.github import parse_github_repo
from app.services.extractors.youtube import extract_video_id

PASTED_1 = "Gradient descent is an optimization algorithm used for training machine learning models."
PASTED_2 = "Stochastic gradient descent calculates the gradient using a random subset of training data."
PASTED_3 = "Quantum computing leverages superposition and entanglement for computation."


@pytest.fixture()
def owner():
    return {"X-Owner-Id": str(uuid4())}


def test_notes_can_be_saved_and_retrieved(client, owner):
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
    other_owner = {"X-Owner-Id": str(uuid4())}
    assert client.patch(
        f"/api/items/{item_id}/notes",
        json={"notes": "Hacked"},
        headers=other_owner,
    ).status_code == 404


def test_related_items_endpoint(client, owner):
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
    other_owner = {"X-Owner-Id": str(uuid4())}
    assert client.get(f"/api/items/{id1}/related", headers=other_owner).status_code == 404


def test_topics_endpoint(client, owner):
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
    other_owner = {"X-Owner-Id": str(uuid4())}
    empty_topics = client.get("/api/topics", headers=other_owner).json()
    assert empty_topics == []


def test_ask_rabbithole_endpoint(client, owner):
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
    other_owner = {"X-Owner-Id": str(uuid4())}
    res_other = client.post(
        "/api/ask",
        json={"question": "What is gradient descent?"},
        headers=other_owner,
    )
    assert res_other.status_code == 200
    assert len(res_other.json()["citations"]) == 0


def test_trails_endpoint(client, owner):
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
