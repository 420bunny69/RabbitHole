import re

import pytest

from app.models import SourceType
from app.services.extractors import web
from app.services.extractors.base import MAX_TEXT_CHARS, ExtractionError
from app.services.extractors.text import derive_title, extract_text
from app.services.fetcher import FetchedPage, FetchError
from app.services.sources import detect_source_type
from app.utils.url_safety import UnsafeURLError
from tests.samples import ARTICLE_HTML, EMPTY_PAGE_HTML


# ---- web articles -----------------------------------------------------------------------------
def test_parse_article_keeps_the_article_and_drops_page_furniture():
    content = web.parse_article(ARTICLE_HTML)
    assert content.title == "Understanding Gradient Descent"
    assert "steepest descent" in content.text
    assert "learning rate" in content.text
    assert "Copyright" not in content.text
    assert "About us" not in content.text


def test_parse_article_accepts_text_as_well_as_bytes():
    assert "steepest descent" in web.parse_article(ARTICLE_HTML.decode()).text


@pytest.mark.parametrize("html", [EMPTY_PAGE_HTML, b"", b"not html at all"])
def test_parse_article_rejects_pages_without_readable_text(html):
    with pytest.raises(ExtractionError, match="readable article text"):
        web.parse_article(html)


def test_extract_from_url_fetches_then_parses(monkeypatch):
    monkeypatch.setattr(
        web, "fetch_page", lambda url: FetchedPage(url=url, content=ARTICLE_HTML)
    )
    assert web.extract_from_url("https://example.com/a").title == "Understanding Gradient Descent"


@pytest.mark.parametrize(
    "error", [FetchError("The website returned an error (404)"), UnsafeURLError("private address")]
)
def test_extract_from_url_turns_fetch_problems_into_extraction_errors(monkeypatch, error):
    def failing_fetch(url):
        raise error

    monkeypatch.setattr(web, "fetch_page", failing_fetch)
    with pytest.raises(ExtractionError, match=re.escape(str(error))):
        web.extract_from_url("https://example.com/a")


# ---- pasted text ------------------------------------------------------------------------------
def test_text_title_defaults_to_first_line():
    content = extract_text("\n\n  My notes on entropy  \nsecond line")
    assert content.title == "My notes on entropy"


def test_explicit_title_wins():
    assert extract_text("some pasted text here", title="Custom").title == "Custom"


def test_long_first_line_is_shortened():
    title = derive_title("word " * 50)
    assert len(title) <= 80 and title.endswith("…")


def test_empty_text_is_rejected():
    with pytest.raises(ExtractionError):
        extract_text("   \n  ")


def test_text_is_truncated_to_the_limit():
    assert len(extract_text("a" * (MAX_TEXT_CHARS + 500)).text) == MAX_TEXT_CHARS


# ---- source type detection --------------------------------------------------------------------
@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.youtube.com/watch?v=abc", SourceType.YOUTUBE),
        ("https://m.youtube.com/watch?v=abc", SourceType.YOUTUBE),
        ("https://youtu.be/abc", SourceType.YOUTUBE),
        ("https://github.com/tiangolo/fastapi", SourceType.GITHUB),
        ("https://www.github.com/tiangolo/fastapi", SourceType.GITHUB),
        ("https://example.com/post", SourceType.ARTICLE),
        ("https://notyoutube.com/watch", SourceType.ARTICLE),
        ("https://github.com.evil.com/x", SourceType.ARTICLE),
    ],
)
def test_detect_source_type(url, expected):
    assert detect_source_type(url) == expected
