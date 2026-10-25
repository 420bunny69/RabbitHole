from app.models import Item, SourceType
from app.services.extractors.base import ExtractedContent, ExtractionError
from app.services.extractors.github import extract_github
from app.services.extractors.text import extract_text
from app.services.extractors.web import extract_from_url
from app.services.extractors.youtube import extract_youtube


def extract_content(item: Item) -> ExtractedContent:
    """Pick the right extractor for an item."""
    if item.source_type == SourceType.TEXT:
        return extract_text(item.raw_text or "", item.title)
    if item.source_type == SourceType.ARTICLE and item.url:
        return extract_from_url(item.url)
    if item.source_type == SourceType.YOUTUBE and item.url:
        return extract_youtube(item.url)
    if item.source_type == SourceType.GITHUB and item.url:
        return extract_github(item.url)
    raise ExtractionError(f"{item.source_type} links are not supported yet")


__all__ = ["ExtractedContent", "ExtractionError", "extract_content", "extract_youtube", "extract_github"]
