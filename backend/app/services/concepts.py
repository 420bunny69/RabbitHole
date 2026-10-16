from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Concept, Item, ItemConcept
from app.services.analyzer import AnalyzedConcept


def _find_concept(db: Session, owner_id, name: str) -> Concept | None:
    return db.scalar(select(Concept).where(Concept.owner_id == owner_id, Concept.name == name))


def link_concepts(db: Session, item: Item, concepts: list[AnalyzedConcept]) -> None:
    """Attach concepts to an item, reusing the visitor's existing Concept rows.

    Reusing rows is what connects the knowledge graph: two items that both mention
    "gradient descent" point at the SAME concept. Nothing is committed here.
    """
    item.concept_links.clear()
    db.flush()  # apply the removal before adding, in case a concept is re-added
    for analyzed in concepts:
        concept = _find_concept(db, item.owner_id, analyzed.name)
        if concept is None:
            concept = Concept(owner_id=item.owner_id, name=analyzed.name)
        item.concept_links.append(ItemConcept(concept=concept, relevance=analyzed.relevance))
