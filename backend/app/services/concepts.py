from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Concept, Item, ItemConcept
from app.services.analyzer import AnalyzedConcept

# Words that rarely change what a concept is about: "class imbalance" and "class imbalance handling"
# are the same idea, so they should become the same graph node.
FILLER_WORDS = {"technique", "techniques", "method", "methods", "approach", "handling"}
KNOWN_CONCEPTS_LIMIT = 100  # how many existing names we show the AI (about 400 tokens)


def concept_key(name: str) -> str:
    """A loose version of a concept name, used only to decide whether two names mean the same thing."""
    tokens = []
    for word in name.split():
        if word in FILLER_WORDS:
            continue
        if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]  # "oversamplings" and "oversampling" match
        tokens.append(word)
    return " ".join(tokens) or name


def top_concept_names(db: Session, owner_id, limit: int = KNOWN_CONCEPTS_LIMIT) -> list[str]:
    """This visitor's existing concept names, most-shared first, to show the AI so it reuses them."""
    stmt = (
        select(Concept.name)
        .join(ItemConcept, ItemConcept.concept_id == Concept.id)
        .where(Concept.owner_id == owner_id)
        .group_by(Concept.id, Concept.name)
        .order_by(func.count().desc(), Concept.id.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


def _find_concept(db: Session, owner_id, name: str) -> Concept | None:
    exact = db.scalar(select(Concept).where(Concept.owner_id == owner_id, Concept.name == name))
    if exact is not None:
        return exact
    key = concept_key(name)  # safety net for when the AI worded an existing idea slightly differently
    for existing in db.scalars(select(Concept).where(Concept.owner_id == owner_id)):
        if concept_key(existing.name) == key:
            return existing
    return None


def link_concepts(db: Session, item: Item, concepts: list[AnalyzedConcept]) -> None:
    """Attach concepts to an item, reusing the visitor's existing Concept rows.

    Reusing rows is what connects the knowledge graph: two items that both mention
    "gradient descent" point at the SAME concept. Nothing is committed here.
    """
    item.concept_links.clear()
    db.flush()  # apply the removal before adding, in case a concept is re-added
    linked: set[int] = set()
    for analyzed in concepts:
        concept = _find_concept(db, item.owner_id, analyzed.name)
        if concept is None:
            concept = Concept(owner_id=item.owner_id, name=analyzed.name)
        elif concept.id in linked:  # two spellings of one idea in the same answer
            continue
        if concept.id is not None:
            linked.add(concept.id)
        item.concept_links.append(ItemConcept(concept=concept, relevance=analyzed.relevance))