from uuid import uuid4

from app.models import Concept, Item
from app.services.analyzer import AnalyzedConcept
from app.services.concepts import concept_key, link_concepts, top_concept_names
from app.services.llm.prompts import build_user_prompt


def make_item(db, owner):
    item = Item(owner_id=owner, source_type="text", raw_text="x" * 30)
    db.add(item)
    db.flush()
    return item


def test_concept_key_ignores_filler_words_and_plurals():
    assert concept_key("class imbalance handling") == concept_key("class imbalance")
    assert concept_key("synthetic minority oversampling technique") == concept_key(
        "synthetic minority oversampling"
    )
    assert concept_key("decision trees") == concept_key("decision tree")
    assert concept_key("gradient descent") != concept_key("learning rate")


def test_similar_names_share_one_concept_row(db_session):
    owner = uuid4()
    first, second = make_item(db_session, owner), make_item(db_session, owner)
    link_concepts(db_session, first, [AnalyzedConcept(name="class imbalance", relevance=0.9)])
    db_session.flush()
    link_concepts(db_session, second, [AnalyzedConcept(name="class imbalance handling", relevance=0.8)])
    db_session.commit()
    assert first.concept_links[0].concept is second.concept_links[0].concept
    assert db_session.query(Concept).count() == 1


def test_concepts_are_never_shared_between_owners(db_session):
    a, b = make_item(db_session, uuid4()), make_item(db_session, uuid4())
    link_concepts(db_session, a, [AnalyzedConcept(name="class imbalance", relevance=0.9)])
    db_session.flush()
    link_concepts(db_session, b, [AnalyzedConcept(name="class imbalance", relevance=0.9)])
    db_session.commit()
    assert db_session.query(Concept).count() == 2


def test_two_spellings_in_one_answer_do_not_crash(db_session):
    item = make_item(db_session, uuid4())
    link_concepts(
        db_session,
        item,
        [AnalyzedConcept(name="smote", relevance=0.9), AnalyzedConcept(name="smote technique", relevance=0.5)],
    )
    db_session.commit()  # would raise if the same concept were linked twice
    assert len(item.concept_links) >= 1


def test_known_concepts_are_listed_most_shared_first(db_session):
    owner = uuid4()
    a, b = make_item(db_session, owner), make_item(db_session, owner)
    link_concepts(db_session, a, [AnalyzedConcept(name="smote", relevance=0.9), AnalyzedConcept(name="roc-auc", relevance=0.5)])
    db_session.flush()
    link_concepts(db_session, b, [AnalyzedConcept(name="smote", relevance=0.9)])
    db_session.commit()
    assert top_concept_names(db_session, owner)[0] == "smote"
    assert top_concept_names(db_session, uuid4()) == []


def test_prompt_lists_existing_concepts_only_when_there_are_some():
    assert "Existing concepts" not in build_user_prompt("T", "body")
    prompt = build_user_prompt("T", "body", ["smote", "class imbalance"])
    assert "- smote" in prompt and "- class imbalance" in prompt