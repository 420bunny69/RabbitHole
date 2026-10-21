"""Downloads web pages for the extractors, with limits so one bad page cannot hurt the server."""

from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from app.config import get_settings
from app.utils.url_safety import validate_public_url

MAX_BYTES = 2_000_000  # 2 MB, measured after decompression
MAX_REDIRECTS = 5
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
ALLOWED_CONTENT_TYPES = {"text/html", "application/xhtml+xml", "text/plain"}
def build_headers() -> dict[str, str]:
    """Identify ourselves the way Wikimedia and other sites ask: tool/version (contact)."""
    contact = get_settings().fetch_contact.strip() or "personal knowledge tool"
    return {
        "User-Agent": f"RabbitHoleBot/0.1 ({contact})",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
    }


class FetchError(Exception):
    """The page could not be downloaded. The message is safe to show to the visitor."""


@dataclass(frozen=True)
class FetchedPage:
    url: str  # final URL, after redirects
    content: bytes  # raw bytes: the extractor detects the text encoding itself


def fetch_page(url: str, *, transport: httpx.BaseTransport | None = None) -> FetchedPage:
    """Download a public web page.

    Redirects are followed by hand so that EVERY hop goes through validate_public_url:
    a public site must not be able to bounce us to http://localhost or a private address.
    `transport` exists only so tests can fake the network.

    Raises UnsafeURLError (from url_safety) or FetchError.
    """
    current = validate_public_url(url)
    try:
        with httpx.Client(
            transport=transport, timeout=TIMEOUT, headers=build_headers(), follow_redirects=False
        ) as client:as client:
            for _ in range(MAX_REDIRECTS + 1):
                with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchError("The website sent an invalid redirect")
                        current = validate_public_url(urljoin(current, location))
                        continue
                    return FetchedPage(url=current, content=_read_body(response))
            raise FetchError("The website redirected too many times")
    except httpx.TimeoutException:
        raise FetchError("The website took too long to respond") from None
    except httpx.HTTPError:
        raise FetchError("Could not reach that website") from None


def _read_body(response: httpx.Response) -> bytes:
    if response.status_code in (401, 403, 429):
        raise FetchError(
            f"The website blocked automated access ({response.status_code}). Try pasting the text instead"
        )
    if response.status_code >= 400:
        raise FetchError(f"The website returned an error ({response.status_code})")
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise FetchError("That link is not a web page (it looks like a file or media)")

    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > MAX_BYTES:
            raise FetchError("That page is too large to process")
        chunks.append(chunk)
    return b"".join(chunks)
