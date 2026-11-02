import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import Concept, Item, ItemConcept, ItemStatus, Suggestion, UserWorkspace, Workspace


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


def test_workspace_creation_and_defaults(db_session):
    ws = Workspace()
    db_session.add(ws)
    db_session.commit()

    assert isinstance(ws.id, uuid.UUID)
    assert ws.name == "Personal Workspace"
    assert ws.created_at is not None
    assert ws.user_link is None


def test_user_workspace_mapping_creation(db_session):
    ws = Workspace()
    db_session.add(ws)
    db_session.commit()

    user_id = uuid.uuid4()
    mapping = UserWorkspace(user_id=user_id, workspace_id=ws.id)
    db_session.add(mapping)
    db_session.commit()

    assert mapping.user_id == user_id
    assert mapping.workspace_id == ws.id
    assert mapping.role == "owner"
    assert mapping.created_at is not None
    assert mapping.workspace.id == ws.id
    assert ws.user_link.user_id == user_id


def test_duplicate_user_ownership_is_rejected(db_session):
    ws1 = Workspace()
    ws2 = Workspace()
    db_session.add_all([ws1, ws2])
    db_session.commit()

    user_id = uuid.uuid4()
    db_session.add(UserWorkspace(user_id=user_id, workspace_id=ws1.id))
    db_session.commit()

    # Same user trying to claim a second workspace
    db_session.add(UserWorkspace(user_id=user_id, workspace_id=ws2.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_duplicate_workspace_ownership_is_rejected(db_session):
    ws = Workspace()
    db_session.add(ws)
    db_session.commit()

    user1 = uuid.uuid4()
    user2 = uuid.uuid4()
    db_session.add(UserWorkspace(user_id=user1, workspace_id=ws.id))
    db_session.commit()

    # Another user trying to link to the same workspace
    db_session.add(UserWorkspace(user_id=user2, workspace_id=ws.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_user_workspace_cannot_reference_nonexistent_workspace(db_session):
    nonexistent_ws_id = uuid.uuid4()
    user_id = uuid.uuid4()
    db_session.add(UserWorkspace(user_id=user_id, workspace_id=nonexistent_ws_id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_workspace_cascades_to_user_workspace(db_session):
    ws = Workspace()
    db_session.add(ws)
    db_session.commit()

    user_id = uuid.uuid4()
    mapping = UserWorkspace(user_id=user_id, workspace_id=ws.id)
    db_session.add(mapping)
    db_session.commit()

    assert count(db_session, Workspace) == 1
    assert count(db_session, UserWorkspace) == 1

    db_session.delete(ws)
    db_session.commit()

    assert count(db_session, Workspace) == 0
    assert count(db_session, UserWorkspace) == 0

