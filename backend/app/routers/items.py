import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import OwnerId
from app.models import Item, ItemConcept, ItemStatus, SourceType
from app.schemas import ItemCreate, ItemDetail, ItemOut, ItemSummary
from app.services.extractors.text import derive_title
from app.services.pipeline import process_item
from app.services.sources import detect_source_type
from app.utils.url_safety import UnsafeURLError, validate_public_url

router = APIRouter(prefix="/items", tags=["items"])

DB = Annotated[Session, Depends(get_db)]


def get_owned_item(db: Session, owner_id: uuid.UUID, item_id: uuid.UUID) -> Item:
    """Load an item, treating other visitors' items exactly like missing ones."""
    item = db.get(Item, item_id)
    if item is None or item.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("", response_model=ItemOut, status_code=201)
def create_item(
    payload: ItemCreate,
    owner_id: OwnerId,
    db: DB,
    background_tasks: BackgroundTasks,
    response: Response,
):
    """Save a URL or pasted text. Processing happens in the background; poll GET /items/{id}."""
    if payload.url:
        try:
            url = validate_public_url(payload.url)
        except UnsafeURLError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

        existing = db.scalar(select(Item).where(Item.owner_id == owner_id, Item.url == url))
        if existing:  # saving the same link twice just returns the first one
            response.status_code = 200
            return existing

        item = Item(
            owner_id=owner_id, url=url, title=payload.title, source_type=detect_source_type(url).value
        )
    else:
        item = Item(
            owner_id=owner_id,
            raw_text=payload.text,
            title=payload.title or derive_title(payload.text),  # known now, so the UI never flickers
            source_type=SourceType.TEXT.value,
        )

    db.add(item)
    db.commit()
    background_tasks.add_task(process_item, item.id)
    return item


@router.get("", response_model=list[ItemSummary])
def list_items(
    owner_id: OwnerId,
    db: DB,
    q: Annotated[str | None, Query(max_length=200, description="Search title, URL and summary")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Item).where(Item.owner_id == owner_id)
    term = q.strip().lower() if q else ""
    if term:
        stmt = stmt.where(
            or_(
                *(
                    func.lower(func.coalesce(column, "")).contains(term, autoescape=True)
                    for column in (Item.title, Item.url, Item.summary)
                )
            )
        )
    stmt = (
        stmt.options(selectinload(Item.concept_links).selectinload(ItemConcept.concept))
        .order_by(Item.created_at.desc(), Item.id)
        .limit(limit)
        .offset(offset)
    )
    return [ItemSummary.from_item(item) for item in db.scalars(stmt).all()]


@router.get("/{item_id}", response_model=ItemDetail)
def get_item(item_id: uuid.UUID, owner_id: OwnerId, db: DB):
    return ItemDetail.from_item(get_owned_item(db, owner_id, item_id))


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: uuid.UUID, owner_id: OwnerId, db: DB) -> None:
    item = get_owned_item(db, owner_id, item_id)
    db.delete(item)
    db.commit()


@router.post("/{item_id}/retry", response_model=ItemOut)
def retry_item(
    item_id: uuid.UUID, owner_id: OwnerId, db: DB, background_tasks: BackgroundTasks
):
    """Run processing again for an item that failed."""
    item = get_owned_item(db, owner_id, item_id)
    if item.status != ItemStatus.FAILED:
        raise HTTPException(status_code=409, detail="Only failed items can be retried")
    item.status = ItemStatus.PENDING.value
    item.error_message = None
    db.commit()
    background_tasks.add_task(process_item, item.id)
    return item
