from dataclasses import dataclass

MAX_TEXT_CHARS = 100_000  # longest text we store per item
MIN_ARTICLE_CHARS = 200  # a web page with less readable text than this is treated as "nothing found"


class ExtractionError(Exception):
    """Content could not be extracted. The message is safe to show to the visitor."""


@dataclass(frozen=True)
class ExtractedContent:
    title: str | None
    text: str
