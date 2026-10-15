import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import Concept, Item, ItemConcept, ItemStatus, Suggestion


def make_item(owner: uuid.UUID, **kwargs) -> Item:
    return Item(owner_id=owner, url="https://example.com/a", title="A title", **kwargs)


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def test_item_gets_sensible_defaults(db_session):
    item = make_item(uuid.uuid4())
    db_session.add(item)
    db_session.commit()

    assert isinstance(item.id, uuid.UUID)
    assert item.status == ItemStatus.PENDING
    assert item.source_type == "article"
    assert item.created_at is not None
    assert item.summary is None


def test_item_can_have_concepts_and_suggestions(db_session):
    owner = uuid.uuid4()
    item = make_item(owner)
    concept = Concept(owner_id=owner, name="gradient descent")
    item.concept_links.append(ItemConcept(concept=concept, relevance=0.9))
    item.suggestions.append(
        Suggestion(title="Gradient descent", url="https://en.wikipedia.org/wiki/Gradient_descent",
                   source="wikipedia")
    )
    db_session.add(item)
    db_session.commit()

    saved = db_session.get(Item, item.id)
    assert [link.concept.name for link in saved.concept_links] == ["gradient descent"]
    assert saved.concept_links[0].relevance == 0.9
    assert saved.suggestions[0].source == "wikipedia"


def test_deleting_item_removes_its_links_and_suggestions_but_keeps_concepts(db_session):
    owner = uuid.uuid4()
    item = make_item(owner)
    item.concept_links.append(ItemConcept(concept=Concept(owner_id=owner, name="entropy")))
    item.suggestions.append(Suggestion(title="t", url="https://example.com", source="hn"))
    db_session.add(item)
    db_session.commit()

    db_session.delete(item)
    db_session.commit()

    assert count(db_session, Item) == 0
    assert count(db_session, ItemConcept) == 0
    assert count(db_session, Suggestion) == 0
    assert count(db_session, Concept) == 1


def test_concept_name_is_unique_per_owner(db_session):
    owner = uuid.uuid4()
    db_session.add(Concept(owner_id=owner, name="entropy"))
    db_session.commit()

    db_session.add(Concept(owner_id=owner, name="entropy"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_different_owners_can_share_a_concept_name(db_session):
    db_session.add_all(
        [Concept(owner_id=uuid.uuid4(), name="entropy"), Concept(owner_id=uuid.uuid4(), name="entropy")]
    )
    db_session.commit()
    assert count(db_session, Concept) == 2


def test_sqlite_enforces_foreign_keys(db_session):
    db_session.add(Suggestion(item_id=uuid.uuid4(), title="t", url="https://example.com", source="hn"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
