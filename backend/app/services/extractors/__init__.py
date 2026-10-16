from app.models import Item, SourceType
from app.services.extractors.base import ExtractedContent, ExtractionError
from app.services.extractors.text import extract_text
from app.services.extractors.web import extract_from_url


def extract_content(item: Item) -> ExtractedContent:
    """Pick the right extractor for an item. YouTube and GitHub are added on Day 2."""
    if item.source_type == SourceType.TEXT:
        return extract_text(item.raw_text or "", item.title)
    if item.source_type == SourceType.ARTICLE and item.url:
        return extract_from_url(item.url)
    raise ExtractionError(f"{item.source_type} links are not supported yet")


__all__ = ["ExtractedContent", "ExtractionError", "extract_content"]
