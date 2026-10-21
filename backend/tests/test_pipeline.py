from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, enable_sqlite_foreign_keys
from app.models import Concept, Item, ItemConcept
from app.services import concepts, pipeline
from app.services.analyzer import Analysis
from app.services.extractors import web
from app.services.fetcher import FetchedPage
from app.services.llm import LLMError
from tests.samples import ARTICLE_HTML

PASTED = "Entropy measures disorder in a system.\nIt never decreases in an isolated system."
BUSY = "The AI service is busy right now (rate limit). Please retry in a minute"


@pytest.fixture()
def owner():
    return {"X-Owner-Id": str(uuid4())}


@pytest.fixture()
def fetch_log(monkeypatch, public_dns):
    """Fake page downloads and record each one, so tests can see whether a page was fetched again."""
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return FetchedPage(url=url, content=ARTICLE_HTML)

    monkeypatch.setattr(web, "fetch_page", fake_fetch)
    return calls


def detail(client, headers, item_id):
    return client.get(f"/api/items/{item_id}", headers=headers).json()


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


# ---- through the API --------------------------------------------------------------------------
def test_a_ready_item_has_a_summary_and_concepts_most_relevant_first(client, owner):
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]
    item = detail(client, owner, item_id)
    assert item["status"] == "ready"
    assert item["summary"] == "A short test summary of the content."
    assert item["concepts"] == [
        {"name": "entropy", "relevance": 0.9},
        {"name": "shared idea", "relevance": 0.4},
    ]


def test_the_list_includes_each_items_concept_names(client, owner):
    client.post("/api/items", json={"text": PASTED}, headers=owner)
    listed = client.get("/api/items", headers=owner).json()
    assert listed[0]["concepts"] == ["entropy", "shared idea"]  # most relevant first


def test_the_list_shows_no_concepts_for_an_item_that_has_none_yet(client, owner, monkeypatch):
    def busy(title, text):
        raise LLMError(BUSY)

    monkeypatch.setattr(pipeline, "analyze_text", busy)
    client.post("/api/items", json={"text": PASTED}, headers=owner)
    assert client.get("/api/items", headers=owner).json()[0]["concepts"] == []


def test_items_of_the_same_visitor_share_concept_rows(client, owner):
    client.post("/api/items", json={"text": PASTED}, headers=owner)
    client.post("/api/items", json={"text": "Gradient descent finds minima of a function."}, headers=owner)

    with pipeline.SessionLocal() as db:  # the pipeline's session factory points at the test database
        names = sorted(db.scalars(select(Concept.name)))
        assert names == ["entropy", "gradient descent", "shared idea"]
        shared = db.scalar(select(Concept).where(Concept.name == "shared idea"))
        assert len(shared.item_links) == 2  # one concept, linked from both items


def test_different_visitors_do_not_share_concepts(client):
    for _ in range(2):
        client.post("/api/items", json={"text": PASTED}, headers={"X-Owner-Id": str(uuid4())})
    with pipeline.SessionLocal() as db:
        assert count(db, Concept) == 4  # "entropy" and "shared idea", once per visitor


def test_ai_failure_keeps_the_text_and_retry_does_not_download_again(
    client, owner, fetch_log, monkeypatch
):
    working = pipeline.analyze_text

    def busy(title, text):
        raise LLMError(BUSY)

    monkeypatch.setattr(pipeline, "analyze_text", busy)
    item_id = client.post("/api/items", json={"url": "https://example.com/gd"}, headers=owner).json()["id"]

    item = detail(client, owner, item_id)
    assert item["status"] == "failed"
    assert item["error_message"] == BUSY
    assert "steepest descent" in item["raw_text"]  # extraction was kept
    assert item["summary"] is None and item["concepts"] == []

    monkeypatch.setattr(pipeline, "analyze_text", working)
    assert client.post(f"/api/items/{item_id}/retry", headers=owner).status_code == 200
    item = detail(client, owner, item_id)
    assert item["status"] == "ready"
    assert item["error_message"] is None
    assert item["summary"] and item["concepts"]
    assert len(fetch_log) == 1  # the page was downloaded once, not twice


def test_unexpected_ai_errors_do_not_leak_details(client, owner, monkeypatch):
    def broken(title, text):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(pipeline, "analyze_text", broken)
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]
    item = detail(client, owner, item_id)
    assert item["status"] == "failed"
    assert item["error_message"] == pipeline.GENERIC_FAILURE


def test_processing_a_deleted_item_is_harmless(client):
    pipeline.process_item(uuid4())  # must simply return


def test_deleting_an_item_removes_its_links_but_not_the_concepts(client, owner):
    item_id = client.post("/api/items", json={"text": PASTED}, headers=owner).json()["id"]
    client.delete(f"/api/items/{item_id}", headers=owner)
    with pipeline.SessionLocal() as db:
        assert count(db, ItemConcept) == 0
        assert count(db, Concept) == 2


# ---- save_analysis directly -------------------------------------------------------------------
def test_saving_the_same_analysis_twice_does_not_duplicate_links(db_session):
    item = Item(owner_id=uuid4(), url="https://example.com/x", title="t", status="processing")
    db_session.add(item)
    db_session.commit()
    analysis = Analysis(summary="A summary that is long enough.", concepts=["entropy", "heat"])

    pipeline.save_analysis(db_session, item, analysis)
    pipeline.save_analysis(db_session, item, analysis)

    assert item.status == "ready"
    assert count(db_session, ItemConcept) == 2
    assert count(db_session, Concept) == 2


def test_two_items_creating_the_same_new_concept_at_once_is_handled(tmp_path, monkeypatch):
    """Simulates a race: another item creates "shared idea" while this one is saving."""
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    owner_id = uuid4()

    with Session() as session_a, Session() as session_b:
        item = Item(owner_id=owner_id, url="https://example.com/x", title="t", status="processing")
        session_a.add(item)
        session_a.commit()
        session_b.add(Concept(owner_id=owner_id, name="shared idea"))
        session_b.commit()  # the "other item" got there first

        real_find = concepts._find_concept
        lookups = []

        def blind_the_first_time(db, owner, name):
            lookups.append(name)
            return None if len(lookups) == 1 else real_find(db, owner, name)

        monkeypatch.setattr(concepts, "_find_concept", blind_the_first_time)
        analysis = Analysis(summary="A summary that is long enough.", concepts=["shared idea"])
        pipeline.save_analysis(session_a, item, analysis)

        assert item.status == "ready"
        assert count(session_a, Concept) == 1  # no duplicate was left behind
        assert [link.concept.name for link in item.concept_links] == ["shared idea"]
    engine.dispose()
