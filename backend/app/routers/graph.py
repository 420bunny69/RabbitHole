from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import OwnerId
from app.models import Item, ItemConcept, ItemStatus
from app.schemas import Graph, GraphEdge, GraphNode

router = APIRouter(prefix="/graph", tags=["graph"])

DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Graph)
def get_graph(
    owner_id: OwnerId,
    db: DB,
    limit: Annotated[int, Query(ge=1, le=200, description="How many of the newest items to include")] = 100,
    min_items: Annotated[int, Query(ge=1, le=50, description="Hide concepts used by fewer items")] = 1,
):
    """The visitor's knowledge graph: ready items, the concepts they share, and the links between them.

    Edges are computed from the item-to-concept links, so nothing extra is stored. Items that are
    still processing or failed have no concepts yet, so they are left out.
    """
    stmt = (
        select(Item)
        .where(Item.owner_id == owner_id, Item.status == ItemStatus.READY.value)
        .options(selectinload(Item.concept_links).selectinload(ItemConcept.concept))
        .order_by(Item.created_at.desc(), Item.id)
        .limit(limit + 1)  # one extra row tells us whether older items were cut off
    )
    items = list(db.scalars(stmt))
    truncated = len(items) > limit
    items = items[:limit]

    # How many of the included items use each concept (so counts always match the graph).
    counts: dict[int, int] = {}
    names: dict[int, str] = {}
    for item in items:
        for link in item.concept_links:
            counts[link.concept_id] = counts.get(link.concept_id, 0) + 1
            names[link.concept_id] = link.concept.name
    shown = {concept_id for concept_id, count in counts.items() if count >= min_items}

    nodes = [
        GraphNode(
            id=f"item:{item.id}",
            type="item",
            label=item.title or item.url or "Untitled",
            item_id=item.id,
            source_type=item.source_type,
            url=item.url,
        )
        for item in items
    ]
    nodes += [
        GraphNode(id=f"concept:{concept_id}", type="concept", label=names[concept_id], count=counts[concept_id])
        for concept_id in sorted(shown, key=lambda cid: (-counts[cid], names[cid]))
    ]
    edges = [
        GraphEdge(
            id=f"item:{item.id}->concept:{link.concept_id}",
            source=f"item:{item.id}",
            target=f"concept:{link.concept_id}",
            weight=link.relevance,
        )
        for item in items
        for link in item.concept_links
        if link.concept_id in shown
    ]
    return Graph(nodes=nodes, edges=edges, truncated=truncated)