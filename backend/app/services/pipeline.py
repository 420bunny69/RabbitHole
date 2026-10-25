"""Background processing of a saved item: extract the text, then summarize it with the AI."""

import json
import logging
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Item, ItemStatus, SourceType
from app.services.analyzer import Analysis, analyze_text
from app.services.concepts import link_concepts
from app.services.extractors import ExtractionError, extract_content
from app.services.llm import LLMError

logger = logging.getLogger(__name__)

GENERIC_FAILURE = "Something went wrong while processing this item"


def save_analysis(db: Session, item: Item, analysis: Analysis) -> None:
    """Store the summary and concepts and mark the item ready.

    Two items processed at the same moment can both try to create the same new concept.
    The database rejects the second one (unique constraint), so we roll back and try once
    more; the second attempt finds the concept the first one created.
    """
    for attempt in range(2):
        try:
            item.summary = analysis.summary
            if analysis.takeaways:
                item.takeaways = json.dumps(analysis.takeaways)
            link_concepts(db, item, analysis.concepts)
            item.status = ItemStatus.READY.value
            db.commit()
            return
        except IntegrityError:
            db.rollback()
            if attempt == 1:
                raise


def _mark_failed(db: Session, item: Item, message: str) -> None:
    item.status = ItemStatus.FAILED.value
    item.error_message = message
    db.commit()


def process_item(item_id: uuid.UUID) -> None:
    """Run the whole pipeline for one item and record the outcome on it.

    Runs after the HTTP response was sent, so it opens its own database session
    (the request's session is already closed by then). It never raises: any problem
    is stored on the item, where the frontend can show it.
    """
    with SessionLocal() as db:
        item = db.get(Item, item_id)
        if item is None:  # deleted before we got to it
            return

        item.status = ItemStatus.PROCESSING.value
        item.error_message = None
        db.commit()

        try:
            # A retry after an AI failure already has its text, so we don't download it again.
            if item.source_type == SourceType.TEXT or not item.raw_text:
                content = extract_content(item)
                item.title = item.title or content.title or item.url
                item.raw_text = content.text
                db.commit()  # keep the extracted text even if the AI step fails

            analysis = analyze_text(item.title, item.raw_text)
            save_analysis(db, item, analysis)
        except (ExtractionError, LLMError) as error:
            db.rollback()
            _mark_failed(db, item, str(error))
        except Exception:
            logger.exception("Unexpected error while processing item %s", item_id)
            db.rollback()
            _mark_failed(db, item, GENERIC_FAILURE)
