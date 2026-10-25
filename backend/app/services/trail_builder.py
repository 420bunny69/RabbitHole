"""Generates curiosity trails through the user's saved resources and concepts."""

import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Item, ItemConcept, ItemStatus
from app.schemas import Trail, TrailStep


def build_curiosity_trail(db: Session, owner_id: uuid.UUID) -> Trail:
    """Build an exploratory trail through saved resources and connected concepts."""
    stmt = (
        select(Item)
        .where(Item.owner_id == owner_id, Item.status == ItemStatus.READY.value)
        .options(selectinload(Item.concept_links).selectinload(ItemConcept.concept))
        .order_by(Item.created_at.desc())
    )
    items = list(db.scalars(stmt))
    trail_id = str(uuid.uuid4())

    if not items:
        return Trail(
            id=trail_id,
            title="Curiosity Trail",
            steps=[
                TrailStep(
                    id="welcome",
                    step_type="guidance",
                    title="Begin Your First Trail",
                    connection_reason="Save resources to your library to generate interactive curiosity trails across your knowledge.",
                )
            ],
        )

    if len(items) == 1:
        single = items[0]
        steps = [
            TrailStep(
                id=f"step-item-{single.id}",
                step_type="item",
                item_id=single.id,
                title=single.title or "Your saved resource",
                url=single.url,
                source_type=single.source_type,
                connection_reason="Starting Point: The anchor of your personal knowledge library.",
            )
        ]
        for link in single.concept_links[:3]:
            steps.append(
                TrailStep(
                    id=f"step-concept-{link.concept_id}",
                    step_type="concept",
                    title=link.concept.name,
                    connection_reason=f"Key Concept: Extracted with {int(link.relevance * 100)}% relevance to this resource.",
                )
            )
        return Trail(id=trail_id, title=f"Trail: {single.title or 'Exploration'}", steps=steps)

    # With multiple items, traverse connected path: Item -> Concept -> Item -> Concept ...
    visited_items: set[uuid.UUID] = set()
    visited_concepts: set[int] = set()
    steps: list[TrailStep] = []

    # Pick the newest item as the starting anchor
    current_item = items[0]
    visited_items.add(current_item.id)

    steps.append(
        TrailStep(
            id=f"step-item-{current_item.id}",
            step_type="item",
            item_id=current_item.id,
            title=current_item.title or "Untitled Resource",
            url=current_item.url,
            source_type=current_item.source_type,
            connection_reason="Starting Anchor: Your recent exploration in this domain.",
        )
    )

    trail_title = f"Trail: {current_item.title or 'Connected Ideas'}"

    # Hop up to 6 steps
    for _ in range(4):
        # Find best unvisited concept on current item
        best_link = None
        for link in current_item.concept_links:
            if link.concept_id not in visited_concepts:
                if best_link is None or link.relevance > best_link.relevance:
                    best_link = link

        if not best_link:
            break

        concept = best_link.concept
        visited_concepts.add(concept.id)
        steps.append(
            TrailStep(
                id=f"step-concept-{concept.id}",
                step_type="concept",
                title=concept.name,
                connection_reason=f"Connecting Concept: A central idea linking these lines of thought.",
            )
        )

        # Find next unvisited item that shares this concept
        next_item = None
        for other in items:
            if other.id not in visited_items:
                if any(l.concept_id == concept.id for l in other.concept_links):
                    next_item = other
                    break

        # If no unvisited item shares this concept, find an item sharing any concept or the next newest
        if not next_item:
            for other in items:
                if other.id not in visited_items:
                    next_item = other
                    break

        if not next_item:
            break

        visited_items.add(next_item.id)
        current_item = next_item

        steps.append(
            TrailStep(
                id=f"step-item-{current_item.id}",
                step_type="item",
                item_id=current_item.id,
                title=current_item.title or "Untitled Resource",
                url=current_item.url,
                source_type=current_item.source_type,
                connection_reason=f"Connected Discovery: Explores '{concept.name}' from another angle.",
            )
        )

    return Trail(id=trail_id, title=trail_title, steps=steps)
