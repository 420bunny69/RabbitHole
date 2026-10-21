from app.services.extractors.base import MAX_TEXT_CHARS, ExtractedContent, ExtractionError


def derive_title(text: str, max_len: int = 80) -> str:
    """Use the first non-empty line of pasted text as its title."""
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if not first_line:
        return "Pasted text"
    if len(first_line) <= max_len:
        return first_line
    cut = first_line[: max_len - 1]
    if " " in cut:  # end on a whole word instead of cutting one in half
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "…"


def extract_text(text: str, title: str | None = None) -> ExtractedContent:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ExtractionError("There is no text to process")
    return ExtractedContent(title=title or derive_title(cleaned), text=cleaned[:MAX_TEXT_CHARS])
