"""Topics router: lists all unique concepts and their associated resources for an owner."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, with_loader_criteria

from app.database import get_db
from app.deps import CurrentWorkspaceId
from app.models import Concept, Item, ItemConcept, ItemStatus
from app.schemas import TopicDetail, TopicItem

router = APIRouter(prefix="/topics", tags=["topics"])

DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[TopicDetail])
def list_topics(workspace_id: CurrentWorkspaceId, db: DB) -> list[TopicDetail]:
    """Return all extracted concepts and their associated items for this owner."""
    stmt = (
        select(Concept)
        .where(Concept.owner_id == workspace_id)
        .options(
            selectinload(Concept.item_links)
            .selectinload(ItemConcept.item),
            with_loader_criteria(
                ItemConcept,
                ItemConcept.item.has(Item.owner_id == workspace_id),
                include_aliases=True,
            ),
        )
    )
    concepts = list(db.scalars(stmt))

    results: list[TopicDetail] = []
    for concept in concepts:
        ready_items = [
            TopicItem(
                id=link.item.id,
                title=link.item.title,
                url=link.item.url,
                source_type=link.item.source_type,
                summary=link.item.summary,
                status=link.item.status,
                created_at=link.item.created_at,
            )
            for link in concept.item_links
            if link.item and link.item.status == ItemStatus.READY.value
        ]
        if ready_items:
            # Sort items by date descending
            ready_items.sort(key=lambda i: i.created_at, reverse=True)
            results.append(
                TopicDetail(
                    id=concept.id,
                    name=concept.name,
                    count=len(ready_items),
                    items=ready_items,
                )
            )

    results.sort(key=lambda t: (-t.count, t.name))
    return results
