import logging

import trafilatura

from app.services.extractors.base import (
    MAX_TEXT_CHARS,
    MIN_ARTICLE_CHARS,
    ExtractedContent,
    ExtractionError,
)
from app.services.fetcher import FetchError, fetch_page
from app.utils.url_safety import UnsafeURLError

logger = logging.getLogger(__name__)

NOTHING_FOUND = (
    "Could not find readable article text on that page "
    "(it may need JavaScript or a login). Try pasting the text instead."
)


def parse_article(html: str | bytes) -> ExtractedContent:
    """Pull the main article text and title out of an HTML page, dropping menus, ads and footers."""
    try:
        text = trafilatura.extract(html, include_comments=False, include_tables=False)
        metadata = trafilatura.extract_metadata(html)
    except Exception:
        logger.exception("trafilatura failed")
        raise ExtractionError(NOTHING_FOUND) from None

    if not text or len(text) < MIN_ARTICLE_CHARS:
        raise ExtractionError(NOTHING_FOUND)

    title = metadata.title.strip()[:500] if metadata and metadata.title else None
    return ExtractedContent(title=title or None, text=text[:MAX_TEXT_CHARS])


def extract_from_url(url: str) -> ExtractedContent:
    try:
        page = fetch_page(url)
    except (FetchError, UnsafeURLError) as error:
        raise ExtractionError(str(error)) from None
    return parse_article(page.content)
