from uuid import uuid4

import pytest

from app.services.extractors import web
from app.services.fetcher import FetchedPage, FetchError
from tests.samples import ARTICLE_HTML

PASTED = "Entropy measures disorder in a system.\nIt never decreases in an isolated system."


@pytest.fixture()
def owner():
    return {"X-Owner-Id": str(uuid4())}


@pytest.fixture()
def fake_web(monkeypatch, public_dns):
    """Make page downloads return a sample article instead of using the network."""
    monkeypatch.setattr(web, "fetch_page", lambda url: FetchedPage(url=url, content=ARTICLE_HTML))


# ---- creating ---------------------------------------------------------------------------------
def test_saving_pasted_text_is_processed_in_the_background(client, owner):
    response = client.post("/api/items", json={"text": PASTED}, headers=owner)
    assert response.status_code == 201
    assert response.json()["status"] == "pending"

    item = client.get(f"/api/items/{response.json()['id']}", headers=owner).json()
    assert item["status"] == "ready"
    assert item["source_type"] == "text"
    assert item["title"] == "Entropy measures disorder in a system."
    assert item["raw_text"] == PASTED


def test_saving_a_url_extracts_the_article(client, owner, fake_web):
    response = client.post("/api/items", json={"url": "https://example.com/gd#intro"}, headers=owner)
    assert response.status_code == 201
    assert response.json()["url"] == "https://example.com/gd"  # fragment removed

    item = client.get(f"/api/items/{response.json()['id']}", headers=owner).json()
    assert item["status"] == "ready"
    assert item["source_type"] == "article"
    assert item["title"] == "Understanding Gradient Descent"
    assert "steepest descent" in item["raw_text"]


def test_a_custom_title_is_kept(client, owner, fake_web):
    created = client.post(
        "/api/items", json={"url": "https://example.com/gd", "title": "My title"}, headers=owner
    ).json()
    assert client.get(f"/api/items/{created['id']}", headers=owner).json()["title"] == "My title"


def test_saving_the_same_url_twice_returns_the_first_item(client, owner, fake_web):
    first = client.post("/api/items", json={"url": "https://example.com/gd"}, headers=owner)
    second = client.post("/api/items", json={"url": "https://example.com/gd"}, headers=owner)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get("/api/items", headers=owner).json()) == 1


def test_a_failed_download_marks_the_item_failed(client, owner, public_dns, monkeypatch):
    def failing_fetch(url):
        raise FetchError("The website returned an error (404)")

    monkeypatch.setattr(web, "fetch_page", failing_fetch)
    created = client.post("/api/items", json={"url": "https://example.com/missing"}, headers=owner)
    item = client.get(f"/api/items/{created.json()['id']}", headers=owner).json()
    assert item["status"] == "failed"
    assert item["error_message"] == "The website returned an error (404)"


def test_unexpected_errors_do_not_leak_details(client, owner, public_dns, monkeypatch):
    def broken_fetch(url):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(web, "fetch_page", broken_fetch)
    created = client.post("/api/items", json={"url": "https://example.com/x"}, headers=owner)
    item = client.get(f"/api/items/{created.json()['id']}", headers=owner).json()
    assert item["status"] == "failed"
    assert "secret" not in item["error_message"]


def test_youtube_links_are_recognized_but_not_supported_yet(client, owner, public_dns):
    created = client.post(
        "/api/items", json={"url": "https://www.youtube.com/watch?v=abc"}, headers=owner
    )
    item = client.get(f"/api/items/{created.json()['id']}", headers=owner).json()
    assert item["source_type"] == "youtube"
    assert item["status"] == "failed"
    assert "not supported yet" in item["error_message"]


# ---- validation -------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "url", ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"]
)
def test_unsafe_urls_are_rejected(client, owner, public_dns, url):
    response = client.post("/api/items", json={"url": url}, headers=owner)
    assert response.status_code == 422
    assert client.get("/api/items", headers=owner).json() == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"url": "   ", "text": ""},
        {"url": "https://example.com", "text": PASTED},
        {"text": "too short"},
        {"text": "x" * 100_001},
    ],
)
def test_invalid_requests_are_rejected(client, owner, public_dns, body):
    assert client.post("/api/items", json=body, headers=owner).status_code == 422


