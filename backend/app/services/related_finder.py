"""Finds related items for a saved resource using explainable connections (shared concepts, keywords)."""

import re
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Item, ItemConcept, ItemStatus
from app.schemas import RelatedItem

STOPWORDS = {
    "about", "above", "after", "again", "against", "all", "and", "any", "are", "aren't",
    "because", "been", "before", "being", "below", "between", "both", "but", "can't",
    "cannot", "could", "couldn't", "did", "didn't", "does", "doesn't", "doing", "don't",
    "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "here", "how", "into", "more", "most", "mustn't",
    "not", "off", "once", "only", "other", "ought", "our", "ours", "ourselves", "out",
    "over", "own", "same", "shan't", "she", "should", "shouldn't", "some", "such",
    "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there",
    "these", "they", "this", "those", "through", "too", "under", "until", "very", "was",
    "wasn't", "were", "weren't", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "won't", "would", "wouldn't", "you", "your", "yours", "yourself",
}


def _tokenize(text: str | None) -> set[str]:
    if not text:
        return set()
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    return {w for w in words if w not in STOPWORDS}


def find_related_items(
    db: Session,
    owner_id: uuid.UUID,
    item_id: uuid.UUID,
    limit: int = 5,
) -> list[RelatedItem]:
    """Find other ready items belonging to the same owner that connect to item_id."""
    target = db.get(Item, item_id)
    if not target or target.owner_id != owner_id:
        return []

    # Map target's concepts and weights
    target_concepts: dict[int, tuple[str, float]] = {}
    for link in target.concept_links:
        target_concepts[link.concept_id] = (link.concept.name, link.relevance)

    target_tokens = _tokenize(f"{target.title or ''} {target.summary or ''}")

    # Fetch other ready items for this owner
    stmt = (
        select(Item)
        .where(
            Item.owner_id == owner_id,
            Item.status == ItemStatus.READY.value,
            Item.id != item_id,
        )
        .options(selectinload(Item.concept_links).selectinload(ItemConcept.concept))
    )
    candidates = list(db.scalars(stmt))
    if not candidates:
        return []

    scored_items: list[tuple[float, Item, str, list[str]]] = []

    for item in candidates:
        shared_names: list[str] = []
        concept_score = 0.0

        for link in item.concept_links:
            if link.concept_id in target_concepts:
                name, weight = target_concepts[link.concept_id]
                shared_names.append(name)
                concept_score += weight * link.relevance

        item_tokens = _tokenize(f"{item.title or ''} {item.summary or ''}")
        common_words = target_tokens & item_tokens
        text_score = (len(common_words) / max(len(target_tokens | item_tokens), 1)) if common_words else 0.0

        total_score = concept_score * 2.0 + text_score

        if total_score <= 0.05:
            continue

        if shared_names:
            if len(shared_names) == 1:
                reason = f"Shares concept '{shared_names[0]}'"
            elif len(shared_names) <= 3:
                reason = f"Shares {len(shared_names)} concepts: {', '.join(shared_names)}"
            else:
                reason = f"Shares {len(shared_names)} concepts, including {shared_names[0]} and {shared_names[1]}"
        elif common_words:
            sample_words = sorted(common_words, key=len, reverse=True)[:2]
            reason = f"Both discuss {' and '.join(sample_words)}"
        else:
            reason = "Connected through shared themes in your library"

        scored_items.append((total_score, item, reason, shared_names))

    scored_items.sort(key=lambda x: x[0], reverse=True)
    results: list[RelatedItem] = []

    for _, item, reason, shared in scored_items[:limit]:
        results.append(
            RelatedItem(
                id=item.id,
                title=item.title,
                url=item.url,
                source_type=item.source_type,
                summary=item.summary,
                relationship_reason=reason,
                shared_concepts=shared,
            )
        )

    return results