def test_owner_header_is_required(client):
    assert client.post("/api/items", json={"text": PASTED}).status_code == 400
    assert client.get("/api/items").status_code == 400


# ---- listing, owner isolation, delete, retry --------------------------------------------------
def test_other_visitors_cannot_see_or_change_my_items(client, owner):
    other = {"X-Owner-Id": str(uuid4())}
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]

    assert client.get("/api/items", headers=other).json() == []
    assert client.get(f"/api/items/{item_id}", headers=other).status_code == 404
    assert client.delete(f"/api/items/{item_id}", headers=other).status_code == 404
    assert client.post(f"/api/items/{item_id}/retry", headers=other).status_code == 404
    assert client.get(f"/api/items/{item_id}", headers=owner).status_code == 200


def test_list_is_newest_first_and_searchable(client, owner):
    client.post("/api/items", json={"text": "Alpha notes about entropy and heat"}, headers=owner)
    client.post("/api/items", json={"text": "Beta notes about gradient descent"}, headers=owner)

    titles = [i["title"] for i in client.get("/api/items", headers=owner).json()]
    assert titles == ["Beta notes about gradient descent", "Alpha notes about entropy and heat"]

    found = client.get("/api/items", params={"q": "ENTROPY"}, headers=owner).json()
    assert [i["title"] for i in found] == ["Alpha notes about entropy and heat"]
    assert client.get("/api/items", params={"q": "100%"}, headers=owner).json() == []


def test_list_pagination(client, owner):
    for n in range(3):
        client.post("/api/items", json={"text": f"Note number {n} about something"}, headers=owner)
    page = client.get("/api/items", params={"limit": 2, "offset": 2}, headers=owner).json()
    assert len(page) == 1
    assert client.get("/api/items", params={"limit": 0}, headers=owner).status_code == 422


def test_unknown_or_malformed_ids(client, owner):
    assert client.get(f"/api/items/{uuid4()}", headers=owner).status_code == 404
    assert client.get("/api/items/not-a-uuid", headers=owner).status_code == 422


def test_delete_removes_the_item(client, owner):
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]
    assert client.delete(f"/api/items/{item_id}", headers=owner).status_code == 204
    assert client.get(f"/api/items/{item_id}", headers=owner).status_code == 404


def test_retry_reprocesses_a_failed_item(client, owner, public_dns, monkeypatch):
    def failing_fetch(url):
        raise FetchError("The website took too long to respond")

    monkeypatch.setattr(web, "fetch_page", failing_fetch)
    item_id = client.post("/api/items", json={"url": "https://example.com/gd"}, headers=owner).json()["id"]
    assert client.get(f"/api/items/{item_id}", headers=owner).json()["status"] == "failed"

    monkeypatch.setattr(web, "fetch_page", lambda url: FetchedPage(url=url, content=ARTICLE_HTML))
    assert client.post(f"/api/items/{item_id}/retry", headers=owner).status_code == 200
    item = client.get(f"/api/items/{item_id}", headers=owner).json()
    assert item["status"] == "ready"
    assert item["error_message"] is None


def test_only_failed_items_can_be_retried(client, owner):
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]
    assert client.post(f"/api/items/{item_id}/retry", headers=owner).status_code == 409


def test_timestamps_are_always_utc_with_a_z_suffix(client, owner):
    created = client.post("/api/items", json={"text": PASTED}, headers=owner).json()
    fetched = client.get(f"/api/items/{created['id']}", headers=owner).json()  # read back from SQLite
    listed = client.get("/api/items", headers=owner).json()[0]
    assert created["created_at"].endswith("Z")
    assert fetched["created_at"].endswith("Z")
    assert listed["created_at"].endswith("Z")
